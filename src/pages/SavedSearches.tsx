import { useState } from 'react'
import type { Query } from '../tmdb'
import type { useViews } from '../views'
import { MAX_VIEWS } from '../views'
import { Sheet } from '../ui/components'
import { Icon } from '../ui/icons'
import { summary } from '../ui/helpers'

type ViewsApi = ReturnType<typeof useViews>

export function ManageViews({ api, q, onClose }: { api: ViewsApi; q: Query; onClose: () => void }) {
  const [name, setName] = useState('')
  return (
    <Sheet title="Le tue ricerche salvate" onClose={onClose}>
      <p className="muted">Una vista è un insieme di filtri salvato con un nome. Ne puoi avere fino a {MAX_VIEWS}.</p>
      <div className="viewlist">
        {api.views.map((v, i) => (
          <div key={v.id} className="viewitem">
            <b>{v.name}</b>
            <span className="muted">{summary(v.query)}</span>
            <div className="tools">
              <button className="btn sm" disabled={i === 0} onClick={() => api.move(v.id, -1)} aria-label="Sposta su"><Icon name="up" size={14} /></button>
              <button className="btn sm" disabled={i === api.views.length - 1} onClick={() => api.move(v.id, 1)} aria-label="Sposta giù"><Icon name="down" size={14} /></button>
              <button className="btn sm" onClick={() => { const n = prompt('Nome della vista', v.name); if (n?.trim()) api.rename(v.id, n.trim()) }}>Rinomina</button>
              <button className="btn sm" onClick={() => api.update(v.id, q)}>Usa i filtri attuali</button>
              <button className="btn sm" onClick={() => api.remove(v.id)}>Elimina</button>
            </div>
          </div>
        ))}
      </div>
      {api.views.length < MAX_VIEWS ? (
        <div className="row" style={{ marginTop: 16 }}>
          <input className="field" placeholder="Nome nuova ricerca" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn gold" disabled={!name.trim()} onClick={() => { api.add(name.trim(), q); setName('') }}>Salva i filtri attuali</button>
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 14 }}>Hai raggiunto il massimo di {MAX_VIEWS}: eliminane una per aggiungerne un'altra.</p>
      )}
    </Sheet>
  )
}
