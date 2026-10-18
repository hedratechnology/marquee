import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import * as tmdb from './tmdb'
import type { Detail, Kind, Query, Title } from './tmdb'
import { getOmdbKey, requestRatings, setOmdbKey, useRatings } from './omdb'
import type { Ratings } from './omdb'
import { useLists } from './store'
import type { ListName, Lists as ListsData } from './store'
import { MAX_VIEWS, useViews } from './views'
import type { View } from './views'
import { SUGGESTED_SOURCES, useSources } from './sources'
import type { Platform } from './sources'

type Tab = 'explore' | 'search' | 'recs' | 'lists' | 'settings'
type Opener = (t: Title) => void
type ViewsApi = ReturnType<typeof useViews>

const LIST_LABEL: Record<ListName, string> = { watchlist: 'Da vedere', seen: 'Visti', favorites: 'Preferiti' }
const num = (n: number) => String(n).replace('.', ',')

function errText(e: unknown) {
  const m = e instanceof Error ? e.message : ''
  if (m === 'NO_KEY') return 'Inserisci la chiave TMDB in Impostazioni.'
  if (m === 'BAD_KEY') return 'Chiave TMDB non valida.'
  return 'Errore di rete. Riprova.'
}

function summary(q: Query): string {
  const kinds = tmdb.KINDS.filter((k) => q.kinds.includes(k.id)).map((k) => k.label)
  const parts = [kinds.join(', ')]
  if (q.genre) parts.push(q.genre)
  if (q.minImdb) parts.push(`IMDb ${num(q.minImdb)}+`)
  if (q.minRt) parts.push(`RT ${q.minRt}%+`)
  if (q.minMeta) parts.push(`Meta ${q.minMeta}+`)
  if (q.minTmdb) parts.push(`TMDB ${num(q.minTmdb)}+`)
  if (q.providers.length) parts.push(tmdb.PROVIDERS.filter((p) => q.providers.includes(p.id)).map((p) => p.name).join('/'))
  if (q.yearFrom || q.yearTo) parts.push(`${q.yearFrom || '…'}–${q.yearTo || '…'}`)
  if (q.actor) parts.push(q.actor.name)
  return parts.join(' · ')
}

function badges(t: Title, r: Ratings | undefined, enabled: boolean) {
  const list: string[] = []
  if (r?.imdb !== undefined) list.push(`IMDb ${num(r.imdb)}`)
  if (r?.rt !== undefined) list.push(`RT ${r.rt}%`)
  if (r?.meta !== undefined) list.push(`MC ${r.meta}`)
  if (!list.length && (!enabled || r)) list.push(`TMDB ${num(t.rating)}`)
  return list
}

interface ListsApi {
  has: (l: ListName, t: Title) => boolean
  toggle: (l: ListName, t: Title) => void
}
const ListsCtx = createContext<ListsApi>({ has: () => false, toggle: () => undefined })

function PosterCard({ t, name, sub, due, open }: { t?: Title; name: string; sub: string; due?: string; open: Opener }) {
  const R = useRatings()
  const { has, toggle } = useContext(ListsCtx)
  const fav = t ? has('favorites', t) : false
  const watch = t ? has('watchlist', t) : false
  const go = () => t && open(t)
  return (
    <div className="card">
      <div className="poster">
        <button className="open" onClick={go} aria-label={`Apri ${name}`}>
          {t?.poster ? <img loading="lazy" src={`${tmdb.IMG}/w342${t.poster}`} alt="" /> : <div className="noimg">{name}</div>}
        </button>
        {due && <span className="due">{due}</span>}
        <div className="qa">
          <button className={fav ? 'on' : ''} disabled={!t} aria-pressed={fav} aria-label={fav ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'} onClick={() => t && toggle('favorites', t)}>
            {fav ? '★' : '☆'}
          </button>
          <button className={watch ? 'on' : ''} disabled={!t} aria-pressed={watch} aria-label={watch ? 'Togli da Da vedere' : 'Aggiungi a Da vedere'} onClick={() => t && toggle('watchlist', t)}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill={watch ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 3h12v18l-6-4-6 4z" />
            </svg>
          </button>
        </div>
        {t && (
          <div className="badges">
            {badges(t, R.get(t), R.enabled).map((b) => (
              <span key={b}>{b}</span>
            ))}
          </div>
        )}
      </div>
      <button className="open meta" onClick={go}>
        <b>{name}</b>
        <span className="muted">{sub}</span>
      </button>
    </div>
  )
}

function Grid({ items, open, empty }: { items: Title[]; open: Opener; empty?: string }) {
  useEffect(() => requestRatings(items), [items])
  if (!items.length) return <p className="muted">{empty ?? 'Nessun risultato.'}</p>
  return (
    <div className="grid">
      {items.map((t) => (
        <PosterCard key={t.type + t.id} t={t} name={t.title} sub={`${t.year} · ${t.type === 'movie' ? 'Film' : 'Serie'}`} open={open} />
      ))}
    </div>
  )
}

function Chip({ on, children, onClick }: { on?: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button className={'chip' + (on ? ' on' : '')} onClick={onClick}>
      {children}
    </button>
  )
}

function Range({ label, value, min, max, step, suffix = '', onChange }: {
  label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (v: number) => void
}) {
  return (
    <label className="rng">
      <span className="k">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      <span className="v">{value ? num(value) + suffix : 'Tutti'}</span>
    </label>
  )
}

function ViewsStrip({ api, q, onApply, activeId }: { api: ViewsApi; q: Query; onApply: (v: View) => void; activeId: string | null }) {
  const [edit, setEdit] = useState(false)
  return (
    <section>
      <div className="row between">
        <h2>Le tue viste</h2>
        <button className="link" onClick={() => setEdit((e) => !e)}>{edit ? 'Fine' : 'Modifica'}</button>
      </div>
      <div className="views">
        {api.views.map((v, i) => (
          <div key={v.id} className={'view' + (activeId === v.id ? ' on' : '')}>
            <button className="viewmain" onClick={() => onApply(v)}>
              <b>{v.name}</b>
              <span>{summary(v.query)}</span>
            </button>
            {edit && (
              <div className="viewtools">
                <button aria-label="Sposta a sinistra" disabled={i === 0} onClick={() => api.move(v.id, -1)}>←</button>
                <button aria-label="Sposta a destra" disabled={i === api.views.length - 1} onClick={() => api.move(v.id, 1)}>→</button>
                <button onClick={() => { const n = prompt('Nome della vista', v.name); if (n?.trim()) api.rename(v.id, n.trim()) }}>Nome</button>
                <button onClick={() => api.update(v.id, q)}>Usa filtri attuali</button>
                <button onClick={() => api.remove(v.id)}>Elimina</button>
              </div>
            )}
          </div>
        ))}
        {api.views.length < MAX_VIEWS && (
          <button className="view add" onClick={() => { const n = prompt('Nome della nuova vista (usa i filtri attuali)'); if (n?.trim()) api.add(n.trim(), q) }}>
            + Nuova vista
          </button>
        )}
      </div>
    </section>
  )
}


interface ExpiringItem {
  type: tmdb.MediaType
  id: number
  title: string
  year: number | null
  imdb: number | null
  service: string
  serviceName: string
  expiresAt: number
  link: string | null
}

const DAY = 86400000

function daysLabel(ts: number) {
  const d = Math.ceil((ts * 1000 - Date.now()) / DAY)
  return d <= 0 ? 'oggi' : d === 1 ? 'domani' : `tra ${d} giorni`
}

function Expiring({ open, active }: { open: Opener; active: boolean }) {
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
    .slice(0, 14)
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
  }, [shownKey, active])

  if (!data?.items.length) return null
  const services = [...new Map(data.items.map((i) => [i.service, i.serviceName])).entries()]

  return (
    <section>
      <div className="row between">
        <h2>In scadenza che meritano</h2>
        <div className="row">
          <select value={service} onChange={(e) => setService(e.target.value)}>
            <option value="">Tutte le piattaforme</option>
            {services.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={min} onChange={(e) => { setMin(+e.target.value); localStorage.setItem('exp_min', e.target.value) }}>
            {[6, 6.5, 7, 7.5, 8].map((v) => <option key={v} value={v}>IMDb {num(v)}+</option>)}
          </select>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="muted">Nessun titolo in scadenza con questi criteri.</p>
      ) : (
        <div className="exp">
          {shown.map((i) => (
            <PosterCard
              key={i.type + i.id + i.service}
              t={titles[i.type + i.id]}
              name={i.title}
              sub={`${i.serviceName}${i.imdb !== null ? ` · IMDb ${num(i.imdb)}` : ''}`}
              due={daysLabel(i.expiresAt)}
              open={open}
            />
          ))}
        </div>
      )}
      <p className="muted">Dati per l'Italia, aggiornati il {new Date(data.generatedAt).toLocaleDateString('it-IT')}.</p>
    </section>
  )
}

function Explore({ open, seen, views, active }: { open: Opener; seen: Title[]; views: ViewsApi; active: boolean }) {
  const [q, setQ] = useState<Query>(tmdb.emptyQuery)
  const [activeView, setActiveView] = useState<string | null>(null)
  const [panel, setPanel] = useState(false)
  const [items, setItems] = useState<Title[]>([])
  const [page, setPage] = useState(1)
  const [more, setMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [genres, setGenres] = useState<tmdb.GenreEntry[]>([])
  const [actorQ, setActorQ] = useState('')
  const [sugg, setSugg] = useState<{ id: number; name: string }[]>([])
  const reqId = useRef(0)
  const R = useRatings()

  useEffect(() => {
    tmdb.genreList().then(setGenres).catch(() => setGenres([]))
  }, [])

  const load = useCallback(async (query: Query, p: number) => {
    const id = ++reqId.current
    setLoading(true)
    setErr('')
    try {
      const r = await tmdb.discover(query, p)
      if (id !== reqId.current) return
      setItems((cur) => (p === 1 ? r.items : [...cur, ...r.items.filter((n) => !cur.some((c) => c.id === n.id && c.type === n.type))]))
      setMore(r.more)
      setPage(p)
    } catch (e) {
      if (id === reqId.current) setErr(errText(e))
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }, [])

  // I punteggi e "nascondi visti" si applicano lato client: non rifanno la chiamata a TMDB
  const serverKey = JSON.stringify({ ...q, minImdb: 0, minRt: 0, minMeta: 0, hideSeen: false })
  useEffect(() => {
    load(JSON.parse(serverKey), 1)
  }, [serverKey, load])

  // Tornando su Esplora dopo aver inserito la chiave, riprova se c'era un errore o nessun dato
  useEffect(() => {
    if (!active) return
    if (err || !items.length) load(JSON.parse(serverKey), 1)
    if (!genres.length) tmdb.genreList().then(setGenres).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  const seenSet = new Set(seen.map((t) => t.type + t.id))
  const ratingFilter = !!(q.minImdb || q.minRt || q.minMeta)
  const visible = items.filter((t) => {
    if (q.hideSeen && seenSet.has(t.type + t.id)) return false
    if (!ratingFilter) return true
    const r = R.get(t)
    if (!r) return false
    if (q.minImdb && !(r.imdb !== undefined && r.imdb >= q.minImdb)) return false
    if (q.minRt && !(r.rt !== undefined && r.rt >= q.minRt)) return false
    if (q.minMeta && !(r.meta !== undefined && r.meta >= q.minMeta)) return false
    return true
  })

  // Con filtri sui punteggi pochi titoli passano: carica altre pagine finché ce ne sono abbastanza
  useEffect(() => {
    if (ratingFilter && R.enabled && !R.limited && !loading && more && R.pending === 0 && visible.length < 12 && page < 6 && items.length) {
      load(JSON.parse(serverKey), page + 1)
    }
  })

  const set = (p: Partial<Query>) => {
    setActiveView(null)
    setQ((c) => ({ ...c, ...p }))
  }
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
  const types = tmdb.kindTypes(q.kinds)
  const genreOptions = genres.filter((g) => types.some((t) => g[t] !== undefined))

  async function findActor(v: string) {
    setActorQ(v)
    if (v.length < 2) return setSugg([])
    try {
      setSugg(await tmdb.searchPerson(v))
    } catch {
      setSugg([])
    }
  }

  const activeCount =
    (q.genre ? 1 : 0) + (q.providers.length ? 1 : 0) + (q.yearFrom || q.yearTo ? 1 : 0) + (q.actor ? 1 : 0) +
    (q.minImdb ? 1 : 0) + (q.minRt ? 1 : 0) + (q.minMeta ? 1 : 0) + (q.minTmdb ? 1 : 0) +
    (q.maxRuntime ? 1 : 0) + (q.lang ? 1 : 0) + (q.hideSeen ? 1 : 0)

  return (
    <>
      <ViewsStrip
        api={views}
        q={q}
        activeId={activeView}
        onApply={(v) => { setQ(v.query); setActiveView(v.id) }}
      />

      <Expiring open={open} active={active} />

      <div className="row between">
        <h2>Esplora</h2>
        <div className="row">
          {visible.length > 0 && <button onClick={() => open(visible[Math.floor(Math.random() * visible.length)])}>Sorprendimi</button>}
          <button className={panel ? 'on' : ''} onClick={() => setPanel((p) => !p)}>
            Filtri{activeCount ? ` (${activeCount})` : ''}
          </button>
        </div>
      </div>

      <div className="row">
        {tmdb.KINDS.map((k) => (
          <Chip key={k.id} on={q.kinds.includes(k.id)} onClick={() => q.kinds.length > 1 || !q.kinds.includes(k.id) ? set({ kinds: toggle<Kind>(q.kinds, k.id), genre: undefined }) : undefined}>
            {k.label}
          </Chip>
        ))}
      </div>

      {panel && (
        <div className="panel">
          <p className="lbl">Piattaforme (Italia, abbonamento incluso)</p>
          <div className="row">
            {tmdb.PROVIDERS.map((p) => (
              <Chip key={p.id} on={q.providers.includes(p.id)} onClick={() => set({ providers: toggle(q.providers, p.id) })}>{p.name}</Chip>
            ))}
          </div>

          <p className="lbl">Punteggi minimi</p>
          {!getOmdbKey() && <p className="muted">Per IMDb, Rotten Tomatoes e Metacritic inserisci la chiave OMDb in Impostazioni.</p>}
          <Range label="IMDb" value={q.minImdb} min={0} max={9.5} step={0.1} onChange={(v) => set({ minImdb: v })} />
          <Range label="Rotten Tomatoes" value={q.minRt} min={0} max={100} step={5} suffix="%" onChange={(v) => set({ minRt: v })} />
          <Range label="Metacritic" value={q.minMeta} min={0} max={100} step={5} onChange={(v) => set({ minMeta: v })} />
          <Range label="TMDB" value={q.minTmdb} min={0} max={9} step={0.1} onChange={(v) => set({ minTmdb: v })} />

          <p className="lbl">Dettagli</p>
          <div className="row">
            <select className="grow" value={q.genre ?? ''} onChange={(e) => set({ genre: e.target.value || undefined })}>
              <option value="">Tutti i generi</option>
              {genreOptions.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
            </select>
            <select value={q.lang ?? ''} onChange={(e) => set({ lang: e.target.value || undefined })}>
              <option value="">Ogni lingua</option>
              {tmdb.LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
            <select value={q.maxRuntime ?? 0} onChange={(e) => set({ maxRuntime: +e.target.value || undefined })}>
              <option value={0}>Ogni durata</option>
              <option value={100}>Film sotto 100 min</option>
              <option value={120}>Film sotto 120 min</option>
              <option value={150}>Film sotto 150 min</option>
            </select>
          </div>
          <div className="row">
            <input className="grow" type="number" placeholder="Dall'anno" value={q.yearFrom ?? ''} onChange={(e) => set({ yearFrom: e.target.value || undefined })} />
            <input className="grow" type="number" placeholder="Fino all'anno" value={q.yearTo ?? ''} onChange={(e) => set({ yearTo: e.target.value || undefined })} />
          </div>
          <div className="row">
            {q.actor ? (
              <button className="on" onClick={() => { set({ actor: undefined }); setActorQ('') }}>Attore: {q.actor.name} ✕</button>
            ) : (
              <input className="grow" placeholder="Attore o attrice…" value={actorQ} onChange={(e) => findActor(e.target.value)} />
            )}
          </div>
          {!q.actor && sugg.length > 0 && (
            <div className="row">
              {sugg.map((s) => <Chip key={s.id} onClick={() => { set({ actor: s }); setSugg([]) }}>{s.name}</Chip>)}
            </div>
          )}
          {q.actor && q.providers.length > 0 && <p className="muted">Con un attore selezionato il filtro piattaforme non si applica.</p>}
          <div className="row">
            <Chip on={q.hideSeen} onClick={() => set({ hideSeen: !q.hideSeen })}>Nascondi i già visti</Chip>
            <select value={q.sort} onChange={(e) => set({ sort: e.target.value as Query['sort'] })}>
              <option value="popularity">Più popolari</option>
              <option value="rating">Voto più alto</option>
              <option value="recent">Più recenti</option>
            </select>
            <button onClick={() => { setActiveView(null); setQ(tmdb.emptyQuery) }}>Azzera</button>
          </div>
        </div>
      )}

      {err && <p className="err">{err}</p>}
      {ratingFilter && R.limited && <p className="err">Limite giornaliero OMDb raggiunto: i filtri sui punteggi usano solo i titoli già controllati.</p>}
      {ratingFilter && R.pending > 0 && <p className="muted">Controllo i punteggi… ({R.pending})</p>}
      <Grid items={visible} open={open} empty={loading ? 'Carico…' : ratingFilter && R.pending === 0 ? 'Nessun titolo supera questi punteggi: abbassa le soglie.' : undefined} />
      {more && items.length > 0 && !q.actor && (
        <div className="row center">
          <button disabled={loading} onClick={() => load(JSON.parse(serverKey), page + 1)}>{loading ? 'Carico…' : 'Carica altri'}</button>
        </div>
      )}
    </>
  )
}

function Search({ open }: { open: Opener }) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Title[]>([])
  const [err, setErr] = useState('')

  useEffect(() => {
    if (q.trim().length < 2) return
    const h = setTimeout(() => {
      tmdb.search(q).then((r) => { setItems(r); setErr('') }).catch((e) => setErr(errText(e)))
    }, 350)
    return () => clearTimeout(h)
  }, [q])

  return (
    <>
      <h1>Cerca</h1>
      <input style={{ width: '100%' }} autoFocus placeholder="Titolo di film o serie…" value={q} onChange={(e) => setQ(e.target.value)} />
      {err && <p className="err">{err}</p>}
      <Grid items={q.trim().length < 2 ? [] : items} open={open} empty={q.length < 2 ? 'Scrivi almeno 2 lettere.' : undefined} />
    </>
  )
}

function Recs({ open, favorites, seen }: { open: Opener; favorites: Title[]; seen: Title[] }) {
  const [items, setItems] = useState<Title[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const base = favorites.slice(0, 8)
    if (!base.length) return
    setLoading(true)
    Promise.all(base.map((t) => tmdb.recommendations(t.type, t.id).catch(() => [] as Title[])))
      .then((all) => {
        const score = new Map<string, { t: Title; n: number }>()
        for (const t of all.flat()) {
          const k = t.type + t.id
          const cur = score.get(k)
          if (cur) cur.n++
          else score.set(k, { t, n: 1 })
        }
        const known = new Set([...favorites, ...seen].map((t) => t.type + t.id))
        setItems(
          [...score.values()]
            .filter((x) => !known.has(x.t.type + x.t.id) && x.t.poster)
            .sort((a, b) => b.n - a.n || b.t.rating - a.t.rating)
            .slice(0, 30)
            .map((x) => x.t),
        )
      })
      .catch((e) => setErr(errText(e)))
      .finally(() => setLoading(false))
  }, [favorites, seen])

  return (
    <>
      <h1>Consigli per te</h1>
      <p className="muted">Basati sui tuoi preferiti. Titoli già visti o preferiti esclusi.</p>
      {err && <p className="err">{err}</p>}
      {loading && <p className="muted">Carico…</p>}
      <Grid items={items} open={open} empty="Aggiungi qualche titolo ai Preferiti per ricevere consigli." />
    </>
  )
}

function Lists({ open, lists }: { open: Opener; lists: ListsData }) {
  const [tab, setTab] = useState<ListName>('watchlist')
  return (
    <>
      <h1>Le mie liste</h1>
      <div className="row">
        {(Object.keys(LIST_LABEL) as ListName[]).map((l) => (
          <Chip key={l} on={tab === l} onClick={() => setTab(l)}>{LIST_LABEL[l]} ({lists[l].length})</Chip>
        ))}
      </div>
      <Grid items={lists[tab]} open={open} empty="Lista vuota." />
    </>
  )
}

function KeyField({ label, help, value, onSave }: { label: string; help: string; value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  const [saved, setSaved] = useState(false)
  return (
    <>
      <h2>{label}</h2>
      <p className="muted">{help}</p>
      <div className="row">
        <input className="grow" type="password" value={v} onChange={(e) => { setV(e.target.value); setSaved(false) }} placeholder="Incolla qui la chiave" />
        <button className="primary" onClick={() => { onSave(v); setSaved(true) }}>Salva</button>
      </div>
      {saved && <p className="muted">Salvata ✓</p>}
    </>
  )
}

const PLATFORM_LABEL: Record<Platform, string> = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', x: 'X', other: 'Link' }

function LinkList({ title, help, placeholder, items, onAdd, onRemove, extra }: {
  title: string
  help: string
  placeholder: string
  items: { id: string; url: string; name: string; tag?: string }[]
  onAdd: (v: string) => string | null
  onRemove: (id: string) => void
  extra?: React.ReactNode
}) {
  const [v, setV] = useState('')
  const [err, setErr] = useState('')
  function add() {
    const e = onAdd(v)
    setErr(e ?? '')
    if (!e) setV('')
  }
  return (
    <>
      <h2>{title}</h2>
      <p className="muted">{help}</p>
      <div className="row">
        <input
          className="grow"
          value={v}
          placeholder={placeholder}
          onChange={(e) => { setV(e.target.value); setErr('') }}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="primary" onClick={add}>Aggiungi</button>
      </div>
      {err && <p className="err">{err}</p>}
      {extra}
      {items.length === 0 ? (
        <p className="muted">Nessun elemento.</p>
      ) : (
        <ul className="links">
          {items.map((i) => (
            <li key={i.id}>
              <a href={i.url} target="_blank" rel="noreferrer">{i.name}</a>
              {i.tag && <span className="muted"> · {i.tag}</span>}
              <button aria-label={`Rimuovi ${i.name}`} onClick={() => onRemove(i.id)}>Rimuovi</button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function Settings({ lists, views, replaceLists, src }: {
  lists: ListsData
  views: ViewsApi
  replaceLists: (l: ListsData) => void
  src: ReturnType<typeof useSources>
}) {
  function exportJson() {
    const data = { lists, views: views.views, sources: src.sources, profiles: src.profiles }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'marquee-backup.json'
    a.click()
  }
  async function importJson(file: File) {
    try {
      const d = JSON.parse(await file.text())
      replaceLists(d.lists ?? d)
      if (Array.isArray(d.views)) views.replace(d.views)
      src.replace(d.sources, d.profiles)
    } catch {
      alert('File non valido.')
    }
  }
  const missing = SUGGESTED_SOURCES.filter((s) => !src.sources.some((x) => x.url.replace(/\/$/, '') === s.url))

  return (
    <>
      <h1>Impostazioni</h1>

      <LinkList
        title="Fonti di qualità"
        help="Siti e riviste di cui ti fidi per i consigli. Per ora li salviamo qui; li useremo per la scheda Il meglio."
        placeholder="https://www.mymovies.it"
        items={src.sources}
        onAdd={(v) => src.addSource(v)}
        onRemove={src.removeSource}
        extra={
          missing.length > 0 && (
            <div className="row">
              <span className="muted">Suggerite:</span>
              {missing.map((m) => (
                <Chip key={m.url} onClick={() => src.addSource(m.url, m.name)}>+ {m.name}</Chip>
              ))}
            </div>
          )
        }
      />

      <LinkList
        title="Profili da cui prendere spunto"
        help="Instagram, TikTok, YouTube o altro. Incolla il link del profilo oppure scrivi @nomeprofilo (vale come Instagram)."
        placeholder="https://www.instagram.com/nomeprofilo"
        items={src.profiles.map((p) => ({ id: p.id, url: p.url, name: p.name, tag: PLATFORM_LABEL[p.platform] }))}
        onAdd={(v) => src.addProfile(v)}
        onRemove={src.removeProfile}
      />

      <KeyField label="Chiave TMDB" help="Si crea gratis su themoviedb.org (Impostazioni, API). Resta salvata solo in questo dispositivo. Vanno bene sia la chiave API v3 sia il token Read Access." value={tmdb.getKey()} onSave={tmdb.setKey} />
      <KeyField label="Chiave OMDb (IMDb, Rotten Tomatoes, Metacritic)" help="Si crea gratis su omdbapi.com/apikey.aspx (1000 richieste al giorno). Serve per i punteggi e i relativi filtri." value={getOmdbKey()} onSave={setOmdbKey} />
      <h2>Backup di liste, viste, fonti e profili</h2>
      <div className="row">
        <button onClick={exportJson}>Esporta</button>
        <label>
          <button onClick={(e) => (e.currentTarget.nextElementSibling as HTMLInputElement).click()}>Importa</button>
          <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        </label>
      </div>
      <p className="muted">I dati sono nel browser: per usarli su un altro dispositivo, esporta e importa.</p>
      <p className="muted">Questo prodotto usa l'API di TMDB ma non è approvato o certificato da TMDB.</p>
    </>
  )
}

function DetailSheet({ t, close, has, toggle, open }: {
  t: Title; close: () => void; has: (l: ListName, t: Title) => boolean; toggle: (l: ListName, t: Title) => void; open: Opener
}) {
  const [d, setD] = useState<Detail | null>(null)
  const [similar, setSimilar] = useState<Title[]>([])
  const R = useRatings()

  useEffect(() => {
    setD(null)
    requestRatings([t])
    tmdb.detail(t.type, t.id).then(setD).catch(() => setD(null))
    tmdb.recommendations(t.type, t.id).then((r) => setSimilar(r.slice(0, 12))).catch(() => setSimilar([]))
  }, [t])

  return (
    <div className="modal" onClick={close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="hd">
          {t.poster && <img src={`${tmdb.IMG}/w342${t.poster}`} alt="" />}
          <div>
            <h1 style={{ marginTop: 0 }}>{t.title}</h1>
            <div className="muted">
              {t.year} · {t.type === 'movie' ? 'Film' : 'Serie'}
              {d?.runtime ? ` · ${d.runtime}` : ''}
            </div>
            {d && <div className="muted">{d.genres.join(', ')}</div>}
            <div className="badges inline">
              {badges(t, R.get(t), R.enabled).map((b) => <span key={b}>{b}</span>)}
              {R.get(t) && R.get(t)!.imdb !== undefined && <span>TMDB {num(t.rating)}</span>}
            </div>
          </div>
        </div>
        <div className="row">
          {(Object.keys(LIST_LABEL) as ListName[]).map((l) => (
            <Chip key={l} on={has(l, t)} onClick={() => toggle(l, t)}>{LIST_LABEL[l]}</Chip>
          ))}
        </div>
        <p>{t.overview || 'Nessuna trama disponibile.'}</p>
        {d && (
          <>
            <h2>Dove guardarlo (Italia)</h2>
            {d.providers.length ? (
              <div className="logos">
                {d.providers.map((p) => <img key={p.id} src={`${tmdb.IMG}/w92${p.logo}`} alt={p.name} title={p.name} />)}
              </div>
            ) : (
              <p className="muted">Non in streaming incluso in abbonamento.</p>
            )}
            {d.trailer && <p><a href={d.trailer} target="_blank" rel="noreferrer">Guarda il trailer</a></p>}
            <h2>Cast</h2>
            <p className="muted">{d.cast.map((c) => c.name).join(' · ')}</p>
          </>
        )}
        {similar.length > 0 && (
          <>
            <h2>Simili</h2>
            <Grid items={similar} open={open} />
          </>
        )}
        <div className="row"><button onClick={close}>Chiudi</button></div>
      </div>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab>(tmdb.getKey() ? 'explore' : 'settings')
  const [sel, setSel] = useState<Title | null>(null)
  const { lists, has, toggle, replace } = useLists()
  const views = useViews()
  const src = useSources()

  const tabs: [Tab, string][] = [
    ['explore', 'Esplora'], ['search', 'Cerca'], ['recs', 'Consigli'], ['lists', 'Liste'], ['settings', 'Impost.'],
  ]

  return (
    <ListsCtx.Provider value={{ has, toggle }}>
      <div hidden={tab !== 'explore'}>
        <Explore open={setSel} seen={lists.seen} views={views} active={tab === 'explore'} />
      </div>
      {tab === 'search' && <Search open={setSel} />}
      {tab === 'recs' && <Recs open={setSel} favorites={lists.favorites} seen={lists.seen} />}
      {tab === 'lists' && <Lists open={setSel} lists={lists} />}
      {tab === 'settings' && <Settings lists={lists} views={views} replaceLists={replace} src={src} />}
      {sel && <DetailSheet t={sel} close={() => setSel(null)} has={has} toggle={toggle} open={setSel} />}
      <nav>
        {tabs.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>
    </ListsCtx.Provider>
  )
}
