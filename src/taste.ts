import type { GenreEntry, Title } from './tmdb'
import { genreName } from './tmdb'
import type { Lists } from './store'
import type { Reaction, ReactionEntry } from './personal'

export interface Taste {
  /** affinità per genere, da -1 a 1 (chiave: id genere TMDB) */
  genre: Record<number, number>
  /** quota di film rispetto alle serie tra i titoli che ti piacciono, 0..1 */
  moviePref: number
  gentle: boolean
  slowAverse: boolean
  samples: number
  topGenreIds: number[]
  /** quante volte hai lasciato ciascuna reazione */
  signals: Record<Reaction, number>
  /** quanti titoli hanno almeno una reazione */
  reacted: number
}

const LIST_WEIGHT: Record<keyof Lists, number> = {
  favorites: 3,
  seen: 1.5,
  watchlist: 1,
  started: 0.5,
  dropped: -2,
  hidden: -2,
}

const REACTION_WEIGHT: Record<Reaction, number> = { more: 2.5, characters: 1, atmosphere: 1, slow: -1.5, ending: -0.5, violent: -1 }

export const EMPTY_SIGNALS: Record<Reaction, number> = { more: 0, characters: 0, atmosphere: 0, slow: 0, ending: 0, violent: 0 }

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
  const signals = { ...EMPTY_SIGNALS }
  let reacted = 0
  for (const r of Object.values(reactions)) {
    if (r.reactions.length) reacted++
    for (const x of r.reactions) {
      add(r.genreIds ?? [], REACTION_WEIGHT[x])
      signals[x]++
    }
    // "ne voglio altri così" conta anche per il tipo (film o serie)
    if (r.reactions.includes('more')) (r.type === 'movie' ? (movies += 1.5) : (tv += 1.5))
  }
  const max = Math.max(1, ...[...raw.values()].map(Math.abs))
  const genre: Record<number, number> = {}
  for (const [g, v] of raw) genre[g] = Math.max(-1, Math.min(1, v / max))
  const topGenreIds = [...raw.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g]) => g)
  return {
    genre,
    moviePref: movies + tv ? movies / (movies + tv) : 0.5,
    gentle: signals.violent >= 2,
    slowAverse: signals.slow >= 2,
    samples,
    topGenreIds,
    signals,
    reacted,
  }
}

/** Affinità media di un titolo con i tuoi gusti, da -1 a 1 (0 se non sappiamo nulla). */
export function affinity(t: Pick<Title, 'genreIds'>, taste: Taste): number {
  const ids = t.genreIds ?? []
  if (!ids.length || !taste.samples) return 0
  return ids.reduce((s, g) => s + (taste.genre[norm(g)] ?? 0), 0) / ids.length
}

/** I generi che spiegano perché un titolo ti si addice (solo quelli con affinità positiva). */
export function matchingGenres(t: Pick<Title, 'genreIds'>, taste: Taste, genres: GenreEntry[]): string[] {
  return (t.genreIds ?? [])
    .map((g) => ({ g, v: taste.genre[norm(g)] ?? 0 }))
    .filter((x) => x.v > 0.2)
    .sort((a, b) => b.v - a.v)
    .map((x) => genreName(genres, x.g))
    .filter((n): n is string => !!n)
    .slice(0, 2)
}

export interface GenreBar {
  id: number
  name: string
  value: number
}

/** I generi che ami e quelli che eviti, ordinati per forza del segnale. */
export function genreBars(taste: Taste, genres: GenreEntry[]): { likes: GenreBar[]; dislikes: GenreBar[] } {
  const all = Object.entries(taste.genre)
    .map(([id, value]) => ({ id: +id, name: genreName(genres, +id) ?? '', value }))
    .filter((g) => g.name)
  return {
    likes: all.filter((g) => g.value > 0.1).sort((a, b) => b.value - a.value).slice(0, 5),
    dislikes: all.filter((g) => g.value < -0.1).sort((a, b) => a.value - b.value).slice(0, 4),
  }
}

/** Frasi che dicono cosa ho capito di te, in parole semplici. */
export function tasteInsights(taste: Taste, genres: GenreEntry[]): string[] {
  const out: string[] = []
  const names = taste.topGenreIds.map((g) => genreName(genres, g)).filter((n): n is string => !!n)
  if (names.length) out.push(`Ami i generi ${names.slice(0, 3).join(', ').toLowerCase()}`)
  if (taste.samples) {
    if (taste.moviePref > 0.65) out.push('Preferisci i film alle serie')
    else if (taste.moviePref < 0.35) out.push('Preferisci le serie ai film')
    else out.push('Film e serie ti vanno bene allo stesso modo')
  }
  const s = taste.signals
  if (s.slow >= 2) out.push('Perdi interesse con i ritmi lenti: ti propongo titoli più veloci')
  else if (s.slow === 1) out.push('Hai trovato lento un titolo: tengo d\'occhio il ritmo')
  if (s.violent >= 2) out.push('Preferisci poca violenza')
  else if (s.violent === 1) out.push('Hai trovato troppo violento un titolo')
  if (s.characters >= 2) out.push('Ti conquistano i personaggi ben scritti')
  if (s.atmosphere >= 2) out.push("Ti conquista l'atmosfera")
  if (s.ending >= 2) out.push('Un finale deludente pesa molto sul tuo giudizio')
  if (s.more >= 1) out.push(`Mi hai chiesto altri titoli simili a ${s.more} che ti sono piaciuti`)
  return out
}

/** Quanto è affidabile il profilo, in base a quanti segnali ha. */
export function confidence(taste: Taste): { pct: number; label: string; next: string } {
  const points = taste.samples + taste.reacted * 2
  const pct = Math.max(0, Math.min(100, Math.round((points / 30) * 100)))
  if (points === 0) return { pct, label: 'Ancora niente', next: 'Salva qualche preferito o segna un titolo come visto.' }
  if (pct < 35) return { pct, label: 'Appena iniziato', next: 'Lascia una reazione ai titoli che hai visto: bastano un paio di tocchi.' }
  if (pct < 70) return { pct, label: 'Sta prendendo forma', next: 'Ancora qualche reazione e le proposte diventano molto più mirate.' }
  return { pct, label: 'Affidabile', next: 'Continua così: ogni nuova reazione lo affina ancora.' }
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
  if (taste.signals.characters >= 2) parts.push('dai peso ai personaggi')
  if (taste.signals.ending >= 2) parts.push('un finale deludente pesa molto')
  return parts.join('; ') + '.'
}
