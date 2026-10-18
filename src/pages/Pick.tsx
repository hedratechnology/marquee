import { useMemo, useState } from 'react'
import * as tmdb from '../tmdb'
import type { Mood, Title } from '../tmdb'
import { MOODS } from '../tmdb'
import { COMPANIES, TIMES, choose, effortLabel, fmtMin } from '../pick'
import type { Company, Pick, PickInput, Time } from '../pick'
import { computeTaste } from '../taste'
import { usePersonal } from '../personal'
import { useLists, useOpen } from '../ui/ctx'
import { Chip, Empty, Option } from '../ui/components'
import { Icon } from '../ui/icons'
import { useBest, useGenres } from '../ui/data'
import { keyOf } from '../store'
import type { Lists } from '../store'
import { errText } from '../ui/helpers'
import { Expect } from '../ui/Expect'

function PickCard({ p, onNo, lists }: { p: Pick; onNo: () => void; lists: Lists }) {
  const open = useOpen()
  const { has, toggle } = useLists()
  const t: Title = p.title
  const interested = has('watchlist', t)
  const effort = effortLabel(p.detail)
  const poster = t.poster ? `${tmdb.IMG}/w342${t.poster}` : null
  void lists
  return (
    <article className="pickcard stacked">
      <div className="pickhead">
        <button className="pickposter" onClick={() => open(t)} aria-label={`Apri ${t.title}`}>
          {poster ? <img src={poster} alt="" /> : <div className="noimg">{t.title}</div>}
        </button>
        <div>
          <span className="eyebrow">{t.type === 'movie' ? 'Film' : 'Serie TV'}{t.year ? ` · ${t.year}` : ''}</span>
          <h3>{t.title}</h3>
          <div className="meta-line">
            {p.detail.type === 'movie' && p.detail.runtimeMin ? <span>{fmtMin(p.detail.runtimeMin)}</span> : null}
            {effort && <span className={p.detail.type === 'movie' && p.detail.runtimeMin ? 'dot' : ''}>{effort}</span>}
          </div>
        </div>
      </div>
      <ul className="reasons">
        {p.reasons.map((r) => <li key={r}>{r}</li>)}
      </ul>
      <Expect t={t} detail={p.detail} />
      <div className="row">
        <button className={'btn' + (interested ? ' on' : ' gold')} onClick={() => toggle('watchlist', t)}>
          <Icon name={interested ? 'check' : 'plus'} size={16} /> {interested ? 'In lista' : 'Mi interessa'}
        </button>
        <button className="btn" onClick={onNo}>Non stasera</button>
        <button className="btn" onClick={() => open(t)}>Dettagli</button>
      </div>
    </article>
  )
}

export function PickPage({ lists }: { lists: Lists }) {
  const personal = usePersonal()
  const genres = useGenres()
  const best = useBest()
  const [mood, setMood] = useState<Mood>()
  const [time, setTime] = useState<Time>()
  const [company, setCompany] = useState<Company>('solo')
  const [gentle, setGentle] = useState(false)
  const [mineOnly, setMineOnly] = useState(personal.prefs.useMine && personal.prefs.providers.length > 0)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [picks, setPicks] = useState<Pick[] | null>(null)
  const [reserve, setReserve] = useState<Pick[]>([])
  const taste = useMemo(() => computeTaste(lists, personal.reactions), [lists, personal.reactions])
  const merit = useMemo(() => new Set((best?.items ?? []).slice(0, 120).map((i) => `${i.type}:${i.id}`)), [best])
  const hasMine = personal.prefs.providers.length > 0

  const ready = !!mood && !!time

  async function run() {
    if (!mood || !time) return
    setLoading(true)
    setErr('')
    setPicks(null)
    try {
      const input: PickInput = { mood, time, company, gentle, mine: mineOnly ? personal.prefs.providers : [] }
      const g = genres.length ? genres : await tmdb.genreList()
      const res = await choose(input, {
        lists, taste, genres: g, merit,
        isSnoozed: personal.isSnoozed,
        tagsOf: personal.tagsOf,
      })
      setPicks(res.picks)
      setReserve(res.reserve)
    } catch (e) {
      setErr(errText(e))
    } finally {
      setLoading(false)
    }
  }

  function notTonight(p: Pick) {
    personal.snooze(p.title)
    setPicks((cur) => {
      if (!cur) return cur
      const next = reserve[0]
      const rest = cur.filter((x) => keyOf(x.title) !== keyOf(p.title))
      return next ? [...rest, next] : rest
    })
    setReserve((r) => r.slice(1))
  }

  if (picks) {
    return (
      <>
        <div style={{ marginTop: 6 }}><button className="link" onClick={() => setPicks(null)}>← Cambia i criteri</button></div>
        <h1 className="page-title">Stasera, per te</h1>
        <p className="lede">
          {picks.length ? 'Tre proposte, ognuna con i motivi per cui potrebbe andare bene.' : 'Non ho trovato proposte con questi criteri.'}
        </p>
        {picks.length === 0 && (
          <Empty title="Niente da proporre" text="Prova ad allargare i criteri: un altro umore, più tempo o tutte le piattaforme." />
        )}
        <div className="pickgrid">
          {picks.map((p) => <PickCard key={keyOf(p.title)} p={p} lists={lists} onNo={() => notTonight(p)} />)}
        </div>
        {picks.length > 0 && picks.length < 3 && reserve.length === 0 && <p className="muted">Non ci sono altre alternative con questi criteri.</p>}
        <div className="row center" style={{ margin: '28px 0' }}>
          <button className="btn" onClick={run} disabled={loading}>{loading ? 'Cerco…' : 'Altre proposte'}</button>
        </div>
      </>
    )
  }

  return (
    <>
      <h1 className="page-title">Scegli per me</h1>
      <p className="lede">Tre risposte e ti propongo tre titoli, con i motivi.</p>

      <section className="qgroup">
        <h2 className="sec">Che umore hai?</h2>
        <div className="optgrid">
          {MOODS.map((m) => <Option key={m.id} value={m.id} current={mood} onPick={setMood} title={m.label} hint={m.hint} />)}
        </div>
      </section>

      <section className="qgroup">
        <h2 className="sec">Quanto tempo hai?</h2>
        <div className="optgrid">
          {TIMES.map((t) => <Option key={t.id} value={t.id} current={time} onPick={setTime} title={t.label} hint={t.hint} />)}
        </div>
      </section>

      <section className="qgroup">
        <h2 className="sec">Con chi guardi?</h2>
        <div className="row">
          {COMPANIES.map((c) => <Chip key={c.id} on={company === c.id} onClick={() => setCompany(c.id)}>{c.label}</Chip>)}
        </div>
      </section>

      <section className="qgroup">
        <div className="row">
          <Chip on={gentle} onClick={() => setGentle((v) => !v)}>Poco violento</Chip>
          {hasMine ? (
            <Chip on={mineOnly} onClick={() => setMineOnly((v) => !v)}>Solo i miei abbonamenti</Chip>
          ) : (
            <span className="muted">Imposta i tuoi abbonamenti in Impostazioni per vedere solo ciò che puoi guardare.</span>
          )}
        </div>
      </section>

      {err && <p className="err">{err}</p>}
      <div className="row" style={{ margin: '12px 0 40px' }}>
        <button className="btn gold" disabled={!ready || loading} onClick={run}>{loading ? 'Cerco…' : 'Scegli per me'}</button>
        {!ready && <span className="muted">Scegli umore e tempo.</span>}
      </div>
    </>
  )
}
