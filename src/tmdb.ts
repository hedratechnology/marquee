import { awardLabel, loadAwards } from './awards'
const API = 'https://api.themoviedb.org/3'
export const IMG = 'https://image.tmdb.org/t/p'
export const REGION = 'IT'

export type MediaType = 'movie' | 'tv'
export type Kind = 'film' | 'series' | 'miniseries' | 'doc' | 'animation'
export type Sort = 'popularity' | 'rating' | 'recent' | 'taste'
export type Mood = 'light' | 'cozy' | 'intense' | 'mystery' | 'fun' | 'adventure'
export type Monetization = 'any' | 'flatrate' | 'rent' | 'buy'

export const KINDS: { id: Kind; label: string }[] = [
  { id: 'film', label: 'Film' },
  { id: 'series', label: 'Serie' },
  { id: 'miniseries', label: 'Miniserie' },
  { id: 'doc', label: 'Documentari' },
  { id: 'animation', label: 'Animazione' },
]

/** Umori: insiemi di generi TMDB (id diversi per film e serie). Sono stime, non fatti. */
export const MOODS: { id: Mood; label: string; hint: string; movie: number[]; tv: number[] }[] = [
  { id: 'light', label: 'Leggero', hint: 'Per staccare la testa', movie: [35, 12, 16], tv: [35, 10759, 16] },
  { id: 'cozy', label: 'Rassicurante', hint: 'Caldo, senza ansia', movie: [10751, 10749, 35, 16], tv: [10751, 35, 16, 18] },
  { id: 'intense', label: 'Intenso', hint: 'Tosto e coinvolgente', movie: [18, 53, 80, 10752], tv: [18, 80, 10768] },
  { id: 'mystery', label: 'Misterioso', hint: 'Enigmi e tensione', movie: [9648, 53, 80], tv: [9648, 80, 18] },
  { id: 'fun', label: 'Divertente', hint: 'Per ridere', movie: [35], tv: [35] },
  { id: 'adventure', label: 'Avventuroso', hint: 'Azione e mondi nuovi', movie: [28, 12, 878, 14], tv: [10759, 10765] },
]

export interface Title {
  id: number
  type: MediaType
  title: string
  year: string
  date: string
  poster: string | null
  backdrop?: string | null
  rating: number
  popularity: number
  genreIds: number[]
  overview: string
  /** annotazione mostrata sotto il titolo (es. i premi vinti) */
  note?: string
}

export interface Provider {
  id: number
  name: string
  logo: string
}

export interface Detail extends Title {
  genres: string[]
  runtime: string
  runtimeMin: number | null
  seasons: number | null
  episodes: number | null
  episodeRuntime: number | null
  status: string | null
  certification: string | null
  cast: { id: number; name: string; character: string }[]
  providers: Provider[]
  rent: Provider[]
  buy: Provider[]
  trailer: string | null
  link: string | null
}

export interface Query {
  kinds: Kind[]
  moods: Mood[]
  genres: string[]
  /** 'all' = tutti i generi insieme, 'any' = almeno uno */
  genreMode: 'all' | 'any'
  yearFrom?: string
  yearTo?: string
  providers: number[]
  monetization: Monetization
  /** solo titoli che si possono guardare in Italia (abbonamento, noleggio o acquisto) */
  onlyItaly: boolean
  onlyMine: boolean
  /** chiavi dei premi vinti (vedi awards.ts): solo titoli premiati */
  awards: string[]
  actor?: { id: number; name: string }
  director?: { id: number; name: string }
  country?: string
  minTmdb: number
  minImdb: number
  minRt: number
  minMeta: number
  /** true = senza tutti i voti richiesti il titolo è escluso; false = contano solo i voti disponibili */
  strictRatings: boolean
  maxRuntime?: number
  maxEpisode?: number
  status?: 'ended' | 'ongoing'
  gentle: boolean
  lang?: string
  hideSeen: boolean
  sort: Sort
}

export const emptyQuery: Query = {
  kinds: ['film', 'series'],
  moods: [],
  genres: [],
  genreMode: 'all',
  providers: [],
  monetization: 'any',
  onlyItaly: true,
  onlyMine: false,
  awards: [],
  minTmdb: 0,
  minImdb: 0,
  minRt: 0,
  minMeta: 0,
  strictRatings: false,
  gentle: false,
  hideSeen: false,
  sort: 'popularity',
}

export const PROVIDERS = [
  { id: 8, name: 'Netflix' },
  { id: 119, name: 'Prime Video' },
  { id: 337, name: 'Disney+' },
  { id: 531, name: 'Paramount+' },
  { id: 350, name: 'Apple TV+' },
  { id: 39, name: 'NOW' },
  { id: 29, name: 'Sky Go' },
  { id: 222, name: 'RaiPlay' },
  { id: 359, name: 'Mediaset Infinity' },
  { id: 11, name: 'MUBI' },
  { id: 283, name: 'Crunchyroll' },
]

export const LANGS = [
  { id: 'en', label: 'Inglese' },
  { id: 'it', label: 'Italiano' },
  { id: 'fr', label: 'Francese' },
  { id: 'es', label: 'Spagnolo' },
  { id: 'ko', label: 'Coreano' },
  { id: 'ja', label: 'Giapponese' },
]

export const COUNTRIES = [
  { id: 'IT', label: 'Italia' },
  { id: 'US', label: 'Stati Uniti' },
  { id: 'GB', label: 'Regno Unito' },
  { id: 'FR', label: 'Francia' },
  { id: 'ES', label: 'Spagna' },
  { id: 'DE', label: 'Germania' },
  { id: 'KR', label: 'Corea del Sud' },
  { id: 'JP', label: 'Giappone' },
]

export const getKey = () => localStorage.getItem('tmdb_key') ?? ''
export const setKey = (k: string) => localStorage.setItem('tmdb_key', k.trim())

type Params = Record<string, string | number | undefined>

async function call<T>(path: string, params: Params = {}): Promise<T> {
  const key = getKey()
  if (!key) throw new Error('NO_KEY')
  const url = new URL(API + path)
  const headers: Record<string, string> = {}
  // Supporta sia la chiave v3 (corta) sia il token "Read Access" v4 (JWT)
  if (key.length > 60) headers.Authorization = `Bearer ${key}`
  else url.searchParams.set('api_key', key)
  url.searchParams.set('language', 'it-IT')
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  const res = await fetch(url, { headers })
  if (res.status === 401) throw new Error('BAD_KEY')
  if (!res.ok) throw new Error(`TMDB ${res.status}`)
  return res.json()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTitle(r: any, fallback?: MediaType): Title | null {
  const type: MediaType | undefined = r.media_type ?? fallback
  if (type !== 'movie' && type !== 'tv') return null
  const date: string = r.release_date ?? r.first_air_date ?? ''
  return {
    id: r.id,
    type,
    title: r.title ?? r.name ?? '',
    year: date.slice(0, 4),
    date,
    poster: r.poster_path,
    backdrop: r.backdrop_path ?? null,
    rating: Math.round((r.vote_average ?? 0) * 10) / 10,
    popularity: r.popularity ?? 0,
    genreIds: r.genre_ids ?? [],
    overview: r.overview ?? '',
  }
}

const clean = (l: (Title | null)[]) => l.filter((t): t is Title => !!t)

export async function search(q: string): Promise<Title[]> {
  const r = await call<{ results: unknown[] }>('/search/multi', { query: q })
  return clean(r.results.map((x) => mapTitle(x)))
}

export async function searchPerson(q: string): Promise<{ id: number; name: string }[]> {
  const r = await call<{ results: { id: number; name: string }[] }>('/search/person', { query: q })
  return r.results.slice(0, 6).map((p) => ({ id: p.id, name: p.name }))
}

export interface GenreEntry {
  name: string
  movie?: number
  tv?: number
}

let genreCache: Promise<GenreEntry[]> | null = null

export function genreList(): Promise<GenreEntry[]> {
  genreCache ??= Promise.all([
    call<{ genres: { id: number; name: string }[] }>('/genre/movie/list'),
    call<{ genres: { id: number; name: string }[] }>('/genre/tv/list'),
  ])
    .then(([m, t]) => {
      const map = new Map<string, GenreEntry>()
      for (const g of m.genres) map.set(g.name, { name: g.name, movie: g.id })
      for (const g of t.genres) map.set(g.name, { ...map.get(g.name), name: g.name, tv: g.id })
      return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'it'))
    })
    .catch((e) => {
      genreCache = null
      throw e
    })
  return genreCache
}

/** Nome leggibile di un id genere (film o serie). */
export function genreName(genres: GenreEntry[], id: number): string | undefined {
  return genres.find((g) => g.movie === id || g.tv === id)?.name
}

export function kindTypes(kinds: Kind[]): MediaType[] {
  const s = new Set<MediaType>()
  for (const k of kinds) {
    if (k === 'film') s.add('movie')
    else if (k === 'series' || k === 'miniseries') s.add('tv')
    else {
      s.add('movie')
      s.add('tv')
    }
  }
  return [...s]
}

interface Spec {
  type: MediaType
  tvType?: string
  extraGenre?: number
  /** serie concluse da tenere solo se hanno una stagione e pochi episodi (miniserie non etichettate da TMDB) */
  limited?: boolean
}

const SPECS: Record<Kind, Spec[]> = {
  film: [{ type: 'movie' }],
  series: [{ type: 'tv', tvType: '4' }],
  miniseries: [{ type: 'tv', tvType: '2' }, { type: 'tv', tvType: '4', limited: true }],
  doc: [{ type: 'movie', extraGenre: 99 }, { type: 'tv', extraGenre: 99 }],
  animation: [{ type: 'movie', extraGenre: 16 }, { type: 'tv', extraGenre: 16 }],
}

const SORT_PARAM = (type: MediaType, s: Sort) =>
  s === 'popularity' || s === 'taste'
    ? 'popularity.desc'
    : s === 'rating'
      ? 'vote_average.desc'
      : type === 'movie'
        ? 'primary_release_date.desc'
        : 'first_air_date.desc'

async function discoverSpec(spec: Spec, q: Query, page: number, genres: GenreEntry[]): Promise<{ items: Title[]; raw: number }> {
  // le miniserie "nascoste" tra le serie concluse non hanno senso se si cercano serie in corso
  if (spec.limited && q.status === 'ongoing') return { items: [], raw: 0 }
  const gIds = q.genres.map((n) => genres.find((g) => g.name === n)?.[spec.type]).filter((x): x is number => !!x)
  // se i generi scelti non esistono per questo tipo (es. un genere solo da film) non c'è nulla da cercare
  if (q.genres.length && !gIds.length) return { items: [], raw: 0 }
  const moodIds = [...new Set(q.moods.flatMap((m) => MOODS.find((x) => x.id === m)?.[spec.type] ?? []))]
  // virgola = tutti i generi insieme, barra = almeno uno: non si possono mescolare
  let withGenres = ''
  if (spec.extraGenre) withGenres = [spec.extraGenre, ...gIds].join(',')
  else if (gIds.length) withGenres = gIds.join(q.genreMode === 'any' ? '|' : ',')
  else withGenres = moodIds.join('|')
  const without = q.gentle ? (spec.type === 'movie' ? [27, 10752] : [10768]) : []
  const df = spec.type === 'movie' ? 'primary_release_date' : 'first_air_date'
  // "disponibile in Italia": almeno un abbonamento, noleggio o acquisto nel paese
  const monetization =
    q.monetization !== 'any' ? q.monetization : q.providers.length ? 'flatrate' : q.onlyItaly ? 'flatrate|free|ads|rent|buy' : undefined
  const r = await call<{ results: unknown[] }>(`/discover/${spec.type}`, {
    sort_by: SORT_PARAM(spec.type, q.sort),
    with_genres: withGenres || undefined,
    without_genres: without.join(',') || undefined,
    with_type: spec.tvType,
    [`${df}.gte`]: q.yearFrom ? `${q.yearFrom}-01-01` : undefined,
    [`${df}.lte`]: q.yearTo ? `${q.yearTo}-12-31` : q.sort === 'recent' ? new Date().toISOString().slice(0, 10) : undefined,
    'vote_average.gte': q.minTmdb || undefined,
    'vote_count.gte': q.sort === 'rating' ? 300 : 100,
    with_watch_providers: q.providers.join('|') || undefined,
    watch_region: REGION,
    with_watch_monetization_types: monetization,
    'with_runtime.lte': spec.type === 'movie' ? q.maxRuntime : q.maxEpisode,
    with_original_language: q.lang,
    with_origin_country: q.country,
    with_status: spec.type === 'tv' ? (spec.limited ? 3 : q.status === 'ended' ? 3 : q.status === 'ongoing' ? 0 : undefined) : undefined,
    with_crew: spec.type === 'movie' ? q.director?.id : undefined,
    certification_country: q.gentle && spec.type === 'movie' ? 'US' : undefined,
    'certification.lte': q.gentle && spec.type === 'movie' ? 'PG-13' : undefined,
    page,
  })
  const titles = clean(r.results.map((x) => mapTitle(x, spec.type)))
  return { items: spec.limited ? await onlyLimited(titles) : titles, raw: titles.length }
}

const shapeCache = new Map<number, Promise<{ seasons: number; episodes: number } | null>>()

function tvShape(id: number) {
  let p = shapeCache.get(id)
  if (!p) {
    p = call<{ number_of_seasons?: number; number_of_episodes?: number }>(`/tv/${id}`)
      .then((d) => ({ seasons: d.number_of_seasons ?? 0, episodes: d.number_of_episodes ?? 0 }))
      .catch(() => {
        shapeCache.delete(id)
        return null
      })
    shapeCache.set(id, p)
  }
  return p
}

/** Tiene le serie con una sola stagione e al massimo 12 episodi: sono miniserie anche se TMDB non le etichetta così. */
async function onlyLimited(titles: Title[]): Promise<Title[]> {
  const shapes = await Promise.all(titles.map((t) => tvShape(t.id)))
  return titles.filter((_, i) => {
    const sh = shapes[i]
    return !!sh && sh.seasons === 1 && sh.episodes > 0 && sh.episodes <= 12
  })
}

function sortTitles(list: Title[], s: Sort): Title[] {
  const key = (t: Title) => (s === 'popularity' || s === 'taste' ? t.popularity : s === 'rating' ? t.rating : Date.parse(t.date) || 0)
  return [...list].sort((a, b) => key(b) - key(a))
}

async function actorTitles(q: Query, genres: GenreEntry[]): Promise<Title[]> {
  const r = await call<{ cast: unknown[] }>(`/person/${q.actor!.id}/combined_credits`)
  const types = new Set(kindTypes(q.kinds))
  const entries = q.genres.map((n) => genres.find((g) => g.name === n)).filter((x): x is GenreEntry => !!x)
  const seen = new Set<string>()
  return clean(r.cast.map((x) => mapTitle(x)))
    .filter((t) => {
      const k = t.type + t.id
      if (seen.has(k) || !t.poster || !types.has(t.type)) return false
      seen.add(k)
      if (entries.length) {
        const has = entries.map((e) => t.genreIds.includes(e[t.type] ?? -1))
        if (q.genreMode === 'any' ? !has.some(Boolean) : !has.every(Boolean)) return false
      }
      if (q.yearFrom && t.year < q.yearFrom) return false
      if (q.yearTo && t.year > q.yearTo) return false
      if (t.rating < q.minTmdb) return false
      return true
    })
}

/** Titoli premiati (dataset da Wikidata): si filtra qui perché TMDB non conosce i premi. */
async function awardTitles(q: Query, genres: GenreEntry[]): Promise<Title[]> {
  const file = await loadAwards()
  if (!file) throw new Error('AWARDS_MISSING')
  const types = new Set(kindTypes(q.kinds))
  const onlyDocAnim = q.kinds.every((k) => k === 'doc' || k === 'animation')
  const wantedGenres = q.kinds.flatMap((k) => (k === 'doc' ? [99] : k === 'animation' ? [16] : []))
  const entries = q.genres.map((n) => genres.find((g) => g.name === n)).filter((x): x is GenreEntry => !!x)
  const out = file.items
    .filter((i) => {
      if (!q.awards.some((k) => k in i.awards)) return false
      if (!types.has(i.type)) return false
      if (onlyDocAnim && !i.genreIds.some((g) => wantedGenres.includes(g))) return false
      if (entries.length) {
        const has = entries.map((e) => i.genreIds.includes(e[i.type] ?? -1))
        if (q.genreMode === 'any' ? !has.some(Boolean) : !has.every(Boolean)) return false
      }
      if (q.moods.length && !q.moods.some((m) => (MOODS.find((x) => x.id === m)?.[i.type] ?? []).some((g) => i.genreIds.includes(g)))) return false
      if (q.yearFrom && i.year < q.yearFrom) return false
      if (q.yearTo && i.year > q.yearTo) return false
      if (q.minTmdb && i.rating < q.minTmdb) return false
      if (q.lang && i.lang !== q.lang) return false
      return true
    })
    .map<Title>((i) => ({
      id: i.id,
      type: i.type,
      title: i.title,
      year: i.year,
      date: i.date,
      poster: i.poster,
      backdrop: i.backdrop,
      rating: i.rating,
      popularity: 0,
      genreIds: i.genreIds,
      overview: i.overview,
      note: q.awards.filter((k) => k in i.awards).map((k) => `${awardLabel(k)}${i.awards[k] ? ' ' + i.awards[k] : ''}`).join(' · '),
    }))
  return q.sort === 'recent' ? out : [...out].sort((a, b) => b.rating - a.rating)
}

/** Una pagina di risultati per la query. Con un attore filtrato la pagina 1 contiene tutto. */
export async function discover(q: Query, page: number): Promise<{ items: Title[]; more: boolean }> {
  const genres = await genreList()
  if (q.awards.length) return { items: await awardTitles(q, genres), more: false }
  if (q.actor) {
    if (page > 1) return { items: [], more: false }
    return { items: sortTitles(await actorTitles(q, genres), q.sort), more: false }
  }
  const specs = q.kinds.flatMap((k) => SPECS[k])
  const results = await Promise.all(specs.map((s) => discoverSpec(s, q, page, genres)))
  const seen = new Set<string>()
  const merged = results.flatMap((r) => r.items).filter((t) => {
    const k = t.type + t.id
    if (seen.has(k)) return false
    seen.add(k)
    return !!t.poster
  })
  // "more" guarda i risultati grezzi: una pagina può svuotarsi dopo il filtro sulle miniserie ma averne altre dopo
  return { items: sortTitles(merged, q.sort), more: page < 20 && results.some((r) => r.raw > 0) }
}

/** Ricerca libera su discover con parametri grezzi (usata da "Scegli per me"). */
export async function discoverRaw(type: MediaType, params: Params): Promise<Title[]> {
  const r = await call<{ results: unknown[] }>(`/discover/${type}`, { watch_region: REGION, ...params })
  return clean(r.results.map((x) => mapTitle(x, type))).filter((t) => t.poster)
}

export async function trending(): Promise<Title[]> {
  const r = await call<{ results: unknown[] }>('/trending/all/week')
  return clean(r.results.map((x) => mapTitle(x))).filter((t) => t.poster)
}

const basicCache = new Map<string, Promise<Title | null>>()

/** Dati base di un titolo (locandina, trama) a partire dal suo id TMDB. */
export function titleById(type: MediaType, id: number): Promise<Title | null> {
  const k = `${type}:${id}`
  let p = basicCache.get(k)
  if (!p) {
    p = call<unknown>(`/${type}/${id}`)
      .then((d) => mapTitle({ ...(d as object), genre_ids: ((d as { genres?: { id: number }[] }).genres ?? []).map((g) => g.id) }, type))
      .catch(() => {
        basicCache.delete(k) // un errore non va ricordato: la prossima volta riprova
        return null
      })
    basicCache.set(k, p)
  }
  return p
}

export async function externalImdb(type: MediaType, id: number): Promise<string | null> {
  const r = await call<{ imdb_id?: string | null }>(`/${type}/${id}/external_ids`)
  return r.imdb_id || null
}

export async function recommendations(type: MediaType, id: number): Promise<Title[]> {
  const r = await call<{ results: unknown[] }>(`/${type}/${id}/recommendations`)
  return clean(r.results.map((x) => mapTitle(x, type)))
}

export async function similar(type: MediaType, id: number): Promise<Title[]> {
  const r = await call<{ results: unknown[] }>(`/${type}/${id}/similar`)
  return clean(r.results.map((x) => mapTitle(x, type)))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapProviders = (list: any[] | undefined): Provider[] =>
  (list ?? []).map((p) => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path }))

export async function detail(type: MediaType, id: number): Promise<Detail> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = await call(`/${type}/${id}`, {
    append_to_response: `credits,videos,watch/providers,${type === 'movie' ? 'release_dates' : 'content_ratings'}`,
  })
  const base = mapTitle({ ...d, genre_ids: (d.genres ?? []).map((g: { id: number }) => g.id) }, type)!
  const prov = d['watch/providers']?.results?.[REGION]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const video = d.videos?.results?.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer')

  let certification: string | null = null
  if (type === 'movie') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byCountry = (c: string) => d.release_dates?.results?.find((r: any) => r.iso_3166_1 === c)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cert = (byCountry('IT') ?? byCountry('US'))?.release_dates?.find((r: any) => r.certification)?.certification
    certification = cert || null
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byCountry = (c: string) => d.content_ratings?.results?.find((r: any) => r.iso_3166_1 === c)
    certification = (byCountry('IT') ?? byCountry('US'))?.rating || null
  }

  const runtimeMin: number | null = type === 'movie' ? d.runtime || null : null
  const episodeRuntime: number | null = type === 'tv' ? d.episode_run_time?.[0] ?? d.last_episode_to_air?.runtime ?? null : null
  return {
    ...base,
    genres: (d.genres ?? []).map((g: { name: string }) => g.name),
    runtime: type === 'movie' ? (d.runtime ? `${d.runtime} min` : '') : d.number_of_seasons ? `${d.number_of_seasons} stagioni` : '',
    runtimeMin,
    seasons: type === 'tv' ? d.number_of_seasons ?? null : null,
    episodes: type === 'tv' ? d.number_of_episodes ?? null : null,
    episodeRuntime,
    status: d.status ?? null,
    certification,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cast: (d.credits?.cast ?? []).slice(0, 12).map((c: any) => ({ id: c.id, name: c.name, character: c.character })),
    providers: mapProviders(prov?.flatrate),
    rent: mapProviders(prov?.rent),
    buy: mapProviders(prov?.buy),
    trailer: video ? `https://www.youtube.com/watch?v=${video.key}` : null,
    link: prov?.link ?? null,
  }
}
