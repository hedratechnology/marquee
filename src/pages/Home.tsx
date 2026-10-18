import { useEffect, useState } from 'react'
import * as tmdb from '../tmdb'
import type { Title } from '../tmdb'
import { requestRatings } from '../omdb'
import { Empty, PosterCard, Rail, TitleRail, num } from '../ui/components'
import { Icon } from '../ui/icons'
import { daysLabel } from '../ui/helpers'
import { bestToTitle, useBest } from '../ui/data'

export type Goto = 'pick' | 'like' | 'library' | 'together' | 'best' | 'explore' | 'settings'

interface ExpiringItem {
  type: tmdb.MediaType
  id: number
  title: string
  imdb: number | null
  service: string
  serviceName: string
  expiresAt: number
}

function Expiring() {
  const [data, setData] = useState<{ generatedAt: string; items: ExpiringItem[] } | null>(null)
  const [min, setMin] = useState(() => Number(localStorage.getItem('exp_min') ?? 7))
  const [service, setService] = useState('')
  const [titles, setTitles] = useState<Record<string, Title>>({})

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}expiring.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d && Array.isArray(d.items) ? d : null))
      .catch(() => setData(null))
  }, [])

  const now = Date.now() / 1000
  const shown = (data?.items ?? [])
    .filter((i) => i.expiresAt >= now && (i.imdb ?? 0) >= min && (!service || i.service === service))
    .slice(0, 16)
  const shownKey = shown.map((i) => i.type + i.id).join(',')

  useEffect(() => {
    let live = true
    Promise.all(shown.map((i) => tmdb.titleById(i.type, i.id))).then((list) => {
      if (!live) return
      setTitles(Object.fromEntries(list.filter((t): t is Title => !!t).map((t) => [t.type + t.id, t])))
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey])

  if (!data?.items.length) return null
  const services = [...new Map(data.items.map((i) => [i.service, i.serviceName])).entries()]

  return (
    <Rail
      title="In scadenza che meritano"
      action={
        <div className="row" style={{ gap: 8 }}>
          <select className="mini" value={service} onChange={(e) => setService(e.target.value)} aria-label="Piattaforma">
            <option value="">Tutte</option>
            {services.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select className="mini" value={min} onChange={(e) => { setMin(+e.target.value); localStorage.setItem('exp_min', e.target.value) }} aria-label="Voto minimo">
            {[6, 6.5, 7, 7.5, 8].map((v) => <option key={v} value={v}>IMDb {num(v)}+</option>)}
          </select>
        </div>
      }
    >
      {shown.length === 0 && <p className="muted">Nessun titolo in scadenza con questi criteri.</p>}
      {shown.map((i) => (
        <PosterCard
          key={i.type + i.id + i.service}
          t={titles[i.type + i.id]}
          name={i.title}
          sub={i.serviceName}
          tag={daysLabel(i.expiresAt)}
          scores={i.imdb !== null ? [`IMDb ${num(i.imdb)}`] : []}
        />
      ))}
    </Rail>
  )
}

function Entrance({ icon, title, text, onClick, accent }: { icon: string; title: string; text: string; onClick: () => void; accent?: boolean }) {
  return (
    <button className={'entrance' + (accent ? ' accent' : '')} onClick={onClick}>
      <span className="eicon"><Icon name={icon} size={26} /></span>
      <b>{title}</b>
      <span>{text}</span>
      <span className="go"><Icon name="arrow" size={18} /></span>
    </button>
  )
}

export function Home({ favorites, seen, goto, listCount }: { favorites: Title[]; seen: Title[]; goto: (t: Goto) => void; listCount: number }) {
  const [recs, setRecs] = useState<Title[]>([])
  const best = useBest()
  const hasKey = !!tmdb.getKey()

  useEffect(() => {
    const base = favorites.slice(0, 8)
    if (!base.length || !hasKey) return
    Promise.all(base.map((t) => tmdb.recommendations(t.type, t.id).catch(() => [] as Title[]))).then((all) => {
      const score = new Map<string, { t: Title; n: number }>()
      for (const t of all.flat()) {
        const k = t.type + t.id
        const cur = score.get(k)
        if (cur) cur.n++
        else score.set(k, { t, n: 1 })
      }
      const known = new Set([...favorites, ...seen].map((t) => t.type + t.id))
      const out = [...score.values()]
        .filter((x) => !known.has(x.t.type + x.t.id) && x.t.poster)
        .sort((a, b) => b.n - a.n || b.t.rating - a.t.rating)
        .slice(0, 18)
        .map((x) => x.t)
      setRecs(out)
      requestRatings(out)
    })
  }, [favorites, seen, hasKey])

  if (!hasKey) {
    return (
      <Empty
        title="Benvenuto in Marquee"
        text="Per iniziare serve una chiave gratuita di TMDB: ci vogliono due minuti."
        action={<button className="btn gold" onClick={() => goto('settings')}>Inserisci la chiave</button>}
      />
    )
  }

  return (
    <>
      <span className="eyebrow" style={{ display: 'block', marginTop: 18 }}>Stasera</span>
      <h1 className="page-title hero-title">Cosa ti va di vedere?</h1>
      <p className="lede">Scegli come arrivarci: in pochi minuti, senza scorrere cataloghi infiniti.</p>

      <div className="entrances">
        <Entrance accent icon="spark" title="Scegli per me" text="Umore, tempo e compagnia: tre proposte, con i motivi." onClick={() => goto('pick')} />
        <Entrance icon="search" title="Ho voglia di qualcosa come…" text="Parti da un titolo oppure descrivi ciò che cerchi." onClick={() => goto('like')} />
        <Entrance icon="bookmark" title="La mia lista" text={listCount ? `${listCount} titoli salvati, organizzati.` : 'Da vedere, preferiti, visti: tutto in ordine.'} onClick={() => goto('library')} />
      </div>
      <button className="banner" onClick={() => goto('together')}>
        <Icon name="users" size={22} />
        <span><b>Scegliamo insieme</b> Due persone, un punto d'incontro. Senza account.</span>
        <Icon name="arrow" size={18} />
      </button>

      <Expiring />
      <TitleRail title="Consigliati per te" items={recs} />
      {best && best.items.length > 0 && (
        <TitleRail
          title="Il meglio, secondo i numeri"
          items={best.items.slice(0, 16).map(bestToTitle)}
          action={<button className="link" onClick={() => goto('best')}>Vedi tutti</button>}
        />
      )}
      <p className="muted" style={{ marginTop: 28 }}>
        Per esplorare liberamente tutto il catalogo con i filtri, vai su <button className="link" onClick={() => goto('explore')}>Esplora</button>.
      </p>
    </>
  )
}
