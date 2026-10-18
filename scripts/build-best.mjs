// Costruisce public/best.json: i titoli migliori con punteggio composto (critica, pubblico, premi).
// Chiavi: TMDB_KEY e OMDB_KEY (secret di GitHub in CI, .env.local in locale).
// La cache dei punteggi OMDb è in data/cache.json, così i limiti giornalieri non bloccano gli aggiornamenti.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const OUT = 'public/best.json'
const CACHE = 'data/cache.json'
const CACHE_DAYS = 30
const TOP = 250
const MIN_SCORE = 80 // sotto questa soglia un titolo non entra nella classifica
const TMDB = 'https://api.themoviedb.org/3'

function env(name) {
  if (process.env[name]) return process.env[name].trim()
  if (existsSync('.env.local')) {
    const m = readFileSync('.env.local', 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'))
    if (m) return m[1].trim()
  }
  return ''
}

const tmdbKey = env('TMDB_KEY')
const omdbKey = env('OMDB_KEY')
if (!tmdbKey || !omdbKey) {
  console.log('Chiavi TMDB_KEY / OMDB_KEY mancanti: salto la generazione di best.json')
  process.exit(0)
}

async function tmdb(path, params = {}) {
  const url = new URL(TMDB + path)
  const headers = {}
  if (tmdbKey.length > 60) headers.Authorization = `Bearer ${tmdbKey}`
  else url.searchParams.set('api_key', tmdbKey)
  url.searchParams.set('language', 'it-IT')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers })
    if (res.ok) return res.json()
    if (res.status === 429) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
    else throw new Error(`TMDB ${res.status} ${path}`)
  }
  throw new Error(`TMDB rate limit ${path}`)
}

async function pool() {
  const year = new Date().getFullYear()
  const jobs = []
  const add = (type, params, pages) => {
    for (let p = 1; p <= pages; p++) jobs.push({ type, params: { ...params, page: p } })
  }
  const date = type => (type === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte')
  const top = { sort_by: 'vote_average.desc' }
  add('movie', { ...top, 'vote_count.gte': 3000 }, 6)
  add('movie', { ...top, 'vote_count.gte': 800, [date('movie')]: `${year - 4}-01-01` }, 2)
  add('movie', { ...top, 'vote_count.gte': 400, with_original_language: 'it' }, 2)
  add('tv', { ...top, 'vote_count.gte': 1500 }, 4)
  add('tv', { ...top, 'vote_count.gte': 500, [date('tv')]: `${year - 4}-01-01` }, 2)
  add('tv', { ...top, 'vote_count.gte': 150, with_original_language: 'it' }, 1)
  const seen = new Map()
  for (const j of jobs) {
    const d = await tmdb(`/discover/${j.type}`, j.params)
    for (const r of d.results) {
      const k = `${j.type}:${r.id}`
      if (!seen.has(k) && r.poster_path) seen.set(k, { type: j.type, r })
    }
  }
  return [...seen.values()]
}

function loadCache() {
  try {
    return JSON.parse(readFileSync(CACHE, 'utf8'))
  } catch {
    return {}
  }
}

let omdbLimited = false

async function omdb(imdbId) {
  if (omdbLimited) return null
  const res = await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(omdbKey)}&i=${imdbId}`)
  const d = await res.json()
  if (d.Response === 'False') {
    if (/limit/i.test(d.Error ?? '')) omdbLimited = true
    return null
  }
  const num = (v) => (v && v !== 'N/A' ? parseFloat(String(v).replace(/,/g, '')) : null)
  const rt = d.Ratings?.find((r) => r.Source === 'Rotten Tomatoes')?.Value
  return { imdb: num(d.imdbRating), votes: num(d.imdbVotes), meta: num(d.Metascore), rt: num(rt) }
}

async function inBatches(list, size, fn) {
  const out = []
  for (let i = 0; i < list.length; i += size) {
    out.push(...(await Promise.all(list.slice(i, i + size).map(fn))))
  }
  return out
}

// Premi: solo vincitori, da Wikidata (dati aperti). Copertura buona per i film, parziale per le serie.
const AWARDS = {
  Q102427: 'Oscar miglior film',
  Q179808: "Palma d'Oro",
  Q209459: "Leone d'Oro",
  Q154590: "Orso d'Oro",
  Q768476: 'David di Donatello miglior film',
  Q1011509: 'Golden Globe miglior film drammatico',
  Q989438: 'Emmy miglior serie drammatica',
  Q645595: 'César miglior film',
}

async function awards() {
  const q = `SELECT ?imdb ?award ?date WHERE {
    VALUES ?award { ${Object.keys(AWARDS).map((k) => `wd:${k}`).join(' ')} }
    ?film p:P166 ?st . ?st ps:P166 ?award .
    OPTIONAL { ?st pq:P585 ?date }
    ?film wdt:P345 ?imdb . FILTER(STRSTARTS(?imdb, "tt"))
  }`
  const res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, {
    headers: { 'User-Agent': 'marquee-personal-app/1.0 (https://github.com/hedratechnology/marquee)' },
  })
  if (!res.ok) throw new Error(`Wikidata ${res.status}`)
  const rows = (await res.json()).results.bindings
  const map = new Map()
  for (const r of rows) {
    const id = r.imdb.value
    const name = AWARDS[r.award.value.split('/').pop()]
    const year = r.date?.value.slice(0, 4) ?? null
    const list = map.get(id) ?? []
    if (!list.some((a) => a.name === name)) list.push({ name, year })
    map.set(id, list)
  }
  return map
}

/** Punteggio 0-100: critica (Metascore, Rotten Tomatoes) + pubblico (IMDb) + bonus premi. */
export function score(r, awardList) {
  const critics = [r.meta, r.rt].filter((v) => typeof v === 'number')
  const critic = critics.length ? critics.reduce((a, b) => a + b, 0) / critics.length : null
  const audience = typeof r.imdb === 'number' && (r.votes ?? 0) >= 10000 ? r.imdb * 10 : null
  if (critic === null && audience === null) return null
  let base
  if (critic !== null && audience !== null) base = 0.55 * critic + 0.45 * audience
  else base = 0.96 * (critic ?? audience) // un solo dato (di solito le serie, senza voti della critica): pesa un po' meno
  const bonus = Math.min(9, awardList.length * 3)
  return Math.round(Math.min(100, base + bonus) * 10) / 10
}

const started = Date.now()
const candidates = await pool()
console.log(`candidati: ${candidates.length}`)

const cache = loadCache()
const fresh = (e) => e && Date.now() - e.at < CACHE_DAYS * 86400000
const awardMap = await awards().catch((e) => {
  console.log(`premi non disponibili: ${e.message}`)
  return new Map()
})

const rows = await inBatches(candidates, 5, async ({ type, r }) => {
  const key = `${type}:${r.id}`
  let entry = cache[key]
  if (!fresh(entry)) {
    try {
      const ext = await tmdb(`/${type}/${r.id}/external_ids`)
      const imdbId = ext.imdb_id
      const ratings = imdbId ? await omdb(imdbId) : null
      if (ratings || !imdbId) entry = cache[key] = { at: Date.now(), imdbId: imdbId ?? null, ...(ratings ?? {}) }
      else if (!entry) return null
    } catch {
      if (!entry) return null
    }
  }
  const a = (entry.imdbId && awardMap.get(entry.imdbId)) || []
  const s = score(entry, a)
  if (s === null) return null
  const date = r.release_date ?? r.first_air_date ?? ''
  return {
    type,
    id: r.id,
    title: r.title ?? r.name,
    year: date.slice(0, 4),
    date,
    poster: r.poster_path,
    backdrop: r.backdrop_path ?? null,
    overview: (r.overview ?? '').slice(0, 280),
    genreIds: r.genre_ids ?? [],
    lang: r.original_language,
    score: s,
    imdb: entry.imdb ?? null,
    votes: entry.votes ?? null,
    rt: entry.rt ?? null,
    meta: entry.meta ?? null,
    awards: a,
  }
})

mkdirSync('data', { recursive: true })
writeFileSync(CACHE, JSON.stringify(cache))
const items = rows.filter((r) => r && r.score >= MIN_SCORE).sort((a, b) => b.score - a.score).slice(0, TOP)
mkdirSync('public', { recursive: true })
writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), omdbLimited, awardsCovered: awardMap.size > 0, items }),
)
console.log(`${OUT}: ${items.length} titoli in ${Math.round((Date.now() - started) / 1000)}s${omdbLimited ? ' (limite OMDb raggiunto)' : ''}`)
