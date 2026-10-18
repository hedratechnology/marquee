import { useCallback, useEffect, useState } from 'react'
import type { Title } from './tmdb'

export type ListName = 'watchlist' | 'favorites' | 'seen' | 'started' | 'dropped' | 'hidden'
export type Lists = Record<ListName, Title[]>

export const LIST_NAMES: ListName[] = ['watchlist', 'favorites', 'seen', 'started', 'dropped', 'hidden']

const KEY = 'lists_v1'
const empty: Lists = { watchlist: [], favorites: [], seen: [], started: [], dropped: [], hidden: [] }

function load(): Lists {
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return empty
  }
}

export const keyOf = (t: Pick<Title, 'type' | 'id'>) => `${t.type}:${t.id}`

export function useLists() {
  const [lists, setLists] = useState<Lists>(load)

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(lists))
  }, [lists])

  const has = useCallback((l: ListName, t: Title) => lists[l].some((x) => x.id === t.id && x.type === t.type), [lists])

  const toggle = useCallback((l: ListName, t: Title) => {
    setLists((cur) => {
      const on = cur[l].some((x) => x.id === t.id && x.type === t.type)
      const next = on ? cur[l].filter((x) => !(x.id === t.id && x.type === t.type)) : [t, ...cur[l]]
      return { ...cur, [l]: next }
    })
  }, [])

  const replace = useCallback((l: Lists) => setLists({ ...empty, ...l }), [])

  return { lists, has, toggle, replace }
}
