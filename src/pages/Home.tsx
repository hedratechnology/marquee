import { useEffect, useState } from 'react'
import * as tmdb from '../tmdb'
import type { Title } from '../tmdb'
import { requestRatings } from '../omdb'
import { Empty, PosterCard, Rail, TitleRail, num } from '../ui/components'
import { Icon } from '../ui/icons'
import { daysLabel } from '../ui/helpers'
import { useFilters, useReportCount } from '../filters'
import { usePersonal } from '../personal'
import { useTaste } from '../ui/ctx'
import { affinity, confidence } from '../taste'
import { matchesQuery, useFilterEnv } from '../filtering'
import { bestToTitle, useBest } from '../ui/data'

export type Goto = 'pick' | 'library' | 'taste' | 'together' | 'best' | 'explore' | 'settings'

interface ExpiringItem {
  type: tmdb.MediaType
  id: number
  title: string
  year?: number | null
  imdb: number | null
  service: string
  serviceName: string
  expiresAt: number
}

/** Piattaforme di TMDB -> servizi dell'elenco delle scadenze. */
const SERVICE_OF: Record<number, string> = { 8: 'netflix', 119: 'prime', 337: 'disney', 350: 'apple', 531: 'paramount', 39: 'now', 11: 'mubi', 283: 'crunchyroll' }

function Expiring({ onCount }: { onCount: (n: number) => void }) {
  const F = useFilters()
  const env = useFilterEnv(F.q)
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
  // prima i filtri che si valutano dai dati delle scadenze: voto, servizio, tipo, anno, piattaforme
  const candidates = (data?.items ?? [])
    .filter((i) => {
      if (i.expiresAt < now || (i.imdb ?? 0) < Math.max(min, F.q.minImdb)) return false
      if (service && i.service !== service) return false
      if (!tmdb.kindTypes(F.q.kinds).includes(i.type)) return false
      if (F.q.yearFrom && i.year && String(i.year) < F.q.yearFrom) return false
      if (F.q.yearTo && i.year && String(i.year) > F.q.yearTo) return false
      const wanted = F.q.providers.map((p) => SERVICE_OF[p]).filter(Boolean)
      if (F.q.providers.length && wanted.length && !wanted.includes(i.service)) return false
      return true
    })
    .slice(0, 40)
  const candKey = candidates.map((i) => i.type + i.id).join(',')

  useEffect(() => {
    let live = true
    Promise.all(candidates.map((i) => tmdb.titleById(i.type, i.id))).then((list) => {
      if (!live) return
      setTitles(Object.fromEntries(list.filter((t): t is Title => !!t).map((t) => [t.type + t.id, t])))
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candKey])

  // poi quelli che servono i dettagli del titolo: generi, umore, premi
  const needsTitle = F.q.genres.length > 0 || F.q.moods.length > 0 || F.q.awards.length > 0 || F.q.minTmdb > 0
  const shown = candidates
    .filter((i) => {
      const t = titles[i.type + i.id]
      if (!t) return !needsTitle
      return matchesQuery({ type: t.type, id: t.id, year: t.year, genreIds: t.genreIds ?? [], rating: t.rating, imdb: i.imdb ?? undefined }, { ...F.q, minImdb: 0, kinds: F.q.kinds }, env)
    })
    .slice(0, 16)

  useEffect(() => onCount(shown.length), [shown.length, onCount])
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

export function Home({ favorites, seen, goto, listCount, active }: { favorites: Title[]; seen: Title[]; goto: (t: Goto) => void; listCount: number; active: boolean }) {
  const F = useFilters()
  const { taste } = useTaste()
  const personal = usePersonal()
  const env = useFilterEnv(F.q)
  const [expiringCount, setExpiringCount] = useState(0)
  const [recs, setRecs] = useState<Title[]>([])
  const best = useBest()
  const hasKey = !!tmdb.getKey()

  // i consigli nascono da ciò che ami: preferiti e titoli per cui hai detto «ne voglio altri così», «bei personaggi», «ottima atmosfera»
  useEffect(() => {
    if (!hasKey) return
    const seeds = new Map<string, { type: tmdb.MediaType; id: number; w: number }>()
    for (const r of Object.values(personal.reactions)) {
      const w = r.reactions.includes('more') ? 2 : r.reactions.some((x) => x === 'characters' || x === 'atmosphere') ? 1 : 0
      if (w) seeds.set(`${r.type}:${r.id}`, { type: r.type, id: r.id, w })
    }
    for (const t of favorites) if (!seeds.has(`${t.type}:${t.id}`)) seeds.set(`${t.type}:${t.id}`, { type: t.type, id: t.id, w: 1 })
    const base = [...seeds.values()].sort((a, b) => b.w - a.w).slice(0, 10)
    if (!base.length) return
    Promise.all(base.map((b) => tmdb.recommendations(b.type, b.id).then((r) => r.map((t) => ({ t, w: b.w }))).catch(() => []))).then((all) => {
      const score = new Map<string, { t: Title; n: number }>()
      for (const { t, w } of all.flat()) {
        const k = t.type + t.id
        const cur = score.get(k)
        if (cur) cur.n += w
        else score.set(k, { t, n: w })
      }
      const known = new Set([...favorites, ...seen].map((t) => t.type + t.id))
      for (const r of Object.values(personal.reactions)) known.add(r.type + r.id)
      const out = [...score.values()]
        // si evitano i generi che hai dimostrato di non amare
        .filter((x) => !known.has(x.t.type + x.t.id) && x.t.poster && affinity(x.t, taste) > -0.3)
        .sort((a, b) => b.n + affinity(b.t, taste) - (a.n + affinity(a.t, taste)) || b.t.rating - a.t.rating)
        .slice(0, 18)
        .map((x) => x.t)
      setRecs(out)
      requestRatings(out)
    })
  }, [favorites, seen, hasKey, personal.reactions, taste])

  const recsF = recs.filter((t) => matchesQuery(t, F.q, env))
  const bestF = (best?.items ?? []).filter((i) => matchesQuery({ type: i.type, id: i.id, year: i.year, genreIds: i.genreIds, rating: i.imdb ?? 0, lang: i.lang, imdb: i.imdb, rt: i.rt, meta: i.meta }, F.q, env))
  const ratingFilter = !!(F.q.minImdb || F.q.minRt || F.q.minMeta)
  useEffect(() => {
    if (ratingFilter) requestRatings(recs)
  }, [ratingFilter, recs])
  useReportCount(hasKey ? recsF.length + Math.min(bestF.length, 16) + expiringCount : null, false, active)

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
        <Entrance icon="spark" title="Il tuo gusto" text={taste.samples + taste.reacted ? `Preciso al ${confidence(taste).pct}%: lascia una reazione per affinarlo.` : 'Lascia qualche reazione: imparo cosa ti piace davvero.'} onClick={() => goto('taste')} />
        <Entrance icon="bookmark" title="La mia lista" text={listCount ? `${listCount} titoli salvati, organizzati.` : 'Da vedere, preferiti, visti: tutto in ordine.'} onClick={() => goto('library')} />
      </div>
      <button className="banner" onClick={() => goto('together')}>
        <Icon name="users" size={22} />
        <span><b>Scegliamo insieme</b> Due persone, un punto d'incontro. Senza account.</span>
        <Icon name="arrow" size={18} />
      </button>

      <Expiring onCount={setExpiringCount} />
      <TitleRail title="Consigliati per te" items={recsF} />
      {bestF.length > 0 && (
        <TitleRail
          title="Il meglio, secondo i numeri"
          items={bestF.slice(0, 16).map(bestToTitle)}
          action={<button className="link" onClick={() => goto('best')}>Vedi tutti</button>}
        />
      )}
      <p className="muted" style={{ marginTop: 28 }}>
        Per esplorare liberamente tutto il catalogo con i filtri, vai su <button className="link" onClick={() => goto('explore')}>Esplora</button>.
      </p>
    </>
  )
}
