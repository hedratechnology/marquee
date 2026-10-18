import { useState } from 'react'
import type { Title } from '../tmdb'
import type { ListName, Lists } from '../store'
import { Empty, TitleGrid } from '../ui/components'

const LABEL: Record<ListName, string> = { watchlist: 'Da vedere', favorites: 'Preferiti', seen: 'Visti' }
const ICON: Record<ListName, string> = { watchlist: 'bookmark', favorites: 'star', seen: 'check' }
const HELP: Record<ListName, string> = {
  watchlist: 'Tocca il segnalibro su una locandina per salvarla qui.',
  favorites: 'Tocca la stella su una locandina: i preferiti guidano i consigli.',
  seen: 'Segna come visti i titoli nel dettaglio per nasconderli dalle proposte.',
}

export function Library({ lists }: { lists: Lists }) {
  const [tab, setTab] = useState<ListName>('watchlist')
  const items: Title[] = lists[tab]
  return (
    <>
      <h1 className="page-title">Le tue liste</h1>
      <div className="seg" role="tablist" style={{ margin: '8px 0 24px' }}>
        {(Object.keys(LABEL) as ListName[]).map((l) => (
          <button key={l} role="tab" aria-selected={tab === l} className={tab === l ? 'on' : ''} onClick={() => setTab(l)}>
            {LABEL[l]} · {lists[l].length}
          </button>
        ))}
      </div>
      <TitleGrid items={items} empty={<Empty icon={ICON[tab]} title={`${LABEL[tab]}: ancora vuota`} text={HELP[tab]} />} />
    </>
  )
}
