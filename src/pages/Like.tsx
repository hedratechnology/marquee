import { useEffect, useMemo, useState } from 'react'
import * as tmdb from '../tmdb'
import type { Query, Title } from '../tmdb'
import { aiErrorText, getAiKey, nlToQuery, parseQuery } from '../ai'
import { usePersonal } from '../personal'
import { computeTaste, affinity } from '../taste'
import type { Lists } from '../store'
import { keyOf } from '../store'
import { Empty, PosterCard, SkeletonGrid } from '../ui/components'
import { Icon } from '../ui/icons'
import { useGenres } from '../ui/data'
import { errText } from '../ui/helpers'

interface Similar {
  title: Title
  reason: string
  score: number
}

export function Like({ lists, onApplyQuery }: { lists: Lists; onApplyQuery: (q: Query, info: string) => void }) {
  const personal = usePersonal()
  const genres = useGenres()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Title[]>([])
  const [source, setSource] = useState<Title | null>(null)
  const [similar, setSimilar] = useState<Similar[] | null>(null)
  const [err, setErr] = useState('')
  const [phrase, setPhrase] = useState('')
  const [nl, setNl] = useState({ busy: false, err: '' })
  const taste = useMemo(() => computeTaste(lists, personal.reactions), [lists, personal.reactions])

  useEffect(() => {
    if (q.trim().length < 2) return
    const h = setTimeout(() => {
      tmdb.search(q).then((r) => { setResults(r.filter((t) => t.poster).slice(0, 6)); setErr('') }).catch((e) => setErr(errText(e)))
    }, 300)
    return () => clearTimeout(h)
  }, [q])

  async function pick(t: Title) {
    setSource(t)
    setResults([])
    setSimilar(null)
    setErr('')
    try {
      const [recs, sim] = await Promise.all([tmdb.recommendations(t.type, t.id), tmdb.similar(t.type, t.id)])
      const excluded = new Set([...lists.seen, ...lists.hidden, ...lists.dropped].map(keyOf))
      const map = new Map<string, { title: Title; rec: boolean; sim: boolean }>()
      for (const x of recs) map.set(keyOf(x), { title: x, rec: true, sim: false })
      for (const x of sim) {
        const cur = map.get(keyOf(x))
        if (cur) cur.sim = true
        else map.set(keyOf(x), { title: x, rec: false, sim: true })
      }
      const names = (ids: number[]) => ids.map((g) => tmdb.genreName(genres, g)).filter((x): x is string => !!x)
      const out: Similar[] = [...map.values()]
        .filter((x) => x.title.poster && !excluded.has(keyOf(x.title)) && keyOf(x.title) !== keyOf(t) && !personal.isSnoozed(x.title))
        .map((x) => {
          const shared = names((x.title.genreIds ?? []).filter((g) => (t.genreIds ?? []).includes(g)))
          const reason = x.rec && x.sim
            ? `Molto vicino a «${t.title}»${shared.length ? `: stessi generi (${shared.slice(0, 2).join(', ').toLowerCase()})` : ''}.`
            : x.rec
              ? `Lo consigliano a chi ha amato «${t.title}».`
              : `Simile per generi e temi${shared.length ? ` (${shared.slice(0, 2).join(', ').toLowerCase()})` : ''}.`
          const score = (x.rec && x.sim ? 0.4 : 0) + (x.rec ? 0.15 : 0.05) + Math.max(0, (x.title.rating - 6) / 4) * 0.3 + affinity(x.title, taste) * 0.15
          return { title: x.title, reason, score }
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 12)
      setSimilar(out)
    } catch (e) {
      setErr(errText(e))
      setSimilar([])
    }
  }

  async function runPhrase() {
    const text = phrase.trim()
    if (!text) return
    if (!getAiKey()) {
      setNl({ busy: false, err: 'Per descrivere cosa vuoi serve la chiave Anthropic: la inserisci in Impostazioni.' })
      return
    }
    setNl({ busy: true, err: '' })
    try {
      const g = await tmdb.genreList()
      const parsed = await parseQuery(text, g, personal.prefs.aiModel)
      const applied = await nlToQuery(parsed, g, personal.prefs.providers)
      setNl({ busy: false, err: '' })
      onApplyQuery(applied.query, [applied.summary, ...applied.notes].join(' '))
    } catch (e) {
      setNl({ busy: false, err: aiErrorText(e) })
    }
  }

  return (
    <>
      <h1 className="page-title">Ho voglia di qualcosa come…</h1>
      <p className="lede">Parti da un titolo che ti è piaciuto, oppure descrivi in una frase quello che cerchi.</p>

      <section className="cardbox">
        <h2>Parti da un titolo</h2>
        <input className="search-big" placeholder="Un film o una serie che ti è piaciuta" value={q} onChange={(e) => setQ(e.target.value)} />
        {err && <p className="err">{err}</p>}
        {results.length > 0 && (
          <ul className="srclist">
            {results.map((t) => (
              <li key={keyOf(t)}>
                <button onClick={() => pick(t)}>
                  {t.poster && <img src={`${tmdb.IMG}/w92${t.poster}`} alt="" />}
                  <span><b>{t.title}</b><span className="muted"> {t.year} · {t.type === 'movie' ? 'Film' : 'Serie'}</span></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cardbox">
        <h2>Oppure descrivilo</h2>
        <p className="muted" style={{ margin: '4px 0 12px' }}>Per esempio: «un thriller misterioso ma poco violento, sotto le due ore, da vedere in coppia».</p>
        <form className="row" onSubmit={(e) => { e.preventDefault(); runPhrase() }}>
          <input className="field" value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="Cosa ti va di vedere?" aria-label="Descrivi cosa vuoi" />
          <button className="btn gold" type="submit" disabled={nl.busy || !phrase.trim()}><Icon name="spark" size={16} /> {nl.busy ? 'Leggo…' : 'Cerca'}</button>
        </form>
        {nl.err && <p className="err" style={{ marginTop: 8 }}>{nl.err}</p>}
        {!getAiKey() && <p className="muted" style={{ marginTop: 8 }}>Serve la chiave Anthropic in Impostazioni.</p>}
      </section>

      {source && (
        <>
          <h2 className="sec" style={{ margin: '28px 0 14px' }}>Come «{source.title}»</h2>
          {similar === null ? (
            <SkeletonGrid n={6} />
          ) : similar.length === 0 ? (
            <Empty title="Nessun titolo simile" text="Prova con un altro titolo." />
          ) : (
            <div className="grid">
              {similar.map((s) => <PosterCard key={keyOf(s.title)} t={s.title} name={s.title.title} sub={s.reason} />)}
            </div>
          )}
        </>
      )}
    </>
  )
}
