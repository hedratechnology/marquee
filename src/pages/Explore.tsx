import { useCallback, useEffect, useRef, useState } from 'react'
import * as tmdb from '../tmdb'
import type { Kind, Mood, Query, Title } from '../tmdb'
import { getOmdbKey, requestRatings, useRatings } from '../omdb'
import type { Ratings } from '../omdb'
import type { useViews } from '../views'
import { MAX_VIEWS } from '../views'
import { aiErrorText, getAiKey, nlSearch } from '../ai'
import { usePersonal } from '../personal'
import { Chip, Empty, Range, Sheet, SkeletonGrid, TitleGrid } from '../ui/components'
import { Icon } from '../ui/icons'
import { activeChips, errText, summary } from '../ui/helpers'
import { AWARD_OPTIONS } from '../awards'

type ViewsApi = ReturnType<typeof useViews>

const toggleIn = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

function ManageViews({ api, q, onClose }: { api: ViewsApi; q: Query; onClose: () => void }) {
  const [name, setName] = useState('')
  return (
    <Sheet title="Le tue ricerche salvate" onClose={onClose}>
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
          <input className="field" placeholder="Nome nuova ricerca" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn gold" disabled={!name.trim()} onClick={() => { api.add(name.trim(), q); setName('') }}>Salva i filtri attuali</button>
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 14 }}>Hai raggiunto il massimo di {MAX_VIEWS}: eliminane una per aggiungerne un'altra.</p>
      )}
    </Sheet>
  )
}

function FilterSheet({ q, set, reset, count, onClose, hasMine }: {
  q: Query; set: (p: Partial<Query>) => void; reset: () => void; count: number; onClose: () => void; hasMine: boolean
}) {
  const [genres, setGenres] = useState<tmdb.GenreEntry[]>([])
  const [actorQ, setActorQ] = useState('')
  const [dirQ, setDirQ] = useState('')
  const [sugg, setSugg] = useState<{ id: number; name: string }[]>([])
  const [suggFor, setSuggFor] = useState<'actor' | 'director'>('actor')
  useEffect(() => {
    tmdb.genreList().then(setGenres).catch(() => setGenres([]))
  }, [])
  const types = tmdb.kindTypes(q.kinds)
  const options = genres.filter((g) => types.some((t) => g[t] !== undefined))
  const hasSeries = q.kinds.some((k) => k === 'series' || k === 'miniseries')

  async function find(v: string, who: 'actor' | 'director') {
    if (who === 'actor') setActorQ(v)
    else setDirQ(v)
    setSuggFor(who)
    if (v.length < 2) return setSugg([])
    try {
      setSugg(await tmdb.searchPerson(v))
    } catch {
      setSugg([])
    }
  }

  return (
    <Sheet
      title="Filtri"
      onClose={onClose}
      className="filters"
      foot={
        <>
          <button className="btn" onClick={reset}>Azzera i filtri</button>
          <button className="btn gold" onClick={onClose}>Mostra {count} titoli</button>
        </>
      }
    >
      <div className="fgrid">
        <div className="fcol">
          <div className="group">
            <span className="eyebrow">Tipo</span>
            <div className="row">
              {tmdb.KINDS.map((k) => (
                <Chip key={k.id} on={q.kinds.includes(k.id)} onClick={() => (q.kinds.length > 1 || !q.kinds.includes(k.id) ? set({ kinds: toggleIn<Kind>(q.kinds, k.id), genres: [] }) : undefined)}>{k.label}</Chip>
              ))}
            </div>
          </div>
          <div className="group">
            <span className="eyebrow">Umore (stima dai generi)</span>
            <div className="row">
              {tmdb.MOODS.map((m) => <Chip key={m.id} on={q.moods.includes(m.id)} onClick={() => set({ moods: toggleIn<Mood>(q.moods, m.id) })}>{m.label}</Chip>)}
            </div>
          </div>
          <div className="group">
            <span className="eyebrow">Generi</span>
            <div className="row">
              {options.map((g) => <Chip key={g.name} on={q.genres.includes(g.name)} onClick={() => set({ genres: toggleIn(q.genres, g.name) })}>{g.name}</Chip>)}
            </div>
            {q.genres.length > 1 && (
              <div className="row" style={{ marginTop: 8 }}>
                <Chip on={q.genreMode === 'all'} onClick={() => set({ genreMode: 'all' })}>Tutti insieme</Chip>
                <Chip on={q.genreMode === 'any'} onClick={() => set({ genreMode: 'any' })}>Almeno uno</Chip>
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
        </div>

        <div className="fcol">
          <div className="group">
            <span className="eyebrow">Dove e come guardarlo</span>
            <div className="row">
              <Chip on={q.onlyItaly} onClick={() => set({ onlyItaly: !q.onlyItaly })}>Guardabili in italiano</Chip>
              {hasMine ? (
                <Chip on={q.onlyMine} onClick={() => set({ onlyMine: !q.onlyMine })}>Solo i miei abbonamenti</Chip>
              ) : null}
            </div>
            <p className="muted hint">Titoli disponibili in Italia (abbonamento, noleggio o acquisto): di solito doppiati o sottotitolati. Non si può filtrare per audio o sottotitoli.</p>
            <div className="row" style={{ marginTop: 10 }}>
              {tmdb.PROVIDERS.map((p) => <Chip key={p.id} on={q.providers.includes(p.id)} onClick={() => set({ providers: toggleIn(q.providers, p.id) })}>{p.name}</Chip>)}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <select className="field" value={q.monetization} onChange={(e) => set({ monetization: e.target.value as Query['monetization'] })} aria-label="Disponibilità">
                <option value="any">Abbonamento, noleggio o acquisto</option>
                <option value="flatrate">Solo incluso nell'abbonamento</option>
                <option value="rent">Solo da noleggiare</option>
                <option value="buy">Solo da comprare</option>
              </select>
            </div>
            {!hasMine && <p className="muted hint">Indica i tuoi abbonamenti in Impostazioni per filtrare «solo i miei».</p>}
            {q.actor && q.providers.length > 0 && <p className="muted hint">Con un attore selezionato le piattaforme non si applicano.</p>}
          </div>
          <div className="group">
            <span className="eyebrow">Punteggi minimi</span>
            {!getOmdbKey() && <p className="muted hint">Per IMDb, Rotten Tomatoes e Metacritic serve la chiave OMDb (Impostazioni).</p>}
            <Range label="IMDb" value={q.minImdb} min={0} max={9.5} step={0.1} onChange={(v) => set({ minImdb: v })} />
            <Range label="Rotten Tomatoes" value={q.minRt} min={0} max={100} step={5} suffix="%" onChange={(v) => set({ minRt: v })} />
            <Range label="Metacritic" value={q.minMeta} min={0} max={100} step={5} onChange={(v) => set({ minMeta: v })} />
            <Range label="TMDB" value={q.minTmdb} min={0} max={9} step={0.1} onChange={(v) => set({ minTmdb: v })} />
            {(q.minImdb > 0 || q.minRt > 0 || q.minMeta > 0) && (
              <div className="row" style={{ marginTop: 8 }}>
                <Chip on={q.strictRatings} onClick={() => set({ strictRatings: !q.strictRatings })}>Servono tutti i voti</Chip>
                <span className="muted hint" style={{ flex: 1, minWidth: 160 }}>Rotten Tomatoes e Metacritic mancano spesso per serie e titoli recenti: di solito contano solo i voti che esistono.</span>
              </div>
            )}
          </div>
        </div>

        <div className="fcol">
          <div className="group">
            <span className="eyebrow">Premi vinti</span>
            <div className="row">
              {AWARD_OPTIONS.map((a) => <Chip key={a.id} on={q.awards.includes(a.id)} onClick={() => set({ awards: toggleIn(q.awards, a.id) })}>{a.label}</Chip>)}
            </div>
            <p className="muted hint">Dati da Wikidata, buoni ma non completi. Con un premio attivo piattaforme e durata non si applicano.</p>
          </div>
          <div className="group">
            <span className="eyebrow">Durata e ritmo</span>
            <div className="row">
              <select className="field" value={q.maxRuntime ?? 0} onChange={(e) => set({ maxRuntime: +e.target.value || undefined })} aria-label="Durata dei film">
                <option value={0}>Film: ogni durata</option>
                <option value={90}>Film sotto 90 min</option>
                <option value={100}>Film sotto 100 min</option>
                <option value={120}>Film sotto 2 ore</option>
                <option value={150}>Film sotto 2 ore e mezza</option>
              </select>
              <select className="field" value={q.maxEpisode ?? 0} onChange={(e) => set({ maxEpisode: +e.target.value || undefined })} aria-label="Durata degli episodi">
                <option value={0}>Episodi: ogni durata</option>
                <option value={30}>Episodi sotto 30 min</option>
                <option value={45}>Episodi sotto 45 min</option>
                <option value={60}>Episodi sotto 1 ora</option>
              </select>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              {hasSeries && <Chip on={q.status === 'ended'} onClick={() => set({ status: q.status === 'ended' ? undefined : 'ended' })}>Serie concluse</Chip>}
              {hasSeries && <Chip on={q.status === 'ongoing'} onClick={() => set({ status: q.status === 'ongoing' ? undefined : 'ongoing' })}>Serie in corso</Chip>}
              <Chip on={q.gentle} onClick={() => set({ gentle: !q.gentle })}>Poco violento</Chip>
            </div>
          </div>
          <div className="group">
            <span className="eyebrow">Origine e anno</span>
            <div className="row">
              <select className="field" value={q.country ?? ''} onChange={(e) => set({ country: e.target.value || undefined })} aria-label="Paese di produzione">
                <option value="">Paese: tutti</option>
                {tmdb.COUNTRIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <select className="field" value={q.lang ?? ''} onChange={(e) => set({ lang: e.target.value || undefined })} aria-label="Lingua originale">
                <option value="">Lingua originale: qualsiasi</option>
                {tmdb.LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <input className="field" type="number" inputMode="numeric" placeholder="Dal" value={q.yearFrom ?? ''} onChange={(e) => set({ yearFrom: e.target.value || undefined })} />
              <input className="field" type="number" inputMode="numeric" placeholder="Al" value={q.yearTo ?? ''} onChange={(e) => set({ yearTo: e.target.value || undefined })} />
            </div>
          </div>
          <div className="group">
            <span className="eyebrow">Persone</span>
            <div className="row">
              {q.actor ? (
                <button className="btn sm on" onClick={() => { set({ actor: undefined }); setActorQ('') }}>Con {q.actor.name} <Icon name="x" size={14} /></button>
              ) : (
                <input className="field" placeholder="Attore o attrice…" value={actorQ} onChange={(e) => find(e.target.value, 'actor')} />
              )}
              {q.director ? (
                <button className="btn sm on" onClick={() => { set({ director: undefined }); setDirQ('') }}>Regia di {q.director.name} <Icon name="x" size={14} /></button>
              ) : (
                <input className="field" placeholder="Regista (solo film)…" value={dirQ} onChange={(e) => find(e.target.value, 'director')} />
              )}
            </div>
            {sugg.length > 0 && (
              <div className="row" style={{ marginTop: 8 }}>
                {sugg.map((s) => <Chip key={s.id} onClick={() => { set(suggFor === 'actor' ? { actor: s } : { director: s }); setSugg([]) }}>{s.name}</Chip>)}
              </div>
            )}
          </div>
        </div>
      </div>
    </Sheet>
  )
}

export function Explore({ seen, views, active, request }: {
  seen: Title[]; views: ViewsApi; active: boolean; request: { id: number; query: Query; info?: string } | null
}) {
  const personal = usePersonal()
  const mine = personal.prefs.providers
  const [q, setQ] = useState<Query>(tmdb.emptyQuery)
  const [activeView, setActiveView] = useState<string | null>(null)
  const [items, setItems] = useState<Title[]>([])
  const [page, setPage] = useState(1)
  const [more, setMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [filters, setFilters] = useState(false)
  const [manage, setManage] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [nl, setNl] = useState<{ busy: boolean; err: string; info: string; notes: string[] }>({ busy: false, err: '', info: '', notes: [] })
  const reqId = useRef(0)
  const lastRequest = useRef(0)
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

  // i punteggi si cercano per TUTTI i titoli caricati, non solo per quelli che passano il filtro
  useEffect(() => requestRatings(items), [items])

  // richieste dall'esterno (frase libera dalla schermata "Ho voglia di…")
  useEffect(() => {
    if (request && request.id !== lastRequest.current) {
      lastRequest.current = request.id
      setQ(request.query)
      setActiveView(null)
      if (request.info) setNl({ busy: false, err: '', info: request.info, notes: [] })
    }
  }, [request])

  // "solo i miei abbonamenti" si traduce nelle piattaforme salvate; punteggi e visti si applicano lato client
  // un voto minimo alto su IMDb/Rotten Tomatoes si traduce in una soglia più prudente su TMDB, per non scorrere titoli scarsi
  const hint = Math.max(q.minTmdb, q.minImdb ? Math.max(0, q.minImdb - 1.2) : 0, q.minRt >= 80 ? 6.3 : 0, q.minMeta >= 70 ? 6.3 : 0)
  const effective: Query = {
    ...q,
    providers: q.onlyMine && mine.length ? mine : q.providers,
    minTmdb: Math.round(hint * 10) / 10,
    minImdb: 0, minRt: 0, minMeta: 0, hideSeen: false, strictRatings: false,
  }
  const serverKey = JSON.stringify(effective)
  useEffect(() => {
    load(JSON.parse(serverKey), 1)
  }, [serverKey, load])

  useEffect(() => {
    if (active && (err || !items.length)) load(JSON.parse(serverKey), 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  const seenSet = new Set(seen.map((t) => t.type + t.id))
  const ratingFilter = !!(q.minImdb || q.minRt || q.minMeta)
  // senza chiave OMDb non ci sono voti da confrontare: meglio non nascondere tutto
  const ratingActive = ratingFilter && R.enabled
  const passesRatings = (r: Ratings | undefined) => {
    if (!ratingActive) return true
    if (!r) return false // punteggi non ancora caricati
    const reqs: [number, number | undefined][] = [[q.minImdb, r.imdb], [q.minRt, r.rt], [q.minMeta, r.meta]]
    const active = reqs.filter(([min]) => min > 0)
    const known = active.filter(([, v]) => v !== undefined)
    if (q.strictRatings && known.length < active.length) return false
    if (!known.length) return false
    return known.every(([min, v]) => (v as number) >= min)
  }
  const visible = items.filter((t) => {
    if (q.hideSeen && seenSet.has(t.type + t.id)) return false
    return passesRatings(R.get(t))
  })

  // Con filtri stretti passano pochi titoli: si caricano altre pagine finché ce ne sono abbastanza
  useEffect(() => {
    const ratingsSettled = !ratingActive || (R.pending === 0 && !R.limited)
    if (!loading && more && ratingsSettled && visible.length < 12 && page < 10 && !q.actor) {
      load(JSON.parse(serverKey), page + 1)
    }
  })

  const set = (p: Partial<Query>) => {
    setActiveView(null)
    setQ((c) => ({ ...c, ...p }))
  }
  const chips = activeChips(q)
  const isFiltered = chips.length > 0 || activeView !== null || JSON.stringify(q.kinds) !== JSON.stringify(tmdb.emptyQuery.kinds)
  const resetAll = () => {
    setQ(tmdb.emptyQuery)
    setActiveView(null)
    setPhrase('')
    setNl({ busy: false, err: '', info: '', notes: [] })
  }

  async function runPhrase() {
    const text = phrase.trim()
    if (!text) return
    if (!getAiKey()) {
      setNl({ busy: false, err: 'Per cercare con una frase serve la chiave Anthropic: la inserisci in Impostazioni.', info: '', notes: [] })
      return
    }
    setNl({ busy: true, err: '', info: '', notes: [] })
    try {
      const applied = await nlSearch(text, personal.prefs.aiModel, mine)
      setQ(applied.query)
      setActiveView(null)
      setNl({ busy: false, err: '', info: applied.summary, notes: applied.notes })
    } catch (e) {
      setNl({ busy: false, err: aiErrorText(e), info: '', notes: [] })
    }
  }

  return (
    <>
      <div className="row between">
        <h1 className="page-title">Esplora</h1>
        <div className="row">
          <button className="iconbtn" onClick={() => setManage(true)} aria-label="Gestisci le ricerche salvate" data-tip="Gestisci le ricerche salvate"><Icon name="edit" size={18} /></button>
          <button className={'btn' + (chips.length ? ' on' : '')} onClick={() => setFilters(true)} data-tip="Apri tutti i filtri">
            <Icon name="filter" size={18} /> Filtri{chips.length ? ` · ${chips.length}` : ''}
          </button>
        </div>
      </div>

      <form className="nlbox" onSubmit={(e) => { e.preventDefault(); runPhrase() }}>
        <span className="aibadge" data-tip="Descrivi in una frase quello che cerchi: l'IA imposta i filtri per te">
          <Icon name="spark" size={14} /> Cerca con l'IA
        </span>
        <input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="es. una serie misteriosa, poco violenta, episodi brevi" aria-label="Descrivi cosa vuoi vedere" />
        <button className="btn gold sm" type="submit" disabled={nl.busy || !phrase.trim()}>{nl.busy ? 'Leggo…' : 'Cerca'}</button>
      </form>
      {nl.err && <p className="err">{nl.err}</p>}
      {nl.info && <p className="muted"><b>Ho capito:</b> {nl.info}{nl.notes.length > 0 && <> · {nl.notes.join(' ')}</>}</p>}

      <div className="pills" role="tablist" aria-label="Le tue ricerche salvate">
        <button className={'pill' + (activeView === null && chips.length === 0 ? ' on' : '')} onClick={() => { setQ(tmdb.emptyQuery); setActiveView(null); setNl({ busy: false, err: '', info: '', notes: [] }) }}>Tutto</button>
        {views.views.map((v) => (
          <button key={v.id} role="tab" aria-selected={activeView === v.id} className={'pill' + (activeView === v.id ? ' on' : '')} onClick={() => { setQ(v.query); setActiveView(v.id) }}>
            {v.name}
          </button>
        ))}
      </div>

      <div className="row" style={{ margin: '14px 0 8px' }}>
        {tmdb.KINDS.map((k) => (
          <Chip key={k.id} on={q.kinds.includes(k.id)} onClick={() => (q.kinds.length > 1 || !q.kinds.includes(k.id) ? set({ kinds: toggleIn<Kind>(q.kinds, k.id), genres: [] }) : undefined)}>{k.label}</Chip>
        ))}
      </div>

      {isFiltered && (
        <div className="row activechips" aria-label="Filtri attivi">
          {chips.map((c) => (
            <button key={c.key} className="achip" onClick={() => set(c.clear)} aria-label={`Togli il filtro ${c.label}`} data-tip="Togli questo filtro">
              {c.label} <Icon name="x" size={12} />
            </button>
          ))}
          {chips.length > 0 && <button className="link" onClick={() => setManage(true)}>Salva questa ricerca</button>}
          <button className="btn sm" onClick={resetAll} data-tip="Torna ai filtri di partenza"><Icon name="x" size={14} /> Azzera i filtri</button>
        </div>
      )}
      <div style={{ height: 14 }} />

      {err && <p className="err">{err}</p>}
      {ratingFilter && !R.enabled && <p className="err">Per filtrare per IMDb, Rotten Tomatoes o Metacritic serve la chiave OMDb: inseriscila in Impostazioni. Intanto i filtri sui voti non si applicano.</p>}
      {ratingFilter && R.limited && <p className="err">Limite giornaliero OMDb raggiunto: i filtri sui punteggi usano solo i titoli già controllati.</p>}
      {ratingActive && R.pending > 0 && <p className="muted">Controllo i punteggi… ({R.pending})</p>}

      {loading && items.length === 0 ? (
        <SkeletonGrid />
      ) : (
        <TitleGrid
          items={visible}
          empty={
            <Empty
              title="Nessun titolo"
              text={ratingActive && R.pending === 0 ? 'Nessun titolo supera questi punteggi: abbassa le soglie.' : 'Prova a togliere qualche filtro.'}
              action={isFiltered ? <button className="btn gold" onClick={resetAll}>Azzera i filtri</button> : undefined}
            />
          }
        />
      )}
      {more && items.length > 0 && !q.actor && (
        <div className="row center" style={{ margin: '28px 0' }}>
          <button className="btn" disabled={loading} onClick={() => load(JSON.parse(serverKey), page + 1)}>{loading ? 'Carico…' : 'Carica altri'}</button>
        </div>
      )}

      {filters && <FilterSheet q={q} set={set} reset={() => { setActiveView(null); setQ(tmdb.emptyQuery) }} count={visible.length} hasMine={mine.length > 0} onClose={() => setFilters(false)} />}
      {manage && <ManageViews api={views} q={q} onClose={() => setManage(false)} />}
    </>
  )
}
