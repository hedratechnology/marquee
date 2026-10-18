import { useSyncExternalStore } from 'react'
import { externalImdb } from './tmdb'
import type { Title } from './tmdb'

export interface Ratings {
  imdb?: number
  rt?: number
  meta?: number
}

const CACHE_KEY = 'ratings_v1'
const MAX_PARALLEL = 3

export const getOmdbKey = () => localStorage.getItem('omdb_key') ?? ''
export const setOmdbKey = (k: string) => {
  localStorage.setItem('omdb_key', k.trim())
  limited = false
  failed.clear()
  bump()
}

const keyOf = (t: Pick<Title, 'type' | 'id'>) => `${t.type}:${t.id}`

function loadCache(): Map<string, Ratings> {
  try {
    return new Map(Object.entries(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')))
  } catch {
    return new Map()
  }
}

const cache = loadCache()
const inflight = new Set<string>()
const failed = new Set<string>()
const queue: Title[] = []
let limited = false
let version = 0
let active = 0
let saveTimer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

function bump() {
  version++
  listeners.forEach((l) => l())
}

function persist() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(cache)))
    } catch {
      // storage pieno: la cache resta solo in memoria
    }
  }, 500)
}

async function fetchOne(t: Title): Promise<Ratings | 'limit'> {
  const imdbId = await externalImdb(t.type, t.id)
  if (!imdbId) return {}
  const url = `https://www.omdbapi.com/?apikey=${encodeURIComponent(getOmdbKey())}&i=${imdbId}`
  const res = await fetch(url)
  const d = await res.json()
  if (d.Response === 'False') {
    if (/limit/i.test(d.Error ?? '')) return 'limit'
    return {}
  }
  const num = (v: string | undefined) => (v && v !== 'N/A' ? parseFloat(v) : undefined)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rt = d.Ratings?.find((r: any) => r.Source === 'Rotten Tomatoes')?.Value
  return { imdb: num(d.imdbRating), rt: num(rt), meta: num(d.Metascore) }
}

function pump() {
  while (!limited && active < MAX_PARALLEL && queue.length) {
    const t = queue.shift()!
    const k = keyOf(t)
    active++
    fetchOne(t)
      .then((r) => {
        if (r === 'limit') limited = true
        else cache.set(k, r)
      })
      .catch(() => failed.add(k))
      .finally(() => {
        inflight.delete(k)
        active--
        persist()
        bump()
        pump()
      })
  }
}

/** Mette in coda i punteggi mancanti per questi titoli (solo se la chiave OMDb è impostata). */
export function requestRatings(items: Title[]) {
  if (!getOmdbKey() || limited) return
  for (const t of items) {
    const k = keyOf(t)
    if (cache.has(k) || inflight.has(k) || failed.has(k)) continue
    inflight.add(k)
    queue.push(t)
  }
  pump()
}

export function useRatings() {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => version,
  )
  return {
    get: (t: Pick<Title, 'type' | 'id'>) => cache.get(keyOf(t)),
    limited,
    pending: inflight.size,
    enabled: !!getOmdbKey(),
  }
}
