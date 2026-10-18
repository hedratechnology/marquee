import { useEffect, useMemo, useState } from 'react'
import * as tmdb from '../tmdb'
import type { Mood, Title } from '../tmdb'
import { MOODS } from '../tmdb'
import { COMPANIES, TIMES } from '../pick'
import type { Company, Time } from '../pick'
import { computeTaste } from '../taste'
import { usePersonal } from '../personal'
import type { Lists } from '../store'
import { useBest, useGenres } from '../ui/data'
import { useOpen } from '../ui/ctx'
import { Chip, Empty, Option } from '../ui/components'
import { Icon } from '../ui/icons'
import { buildPool, combine, encodePayload, idOf, marksToString, parseId, stringToMarks } from '../together'
import type { Mark, TogetherPayload } from '../together'
import { errText } from '../ui/helpers'

type Stage = 'setup' | 'rateA' | 'next' | 'rateB' | 'result'

function RateList({ titles, marks, setMark }: { titles: Title[]; marks: Record<string, Mark>; setMark: (id: string, m: Mark) => void }) {
  const open = useOpen()
  return (
    <ul className="ratelist">
      {titles.map((t) => {
        const id = idOf(t)
        const m = marks[id]
        return (
          <li key={id}>
            <button className="rthumb" onClick={() => open(t)} aria-label={`Dettagli di ${t.title}`}>
              {t.poster ? <img src={`${tmdb.IMG}/w154${t.poster}`} alt="" /> : <span>{t.title}</span>}
            </button>
            <div className="rinfo">
              <b>{t.title}</b>
              <span className="muted">{t.year} · {t.type === 'movie' ? 'Film' : 'Serie'}{t.rating ? ` · TMDB ${String(t.rating).replace('.', ',')}` : ''}</span>
              <div className="marks" role="group" aria-label={`Cosa ne pensi di ${t.title}`}>
                <button className={m === 'y' ? 'on y' : ''} aria-pressed={m === 'y'} onClick={() => setMark(id, 'y')}>Sì</button>
                <button className={m === 'm' ? 'on m' : ''} aria-pressed={m === 'm'} onClick={() => setMark(id, 'm')}>Forse</button>
                <button className={m === 'n' ? 'on n' : ''} aria-pressed={m === 'n'} onClick={() => setMark(id, 'n')}>No</button>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function TogetherPage({ lists, incoming, onExit }: { lists: Lists; incoming: TogetherPayload | null; onExit: () => void }) {
  const personal = usePersonal()
  const genres = useGenres()
  const best = useBest()
  const open = useOpen()
  const [stage, setStage] = useState<Stage>(incoming ? 'rateB' : 'setup')
  const [nameA, setNameA] = useState(incoming?.n ?? '')
  const [nameB, setNameB] = useState('')
  const [mood, setMood] = useState<Mood | undefined>(incoming?.m)
  const [moodB, setMoodB] = useState<Mood | undefined>()
  const [time, setTime] = useState<Time | undefined>(incoming?.t)
  const [company, setCompany] = useState<Company>(incoming?.c ?? 'couple')
  const [pool, setPool] = useState<Title[]>([])
  const [marksA, setMarksA] = useState<Record<string, Mark>>(() => (incoming ? stringToMarks(incoming.ids, incoming.a) : {}))
  const [marksB, setMarksB] = useState<Record<string, Mark>>({})
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  const taste = useMemo(() => computeTaste(lists, personal.reactions), [lists, personal.reactions])
  const merit = useMemo(() => new Set((best?.items ?? []).slice(0, 120).map((i) => `${i.type}:${i.id}`)), [best])

  // chi apre un link: si caricano i titoli scelti
  useEffect(() => {
    if (!incoming) return
    setLoading(true)
    Promise.all(
      incoming.ids.map(async (s) => {
        const p = parseId(s)
        return p ? tmdb.titleById(p.type, p.id) : null
      }),
    )
      .then((list) => {
        const ok = list.map((t, i) => ({ t, id: incoming.ids[i] })).filter((x): x is { t: Title; id: string } => !!x.t)
        // si tengono solo i titoli ancora caricabili, con i segni corrispondenti
        setPool(ok.map((x) => x.t))
        setMarksA(Object.fromEntries(ok.map((x) => [x.id, stringToMarks(incoming.ids, incoming.a)[x.id] ?? 'm'])))
      })
      .catch((e) => setErr(errText(e)))
      .finally(() => setLoading(false))
  }, [incoming])

  async function prepare() {
    if (!mood || !time) return
    setLoading(true)
    setErr('')
    try {
      const g = genres.length ? genres : await tmdb.genreList()
      const list = await buildPool(mood, time, company, personal.prefs.useMine ? personal.prefs.providers : [], {
        lists, taste, genres: g, merit, isSnoozed: personal.isSnoozed, tagsOf: personal.tagsOf,
      })
      setPool(list)
      setStage('rateA')
    } catch (e) {
      setErr(errText(e))
    } finally {
      setLoading(false)
    }
  }

  const link = useMemo(() => {
    if (!mood || !time || !pool.length) return ''
    const payload: TogetherPayload = { v: 1, n: nameA.trim() || 'Un amico', m: mood, t: time, c: company, ids: pool.map(idOf), a: marksToString(pool, marksA) }
    return `${location.origin}${import.meta.env.BASE_URL}#t=${encodePayload(payload)}`
  }, [mood, time, company, pool, marksA, nameA])

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copia questo link', link)
    }
  }

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator
  const aName = nameA.trim() || 'Tu'
  const bName = nameB.trim() || 'Partner'
  const outcomes = useMemo(() => combine(pool, marksA, marksB, { a: mood, b: moodB }), [pool, marksA, marksB, mood, moodB])

  const header = (
    <>
      <button className="link" onClick={onExit}>← Home</button>
      <h1 className="page-title">Scegliamo insieme</h1>
    </>
  )

  if (stage === 'setup') {
    return (
      <>
        {header}
        <p className="lede">Due persone, un punto d'incontro. Prima scegli tu, poi tocca all'altra persona: sullo stesso telefono oppure con un link. Nessun account.</p>

        <section className="qgroup">
          <h2 className="sec">Come ti chiami?</h2>
          <input className="field" style={{ width: '100%', maxWidth: 320 }} placeholder="Il tuo nome (facoltativo)" value={nameA} onChange={(e) => setNameA(e.target.value)} />
        </section>
        <section className="qgroup">
          <h2 className="sec">Che umore hai?</h2>
          <div className="optgrid">
            {MOODS.map((m) => <Option key={m.id} value={m.id} current={mood} onPick={setMood} title={m.label} hint={m.hint} />)}
          </div>
        </section>
        <section className="qgroup">
          <h2 className="sec">Quanto tempo avete?</h2>
          <div className="optgrid">
            {TIMES.map((t) => <Option key={t.id} value={t.id} current={time} onPick={setTime} title={t.label} hint={t.hint} />)}
          </div>
        </section>
        <section className="qgroup">
          <h2 className="sec">Con chi guardate?</h2>
          <div className="row">
            {COMPANIES.filter((c) => c.id !== 'solo').map((c) => <Chip key={c.id} on={company === c.id} onClick={() => setCompany(c.id)}>{c.label}</Chip>)}
          </div>
        </section>
        {err && <p className="err">{err}</p>}
        <div className="row" style={{ margin: '12px 0 40px' }}>
          <button className="btn gold" disabled={!mood || !time || loading} onClick={prepare}>{loading ? 'Preparo…' : 'Prepara la scelta'}</button>
        </div>
      </>
    )
  }

  if (stage === 'rateA') {
    return (
      <>
        {header}
        <p className="lede">{aName}, per ogni titolo dì se ti va. «Forse» vale una via di mezzo, «No» è un veto.</p>
        <RateList titles={pool} marks={marksA} setMark={(id, m) => setMarksA((c) => ({ ...c, [id]: m }))} />
        <div className="row" style={{ margin: '20px 0 40px' }}>
          <button className="btn gold" onClick={() => setStage('next')}>Fatto, tocca all'altra persona</button>
          <button className="btn" onClick={() => setStage('setup')}>Cambia i criteri</button>
        </div>
      </>
    )
  }

  if (stage === 'next') {
    return (
      <>
        {header}
        <p className="lede">Le tue scelte sono pronte. Come fa l'altra persona?</p>
        <div className="entrances two">
          <button className="entrance" onClick={() => setStage('rateB')}>
            <span className="eicon"><Icon name="users" size={26} /></span>
            <b>Passa il telefono</b>
            <span>L'altra persona sceglie qui, senza vedere le tue risposte.</span>
            <span className="go"><Icon name="arrow" size={18} /></span>
          </button>
          <div className="entrance static">
            <span className="eicon"><Icon name="link" size={26} /></span>
            <b>Invia un link</b>
            <span>Apre gli stessi titoli sul suo telefono. Le tue risposte restano nascoste fino alla fine.</span>
            <div className="row">
              <button className="btn gold sm" onClick={copy}>{copied ? 'Copiato' : 'Copia il link'}</button>
              {canShare && <button className="btn sm" onClick={() => navigator.share({ title: 'Scegliamo insieme', text: `${aName} ha scelto alcuni titoli: dì cosa ne pensi.`, url: link }).catch(() => undefined)}>Condividi</button>}
            </div>
          </div>
        </div>
        <p className="muted">Il link contiene solo i titoli e le tue risposte: non passa da nessun server.</p>
        <button className="link" onClick={() => setStage('rateA')}>← Torna alle tue scelte</button>
      </>
    )
  }

  if (stage === 'rateB') {
    return (
      <>
        {header}
        {incoming && <p className="lede"><b>{incoming.n}</b> ha scelto questi titoli (umore: {MOODS.find((m) => m.id === incoming.m)?.label.toLowerCase()}). Dì cosa ne pensi tu.</p>}
        {!incoming && <p className="lede">Tocca a te: dì cosa ne pensi, senza vedere le risposte di {aName}.</p>}
        <section className="qgroup">
          <div className="row">
            <input className="field" style={{ maxWidth: 260 }} placeholder="Il tuo nome (facoltativo)" value={nameB} onChange={(e) => setNameB(e.target.value)} />
          </div>
          <p className="muted" style={{ margin: '12px 0 8px' }}>Che umore hai tu? (facoltativo, aiuta a decidere in caso di pareggio)</p>
          <div className="row">
            {MOODS.map((m) => <Chip key={m.id} on={moodB === m.id} onClick={() => setMoodB(moodB === m.id ? undefined : m.id)}>{m.label}</Chip>)}
          </div>
        </section>
        {loading ? <p className="muted">Carico i titoli…</p> : <RateList titles={pool} marks={marksB} setMark={(id, m) => setMarksB((c) => ({ ...c, [id]: m }))} />}
        {err && <p className="err">{err}</p>}
        <div className="row" style={{ margin: '20px 0 40px' }}>
          <button className="btn gold" disabled={!pool.length} onClick={() => setStage('result')}>Trova il punto d'incontro</button>
        </div>
      </>
    )
  }

  // risultato
  const top = outcomes[0]
  const rest = outcomes.slice(1, 6)
  const noMatch = !top || top.a === 'n' || top.b === 'n'
  return (
    <>
      {header}
      {!top ? (
        <Empty title="Nessun titolo" text="Non ci sono titoli da confrontare." />
      ) : (
        <>
          <p className="lede">{noMatch ? 'Nessun titolo piace a tutti e due: ecco il compromesso migliore.' : 'Ecco cosa potete guardare stasera.'}</p>
          <article className="winner">
            <button className="pickposter" onClick={() => open(top.title)} aria-label={`Apri ${top.title.title}`}>
              {top.title.poster ? <img src={`${tmdb.IMG}/w342${top.title.poster}`} alt="" /> : <div className="noimg">{top.title.title}</div>}
            </button>
            <div className="pickbody">
              <span className="eyebrow">{top.label}</span>
              <h3>{top.title.title}</h3>
              <div className="meta-line"><span>{top.title.type === 'movie' ? 'Film' : 'Serie TV'}</span>{top.title.year && <span className="dot">{top.title.year}</span>}</div>
              <p className="muted">{aName}: <b>{label(top.a)}</b> · {bName}: <b>{label(top.b)}</b></p>
              <div className="row"><button className="btn gold" onClick={() => open(top.title)}>Dettagli</button></div>
            </div>
          </article>
          {rest.length > 0 && (
            <>
              <h2 className="sec" style={{ margin: '26px 0 12px' }}>Le alternative</h2>
              <ul className="ratelist">
                {rest.map((o) => (
                  <li key={idOf(o.title)}>
                    <button className="rthumb" onClick={() => open(o.title)} aria-label={`Dettagli di ${o.title.title}`}>
                      {o.title.poster ? <img src={`${tmdb.IMG}/w154${o.title.poster}`} alt="" /> : <span>{o.title.title}</span>}
                    </button>
                    <div className="rinfo">
                      <b>{o.title.title}</b>
                      <span className="muted">{o.label} · {aName}: {label(o.a)}, {bName}: {label(o.b)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <div className="row" style={{ margin: '24px 0 40px' }}>
        <button className="btn" onClick={() => { setMarksA({}); setMarksB({}); setPool([]); setStage('setup') }}>Ricomincia</button>
        <button className="btn" onClick={onExit}>Torna alla home</button>
      </div>
    </>
  )
}

const label = (m: Mark) => (m === 'y' ? 'sì' : m === 'n' ? 'no' : 'forse')
