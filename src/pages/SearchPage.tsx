import { useEffect, useState } from 'react'
import * as tmdb from '../tmdb'
import type { Query, Title } from '../tmdb'
import { aiErrorText, getAiKey, nlSearch } from '../ai'
import { usePersonal } from '../personal'
import { Empty, TitleGrid } from '../ui/components'
import { Icon } from '../ui/icons'
import { errText } from '../ui/helpers'

export function SearchPage({ onApplyQuery }: { onApplyQuery: (q: Query, info: string) => void }) {
  const personal = usePersonal()
  const [mode, setMode] = useState<'title' | 'ai'>('title')
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Title[]>([])
  const [err, setErr] = useState('')
  const [phrase, setPhrase] = useState('')
  const [ai, setAi] = useState({ busy: false, err: '' })

  useEffect(() => {
    if (mode !== 'title' || q.trim().length < 2) return
    const h = setTimeout(() => {
      tmdb.search(q).then((r) => { setItems(r.filter((t) => t.poster)); setErr('') }).catch((e) => setErr(errText(e)))
    }, 300)
    return () => clearTimeout(h)
  }, [q, mode])

  async function runAi() {
    const text = phrase.trim()
    if (!text) return
    if (!getAiKey()) {
      setAi({ busy: false, err: 'Per cercare con l\'IA serve la chiave Anthropic: la inserisci in Impostazioni.' })
      return
    }
    setAi({ busy: true, err: '' })
    try {
      const applied = await nlSearch(text, personal.prefs.aiModel, personal.prefs.providers)
      setAi({ busy: false, err: '' })
      onApplyQuery(applied.query, [applied.summary, ...applied.notes].join(' '))
    } catch (e) {
      setAi({ busy: false, err: aiErrorText(e) })
    }
  }

  const ready = q.trim().length >= 2
  return (
    <>
      <h1 className="page-title">Cerca</h1>
      <div className="seg" role="tablist" style={{ marginBottom: 16 }}>
        <button role="tab" aria-selected={mode === 'title'} className={mode === 'title' ? 'on' : ''} onClick={() => setMode('title')}>Per titolo</button>
        <button role="tab" aria-selected={mode === 'ai'} className={mode === 'ai' ? 'on' : ''} onClick={() => setMode('ai')}><Icon name="spark" size={14} /> Descrivi con l'IA</button>
      </div>

      {mode === 'title' ? (
        <>
          <input className="search-big" autoFocus placeholder="Titolo di un film o di una serie" value={q} onChange={(e) => setQ(e.target.value)} />
          {err && <p className="err">{err}</p>}
          <div style={{ marginTop: 26 }}>
            {ready ? <TitleGrid items={items} empty={<Empty icon="search" title="Nessun risultato" text="Prova con un altro titolo." />} /> : <Empty icon="search" title="Cosa stai cercando?" text="Scrivi almeno due lettere." />}
          </div>
        </>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); runAi() }}>
          <input className="search-big" autoFocus value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="Descrivi cosa ti va di vedere" aria-label="Descrivi cosa ti va di vedere" />
          <p className="muted" style={{ margin: '10px 2px' }}>Per esempio: «un thriller misterioso ma poco violento, sotto le due ore, da vedere in coppia». L'IA imposta i filtri e ti mostra i risultati in Esplora, dove puoi ancora modificarli.</p>
          <div className="row">
            <button className="btn gold" type="submit" disabled={ai.busy || !phrase.trim()}><Icon name="spark" size={16} /> {ai.busy ? 'Leggo…' : 'Cerca'}</button>
          </div>
          {ai.err && <p className="err">{ai.err}</p>}
          {!getAiKey() && <p className="muted">Serve la chiave Anthropic in Impostazioni.</p>}
        </form>
      )}
    </>
  )
}
