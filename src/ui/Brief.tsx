import { useEffect, useRef, useState } from 'react'
import type { Detail, Title } from '../tmdb'
import { aiErrorText, cachedBlurb, getAiKey, makeBlurb, stripLead } from '../ai'
import type { Blurb } from '../ai'
import { decisionSheet } from '../decide'
import { usePersonal } from '../personal'
import { useGenres } from './data'
import { useTaste } from './ctx'
import { Icon } from './icons'

/** La scheda che aiuta a decidere, senza spoiler: stime dai dati subito, parere dell'IA quando c'è. */
export function Brief({ t, detail }: { t: Title; detail?: Detail }) {
  const { prefs } = usePersonal()
  const { taste, summary } = useTaste()
  const genres = useGenres()
  const [blurb, setBlurb] = useState<Blurb | undefined>(() => cachedBlurb(t))
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const autoTried = useRef('')

  useEffect(() => {
    setBlurb(cachedBlurb(t))
    setErr('')
  }, [t])

  const sheet = decisionSheet(
    {
      type: t.type,
      genreIds: t.genreIds ?? [],
      runtimeMin: detail?.runtimeMin,
      episodeRuntime: detail?.episodeRuntime,
      seasons: detail?.seasons,
      episodes: detail?.episodes,
      status: detail?.status,
      certification: detail?.certification,
    },
    taste,
    genres,
  )
  const hasKey = !!getAiKey()

  async function run() {
    setLoading(true)
    setErr('')
    try {
      setBlurb(await makeBlurb(t, detail, summary, genres, prefs.aiModel))
    } catch (e) {
      setErr(aiErrorText(e))
    } finally {
      setLoading(false)
    }
  }

  // con l'opzione attiva la scheda dell'IA si prepara da sola, una volta per titolo
  useEffect(() => {
    const k = `${t.type}:${t.id}`
    if (prefs.autoBlurb && hasKey && detail && !blurb && autoTried.current !== k) {
      autoTried.current = k
      run()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.autoBlurb, hasKey, detail, blurb, t])

  const items: { key: string; label: string; color: string; text: ReactTextOrList; extra?: string }[] = [
    { key: 'atmosphere', label: 'Atmosfera', color: '#a78bfa', text: blurb?.atmosphere ?? sheet.atmosphere },
    { key: 'pace', label: 'Ritmo', color: '#60a5fa', text: blurb?.pace ?? sheet.pace },
    { key: 'effort', label: 'Impegno', color: '#34d399', text: blurb?.effort ?? sheet.effort },
    { key: 'like', label: 'Potrebbe piacerti se', color: '#4ade80', text: blurb ? stripLead(blurb.likeIf) : sheet.likeIf },
    { key: 'off', label: 'Potrebbe frenarti se', color: '#fb7185', text: blurb ? stripLead(blurb.mightPutOff) : sheet.putOff },
  ]

  return (
    <section className="brief" aria-label="In breve, senza spoiler">
      <div className="brief-head">
        <span className="eyebrow">In breve · senza spoiler</span>
        {hasKey && (
          <button className="link" onClick={run} disabled={loading}>
            <Icon name="spark" size={13} /> {loading ? 'Leggo il titolo…' : blurb ? 'Aggiorna con l\'IA' : 'Affina con l\'IA'}
          </button>
        )}
      </div>
      <dl className="brief-grid">
        {items.map((i) => {
          const empty = Array.isArray(i.text) ? i.text.length === 0 : !i.text
          return (
            <div key={i.key} className={'brief-item' + (i.key === 'like' || i.key === 'off' ? ' wide' : '')} style={{ ['--c' as string]: i.color }}>
              <dt><i />{i.label}</dt>
              <dd>
                {empty ? (
                  <span className="muted">{i.key === 'effort' ? 'Carico i dettagli…' : i.key === 'off' ? 'Nessun punto debole evidente dai dati.' : '—'}</span>
                ) : Array.isArray(i.text) ? (
                  i.text.length === 1 ? i.text[0][0].toUpperCase() + i.text[0].slice(1) : <ul>{i.text.map((x) => <li key={x}>{x[0].toUpperCase() + x.slice(1)}</li>)}</ul>
                ) : (
                  i.text
                )}
              </dd>
            </div>
          )
        })}
        {blurb?.forYou && (
          <div className="brief-item wide" style={{ ['--c' as string]: '#f5c518' }}>
            <dt><i />Per te</dt>
            <dd>{blurb.forYou}</dd>
          </div>
        )}
      </dl>
      {err && <p className="err">{err}</p>}
      <p className="muted small">
        {blurb
          ? 'Scheda scritta da un modello linguistico a partire dai dati del titolo: può sbagliare.'
          : hasKey
            ? 'Stime dai generi, dalla durata e dai tuoi gusti, non dal contenuto del titolo: per questo non ci sono spoiler. «Affina con l\'IA» le rende più precise.'
            : 'Stime dai generi, dalla durata e dai tuoi gusti, non dal contenuto del titolo: per questo non ci sono spoiler. Con la chiave Anthropic (Impostazioni) puoi renderle più precise.'}
      </p>
    </section>
  )
}

type ReactTextOrList = string | string[]
