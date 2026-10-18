import { useEffect, useState } from 'react'
import { TasteProfile } from './TasteProfile'
import { Icon } from '../ui/icons'
import type { Title } from '../tmdb'
import type { ListName, Lists } from '../store'
import { Chip, Empty, TitleGrid } from '../ui/components'
import { TAGS, usePersonal } from '../personal'
import type { Tag } from '../personal'
import { useFilters, useReportCount } from '../filters'
import { matchesQuery, useFilterEnv } from '../filtering'
import { requestRatings } from '../omdb'

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

export type LibraryTab = ListName | 'taste'

export function Library({ lists, tab, setTab }: { lists: Lists; tab: LibraryTab; setTab: (t: LibraryTab) => void }) {
  const [tag, setTag] = useState<Tag | null>(null)
  const p = usePersonal()
  const { q } = useFilters()
  const env = useFilterEnv(q)
  const listTab: ListName = tab === 'taste' ? 'watchlist' : tab
  const byTag: Title[] = listTab === 'watchlist' && tag ? lists.watchlist.filter((t) => p.tagsOf(t).includes(tag)) : lists[listTab]
  const ratingFilter = !!(q.minImdb || q.minRt || q.minMeta)
  // con filtri sui voti servono i punteggi di tutti i titoli della lista
  useEffect(() => {
    if (ratingFilter) requestRatings(byTag)
  }, [ratingFilter, byTag])
  const items: Title[] = byTag.filter((t) => matchesQuery({ type: t.type, id: t.id, year: t.year, genreIds: t.genreIds ?? [], rating: t.rating }, q, env))
  useReportCount(tab === 'taste' ? null : items.length, false, true)

  return (
    <>
      <h1 className="page-title">{tab === 'taste' ? 'Il tuo gusto' : 'La mia lista'}</h1>
      <div className="pills" role="tablist" aria-label="Liste" style={{ marginBottom: 18 }}>
        <button role="tab" aria-selected={tab === 'taste'} className={'pill' + (tab === 'taste' ? ' on' : '')} onClick={() => setTab('taste')}>
          <Icon name="spark" size={14} /> Il tuo gusto
        </button>
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

      {tab === 'taste' ? <TasteProfile /> : <TitleGrid items={items} empty={<Empty icon={ICON[listTab]} title={`${LABEL[listTab]}: ancora vuota`} text={tag ? 'Nessun titolo con questa etichetta: aprine uno e scegli quando lo guardi.' : HELP[listTab]} />} />}
    </>
  )
}
