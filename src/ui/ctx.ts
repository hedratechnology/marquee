import { createContext, useContext } from 'react'
import type { Title } from '../tmdb'
import type { ListName, Lists } from '../store'
import type { Taste } from '../taste'

export interface ListsApi {
  has: (l: ListName, t: Title) => boolean
  toggle: (l: ListName, t: Title) => void
  lists: Lists
}

export const ListsCtx = createContext<ListsApi>({
  has: () => false,
  toggle: () => undefined,
  lists: { watchlist: [], favorites: [], seen: [], started: [], dropped: [], hidden: [] },
})
export const OpenCtx = createContext<(t: Title) => void>(() => undefined)

export const useLists = () => useContext(ListsCtx)
export const useOpen = () => useContext(OpenCtx)

export interface TasteApi {
  taste: Taste
  summary: string
}
export const TasteCtx = createContext<TasteApi>({
  taste: { genre: {}, moviePref: 0.5, gentle: false, slowAverse: false, samples: 0, topGenreIds: [], signals: { more: 0, characters: 0, atmosphere: 0, slow: 0, ending: 0, violent: 0 }, reacted: 0 },
  summary: '',
})
export const useTaste = () => useContext(TasteCtx)
