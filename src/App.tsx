import { useState } from 'react'
import type { Title } from './tmdb'
import * as tmdb from './tmdb'
import { useLists as useListsStore } from './store'
import { useViews } from './views'
import { useSources } from './sources'
import { ListsCtx, OpenCtx } from './ui/ctx'
import { Icon } from './ui/icons'
import { Home } from './pages/Home'
import { Explore } from './pages/Explore'
import { Best } from './pages/Best'
import { Library } from './pages/Library'
import { SearchPage } from './pages/SearchPage'
import { Settings } from './pages/Settings'
import { Detail } from './pages/Detail'

type Tab = 'home' | 'explore' | 'best' | 'library' | 'search' | 'settings'

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'explore', label: 'Esplora', icon: 'compass' },
  { id: 'best', label: 'Il meglio', icon: 'star' },
  { id: 'library', label: 'Liste', icon: 'bookmark' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>(tmdb.getKey() ? 'home' : 'settings')
  const [sel, setSel] = useState<Title | null>(null)
  const { lists, has, toggle, replace } = useListsStore()
  const views = useViews()
  const src = useSources()

  const go = (t: Tab) => {
    setTab(t)
    window.scrollTo({ top: 0 })
  }

  return (
    <ListsCtx.Provider value={{ has, toggle }}>
      <OpenCtx.Provider value={setSel}>
        <div className="shell">
          <header className="hdr">
            <button className="brand" onClick={() => go('home')} aria-label="Marquee, vai alla home">
              <span className="bulbs" aria-hidden="true"><i /><i /><i /></span>
              Marquee
            </button>
            <nav className="topnav" aria-label="Sezioni">
              {NAV.map((n) => (
                <button key={n.id} className={tab === n.id ? 'on' : ''} aria-current={tab === n.id ? 'page' : undefined} onClick={() => go(n.id)}>{n.label}</button>
              ))}
            </nav>
            <span className="spacer" />
            <button className={'iconbtn' + (tab === 'search' ? ' on' : '')} onClick={() => go('search')} aria-label="Cerca"><Icon name="search" size={19} /></button>
            <button className={'iconbtn' + (tab === 'settings' ? ' on' : '')} onClick={() => go('settings')} aria-label="Impostazioni"><Icon name="sliders" size={19} /></button>
          </header>

          <main>
            <div hidden={tab !== 'home'}>
              <Home favorites={lists.favorites} seen={lists.seen} goto={go} />
            </div>
            <div hidden={tab !== 'explore'}>
              <Explore seen={lists.seen} views={views} active={tab === 'explore'} />
            </div>
            {tab === 'best' && <Best seen={lists.seen} sources={src.sources} />}
            {tab === 'library' && <Library lists={lists} />}
            {tab === 'search' && <SearchPage />}
            {tab === 'settings' && <Settings lists={lists} views={views} replaceLists={replace} src={src} />}
          </main>
        </div>

        <nav className="dock" aria-label="Sezioni">
          {NAV.map((n) => (
            <button key={n.id} className={tab === n.id ? 'on' : ''} aria-current={tab === n.id ? 'page' : undefined} aria-label={n.label} onClick={() => go(n.id)}>
              <Icon name={n.icon} size={22} fill={tab === n.id && n.icon === 'star'} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>

        {sel && <Detail t={sel} close={() => setSel(null)} />}
      </OpenCtx.Provider>
    </ListsCtx.Provider>
  )
}
