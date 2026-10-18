import { useEffect, useMemo, useState } from 'react'
import type { Query, Title } from './tmdb'
import * as tmdb from './tmdb'
import { useLists as useListsStore } from './store'
import { useViews } from './views'
import { useSources } from './sources'
import { PersonalProvider, usePersonal } from './personal'
import { FilterProvider, useFilters } from './filters'
import { computeTaste, tasteSummary } from './taste'
import { decodePayload } from './together'
import type { TogetherPayload } from './together'
import { ListsCtx, OpenCtx, TasteCtx } from './ui/ctx'
import { useGenres } from './ui/data'
import { Icon } from './ui/icons'
import { Home } from './pages/Home'
import type { Goto } from './pages/Home'
import { Explore } from './pages/Explore'
import { FilterBar } from './pages/FilterBar'
import { FilterStrip } from './pages/FilterStrip'
import { ManageViews } from './pages/SavedSearches'
import { Best } from './pages/Best'
import { Library } from './pages/Library'
import type { LibraryTab } from './pages/Library'
import { SearchBar } from './pages/SearchBar'
import { Settings } from './pages/Settings'
import { Detail } from './pages/Detail'
import { PickPage } from './pages/Pick'
import { TogetherPage } from './pages/Together'

type Tab = 'home' | 'pick' | 'together' | 'explore' | 'best' | 'library' | 'settings'

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'explore', label: 'Esplora', icon: 'compass' },
  { id: 'best', label: 'Il meglio', icon: 'star' },
  { id: 'library', label: 'Liste', icon: 'bookmark' },
]

/** Sezioni raggiunte dalla home: nel menu resta evidenziata la Home. */
const NAV_OF: Record<Tab, Tab | null> = {
  home: 'home', pick: 'home', together: 'home', explore: 'explore', best: 'best', library: 'library', settings: null,
}

function readIncoming(): TogetherPayload | null {
  const m = location.hash.match(/^#t=(.+)$/)
  return m ? decodePayload(m[1]) : null
}

function Shell() {
  const incomingAtStart = useMemo(readIncoming, [])
  const [tab, setTab] = useState<Tab>(incomingAtStart ? 'together' : tmdb.getKey() ? 'home' : 'settings')
  // schermata da cui si è aperto Cerca o Impostazioni: un secondo tocco sull'icona ci riporta lì
  const [back, setBack] = useState<Tab>('home')
  const [incoming, setIncoming] = useState<TogetherPayload | null>(incomingAtStart)
  const [sel, setSel] = useState<Title | null>(null)
  const [manageViews, setManageViews] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [libTab, setLibTab] = useState<LibraryTab>('watchlist')
  const { lists, has, toggle, replace } = useListsStore()
  const views = useViews()
  const src = useSources()
  const personal = usePersonal()
  const F = useFilters()
  const genres = useGenres()

  const taste = useMemo(() => computeTaste(lists, personal.reactions), [lists, personal.reactions])
  const summary = useMemo(() => tasteSummary(taste, genres), [taste, genres])

  // il link "scegliamo insieme" si apre una volta e poi si toglie dall'indirizzo
  useEffect(() => {
    if (location.hash.startsWith('#t=')) history.replaceState(null, '', location.pathname + location.search)
    const onHash = () => {
      const p = readIncoming()
      if (p) {
        setIncoming(p)
        setTab('together')
        history.replaceState(null, '', location.pathname + location.search)
      }
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (t: Tab) => {
    const overlay = (x: Tab) => x === 'settings'
    if (overlay(t)) {
      if (tab === t) t = back
      else if (!overlay(tab)) setBack(tab)
    }
    setTab(t)
    if (t === 'explore') setSearchOpen(false) // in Esplora il campo di ricerca è già nella pagina
    window.scrollTo({ top: 0 })
  }
  const listCount = lists.watchlist.length + lists.favorites.length + lists.seen.length
  const applyQuery = (query: Query, info?: string) => {
    F.setQuery(query, info ?? '')
    go('explore')
  }
  // i filtri valgono in Home, Esplora, Il meglio e Liste; dalle altre pagine l'icona porta in Esplora
  const filterable = tab === 'home' || tab === 'explore' || tab === 'best' || tab === 'library'
  const toggleSearch = () => {
    setSearchOpen((o) => !o)
    F.setOpen(false)
  }
  const toggleFilters = () => {
    setSearchOpen(false)
    if (!filterable) {
      go('explore')
      F.setOpen(true)
    } else F.toggleOpen()
  }

  return (
    <ListsCtx.Provider value={{ has, toggle, lists }}>
      <TasteCtx.Provider value={{ taste, summary }}>
        <OpenCtx.Provider value={setSel}>
          <div className="shell">
            <header className="hdr">
              <button className="brand" onClick={() => go('home')} aria-label="Marquee, vai alla home" data-tip="Torna alla home">
                Marquee
              </button>
              <nav className="topnav" aria-label="Sezioni">
                {NAV.map((n) => (
                  <button key={n.id} className={NAV_OF[tab] === n.id ? 'on' : ''} aria-current={NAV_OF[tab] === n.id ? 'page' : undefined} onClick={() => go(n.id)}>{n.label}</button>
                ))}
              </nav>
              <span className="spacer" />
              <button className={'hbtn' + (F.open ? ' on' : '')} onClick={toggleFilters} aria-label="Filtri" aria-expanded={F.open} data-tip={F.open ? 'Chiudi i filtri' : 'Filtra i titoli: tipo, voti, premi, piattaforme…'}>
                <Icon name="filter" size={19} /><span>Filtri</span>
                {F.chips.length > 0 && <i className="hbadge">{F.chips.length}</i>}
              </button>
              {tab !== 'explore' && (
                <button className={'iconbtn' + (searchOpen ? ' on' : '')} onClick={toggleSearch} aria-label="Cerca" aria-expanded={searchOpen} data-tip={searchOpen ? 'Chiudi la ricerca' : 'Cerca un titolo o descrivilo con l\'IA'}>
                  <Icon name="search" size={19} />
                </button>
              )}
              <button className={'hbtn' + (tab === 'settings' ? ' on' : '')} onClick={() => go('settings')} aria-label="Impostazioni" data-tip={tab === 'settings' ? 'Torna alla schermata precedente' : 'Impostazioni: abbonamenti, chiavi, IA, backup'}>
                <Icon name="gear" size={19} /><span>Impostazioni</span>
              </button>
            </header>

            <FilterBar views={views} onManage={() => setManageViews(true)} />
            {searchOpen && tab !== 'explore' && <SearchBar onClose={() => setSearchOpen(false)} onApplyQuery={(q, info) => { setSearchOpen(false); applyQuery(q, info) }} />}
            {filterable && !F.open && <FilterStrip showNotice={tab !== 'explore'} />}

            <main>
              <div hidden={tab !== 'home'}>
                <Home favorites={lists.favorites} seen={lists.seen} listCount={listCount} active={tab === 'home'} goto={(t: Goto) => { if (t === 'taste') { setLibTab('taste'); go('library') } else go(t) }} />
              </div>
              <div hidden={tab !== 'explore'}>
                <Explore active={tab === 'explore'} />
              </div>
              {tab === 'pick' && (
                <>
                  <button className="link" style={{ marginTop: 14 }} onClick={() => go('home')}>← Home</button>
                  <PickPage lists={lists} />
                </>
              )}
              {tab === 'together' && <TogetherPage key={incoming ? 'in' : 'out'} lists={lists} incoming={incoming} onExit={() => { setIncoming(null); go('home') }} />}
              {tab === 'best' && <Best seen={lists.seen} sources={src.sources} />}
              {tab === 'library' && <Library lists={lists} tab={libTab} setTab={setLibTab} />}
              {tab === 'settings' && <Settings lists={lists} views={views} replaceLists={replace} src={src} />}
            </main>
          </div>

          <nav className="dock" aria-label="Sezioni">
            {NAV.map((n) => {
              const on = NAV_OF[tab] === n.id
              return (
                <button key={n.id} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined} aria-label={n.label} data-tip={n.label} onClick={() => go(n.id)}>
                  <Icon name={n.icon} size={22} fill={on && n.icon === 'star'} />
                  <span>{n.label}</span>
                </button>
              )
            })}
          </nav>

          {sel && <Detail t={sel} close={() => setSel(null)} />}
          {manageViews && <ManageViews api={views} q={F.q} onClose={() => setManageViews(false)} />}
        </OpenCtx.Provider>
      </TasteCtx.Provider>
    </ListsCtx.Provider>
  )
}

export default function App() {
  return (
    <PersonalProvider>
      <FilterProvider>
        <Shell />
      </FilterProvider>
    </PersonalProvider>
  )
}
