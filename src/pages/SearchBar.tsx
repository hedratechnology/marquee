import { useEffect, useState } from 'react'
import * as tmdb from '../tmdb'
import type { Query, Title } from '../tmdb'
import { aiErrorText, getAiKey, nlSearch } from '../ai'
import { usePersonal } from '../personal'
import { Rail, PosterCard } from '../ui/components'
import { Icon } from '../ui/icons'
import { errText } from '../ui/helpers'

/** La ricerca a tendina: si apre sotto l'intestazione e spinge giù il resto della pagina. */
export function SearchBar({ onClose, onApplyQuery }: { onClose: () => void; onApplyQuery: (q: Query, info: string) => void }) {
  const personal = usePersonal()
  const [mode, setMode] = useState<'title' | 'ai'>(() => (localStorage.getItem('search_mode') === 'ai' ? 'ai' : 'title'))
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Title[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (mode !== 'title' || q.trim().length < 2) {
      setItems([])
      return
    }
    const h = setTimeout(() => {
      tmdb.search(q).then((r) => { setItems(r.filter((t) => t.poster)); setErr('') }).catch((e) => setErr(errText(e)))
    }, 300)
    return () => clearTimeout(h)
  }, [q, mode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const switchMode = (m: 'title' | 'ai') => {
    setMode(m)
    localStorage.setItem('search_mode', m)
    setErr('')
  }

  async function runAi() {
    const text = q.trim()
    if (!text) return
    if (!getAiKey()) {
      setErr("Per descrivere cosa vuoi serve la chiave Anthropic: la inserisci in Impostazioni.")
      return
    }
    setBusy(true)
    setErr('')
    try {
      const applied = await nlSearch(text, personal.prefs.aiModel, personal.prefs.providers)
      onApplyQuery(applied.query, [applied.summary, ...applied.notes].join(' '))
    } catch (e) {
      setErr(aiErrorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fbar sbar" role="search" aria-label="Cerca">
      <form className="sbar-row" onSubmit={(e) => { e.preventDefault(); if (mode === 'ai') runAi() }}>
        <div className="mode2" role="tablist" aria-label="Come cercare">
          <button type="button" role="tab" aria-selected={mode === 'title'} className={mode === 'title' ? 'on' : ''} onClick={() => switchMode('title')}>
            <Icon name="search" size={14} /> Per titolo
          </button>
          <button type="button" role="tab" aria-selected={mode === 'ai'} className={mode === 'ai' ? 'on' : ''} onClick={() => switchMode('ai')}>
            <Icon name="spark" size={14} /> Con l'IA
          </button>
        </div>
        <input
          autoFocus
          className="sbar-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={mode === 'ai' ? 'Descrivi cosa ti va di vedere: «un thriller misterioso, poco violento, sotto le due ore»' : 'Titolo di un film o di una serie'}
          aria-label={mode === 'ai' ? 'Descrivi cosa ti va di vedere' : 'Cerca un titolo'}
        />
        {mode === 'ai' && <button className="btn gold sm" type="submit" disabled={busy || !q.trim()}>{busy ? 'Leggo…' : 'Cerca'}</button>}
        <button className="iconbtn sm" type="button" onClick={onClose} aria-label="Chiudi la ricerca" data-tip="Chiudi la ricerca"><Icon name="up" size={18} /></button>
      </form>
      {err && <p className="err" style={{ margin: '0 0 10px' }}>{err}</p>}
      {mode === 'title' && items.length > 0 && (
        <div className="sbar-results">
          <Rail title={`${items.length} risultati`}>
            {items.slice(0, 14).map((t) => (
              <PosterCard key={t.type + t.id} t={t} name={t.title} sub={`${t.year} · ${t.type === 'movie' ? 'Film' : 'Serie'}`} />
            ))}
          </Rail>
        </div>
      )}
      {mode === 'title' && q.trim().length >= 2 && items.length === 0 && !err && <p className="muted" style={{ margin: '0 0 12px' }}>Nessun risultato: prova con un altro titolo.</p>}
      {mode === 'ai' && <p className="muted" style={{ margin: '0 0 12px' }}>L'IA imposta i filtri per te e ti mostra i risultati in Esplora, dove puoi ancora modificarli.</p>}
    </div>
  )
}
