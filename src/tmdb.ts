const API = 'https://api.themoviedb.org/3'
export const IMG = 'https://image.tmdb.org/t/p'
export const REGION = 'IT'

export type MediaType = 'movie' | 'tv'

export interface Title {
  id: number
  type: MediaType
  title: string
  year: string
  poster: string | null
  rating: number
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

export const PROVIDERS = [
  { id: 8, name: 'Netflix' },
  { id: 119, name: 'Prime Video' },
  { id: 337, name: 'Disney+' },
  { id: 531, name: 'Paramount+' },
  { id: 350, name: 'Apple TV+' },
  { id: 39, name: 'NOW' },
  { id: 222, name: 'Sky Go' },
  { id: 29, name: 'Sky' },
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
  return {
    id: r.id,
    type,
    title: r.title ?? r.name ?? '',
    year: (r.release_date ?? r.first_air_date ?? '').slice(0, 4),
    poster: r.poster_path,
    rating: Math.round((r.vote_average ?? 0) * 10) / 10,
    overview: r.overview ?? '',
  }
}

const clean = (l: (Title | null)[]) => l.filter((t): t is Title => !!t)

export async function search(q: string): Promise<Title[]> {
  const r = await call<{ results: unknown[] }>('/search/multi', { query: q })
  return clean(r.results.map((x) => mapTitle(x)))
}

export interface Filters {
  type: MediaType
  genre?: number
  yearFrom?: string
  minRating?: number
  providers: number[]
  actorId?: number
  sort: string
  page: number
}

export async function discover(f: Filters): Promise<Title[]> {
  const dateField = f.type === 'movie' ? 'primary_release_date' : 'first_air_date'
  const r = await call<{ results: unknown[] }>(`/discover/${f.type}`, {
    sort_by: f.sort,
    with_genres: f.genre,
    [`${dateField}.gte`]: f.yearFrom ? `${f.yearFrom}-01-01` : undefined,
    'vote_average.gte': f.minRating || undefined,
    'vote_count.gte': 150,
    with_watch_providers: f.providers.join('|') || undefined,
    watch_region: REGION,
    with_watch_monetization_types: f.providers.length ? 'flatrate' : undefined,
    with_cast: f.type === 'movie' ? f.actorId : undefined,
    page: f.page,
  })
  return clean(r.results.map((x) => mapTitle(x, f.type)))
}

export async function discoverByActor(actorId: number, type: MediaType): Promise<Title[]> {
  // Per le serie with_cast non è affidabile: usiamo i crediti della persona
  const r = await call<{ cast: unknown[] }>(`/person/${actorId}/${type}_credits`)
  return clean(r.cast.map((x) => mapTitle(x, type)))
    .filter((t) => t.poster)
    .sort((a, b) => b.rating - a.rating)
}

export async function searchPerson(q: string): Promise<{ id: number; name: string }[]> {
  const r = await call<{ results: { id: number; name: string }[] }>('/search/person', { query: q })
  return r.results.slice(0, 6).map((p) => ({ id: p.id, name: p.name }))
}

export async function genres(type: MediaType): Promise<{ id: number; name: string }[]> {
  const r = await call<{ genres: { id: number; name: string }[] }>(`/genre/${type}/list`)
  return r.genres
}

export async function recommendations(type: MediaType, id: number): Promise<Title[]> {
  const r = await call<{ results: unknown[] }>(`/${type}/${id}/recommendations`)
  return clean(r.results.map((x) => mapTitle(x, type)))
}

export async function detail(type: MediaType, id: number): Promise<Detail> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = await call(`/${type}/${id}`, { append_to_response: 'credits,videos,watch/providers' })
  const base = mapTitle(d, type)!
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
