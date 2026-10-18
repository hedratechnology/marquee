import { useState } from 'react'
import type { Title } from '../tmdb'
import type { ListName, Lists } from '../store'
import { Chip, Empty, TitleGrid } from '../ui/components'
import { TAGS, usePersonal } from '../personal'
import type { Tag } from '../personal'
import { useTaste } from '../ui/ctx'

const LABEL: Record<ListName, string> = {
  watchlist: 'Da vedere', favorites: 'Preferiti', seen: 'Visti', started: 'In corso', dropped: 'Abbandonati', hidden: 'Nascosti',
}
const ICON: Record<ListName, string> = {
  watchlist: 'bookmark', favorites: 'star', seen: 'check', started: 'play', dropped: 'x', hidden: 'film',
}
const HELP: Record<ListName, string> = {
  watchlist: 'Tocca il segnalibro su una locandina per salvarla qui.',
  favorites: 'Tocca la stella su una locandina: i preferiti guidano i consigli.',
  seen: 'Segna come visti i titoli nel dettaglio: non te li riproporrò.',
  started: 'Qui i titoli che hai iniziato e non finito.',
  dropped: 'Qui i titoli che hai lasciato a metà: non te li riproporrò.',
  hidden: 'Qui i titoli che non vuoi più vedere nelle proposte. Aprine uno per ripristinarlo.',
}
const ORDER: ListName[] = ['watchlist', 'favorites', 'seen', 'started', 'dropped', 'hidden']

export function Library({ lists }: { lists: Lists }) {
  const [tab, setTab] = useState<ListName>('watchlist')
  const [tag, setTag] = useState<Tag | null>(null)
  const p = usePersonal()
  const { summary, taste } = useTaste()
  const items: Title[] = tab === 'watchlist' && tag ? lists.watchlist.filter((t) => p.tagsOf(t).includes(tag)) : lists[tab]

  return (
    <>
      <h1 className="page-title">La mia lista</h1>
      {taste.samples > 0 && (
        <p className="lede"><b>Il tuo gusto.</b> {summary}</p>
      )}
      <div className="pills" role="tablist" aria-label="Liste" style={{ marginBottom: 18 }}>
        {ORDER.map((l) => (
          <button key={l} role="tab" aria-selected={tab === l} className={'pill' + (tab === l ? ' on' : '')} onClick={() => { setTab(l); setTag(null) }}>
            {LABEL[l]} · {lists[l].length}
          </button>
        ))}
      </div>

      {tab === 'watchlist' && lists.watchlist.length > 0 && (
        <div className="row" style={{ marginBottom: 20 }}>
          <Chip on={tag === null} onClick={() => setTag(null)}>Tutti</Chip>
          {TAGS.map((g) => (
            <Chip key={g.id} on={tag === g.id} onClick={() => setTag(tag === g.id ? null : g.id)}>
              {g.label} · {lists.watchlist.filter((t) => p.tagsOf(t).includes(g.id)).length}
            </Chip>
          ))}
        </div>
      )}

      <TitleGrid items={items} empty={<Empty icon={ICON[tab]} title={`${LABEL[tab]}: ancora vuota`} text={tag ? 'Nessun titolo con questa etichetta: aprine uno e scegli quando lo guardi.' : HELP[tab]} />} />
    </>
  )
}
