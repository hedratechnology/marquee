const API = 'https://api.themoviedb.org/3'
export const IMG = 'https://image.tmdb.org/t/p'
export const REGION = 'IT'

export type MediaType = 'movie' | 'tv'
export type Kind = 'film' | 'series' | 'miniseries' | 'doc' | 'animation'
export type Sort = 'popularity' | 'rating' | 'recent'

export const KINDS: { id: Kind; label: string }[] = [
  { id: 'film', label: 'Film' },
  { id: 'series', label: 'Serie' },
  { id: 'miniseries', label: 'Miniserie' },
  { id: 'doc', label: 'Documentari' },
  { id: 'animation', label: 'Animazione' },
]

export interface Title {
  id: number
  type: MediaType
  title: string
  year: string
  date: string
  poster: string | null
  rating: number
  popularity: number
  genreIds: number[]
  overview: string
}

export interface Detail extends Title {
  genres: string[]
  runtime: string
  cast: { id: number; name: string; character: string }[]
  providers: { id: number; name: string; logo: string }[]
  trailer: string | null
  link: string | null
}

export interface Query {
  kinds: Kind[]
  genre?: string
  yearFrom?: string
  yearTo?: string
  providers: number[]
  actor?: { id: number; name: string }
  minTmdb: number
  minImdb: number
  minRt: number
  minMeta: number
  maxRuntime?: number
  lang?: string
  hideSeen: boolean
  sort: Sort
}

export const emptyQuery: Query = {
  kinds: ['film', 'series'],
  providers: [],
  minTmdb: 0,
  minImdb: 0,
  minRt: 0,
  minMeta: 0,
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

export const getKey = () => localStorage.getItem('tmdb_key') ?? ''
export const setKey = (k: string) => localStorage.setItem('tmdb_key', k.trim())

async function call<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
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
}

const SPECS: Record<Kind, Spec[]> = {
  film: [{ type: 'movie' }],
  series: [{ type: 'tv', tvType: '4' }],
  miniseries: [{ type: 'tv', tvType: '2' }],
  doc: [{ type: 'movie', extraGenre: 99 }, { type: 'tv', extraGenre: 99 }],
  animation: [{ type: 'movie', extraGenre: 16 }, { type: 'tv', extraGenre: 16 }],
}

const SORT_PARAM = (type: MediaType, s: Sort) =>
  s === 'popularity'
    ? 'popularity.desc'
    : s === 'rating'
      ? 'vote_average.desc'
      : type === 'movie'
        ? 'primary_release_date.desc'
        : 'first_air_date.desc'

async function discoverSpec(spec: Spec, q: Query, page: number, genres: GenreEntry[]): Promise<Title[]> {
  const gEntry = q.genre ? genres.find((g) => g.name === q.genre) : undefined
  const gid = gEntry?.[spec.type]
  if (q.genre && gid === undefined) return []
  const ids = [spec.extraGenre, gid].filter((x): x is number => !!x)
  const df = spec.type === 'movie' ? 'primary_release_date' : 'first_air_date'
  const r = await call<{ results: unknown[] }>(`/discover/${spec.type}`, {
    sort_by: SORT_PARAM(spec.type, q.sort),
    with_genres: ids.join(',') || undefined,
    with_type: spec.tvType,
    [`${df}.gte`]: q.yearFrom ? `${q.yearFrom}-01-01` : undefined,
    [`${df}.lte`]: q.yearTo ? `${q.yearTo}-12-31` : q.sort === 'recent' ? new Date().toISOString().slice(0, 10) : undefined,
    'vote_average.gte': q.minTmdb || undefined,
    'vote_count.gte': q.sort === 'rating' ? 300 : 100,
    with_watch_providers: q.providers.join('|') || undefined,
    watch_region: REGION,
    with_watch_monetization_types: q.providers.length ? 'flatrate' : undefined,
    'with_runtime.lte': spec.type === 'movie' ? q.maxRuntime : undefined,
    with_original_language: q.lang,
    page,
  })
  return clean(r.results.map((x) => mapTitle(x, spec.type)))
}

function sortTitles(list: Title[], s: Sort): Title[] {
  const key = (t: Title) => (s === 'popularity' ? t.popularity : s === 'rating' ? t.rating : Date.parse(t.date) || 0)
  return [...list].sort((a, b) => key(b) - key(a))
}

async function actorTitles(q: Query, genres: GenreEntry[]): Promise<Title[]> {
  const r = await call<{ cast: unknown[] }>(`/person/${q.actor!.id}/combined_credits`)
  const types = new Set(kindTypes(q.kinds))
  const gEntry = q.genre ? genres.find((g) => g.name === q.genre) : undefined
  const seen = new Set<string>()
  return clean(r.cast.map((x) => mapTitle(x)))
    .filter((t) => {
      const k = t.type + t.id
      if (seen.has(k) || !t.poster || !types.has(t.type)) return false
      seen.add(k)
      if (gEntry && !t.genreIds.includes(gEntry[t.type] ?? -1)) return false
      if (q.yearFrom && t.year < q.yearFrom) return false
      if (q.yearTo && t.year > q.yearTo) return false
      if (t.rating < q.minTmdb) return false
      return true
    })
}

/** Una pagina di risultati per la query. Con un attore filtrato la pagina 1 contiene tutto. */
export async function discover(q: Query, page: number): Promise<{ items: Title[]; more: boolean }> {
  const genres = await genreList()
  if (q.actor) {
    if (page > 1) return { items: [], more: false }
    return { items: sortTitles(await actorTitles(q, genres), q.sort), more: false }
  }
  const specs = q.kinds.flatMap((k) => SPECS[k])
  const lists = await Promise.all(specs.map((s) => discoverSpec(s, q, page, genres)))
  const seen = new Set<string>()
  const merged = lists.flat().filter((t) => {
    const k = t.type + t.id
    if (seen.has(k)) return false
    seen.add(k)
    return !!t.poster
  })
  return { items: sortTitles(merged, q.sort), more: page < 20 && lists.some((l) => l.length > 0) }
}

const basicCache = new Map<string, Promise<Title | null>>()

/** Dati base di un titolo (locandina, trama) a partire dal suo id TMDB. */
export function titleById(type: MediaType, id: number): Promise<Title | null> {
  const k = `${type}:${id}`
  let p = basicCache.get(k)
  if (!p) {
    p = call<unknown>(`/${type}/${id}`)
      .then((d) => mapTitle(d, type))
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

export async function detail(type: MediaType, id: number): Promise<Detail> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = await call(`/${type}/${id}`, { append_to_response: 'credits,videos,watch/providers' })
  const base = mapTitle({ ...d, genre_ids: (d.genres ?? []).map((g: { id: number }) => g.id) }, type)!
  const prov = d['watch/providers']?.results?.[REGION]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const video = d.videos?.results?.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer')
  return {
    ...base,
    genres: (d.genres ?? []).map((g: { name: string }) => g.name),
    runtime: type === 'movie' ? (d.runtime ? `${d.runtime} min` : '') : d.number_of_seasons ? `${d.number_of_seasons} stagioni` : '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cast: (d.credits?.cast ?? []).slice(0, 12).map((c: any) => ({ id: c.id, name: c.name, character: c.character })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    providers: (prov?.flatrate ?? []).map((p: any) => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path })),
    trailer: video ? `https://www.youtube.com/watch?v=${video.key}` : null,
    link: prov?.link ?? null,
  }
}
