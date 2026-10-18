import { useEffect, useState } from 'react'
import * as tmdb from '../tmdb'
import type { Title } from '../tmdb'
import { Empty, TitleGrid } from '../ui/components'
import { errText } from '../ui/helpers'

export function SearchPage() {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Title[]>([])
  const [err, setErr] = useState('')

  useEffect(() => {
    if (q.trim().length < 2) return
    const h = setTimeout(() => {
      tmdb.search(q).then((r) => { setItems(r.filter((t) => t.poster)); setErr('') }).catch((e) => setErr(errText(e)))
    }, 300)
    return () => clearTimeout(h)
  }, [q])

  const ready = q.trim().length >= 2
  return (
    <>
      <h1 className="page-title">Cerca</h1>
      <input className="search-big" autoFocus placeholder="Titolo di un film o di una serie" value={q} onChange={(e) => setQ(e.target.value)} />
      {err && <p className="err">{err}</p>}
      <div style={{ marginTop: 26 }}>
        {ready ? <TitleGrid items={items} empty={<Empty icon="search" title="Nessun risultato" text="Prova con un altro titolo." />} /> : <Empty icon="search" title="Cosa stai cercando?" text="Scrivi almeno due lettere." />}
      </div>
    </>
  )
}
