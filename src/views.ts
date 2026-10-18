import { useCallback, useEffect, useState } from 'react'
import { emptyQuery } from './tmdb'
import type { Query } from './tmdb'

export interface View {
  id: string
  name: string
  query: Query
}

export const MAX_VIEWS = 5
const KEY = 'views_v1'

const starter: View[] = [
  { id: 'v-top', name: 'I migliori', query: { ...emptyQuery, kinds: ['film', 'series'], minImdb: 8, sort: 'rating' } },
  { id: 'v-serie', name: 'Serie da maratona', query: { ...emptyQuery, kinds: ['series'], minTmdb: 7.5, sort: 'popularity' } },
  { id: 'v-doc', name: 'Documentari', query: { ...emptyQuery, kinds: ['doc'], minTmdb: 7, sort: 'rating' } },
]

function load(): View[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return starter
    const list = JSON.parse(raw) as View[]
    // unisce ai valori di default per query salvate con versioni precedenti
    return list.map((v) => {
      const q = { ...emptyQuery, ...v.query } as Query & { genre?: string }
      // versioni precedenti salvavano un solo genere
      if (q.genre && !q.genres.length) q.genres = [q.genre]
      delete q.genre
      return { ...v, query: q }
    })
  } catch {
    return starter
  }
}

export function useViews() {
  const [views, setViews] = useState<View[]>(load)

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(views))
  }, [views])

  const add = useCallback((name: string, query: Query) => {
    setViews((cur) => (cur.length >= MAX_VIEWS ? cur : [...cur, { id: `v-${Date.now()}`, name, query }]))
  }, [])
  const remove = useCallback((id: string) => setViews((cur) => cur.filter((v) => v.id !== id)), [])
  const rename = useCallback(
    (id: string, name: string) => setViews((cur) => cur.map((v) => (v.id === id ? { ...v, name } : v))),
    [],
  )
  const update = useCallback(
    (id: string, query: Query) => setViews((cur) => cur.map((v) => (v.id === id ? { ...v, query } : v))),
    [],
  )
  const move = useCallback((id: string, dir: -1 | 1) => {
    setViews((cur) => {
      const i = cur.findIndex((v) => v.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= cur.length) return cur
      const next = [...cur]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }, [])
  const replace = useCallback((v: View[]) => setViews(v.slice(0, MAX_VIEWS)), [])

  return { views, add, remove, rename, update, move, replace }
}
