import { useEffect, useState } from 'react'
import * as tmdb from '../tmdb'
import type { Title } from '../tmdb'
import { requestRatings } from '../omdb'
import { Empty, PosterCard, Rail, TitleRail, num } from '../ui/components'
import { Icon } from '../ui/icons'
import { useLists, useOpen } from '../ui/ctx'
import { daysLabel } from '../ui/helpers'

interface ExpiringItem {
  type: tmdb.MediaType
  id: number
  title: string
  imdb: number | null
  service: string
  serviceName: string
  expiresAt: number
}

interface BestLite {
  type: tmdb.MediaType
  id: number
  title: string
  year: string
  date: string
  poster: string | null
  backdrop?: string | null
  overview: string
  genreIds: number[]
  imdb: number | null
  score: number
}

const asTitle = (i: BestLite): Title => ({
  id: i.id, type: i.type, title: i.title, year: i.year, date: i.date, poster: i.poster, backdrop: i.backdrop,
  rating: i.imdb ?? 0, popularity: 0, genreIds: i.genreIds, overview: i.overview,
})

function Hero({ t, onShuffle }: { t: Title; onShuffle: () => void }) {
  const open = useOpen()
  const { has, toggle } = useLists()
  const watch = has('watchlist', t)
  return (
    <section className="hero" aria-label="Stasera">
      {t.backdrop && <img key={t.id} src={`${tmdb.IMG}/w1280${t.backdrop}`} alt="" />}
      <div className="hero-body">
        <span className="eyebrow">Stasera</span>
        <h1>{t.title}</h1>
        <div className="meta-line">
          <span>{t.type === 'movie' ? 'Film' : 'Serie'}</span>
          {t.year && <span className="dot">{t.year}</span>}
          {t.rating > 0 && <span className="dot">★ {num(t.rating)}</span>}
        </div>
        {t.overview && <p style={{ marginTop: 12 }}>{t.overview}</p>}
        <div className="row">
          <button className="btn gold" onClick={() => open(t)}><Icon name="play" size={16} fill /> Dettagli</button>
          <button className={'btn' + (watch ? ' on' : '')} onClick={() => toggle('watchlist', t)}>
            <Icon name={watch ? 'check' : 'plus'} size={16} /> Da vedere
          </button>
          <button className="iconbtn" onClick={onShuffle} aria-label="Un altro consiglio"><Icon name="shuffle" size={18} /></button>
        </div>
      </div>
    </section>
  )
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

export function Home({ favorites, seen, goto }: { favorites: Title[]; seen: Title[]; goto: (tab: 'best' | 'settings' | 'explore') => void }) {
  const [trend, setTrend] = useState<Title[]>([])
  const [pick, setPick] = useState(0)
  const [recs, setRecs] = useState<Title[]>([])
  const [best, setBest] = useState<BestLite[]>([])
  const [error, setError] = useState('')
  const hasKey = !!tmdb.getKey()

  useEffect(() => {
    if (!hasKey) return
    tmdb.trending().then((r) => { setTrend(r); setPick(Math.floor(Math.random() * Math.min(8, r.length))); setError('') }).catch(() => setError('Non riesco a caricare i consigli. Controlla la chiave TMDB in Impostazioni.'))
  }, [hasKey])

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}best.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setBest(d && Array.isArray(d.items) ? d.items : []))
      .catch(() => setBest([]))
  }, [])

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

  const heroList = trend.filter((t) => t.backdrop)
  const hero = heroList.length ? heroList[pick % heroList.length] : undefined

  return (
    <>
      {error && <p className="err">{error}</p>}
      {hero && <Hero t={hero} onShuffle={() => setPick((p) => p + 1)} />}
      <Expiring />
      <TitleRail title="Consigliati per te" items={recs} />
      {best.length > 0 && (
        <TitleRail
          title="Il meglio, secondo i numeri"
          items={best.slice(0, 16).map(asTitle)}
          action={<button className="link" onClick={() => goto('best')}>Vedi tutti</button>}
        />
      )}
      <TitleRail
        title="Di tendenza questa settimana"
        items={trend}
        action={<button className="link" onClick={() => goto('explore')}>Esplora</button>}
      />
    </>
  )
}
