import * as tmdb from './tmdb'
import type { Detail, GenreEntry, Mood, Title } from './tmdb'
import { MOODS, genreName } from './tmdb'
import { affinity } from './taste'
import type { Taste } from './taste'
import type { Lists } from './store'
import { keyOf } from './store'
import { cachedRatings } from './omdb'

export type Time = 'short' | 'film' | 'long' | 'ep30' | 'ep60'
export type Company = 'solo' | 'couple' | 'friends' | 'family'

export const TIMES: { id: Time; label: string; hint: string }[] = [
  { id: 'short', label: 'Meno di 90 minuti', hint: 'Un film breve' },
  { id: 'film', label: 'Un film, fino a 2 ore', hint: 'La serata classica' },
  { id: 'long', label: 'Una serata lunga', hint: 'Film oltre le 2 ore' },
  { id: 'ep30', label: 'Serie con episodi brevi', hint: 'Circa 20-35 minuti' },
  { id: 'ep60', label: 'Serie con episodi lunghi', hint: 'Circa 45-60 minuti' },
]

export const COMPANIES: { id: Company; label: string }[] = [
  { id: 'solo', label: 'Da solo' },
  { id: 'couple', label: 'In coppia' },
  { id: 'friends', label: 'Con amici' },
  { id: 'family', label: 'In famiglia' },
]

export interface PickInput {
  mood: Mood
  time: Time
  company: Company
  gentle: boolean
  /** piattaforme a cui restringere (vuoto = tutte) */
  mine: number[]
}

export interface Pick {
  title: Title
  detail: Detail
  score: number
  reasons: string[]
}

export interface PickContext {
  lists: Lists
  taste: Taste
  genres: GenreEntry[]
  isSnoozed: (t: Title) => boolean
  tagsOf: (t: Title) => string[]
  /** chiavi (tipo:id) dei titoli della classifica "Il meglio" */
  merit: Set<string>
}

export const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}` : `${m} min`)

const timeType = (t: Time): tmdb.MediaType => (t === 'ep30' || t === 'ep60' ? 'tv' : 'movie')

function baseParams(input: PickInput, type: tmdb.MediaType): Record<string, string | number | undefined> {
  const p: Record<string, string | number | undefined> = {
    'vote_count.gte': 300,
    'vote_average.gte': 6.6,
  }
  if (input.time === 'short') p['with_runtime.lte'] = 95
  if (input.time === 'film') p['with_runtime.lte'] = 125
  if (input.time === 'long') p['with_runtime.gte'] = 120
  if (input.time === 'ep30') p['with_runtime.lte'] = 35
  if (input.time === 'ep60') p['with_runtime.gte'] = 40
  if (input.mine.length) {
    p.with_watch_providers = input.mine.join('|')
    p.with_watch_monetization_types = 'flatrate'
  } else {
    // solo titoli che si possono guardare in Italia (abbonamento, noleggio o acquisto)
    p.with_watch_monetization_types = 'flatrate|free|ads|rent|buy'
  }
  const moodIds = MOODS.find((m) => m.id === input.mood)?.[type] ?? []
  let without: number[] = []
  if (input.company === 'family') {
    p.with_genres = type === 'movie' ? '10751|16' : '10751|16|10762'
    without = type === 'movie' ? [27, 53, 80, 10752] : [80, 10768]
  } else {
    p.with_genres = moodIds.join('|')
  }
  if (input.gentle) {
    without = [...new Set([...without, ...(type === 'movie' ? [27, 10752] : [10768])])]
    if (type === 'movie') {
      p.certification_country = 'US'
      p['certification.lte'] = 'PG-13'
    }
  }
  if (without.length) p.without_genres = without.join(',')
  return p
}

function moodMatch(t: Title, mood: Mood): number {
  const type = t.type
  const ids = MOODS.find((m) => m.id === mood)?.[type] ?? []
  const hits = (t.genreIds ?? []).filter((g) => ids.includes(g)).length
  return Math.min(1, hits / Math.min(2, Math.max(1, (t.genreIds ?? []).length)))
}

function companyBoost(t: Title, company: Company, gentle: boolean): number {
  const g = t.genreIds ?? []
  const has = (...ids: number[]) => ids.filter((x) => g.includes(x)).length
  if (company === 'couple') return Math.min(0.1, 0.05 * has(10749, 18, 35))
  if (company === 'friends') return Math.min(0.1, 0.05 * has(35, 28, 12, ...(gentle ? [] : [27])))
  if (company === 'family') return 0.1 * Math.min(1, has(10751, 16))
  return 0
}

export async function candidates(input: PickInput, ctx: PickContext): Promise<{ title: Title; score: number }[]> {
  const type = timeType(input.time)
  const base = baseParams(input, type)
  const results = await Promise.all([
    tmdb.discoverRaw(type, { ...base, sort_by: 'popularity.desc', page: 1 }),
    tmdb.discoverRaw(type, { ...base, sort_by: 'popularity.desc', page: 2 }),
    tmdb.discoverRaw(type, { ...base, sort_by: 'vote_average.desc', 'vote_count.gte': 1000, page: 1 }),
  ])
  const excluded = new Set([...ctx.lists.seen, ...ctx.lists.hidden, ...ctx.lists.dropped].map(keyOf))
  const watch = new Set(ctx.lists.watchlist.map(keyOf))
  const seen = new Set<string>()
  const out: { title: Title; score: number }[] = []
  for (const t of results.flat()) {
    const k = keyOf(t)
    if (seen.has(k)) continue
    seen.add(k)
    if (excluded.has(k) || ctx.isSnoozed(t)) continue
    const mood = moodMatch(t, input.mood)
    if (mood === 0 && input.company !== 'family') continue
    const quality = Math.max(0, Math.min(1, (t.rating - 6) / 3.5))
    const tags = ctx.tagsOf(t)
    let score =
      0.35 * quality +
      0.3 * ((affinity(t, ctx.taste) + 1) / 2) +
      0.2 * mood +
      (ctx.merit.has(k) ? 0.1 : 0) +
      companyBoost(t, input.company, input.gentle) +
      (watch.has(k) ? 0.15 : 0)
    if (tags.includes('light') && (input.mood === 'light' || input.mood === 'cozy' || input.mood === 'fun')) score += 0.08
    if (tags.includes('together') && (input.company === 'couple' || input.company === 'friends' || input.company === 'family')) score += 0.08
    if (tags.includes('time') && (input.time === 'long' || input.time === 'ep60')) score += 0.08
    out.push({ title: t, score })
  }
  return out.sort((a, b) => b.score - a.score)
}

function fitsTime(d: Detail, time: Time): boolean {
  if (d.type === 'movie' && d.runtimeMin) {
    if (time === 'short') return d.runtimeMin <= 95
    if (time === 'film') return d.runtimeMin <= 125
    if (time === 'long') return d.runtimeMin >= 120
  }
  if (d.type === 'tv' && d.episodeRuntime) {
    if (time === 'ep30') return d.episodeRuntime <= 38
    if (time === 'ep60') return d.episodeRuntime >= 38
  }
  return true
}

export function explain(d: Detail, input: PickInput, ctx: PickContext): string[] {
  const out: string[] = []
  const ratings = cachedRatings(d)
  const mood = MOODS.find((m) => m.id === input.mood)
  const t = TIMES.find((x) => x.id === input.time)

  // durata e impegno
  if (d.type === 'movie' && d.runtimeMin) {
    out.push(`Dura ${fmtMin(d.runtimeMin)}${t && input.time !== 'long' ? `, come volevi (${t.label.toLowerCase()})` : ''}.`)
  } else if (d.type === 'tv') {
    const bits: string[] = []
    if (d.seasons) bits.push(`${d.seasons} ${d.seasons === 1 ? 'stagione' : 'stagioni'}`)
    if (d.episodeRuntime) bits.push(`episodi da circa ${d.episodeRuntime} min`)
    if (bits.length) out.push(`${bits.join(', ')}.`)
    if (d.status === 'Ended' || d.status === 'Canceled') out.push('È conclusa: puoi vederla tutta senza attese.')
    else if (d.status === 'Returning Series') out.push('È ancora in corso: potrebbero mancare episodi nuovi.')
  }

  // umore
  const moodIds = mood?.[d.type] ?? []
  const matching = (d.genreIds ?? []).filter((g) => moodIds.includes(g)).map((g) => genreName(ctx.genres, g)).filter(Boolean)
  if (mood && matching.length) out.push(`Ha l'atmosfera che cerchi (${mood.label.toLowerCase()}): ${[...new Set(matching)].join(', ').toLowerCase()}.`)

  // gusto personale
  const favs = ctx.lists.favorites
  const sim = favs
    .map((f) => ({ f, n: (f.genreIds ?? []).filter((g) => (d.genreIds ?? []).includes(g)).length }))
    .filter((x) => x.n >= 2 && keyOf(x.f) !== keyOf(d))
    .sort((a, b) => b.n - a.n)[0]
  if (sim) out.push(`È nello stile di «${sim.f.title}», uno dei tuoi preferiti.`)
  else if (affinity(d, ctx.taste) > 0.3) {
    const top = (d.genreIds ?? []).map((g) => genreName(ctx.genres, g)).filter(Boolean)[0]
    if (top) out.push(`Ti piace il genere ${top.toLowerCase()}.`)
  }

  // disponibilità
  if (d.providers.length) {
    const mine = d.providers.filter((p) => input.mine.includes(p.id))
    if (mine.length) out.push(`Lo trovi su ${mine.map((p) => p.name).join(' e ')}, uno dei tuoi abbonamenti.`)
    else out.push(`Disponibile in abbonamento su ${d.providers.slice(0, 3).map((p) => p.name).join(', ')}.`)
  } else if (d.rent.length || d.buy.length) out.push('Non è incluso in un abbonamento: si può noleggiare o comprare.')
  else out.push('Non risulta in streaming in Italia in questo momento.')

  // voti e classificazione
  const votes: string[] = []
  if (ratings?.imdb !== undefined) votes.push(`IMDb ${String(ratings.imdb).replace('.', ',')}`)
  if (ratings?.rt !== undefined) votes.push(`Rotten Tomatoes ${ratings.rt}%`)
  if (!votes.length && d.rating > 0) votes.push(`TMDB ${String(d.rating).replace('.', ',')}`)
  if (votes.length) out.push(`Voti: ${votes.join(', ')}.`)
  if (input.company === 'family') out.push('Scelto senza horror, thriller o guerra, adatto a una serata in famiglia.')
  else if (input.gentle) out.push('Scelto tra titoli con poca violenza (è una stima basata su genere e classificazione).')
  if (d.certification) out.push(`Classificazione: ${d.certification}.`)
  return out
}

export interface PickResult {
  picks: Pick[]
  reserve: Pick[]
}

/** Costruisce 3 proposte (più alcune di riserva) con i motivi concreti. */
export async function choose(input: PickInput, ctx: PickContext): Promise<PickResult> {
  const cands = (await candidates(input, ctx)).slice(0, 12)
  const details = await Promise.all(
    cands.map(async (c) => {
      try {
        return { c, d: await tmdb.detail(c.title.type, c.title.id) }
      } catch {
        return null
      }
    }),
  )
  const ok = details.filter((x): x is { c: { title: Title; score: number }; d: Detail } => !!x && fitsTime(x.d, input.time))
  const built: Pick[] = ok.map(({ c, d }) => ({ title: c.title, detail: d, score: c.score, reasons: explain(d, input, ctx) }))

  // varietà: si evita di proporre tre titoli con lo stesso genere principale
  const picks: Pick[] = []
  const rest: Pick[] = []
  const usedFirstGenre = new Set<number>()
  for (const b of built) {
    const first = b.title.genreIds?.[0]
    if (picks.length < 3 && (first === undefined || !usedFirstGenre.has(first) || usedFirstGenre.size >= 2)) {
      picks.push(b)
      if (first !== undefined) usedFirstGenre.add(first)
    } else rest.push(b)
  }
  while (picks.length < 3 && rest.length) picks.push(rest.shift()!)
  return { picks, reserve: rest }
}

export function effortLabel(d: Detail): string {
  if (d.type === 'movie' && d.runtimeMin) {
    if (d.runtimeMin < 95) return 'Leggero: dura poco'
    if (d.runtimeMin < 135) return 'Medio: una serata normale'
    return 'Impegnativo: è lungo'
  }
  if (d.type === 'tv' && d.episodes && d.episodeRuntime) {
    const hours = Math.round((d.episodes * d.episodeRuntime) / 60)
    return `${hours} ore in tutto, ${d.episodes} episodi`
  }
  return ''
}
