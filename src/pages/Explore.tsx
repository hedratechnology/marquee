import { useCallback, useEffect, useRef, useState } from 'react'
import * as tmdb from '../tmdb'
import type { Query, Title } from '../tmdb'
import { requestRatings, useRatings } from '../omdb'
import type { Ratings } from '../omdb'
import { aiErrorText, getAiKey, nlSearch } from '../ai'
import { usePersonal } from '../personal'
import { useFilters, useReportCount } from '../filters'
import { Empty, SkeletonGrid, TitleGrid } from '../ui/components'
import { useLists, useTaste } from '../ui/ctx'
import { useGenres } from '../ui/data'
import { affinity, matchingGenres } from '../taste'
import { Icon } from '../ui/icons'
import { errText } from '../ui/helpers'

/** minuscolo e senza accenti, per confrontare i titoli */
const plain = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export function Explore({ active }: { active: boolean }) {
  const F = useFilters()
  const { q, setQuery, reset, note, isFiltered } = F
  const personal = usePersonal()
  const { lists } = useLists()
  const { taste } = useTaste()
  const genreList = useGenres()
  const mine = personal.prefs.providers
  const [items, setItems] = useState<Title[]>([])
  const [page, setPage] = useState(1)
  const [more, setMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [phrase, setPhrase] = useState('')
  const [nl, setNl] = useState<{ busy: boolean; err: string }>({ busy: false, err: '' })
  // il campo di ricerca: o filtra i risultati che vedi, o descrive in una frase cosa cerchi (IA)
  const [mode, setMode] = useState<'results' | 'ai'>(() => (localStorage.getItem('explore_mode') === 'ai' ? 'ai' : 'results'))
  const [textQ, setTextQ] = useState('')
  const [catalog, setCatalog] = useState<{ q: string; items: Title[]; busy: boolean; err: string } | null>(null)
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

  // i punteggi si cercano per TUTTI i titoli caricati, non solo per quelli che passano il filtro
  useEffect(() => requestRatings(items), [items])

  // "solo i miei abbonamenti" si traduce nelle piattaforme salvate; punteggi e visti si applicano lato client
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

  const seenSet = new Set(lists.seen.map((t) => t.type + t.id))
  const ratingFilter = !!(q.minImdb || q.minRt || q.minMeta)
  // senza chiave OMDb non ci sono voti da confrontare: meglio non nascondere tutto
  const ratingActive = ratingFilter && R.enabled
  const passesRatings = (r: Ratings | undefined) => {
    if (!ratingActive) return true
    if (!r) return false // punteggi non ancora caricati
    const reqs: [number, number | undefined][] = [[q.minImdb, r.imdb], [q.minRt, r.rt], [q.minMeta, r.meta]]
    const act = reqs.filter(([min]) => min > 0)
    const known = act.filter(([, v]) => v !== undefined)
    if (q.strictRatings && known.length < act.length) return false
    if (!known.length) return false
    return known.every(([min, v]) => (v as number) >= min)
  }
  const visible = items.filter((t) => {
    if (q.hideSeen && seenSet.has(t.type + t.id)) return false
    return passesRatings(R.get(t))
  })
  const needle = plain(textQ)
  const filtered = mode === 'results' && needle ? visible.filter((t) => plain(t.title).includes(needle)) : visible
  // "Per il mio gusto": si riordinano i titoli caricati per affinità e si dice perché
  const shown =
    q.sort === 'taste' && taste.samples
      ? [...filtered]
          .sort((a, b) => affinity(b, taste) - affinity(a, taste))
          .map((t) => {
            const why = matchingGenres(t, taste, genreList)
            return why.length ? { ...t, note: `Per te: ${why.join(' · ')}` } : t
          })
      : filtered
  useReportCount(catalog ? catalog.items.length : shown.length, loading || !!catalog?.busy, active)

  // Con filtri stretti passano pochi titoli: si caricano altre pagine finché ce ne sono abbastanza
  useEffect(() => {
    const ratingsSettled = !ratingActive || (R.pending === 0 && !R.limited)
    if (active && !loading && more && ratingsSettled && visible.length < 12 && page < 10 && !q.actor) {
      load(JSON.parse(serverKey), page + 1)
    }
  })

  async function runPhrase() {
    const text = phrase.trim()
    if (!text) return
    if (!getAiKey()) {
      setNl({ busy: false, err: 'Per cercare con una frase serve la chiave Anthropic: la inserisci in Impostazioni.' })
      return
    }
    setNl({ busy: true, err: '' })
    try {
      const applied = await nlSearch(text, personal.prefs.aiModel, mine)
      setQuery(applied.query, [applied.summary, ...applied.notes].join(' '))
      setNl({ busy: false, err: '' })
    } catch (e) {
      setNl({ busy: false, err: aiErrorText(e) })
    }
  }

  async function searchCatalog() {
    const text = textQ.trim()
    if (text.length < 2) return
    setCatalog({ q: text, items: [], busy: true, err: '' })
    try {
      const r = await tmdb.search(text)
      setCatalog({ q: text, items: r.filter((t) => t.poster), busy: false, err: '' })
    } catch (e) {
      setCatalog({ q: text, items: [], busy: false, err: errText(e) })
    }
  }
  const switchMode = (m: 'results' | 'ai') => {
    setMode(m)
    localStorage.setItem('explore_mode', m)
    setCatalog(null)
  }

  return (
    <>
      <h1 className="page-title">Esplora</h1>

      <div className="nlbox">
        <div className="mode2" role="tablist" aria-label="Come cercare">
          <button role="tab" aria-selected={mode === 'results'} className={mode === 'results' ? 'on' : ''} onClick={() => switchMode('results')} data-tip="Filtra i titoli che vedi in elenco, o cerca per titolo in tutto il catalogo">
            <Icon name="search" size={14} /> Nei risultati
          </button>
          <button role="tab" aria-selected={mode === 'ai'} className={mode === 'ai' ? 'on' : ''} onClick={() => switchMode('ai')} data-tip="Descrivi in una frase quello che cerchi: l'IA imposta i filtri per te">
            <Icon name="spark" size={14} /> Con l'IA
          </button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (mode === 'ai') runPhrase(); else searchCatalog() }}>
          {mode === 'ai' ? (
            <input key="ai" value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="es. una serie misteriosa, poco violenta, episodi brevi" aria-label="Descrivi cosa vuoi vedere" />
          ) : (
            <input key="results" value={textQ} onChange={(e) => { setTextQ(e.target.value); setCatalog(null) }} placeholder="Cerca un titolo tra i risultati" aria-label="Cerca tra i risultati" />
          )}
          {mode === 'ai' && <button className="btn gold sm" type="submit" disabled={nl.busy || !phrase.trim()}>{nl.busy ? 'Leggo…' : 'Cerca'}</button>}
        </form>
      </div>
      {nl.err && <p className="err">{nl.err}</p>}
      {note && <p className="muted"><b>Ho capito:</b> {note}</p>}

      <div style={{ height: 6 }} />

      {err && <p className="err">{err}</p>}
      {ratingFilter && !R.enabled && <p className="err">Per filtrare per IMDb, Rotten Tomatoes o Metacritic serve la chiave OMDb: inseriscila in Impostazioni. Intanto i filtri sui voti non si applicano.</p>}
      {ratingFilter && R.limited && <p className="err">Limite giornaliero OMDb raggiunto: i filtri sui punteggi usano solo i titoli già controllati.</p>}
      {ratingActive && R.pending > 0 && <p className="muted">Controllo i punteggi… ({R.pending})</p>}

      {mode === 'results' && textQ.trim().length >= 2 && !catalog && (
        <p className="muted" style={{ margin: '0 0 14px' }}>
          {shown.length} {shown.length === 1 ? 'titolo' : 'titoli'} tra i risultati ·{' '}
          <button className="link" onClick={searchCatalog}>Cerca «{textQ.trim()}» in tutto il catalogo</button>
        </p>
      )}

      {catalog ? (
        <>
          <div className="row between" style={{ margin: '0 0 14px' }}>
            <p className="muted" style={{ margin: 0 }}>Risultati per «{catalog.q}» in tutto il catalogo</p>
            <button className="btn sm" onClick={() => setCatalog(null)}>Torna ai risultati</button>
          </div>
          {catalog.err && <p className="err">{catalog.err}</p>}
          {catalog.busy ? <SkeletonGrid n={6} /> : <TitleGrid items={catalog.items} empty={<Empty icon="search" title="Nessun risultato" text="Prova con un altro titolo." />} />}
        </>
      ) : loading && items.length === 0 ? (
        <SkeletonGrid />
      ) : (
        <TitleGrid
          items={shown}
          empty={
            <Empty
              title="Nessun titolo"
              text={textQ.trim() ? 'Nessun titolo con questo nome tra i risultati: prova a cercarlo in tutto il catalogo.' : ratingActive && R.pending === 0 ? 'Nessun titolo supera questi punteggi: abbassa le soglie.' : 'Prova a togliere qualche filtro.'}
              action={isFiltered ? <button className="btn gold" onClick={reset}>Azzera i filtri</button> : undefined}
            />
          }
        />
      )}
      {!catalog && more && items.length > 0 && !q.actor && !textQ.trim() && (
        <div className="row center" style={{ margin: '28px 0' }}>
          <button className="btn" disabled={loading} onClick={() => load(JSON.parse(serverKey), page + 1)}>{loading ? 'Carico…' : 'Carica altri'}</button>
        </div>
      )}

    </>
  )
}
