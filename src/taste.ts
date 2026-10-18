import type { GenreEntry, Title } from './tmdb'
import { genreName } from './tmdb'
import type { Lists } from './store'
import type { ReactionEntry } from './personal'

export interface Taste {
  /** affinità per genere, da -1 a 1 (chiave: id genere TMDB) */
  genre: Record<number, number>
  /** quota di film rispetto alle serie tra i titoli che ti piacciono, 0..1 */
  moviePref: number
  gentle: boolean
  slowAverse: boolean
  samples: number
  topGenreIds: number[]
}

const LIST_WEIGHT: Record<keyof Lists, number> = {
  favorites: 3,
  seen: 1.5,
  watchlist: 1,
  started: 0.5,
  dropped: -2,
  hidden: -2,
}

const REACTION_WEIGHT = { more: 2.5, characters: 1, atmosphere: 1, slow: -1.5, ending: -0.5, violent: -1 } as const

// Gli id dei generi di film e serie sono in gran parte gli stessi; queste coppie sono equivalenti
const EQUIV: Record<number, number> = { 10759: 28, 10765: 878, 10768: 10752 }
const norm = (id: number) => EQUIV[id] ?? id

export function computeTaste(lists: Lists, reactions: Record<string, ReactionEntry>): Taste {
  const raw = new Map<number, number>()
  let movies = 0
  let tv = 0
  let samples = 0
  const add = (genreIds: number[], w: number) => {
    for (const g of genreIds) raw.set(norm(g), (raw.get(norm(g)) ?? 0) + w / Math.sqrt(Math.max(1, genreIds.length)))
  }
  for (const name of Object.keys(LIST_WEIGHT) as (keyof Lists)[]) {
    for (const t of lists[name]) {
      const w = LIST_WEIGHT[name]
      add(t.genreIds ?? [], w)
      samples++
      if (w > 0) (t.type === 'movie' ? (movies += w) : (tv += w))
    }
  }
  let slow = 0
  let violent = 0
  for (const r of Object.values(reactions)) {
    for (const x of r.reactions) {
      add(r.genreIds ?? [], REACTION_WEIGHT[x])
      if (x === 'slow') slow++
      if (x === 'violent') violent++
    }
  }
  const max = Math.max(1, ...[...raw.values()].map(Math.abs))
  const genre: Record<number, number> = {}
  for (const [g, v] of raw) genre[g] = Math.max(-1, Math.min(1, v / max))
  const topGenreIds = [...raw.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g]) => g)
  return {
    genre,
    moviePref: movies + tv ? movies / (movies + tv) : 0.5,
    gentle: violent >= 2,
    slowAverse: slow >= 2,
    samples,
    topGenreIds,
  }
}

/** Affinità media di un titolo con i tuoi gusti, da -1 a 1 (0 se non sappiamo nulla). */
export function affinity(t: Pick<Title, 'genreIds'>, taste: Taste): number {
  const ids = t.genreIds ?? []
  if (!ids.length || !taste.samples) return 0
  return ids.reduce((s, g) => s + (taste.genre[norm(g)] ?? 0), 0) / ids.length
}

export function tasteSummary(taste: Taste, genres: GenreEntry[]): string {
  if (!taste.samples) return 'Non ho ancora dati sui tuoi gusti.'
  const names = taste.topGenreIds.map((g) => genreName(genres, g)).filter(Boolean)
  const parts: string[] = []
  if (names.length) parts.push(`Generi che ami: ${names.join(', ')}`)
  if (taste.moviePref > 0.65) parts.push('preferisci i film alle serie')
  else if (taste.moviePref < 0.35) parts.push('preferisci le serie ai film')
  if (taste.slowAverse) parts.push('non ami i ritmi lenti')
  if (taste.gentle) parts.push('preferisci poca violenza')
  return parts.join('; ') + '.'
}
