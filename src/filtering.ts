import { useEffect, useState } from 'react'
import * as tmdb from './tmdb'
import type { GenreEntry, MediaType, Query } from './tmdb'
import { MOODS, kindTypes } from './tmdb'
import { loadAwardIndex } from './awards'
import { useRatings } from './omdb'
import type { Ratings } from './omdb'
import { useLists } from './ui/ctx'

/** Qualsiasi titolo che si possa filtrare lato client (liste, classifica, scorciatoie della home). */
export interface Matchable {
  type: MediaType
  id: number
  year: string
  genreIds: number[]
  rating: number
  lang?: string
  /** voti già noti (la classifica li ha già); altrimenti si usano quelli di OMDb */
  imdb?: number | null
  rt?: number | null
  meta?: number | null
}

export interface FilterEnv {
  seen: Set<string>
  ratings: (m: Matchable) => Ratings | undefined
  awards: Map<string, string[]> | null
  genres: GenreEntry[]
}

const key = (m: Pick<Matchable, 'type' | 'id'>) => `${m.type}:${m.id}`

/** Un elenco di titoli passa i filtri? Vale per i filtri che si possono valutare dai dati che abbiamo. */
export function matchesQuery(m: Matchable, q: Query, env: FilterEnv): boolean {
  const types = new Set(kindTypes(q.kinds))
  if (!types.has(m.type)) return false
  if (q.kinds.every((k) => k === 'doc' || k === 'animation')) {
    const wanted: number[] = q.kinds.map((k) => (k === 'doc' ? 99 : 16))
    if (!m.genreIds.some((g) => wanted.includes(g))) return false
  }
  const entries = q.genres.map((n) => env.genres.find((g) => g.name === n)).filter((x): x is GenreEntry => !!x)
  if (entries.length) {
    const has = entries.map((e) => m.genreIds.includes(e[m.type] ?? -1))
    if (q.genreMode === 'any' ? !has.some(Boolean) : !has.every(Boolean)) return false
  }
  if (q.moods.length && !q.moods.some((mo) => (MOODS.find((x) => x.id === mo)?.[m.type] ?? []).some((g) => m.genreIds.includes(g)))) return false
  if (q.yearFrom && m.year && m.year < q.yearFrom) return false
  if (q.yearTo && m.year && m.year > q.yearTo) return false
  if (q.minTmdb && m.rating > 0 && m.rating < q.minTmdb) return false
  if (q.lang && m.lang && m.lang !== q.lang) return false
  if (q.hideSeen && env.seen.has(key(m))) return false
  if (q.awards.length) {
    if (!env.awards) return false
    const won = env.awards.get(key(m)) ?? []
    if (!q.awards.some((a) => won.includes(a))) return false
  }
  if (q.minImdb || q.minRt || q.minMeta) {
    const r = env.ratings(m)
    const imdb = m.imdb ?? r?.imdb
    const rt = m.rt ?? r?.rt
    const meta = m.meta ?? r?.meta
    const known = m.imdb !== undefined || m.rt !== undefined || m.meta !== undefined || !!r
    if (!known) return false
    const reqs: [number, number | null | undefined][] = [[q.minImdb, imdb], [q.minRt, rt], [q.minMeta, meta]]
    const active = reqs.filter(([min]) => min > 0)
    const have = active.filter(([, v]) => v !== undefined && v !== null)
    if (q.strictRatings && have.length < active.length) return false
    if (!have.length) return false
    if (!have.every(([min, v]) => (v as number) >= min)) return false
  }
  return true
}

/** Etichette dei filtri attivi che fuori da Esplora non si possono applicare (servono dati che le liste non hanno). */
export function exploreOnly(q: Query, base: Query): string[] {
  const out: string[] = []
  if (JSON.stringify([...q.providers].sort()) !== JSON.stringify([...base.providers].sort())) out.push('piattaforme')
  if (q.monetization !== 'any') out.push('disponibilità')
  if (q.onlyItaly !== base.onlyItaly) out.push('disponibili in Italia')
  if (q.maxRuntime || q.maxEpisode) out.push('durata')
  if (q.status) out.push('stato delle serie')
  if (q.gentle) out.push('poco violento')
  if (q.country) out.push('paese')
  if (q.actor || q.director) out.push('persone')
  return out
}

/** Dati di contorno per filtrare liste lato client. */
export function useFilterEnv(q: Query): FilterEnv {
  const { lists } = useLists()
  const R = useRatings()
  const [genres, setGenres] = useState<GenreEntry[]>([])
  const [awards, setAwards] = useState<Map<string, string[]> | null>(null)
  const needAwards = q.awards.length > 0

  useEffect(() => {
    if (!tmdb.getKey()) return
    tmdb.genreList().then(setGenres).catch(() => setGenres([]))
  }, [])
  useEffect(() => {
    if (needAwards) loadAwardIndex().then(setAwards)
  }, [needAwards])

  const seen = new Set(lists.seen.map((t) => `${t.type}:${t.id}`))
  return { seen, ratings: (m) => R.get(m), awards, genres }
}
