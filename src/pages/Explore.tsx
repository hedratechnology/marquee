import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as tmdb from '../tmdb'
import type { Kind, Query, Title } from '../tmdb'
import { requestRatings, useRatings } from '../omdb'
import type { Ratings } from '../omdb'
import type { useViews } from '../views'
import { MAX_VIEWS } from '../views'
import { aiErrorText, getAiKey, nlSearch } from '../ai'
import { usePersonal } from '../personal'
import { Chip, Empty, Sheet, SkeletonGrid, TitleGrid } from '../ui/components'
import { Icon } from '../ui/icons'
import { activeChips, errText, summary } from '../ui/helpers'
import { FilterStudio } from './FilterStudio'

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

export function Explore({ seen, views, active, request }: {
  seen: Title[]; views: ViewsApi; active: boolean; request: { id: number; query: Query; info?: string } | null
}) {
  const personal = usePersonal()
  const mine = personal.prefs.providers
  // di partenza gli abbonamenti salvati in Impostazioni sono già selezionati
  const def = useMemo<Query>(
    () => ({ ...tmdb.emptyQuery, providers: personal.prefs.useMine ? personal.prefs.providers : [] }),
    [personal.prefs.useMine, personal.prefs.providers],
  )
  const [q, setQ] = useState<Query>(def)
  const lastDef = useRef(def)
  useEffect(() => {
    // se cambi gli abbonamenti in Impostazioni e non hai ancora toccato le piattaforme, si aggiornano anche qui
    setQ((c) => (JSON.stringify(c.providers) === JSON.stringify(lastDef.current.providers) ? { ...c, providers: def.providers } : c))
    lastDef.current = def
  }, [def])
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
  const chips = activeChips(q, def)
  const isFiltered = JSON.stringify({ ...q, providers: [...q.providers].sort() }) !== JSON.stringify({ ...def, providers: [...def.providers].sort() })
  const resetAll = () => {
    setQ(def)
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
        <button className={'pill' + (activeView === null && !isFiltered ? ' on' : '')} onClick={() => { setQ(def); setActiveView(null); setNl({ busy: false, err: '', info: '', notes: [] }) }}>{def.providers.length ? 'Per me' : 'Tutto'}</button>
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

      {filters && (
        <FilterStudio
          q={q}
          base={def}
          set={set}
          reset={() => { setActiveView(null); setQ(def) }}
          count={visible.length}
          preview={visible}
          loading={loading}
          savedProviders={mine}
          onSaveProviders={(ids) => personal.setPrefs({ providers: ids })}
          onClose={() => setFilters(false)}
        />
      )}
      {manage && <ManageViews api={views} q={q} onClose={() => setManage(false)} />}
    </>
  )
}
