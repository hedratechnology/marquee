import { useState } from 'react'
import type { ReactNode } from 'react'
import * as tmdb from '../tmdb'
import { getOmdbKey, setOmdbKey } from '../omdb'
import type { Lists } from '../store'
import type { useViews } from '../views'
import { SUGGESTED_SOURCES } from '../sources'
import type { Platform, useSources } from '../sources'
import { Chip } from '../ui/components'

type ViewsApi = ReturnType<typeof useViews>
const PLATFORM_LABEL: Record<Platform, string> = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', x: 'X', other: 'Link' }

function Card({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <section className="cardbox">
      <h2>{title}</h2>
      {help && <p className="muted" style={{ margin: '4px 0 12px' }}>{help}</p>}
      {children}
    </section>
  )
}

function KeyField({ title, help, value, onSave }: { title: string; help: string; value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  const [saved, setSaved] = useState(false)
  return (
    <Card title={title} help={help}>
      <div className="row">
        <input className="field" type="password" autoComplete="off" value={v} onChange={(e) => { setV(e.target.value); setSaved(false) }} placeholder="Incolla qui la chiave" />
        <button className="btn gold" onClick={() => { onSave(v); setSaved(true) }}>Salva</button>
      </div>
      {saved && <p className="muted" style={{ marginTop: 8 }}>Salvata sul dispositivo.</p>}
    </Card>
  )
}

function LinkList({ title, help, placeholder, items, onAdd, onRemove, extra }: {
  title: string; help: string; placeholder: string
  items: { id: string; url: string; name: string; tag?: string }[]
  onAdd: (v: string) => string | null
  onRemove: (id: string) => void
  extra?: ReactNode
}) {
  const [v, setV] = useState('')
  const [err, setErr] = useState('')
  function add() {
    const e = onAdd(v)
    setErr(e ?? '')
    if (!e) setV('')
  }
  return (
    <Card title={title} help={help}>
      <div className="row">
        <input className="field" value={v} placeholder={placeholder} onChange={(e) => { setV(e.target.value); setErr('') }} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn gold" onClick={add}>Aggiungi</button>
      </div>
      {err && <p className="err" style={{ marginTop: 8 }}>{err}</p>}
      {extra}
      {items.length > 0 && (
        <ul className="links">
          {items.map((i) => (
            <li key={i.id}>
              <a href={i.url} target="_blank" rel="noreferrer">{i.name}</a>
              {i.tag && <span className="muted">{i.tag}</span>}
              <button className="btn sm" aria-label={`Rimuovi ${i.name}`} onClick={() => onRemove(i.id)}>Rimuovi</button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function Settings({ lists, views, replaceLists, src }: {
  lists: Lists; views: ViewsApi; replaceLists: (l: Lists) => void; src: ReturnType<typeof useSources>
}) {
  function exportJson() {
    const data = { lists, views: views.views, sources: src.sources, profiles: src.profiles }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    a.download = 'marquee-backup.json'
    a.click()
  }
  async function importJson(file: File) {
    try {
      const d = JSON.parse(await file.text())
      replaceLists(d.lists ?? d)
      if (Array.isArray(d.views)) views.replace(d.views)
      src.replace(d.sources, d.profiles)
    } catch {
      alert('File non valido.')
    }
  }
  const missing = SUGGESTED_SOURCES.filter((s) => !src.sources.some((x) => x.url.replace(/\/$/, '') === s.url))

  return (
    <>
      <h1 className="page-title">Impostazioni</h1>
      <p className="lede">Tutto resta su questo dispositivo: chiavi, liste e viste.</p>

      <LinkList
        title="Fonti di qualità"
        help="Siti e riviste di cui ti fidi. Compaiono nella scheda Il meglio."
        placeholder="https://www.mymovies.it"
        items={src.sources}
        onAdd={(v) => src.addSource(v)}
        onRemove={src.removeSource}
        extra={missing.length > 0 && (
          <div className="row" style={{ marginTop: 12 }}>
            <span className="muted">Suggerite</span>
            {missing.map((m) => <Chip key={m.url} onClick={() => src.addSource(m.url, m.name)}>+ {m.name}</Chip>)}
          </div>
        )}
      />

      <LinkList
        title="Profili da cui prendere spunto"
        help="Instagram, TikTok, YouTube o altro. Incolla il link oppure scrivi @nomeprofilo."
        placeholder="https://www.instagram.com/nomeprofilo"
        items={src.profiles.map((p) => ({ id: p.id, url: p.url, name: p.name, tag: PLATFORM_LABEL[p.platform] }))}
        onAdd={(v) => src.addProfile(v)}
        onRemove={src.removeProfile}
      />

      <KeyField title="Chiave TMDB" help="Gratis su themoviedb.org (Impostazioni, API). Vanno bene la chiave v3 o il token Read Access." value={tmdb.getKey()} onSave={tmdb.setKey} />
      <KeyField title="Chiave OMDb" help="Gratis su omdbapi.com/apikey.aspx. Serve per IMDb, Rotten Tomatoes e Metacritic." value={getOmdbKey()} onSave={setOmdbKey} />

      <Card title="Backup" help="Liste, viste, fonti e profili. Utile per passare da un dispositivo all'altro.">
        <div className="row">
          <button className="btn" onClick={exportJson}>Esporta</button>
          <label className="btn" style={{ cursor: 'pointer' }}>
            Importa
            <input type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          </label>
        </div>
      </Card>
      <p className="muted">Questo prodotto usa l'API di TMDB ma non è approvato o certificato da TMDB.</p>
    </>
  )
}
