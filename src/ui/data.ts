import { useEffect, useState } from 'react'
import * as tmdb from '../tmdb'
import type { GenreEntry, MediaType, Title } from '../tmdb'

export interface BestItem {
  type: MediaType
  id: number
  title: string
  year: string
  date: string
  poster: string | null
  backdrop?: string | null
  overview: string
  genreIds: number[]
  lang: string
  score: number
  imdb: number | null
  votes: number | null
  rt: number | null
  meta: number | null
  awards: { name: string; year: string | null }[]
}

export interface BestFile {
  generatedAt: string
  items: BestItem[]
}

let bestPromise: Promise<BestFile | null> | null = null

export function loadBest(): Promise<BestFile | null> {
  bestPromise ??= fetch(`${import.meta.env.BASE_URL}best.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d && Array.isArray(d.items) ? (d as BestFile) : null))
    .catch(() => null)
  return bestPromise
}

/** undefined = in caricamento, null = non disponibile */
export function useBest(): BestFile | null | undefined {
  const [data, setData] = useState<BestFile | null | undefined>(undefined)
  useEffect(() => {
    loadBest().then(setData)
  }, [])
  return data
}

export function useGenres(): GenreEntry[] {
  const [genres, setGenres] = useState<GenreEntry[]>([])
  useEffect(() => {
    if (!tmdb.getKey()) return
    tmdb.genreList().then(setGenres).catch(() => setGenres([]))
  }, [])
  return genres
}

export const bestToTitle = (i: BestItem): Title => ({
  id: i.id, type: i.type, title: i.title, year: i.year, date: i.date, poster: i.poster, backdrop: i.backdrop,
  rating: i.imdb ?? 0, popularity: 0, genreIds: i.genreIds, overview: i.overview,
})
