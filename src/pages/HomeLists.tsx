import { useEffect, useMemo, useState } from 'react'
import * as tmdb from '../tmdb'
import type { MediaType, Title } from '../tmdb'
import { requestRatings, useRatings } from '../omdb'
import { usePersonal } from '../personal'
import type { ListId } from '../personal'
import { useFilters } from '../filters'
import { matchesQuery, useFilterEnv } from '../filtering'
import { analyze, fetchPool, mergeQueries, rankPool } from '../proposals'
import type { Analysis } from '../proposals'
import { useLists, useOpen, useTaste } from './../ui/ctx'
import { platformText, scoreChips } from '../ui/components'
import { quickLine } from '../decide'
import { Icon } from '../ui/icons'

const STEP = 5
const IDS: ListId[] = ['together', 'a', 'b']
const PLACEHOLDER: Record<ListId, string> = {
  together: 'es. una commedia che ci faccia ridere, poco violenta',
  a: 'es. thriller psicologici con un finale che spiazza',
  b: 'es. storie d\'amore ben scritte, anche in costume',
}

function Row({ n, t, why }: { n: number; t: Title; why: string }) {
  const open = useOpen()
  const { has, toggle } = useLists()
  const R = useRatings()
  const [facts, setFacts] = useState<tmdb.Facts | null>(null)
  useEffect(() => {
    let live = true
    requestRatings([t], true)
    tmdb.titleFacts(t.type, t.id).then((f) => live && setFacts(f))
    return () => {
      live = false
    }
  }, [t])
  const votes = scoreChips(t, R.get(t), R.enabled)
  const quick = facts ? quickLine({ type: t.type, genreIds: t.genreIds ?? [], ...facts }) : ''
  const watch = has('watchlist', t)
  return (
    <li className="prow">
      <span className="pn">{n}</span>
      <button className="pmain" onClick={() => open(t)} aria-label={`Apri ${t.title}`}>
        {t.poster ? <img loading="lazy" src={`${tmdb.IMG}/w154${t.poster}`} alt="" /> : <span className="noimg" />}
        <span className="pinfo">
          <b>{t.title}</b>
          <span className="psub">{[t.year, quick].filter(Boolean).join(' · ')}</span>
          <span className="plat" data-tip="Dove lo guardi in Italia"><Icon name="tv" size={12} />{facts ? platformText(facts) : 'Cerco la piattaforma…'}</span>
          {(votes.length > 0 || why) && <span className="psub">{[...votes.slice(0, 2), why].filter(Boolean).join(' · ')}</span>}
        </span>
      </button>
      <button className={'pbtn' + (watch ? ' on' : '')} aria-pressed={watch} aria-label={watch ? 'Togli da Da vedere' : 'Aggiungi a Da vedere'} data-tip={watch ? 'In «Da vedere»: tocca per togliere' : 'Aggiungi a «Da vedere»'} onClick={() => toggle('watchlist', t)}>
        <Icon name="bookmark" size={16} fill={watch} />
      </button>
    </li>
  )
}

function ListCard({ id }: { id: ListId }) {
  const { prefs, setPrefs } = usePersonal()
  const F = useFilters()
  const { taste } = useTaste()
  const { lists } = useLists()
  const R = useRatings()
  const saved = prefs.listPrompts[id]
  const type: MediaType = prefs.listKinds[id]
  const name = id === 'together' ? 'Insieme' : id === 'a' ? prefs.people[0] : prefs.people[1]
  const [draft, setDraft] = useState(saved)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [pool, setPool] = useState<{ items: Title[]; named: Set<string> } | null>(null)
  const [busy, setBusy] = useState(false)
  const [count, setCount] = useState(STEP)

  useEffect(() => setDraft(saved), [saved])

  // 1) il prompt salvato viene letto (o spezzato in parole se manca la chiave IA)
  useEffect(() => {
    let live = true
    setAnalysis(null)
    analyze(saved, prefs.aiModel, prefs.providers).then((a) => live && setAnalysis(a))
    return () => {
      live = false
    }
  }, [saved, prefs.aiModel, prefs.providers])

  // 2) i filtri in alto + ciò che chiede il prompt decidono i candidati
  const merged = useMemo(() => (analysis ? mergeQueries(F.q, type, analysis.query) : null), [analysis, F.q, type])
  const env = useFilterEnv(merged ?? F.q)
  const serverKey = merged ? JSON.stringify(merged) : ''
  useEffect(() => {
    if (!serverKey || !analysis) return
    let live = true
    setBusy(true)
    setCount(STEP)
    fetchPool(saved, type, JSON.parse(serverKey), prefs.providers)
      .then((p) => {
        if (!live) return
        setPool(p)
        requestRatings(p.items.slice(0, 40))
      })
      .finally(() => live && setBusy(false))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey, analysis, saved, type])

  const known = new Set([...lists.seen, ...lists.dropped, ...lists.hidden].map((t) => t.type + t.id))
  const ranked = useMemo(() => (pool && analysis ? rankPool(pool.items, pool.named, analysis.keywords, taste) : []), [pool, analysis, taste])
  const ratingWait = !!(merged && (merged.minImdb || merged.minRt || merged.minMeta)) && R.enabled && R.pending > 0
  const visible = merged
    ? ranked.filter(({ t }) => !known.has(t.type + t.id) && matchesQuery({ type: t.type, id: t.id, year: t.year, genreIds: t.genreIds ?? [], rating: t.rating, lang: undefined }, merged, env))
    : []
  const shown = visible.slice(0, count)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const v = draft.trim()
    if (v !== saved) setPrefs({ listPrompts: { ...prefs.listPrompts, [id]: v } })
  }
  const setType = (k: MediaType) => {
    setPrefs({ listKinds: { ...prefs.listKinds, [id]: k } })
    setCount(STEP)
  }

  return (
    <section className="plist">
      <header>
        <h3>{name}</h3>
        <div className="mode2" role="tablist" aria-label={`Film o serie TV per ${name}`}>
          <button role="tab" aria-selected={type === 'movie'} className={type === 'movie' ? 'on' : ''} onClick={() => setType('movie')}>Film</button>
          <button role="tab" aria-selected={type === 'tv'} className={type === 'tv' ? 'on' : ''} onClick={() => setType('tv')}>Serie TV</button>
        </div>
      </header>
      <form onSubmit={submit} className="pform">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={PLACEHOLDER[id]} aria-label={`Cosa vuole vedere ${name}`} />
        <button className="btn sm" type="submit" disabled={draft.trim() === saved}>Aggiorna</button>
      </form>
      {analysis?.summary && <p className="muted psum"><b>Ho capito:</b> {analysis.summary}</p>}
      {analysis?.notes.map((n) => <p key={n} className="muted psum">{n}</p>)}
      {busy || !analysis || ratingWait ? (
        <p className="muted">Cerco i titoli…</p>
      ) : shown.length ? (
        <ol className="plines">
          {shown.map(({ t, why }, i) => <Row key={t.type + t.id} n={i + 1} t={t} why={why} />)}
        </ol>
      ) : (
        <p className="muted">Nessun titolo con questi criteri: prova a cambiare il prompt o ad allentare i filtri in alto.</p>
      )}
      {!busy && visible.length > count && (
        <button className="btn sm pmore" onClick={() => setCount(count + STEP)}>Mostra altri {Math.min(STEP, visible.length - count)}</button>
      )}
      {!busy && count > STEP && (
        <button className="link pmore" onClick={() => setCount(STEP)}>Mostra meno</button>
      )}
    </section>
  )
}

export function HomeLists() {
  return (
    <section className="plists">
      <div className="rail-head">
        <h2 className="sec">Le tue liste</h2>
      </div>
      <p className="muted" style={{ margin: '-6px 0 14px' }}>Scrivi cosa avete voglia di vedere: propongo 5 titoli in ordine di priorità, con la piattaforma. I filtri in alto valgono anche qui.</p>
      <div className="plist-grid">
        {IDS.map((id) => <ListCard key={id} id={id} />)}
      </div>
    </section>
  )
}
