import { useEffect, useMemo, useState } from 'react'
import type { MediaType, Title } from '../tmdb'
import { requestRatings, useRatings } from '../omdb'
import { usePersonal } from '../personal'
import type { ListId } from '../personal'
import { useFilters } from '../filters'
import { matchesQuery, useFilterEnv } from '../filtering'
import { analyze, fetchPool, mergeQueries, rankPool } from '../proposals'
import type { Analysis } from '../proposals'
import { useLists, useTaste } from '../ui/ctx'
import { PosterCard, Rail } from '../ui/components'
import { Icon } from '../ui/icons'

const STEP = 5
const IDS: ListId[] = ['together', 'a', 'b']

export const listName = (id: ListId, people: [string, string]) => (id === 'together' ? 'Insieme' : id === 'a' ? people[0] : people[1])

function ListRail({ id, onEdit }: { id: ListId; onEdit: () => void }) {
  const { prefs, setPrefs } = usePersonal()
  const F = useFilters()
  const { taste } = useTaste()
  const { lists } = useLists()
  const R = useRatings()
  const saved = prefs.listPrompts[id]
  const type: MediaType = prefs.listKinds[id]
  const name = listName(id, prefs.people)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [pool, setPool] = useState<{ items: Title[]; named: Set<string>; subs: Set<string> } | null>(null)
  const [busy, setBusy] = useState(false)
  const [count, setCount] = useState(STEP)

  // 1) il prompt salvato in Impostazioni viene letto (o spezzato in parole se manca la chiave IA)
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
  const ranked = useMemo(() => (pool && analysis ? rankPool(pool.items, pool.named, pool.subs, analysis.keywords, taste) : []), [pool, analysis, taste])
  const ratingWait = !!(merged && (merged.minImdb || merged.minRt || merged.minMeta)) && R.enabled && R.pending > 0
  const visible = merged
    ? ranked.filter(({ t }) => !known.has(t.type + t.id) && matchesQuery({ type: t.type, id: t.id, year: t.year, genreIds: t.genreIds ?? [], rating: t.rating, lang: undefined }, merged, env))
    : []
  const shown = visible.slice(0, count)
  const loading = busy || !analysis || ratingWait
  const setType = (k: MediaType) => {
    setPrefs({ listKinds: { ...prefs.listKinds, [id]: k } })
    setCount(STEP)
  }

  return (
    <Rail
      title={name}
      action={
        <div className="seg sm" role="tablist" aria-label={`Film o serie TV per ${name}`}>
          <button role="tab" aria-selected={type === 'movie'} className={type === 'movie' ? 'on' : ''} onClick={() => setType('movie')}>Film</button>
          <button role="tab" aria-selected={type === 'tv'} className={type === 'tv' ? 'on' : ''} onClick={() => setType('tv')}>Serie</button>
        </div>
      }
      lead={
        <p className="railnote">
          {saved ? (
            <>
              <span className="muted">{analysis?.summary ? analysis.summary : `«${saved}»`}</span>
              {analysis?.notes.map((n) => <span key={n} className="muted"> · {n}</span>)}
            </>
          ) : (
            <span className="muted">{name === 'Insieme' ? 'Scrivi cosa vi va di vedere insieme.' : `Scrivi cosa vuole vedere ${name}.`}</span>
          )}
          {' '}
          <button className="link" onClick={onEdit}>{saved ? 'Modifica' : 'Scrivi'}</button>
        </p>
      }
    >
      {loading ? (
        Array.from({ length: 5 }, (_, i) => <div key={i} className="card"><div className="skel" /></div>)
      ) : shown.length ? (
        <>
          {shown.map(({ t, why }, i) => (
            <PosterCard key={t.type + t.id} t={t} name={t.title} sub={[t.year, why].filter(Boolean).join(' · ')} rank={i + 1} />
          ))}
          {visible.length > count && (
            <button className="card morecard" onClick={() => setCount(count + STEP)}>
              <Icon name="plus" size={22} />
              <b>Altri {Math.min(STEP, visible.length - count)}</b>
            </button>
          )}
        </>
      ) : (
        <p className="muted">{saved ? 'Nessun titolo con questa richiesta e questi filtri.' : 'Intanto uso i tuoi filtri e i tuoi gusti.'}</p>
      )}
    </Rail>
  )
}

export function HomeLists({ onEdit }: { onEdit: () => void }) {
  return (
    <>
      {IDS.map((id) => <ListRail key={id} id={id} onEdit={onEdit} />)}
    </>
  )
}
