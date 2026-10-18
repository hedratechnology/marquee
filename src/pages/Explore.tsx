import { useCallback, useEffect, useRef, useState } from 'react'
import * as tmdb from '../tmdb'
import type { Kind, Query, Title } from '../tmdb'
import { getOmdbKey } from '../omdb'
import { useRatings } from '../omdb'
import type { useViews } from '../views'
import { MAX_VIEWS } from '../views'
import { Chip, Empty, Range, Sheet, SkeletonGrid, TitleGrid } from '../ui/components'
import { Icon } from '../ui/icons'
import { errText, summary } from '../ui/helpers'

type ViewsApi = ReturnType<typeof useViews>

const toggleIn = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

function ManageViews({ api, q, onClose }: { api: ViewsApi; q: Query; onClose: () => void }) {
  const [name, setName] = useState('')
  return (
    <Sheet title="Le tue viste" onClose={onClose}>
      <p className="muted">Una vista è un insieme di filtri salvato con un nome. Ne puoi avere fino a {MAX_VIEWS}.</p>
      <div className="viewlist">
        {api.views.map((v, i) => (
          <div key={v.id} className="viewitem">
            <b>{v.name}</b>
            <span className="muted">{summary(v.query)}</span>
            <div className="tools">
              <button className="btn sm" disabled={i === 0} onClick={() => api.move(v.id, -1)} aria-label="Sposta su"><Icon name="up" size={14} /></button>
              <button className="btn sm" disabled={i === api.views.length - 1} onClick={() => api.move(v.id, 1)} aria-label="Sposta giù"><Icon name="down" size={14} /></button>
              <button className="btn sm" onClick={() => { const n = prompt('Nome della vista', v.name); if (n?.trim()) api.rename(v.id, n.trim()) }}>Rinomina</button>
              <button className="btn sm" onClick={() => api.update(v.id, q)}>Usa i filtri attuali</button>
              <button className="btn sm" onClick={() => api.remove(v.id)}>Elimina</button>
            </div>
          </div>
        ))}
      </div>
      {api.views.length < MAX_VIEWS ? (
        <div className="row" style={{ marginTop: 16 }}>
          <input className="field" placeholder="Nome nuova vista" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn gold" disabled={!name.trim()} onClick={() => { api.add(name.trim(), q); setName('') }}>Salva filtri attuali</button>
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 14 }}>Hai raggiunto il massimo di {MAX_VIEWS} viste: eliminane una per aggiungerne un'altra.</p>
      )}
    </Sheet>
  )
}

function FilterSheet({ q, set, reset, count, onClose }: {
  q: Query; set: (p: Partial<Query>) => void; reset: () => void; count: number; onClose: () => void
}) {
  const [genres, setGenres] = useState<tmdb.GenreEntry[]>([])
  const [actorQ, setActorQ] = useState('')
  const [sugg, setSugg] = useState<{ id: number; name: string }[]>([])
  useEffect(() => {
    tmdb.genreList().then(setGenres).catch(() => setGenres([]))
  }, [])
  const types = tmdb.kindTypes(q.kinds)
  const options = genres.filter((g) => types.some((t) => g[t] !== undefined))

  async function findActor(v: string) {
    setActorQ(v)
    if (v.length < 2) return setSugg([])
    try {
      setSugg(await tmdb.searchPerson(v))
    } catch {
      setSugg([])
    }
  }

  return (
    <Sheet title="Filtri" onClose={onClose} drawer>
      <div className="group">
        <span className="eyebrow">Tipo</span>
        <div className="row">
          {tmdb.KINDS.map((k) => (
            <Chip key={k.id} on={q.kinds.includes(k.id)} onClick={() => (q.kinds.length > 1 || !q.kinds.includes(k.id) ? set({ kinds: toggleIn<Kind>(q.kinds, k.id), genre: undefined }) : undefined)}>{k.label}</Chip>
          ))}
        </div>
      </div>
      <div className="group">
        <span className="eyebrow">Piattaforme in Italia</span>
        <div className="row">
          {tmdb.PROVIDERS.map((p) => (
            <Chip key={p.id} on={q.providers.includes(p.id)} onClick={() => set({ providers: toggleIn(q.providers, p.id) })}>{p.name}</Chip>
          ))}
        </div>
        {q.actor && q.providers.length > 0 && <p className="muted">Con un attore selezionato le piattaforme non si applicano.</p>}
      </div>
      <div className="group">
        <span className="eyebrow">Punteggi minimi</span>
        {!getOmdbKey() && <p className="muted">Per IMDb, Rotten Tomatoes e Metacritic inserisci la chiave OMDb in Impostazioni.</p>}
        <Range label="IMDb" value={q.minImdb} min={0} max={9.5} step={0.1} onChange={(v) => set({ minImdb: v })} />
        <Range label="Rotten Tomatoes" value={q.minRt} min={0} max={100} step={5} suffix="%" onChange={(v) => set({ minRt: v })} />
        <Range label="Metacritic" value={q.minMeta} min={0} max={100} step={5} onChange={(v) => set({ minMeta: v })} />
        <Range label="TMDB" value={q.minTmdb} min={0} max={9} step={0.1} onChange={(v) => set({ minTmdb: v })} />
      </div>
      <div className="group">
        <span className="eyebrow">Genere, lingua, durata</span>
        <div className="row">
          <select className="field" value={q.genre ?? ''} onChange={(e) => set({ genre: e.target.value || undefined })}>
            <option value="">Tutti i generi</option>
            {options.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
          </select>
          <select className="field" value={q.lang ?? ''} onChange={(e) => set({ lang: e.target.value || undefined })}>
            <option value="">Ogni lingua</option>
            {tmdb.LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <select className="field" value={q.maxRuntime ?? 0} onChange={(e) => set({ maxRuntime: +e.target.value || undefined })}>
            <option value={0}>Ogni durata</option>
            <option value={100}>Film sotto 100 min</option>
            <option value={120}>Film sotto 120 min</option>
            <option value={150}>Film sotto 150 min</option>
          </select>
        </div>
      </div>
      <div className="group">
        <span className="eyebrow">Anno</span>
        <div className="row">
          <input className="field" type="number" inputMode="numeric" placeholder="Dal" value={q.yearFrom ?? ''} onChange={(e) => set({ yearFrom: e.target.value || undefined })} />
          <input className="field" type="number" inputMode="numeric" placeholder="Al" value={q.yearTo ?? ''} onChange={(e) => set({ yearTo: e.target.value || undefined })} />
        </div>
      </div>
      <div className="group">
        <span className="eyebrow">Attore o attrice</span>
        {q.actor ? (
          <button className="btn on" onClick={() => { set({ actor: undefined }); setActorQ('') }}>{q.actor.name} <Icon name="x" size={14} /></button>
        ) : (
          <input style={{ width: '100%' }} placeholder="Cerca un nome…" value={actorQ} onChange={(e) => findActor(e.target.value)} />
        )}
        {!q.actor && sugg.length > 0 && (
          <div className="row" style={{ marginTop: 10 }}>
            {sugg.map((s) => <Chip key={s.id} onClick={() => { set({ actor: s }); setSugg([]) }}>{s.name}</Chip>)}
          </div>
        )}
      </div>
      <div className="group">
        <span className="eyebrow">Ordina e nascondi</span>
        <div className="row">
          <select className="field" value={q.sort} onChange={(e) => set({ sort: e.target.value as Query['sort'] })}>
            <option value="popularity">Più popolari</option>
            <option value="rating">Voto più alto</option>
            <option value="recent">Più recenti</option>
          </select>
          <Chip on={q.hideSeen} onClick={() => set({ hideSeen: !q.hideSeen })}>Nascondi i già visti</Chip>
        </div>
      </div>
      <div className="row between" style={{ marginTop: 8 }}>
        <button className="btn" onClick={reset}>Azzera</button>
        <button className="btn gold" onClick={onClose}>Mostra {count} titoli</button>
      </div>
    </Sheet>
  )
}

export function Explore({ seen, views, active }: { seen: Title[]; views: ViewsApi; active: boolean }) {
  const [q, setQ] = useState<Query>(tmdb.emptyQuery)
  const [activeView, setActiveView] = useState<string | null>(null)
  const [items, setItems] = useState<Title[]>([])
  const [page, setPage] = useState(1)
  const [more, setMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [filters, setFilters] = useState(false)
  const [manage, setManage] = useState(false)
  const reqId = useRef(0)
  const R = useRatings()

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

  // Punteggi e "nascondi visti" si applicano lato client: non rifanno la chiamata
  const serverKey = JSON.stringify({ ...q, minImdb: 0, minRt: 0, minMeta: 0, hideSeen: false })
  useEffect(() => {
    load(JSON.parse(serverKey), 1)
  }, [serverKey, load])

  useEffect(() => {
    if (active && (err || !items.length)) load(JSON.parse(serverKey), 1)
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

  // Con filtri sui punteggi passano pochi titoli: carica altre pagine finché ce ne sono abbastanza
  useEffect(() => {
    if (ratingFilter && R.enabled && !R.limited && !loading && more && R.pending === 0 && visible.length < 12 && page < 6 && items.length) {
      load(JSON.parse(serverKey), page + 1)
    }
  })

  const set = (p: Partial<Query>) => {
    setActiveView(null)
    setQ((c) => ({ ...c, ...p }))
  }
  const activeCount =
    (q.genre ? 1 : 0) + (q.providers.length ? 1 : 0) + (q.yearFrom || q.yearTo ? 1 : 0) + (q.actor ? 1 : 0) +
    (q.minImdb ? 1 : 0) + (q.minRt ? 1 : 0) + (q.minMeta ? 1 : 0) + (q.minTmdb ? 1 : 0) +
    (q.maxRuntime ? 1 : 0) + (q.lang ? 1 : 0) + (q.hideSeen ? 1 : 0)

  return (
    <>
      <div className="row between">
        <h1 className="page-title">Esplora</h1>
        <div className="row">
          <button className="iconbtn" onClick={() => setManage(true)} aria-label="Gestisci le viste"><Icon name="edit" size={18} /></button>
          <button className={'btn' + (activeCount ? ' on' : '')} onClick={() => setFilters(true)}>
            <Icon name="filter" size={18} /> Filtri{activeCount ? ` · ${activeCount}` : ''}
          </button>
        </div>
      </div>

      <div className="pills" role="tablist" aria-label="Le tue viste">
        <button className={'pill' + (activeView === null && activeCount === 0 ? ' on' : '')} onClick={() => { setQ(tmdb.emptyQuery); setActiveView(null) }}>Tutto</button>
        {views.views.map((v) => (
          <button key={v.id} role="tab" aria-selected={activeView === v.id} className={'pill' + (activeView === v.id ? ' on' : '')} onClick={() => { setQ(v.query); setActiveView(v.id) }}>
            {v.name}
          </button>
        ))}
      </div>

      <div className="row" style={{ margin: '14px 0 20px' }}>
        {tmdb.KINDS.map((k) => (
          <Chip key={k.id} on={q.kinds.includes(k.id)} onClick={() => (q.kinds.length > 1 || !q.kinds.includes(k.id) ? set({ kinds: toggleIn<Kind>(q.kinds, k.id), genre: undefined }) : undefined)}>{k.label}</Chip>
        ))}
      </div>

      {err && <p className="err">{err}</p>}
      {ratingFilter && R.limited && <p className="err">Limite giornaliero OMDb raggiunto: i filtri sui punteggi usano solo i titoli già controllati.</p>}
      {ratingFilter && R.pending > 0 && <p className="muted">Controllo i punteggi… ({R.pending})</p>}

      {loading && items.length === 0 ? (
        <SkeletonGrid />
      ) : (
        <TitleGrid
          items={visible}
          empty={<Empty title="Nessun titolo" text={ratingFilter && R.pending === 0 ? 'Nessun titolo supera questi punteggi: abbassa le soglie.' : 'Prova ad allargare i filtri.'} />}
        />
      )}
      {more && items.length > 0 && !q.actor && (
        <div className="row center" style={{ margin: '28px 0' }}>
          <button className="btn" disabled={loading} onClick={() => load(JSON.parse(serverKey), page + 1)}>{loading ? 'Carico…' : 'Carica altri'}</button>
        </div>
      )}

      {filters && <FilterSheet q={q} set={set} reset={() => { setActiveView(null); setQ(tmdb.emptyQuery) }} count={visible.length} onClose={() => setFilters(false)} />}
      {manage && <ManageViews api={views} q={q} onClose={() => setManage(false)} />}
    </>
  )
}
