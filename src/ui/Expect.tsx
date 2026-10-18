import { useEffect, useState } from 'react'
import type { Detail, Title } from '../tmdb'
import { aiErrorText, cachedBlurb, getAiKey, makeBlurb } from '../ai'
import type { Blurb } from '../ai'
import { usePersonal } from '../personal'
import { useGenres } from './data'
import { useTaste } from './ctx'
import { Icon } from './icons'

const ROWS: { key: keyof Blurb; label: string }[] = [
  { key: 'atmosphere', label: 'Atmosfera' },
  { key: 'pace', label: 'Ritmo' },
  { key: 'effort', label: 'Impegno' },
  { key: 'likeIf', label: 'Potrebbe piacerti se' },
  { key: 'mightPutOff', label: 'Potrebbe frenarti se' },
  { key: 'forYou', label: 'Per te' },
]

/** Scheda "Cosa aspettarti": ragionata, senza spoiler, generata a richiesta con la tua chiave Anthropic. */
export function Expect({ t, detail }: { t: Title; detail?: Detail }) {
  const { prefs } = usePersonal()
  const { summary } = useTaste()
  const genres = useGenres()
  const [blurb, setBlurb] = useState<Blurb | undefined>(() => cachedBlurb(t))
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    setBlurb(cachedBlurb(t))
    setErr('')
  }, [t])

  if (!getAiKey()) {
    return <p className="muted aihint">Per le schede «Cosa aspettarti» aggiungi la chiave Anthropic in Impostazioni.</p>
  }

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

  if (!blurb) {
    return (
      <div className="expect">
        <button className="btn sm" onClick={run} disabled={loading}>
          <Icon name="spark" size={14} /> {loading ? 'Leggo il titolo…' : 'Cosa aspettarti'}
        </button>
        {err && <p className="err">{err}</p>}
      </div>
    )
  }
  return (
    <div className="expect open">
      <div className="expect-head">
        <span className="eyebrow">Cosa aspettarti · senza spoiler</span>
        <button className="link" onClick={run} disabled={loading}>{loading ? '…' : 'Aggiorna'}</button>
      </div>
      <dl>
        {ROWS.map((r) => (
          <div key={r.key}>
            <dt>{r.label}</dt>
            <dd>{blurb[r.key]}</dd>
          </div>
        ))}
      </dl>
      {err && <p className="err">{err}</p>}
      <p className="muted small">Generato da un modello linguistico: può sbagliare.</p>
    </div>
  )
}
