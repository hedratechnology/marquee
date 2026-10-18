// Costruisce public/awards.json: i titoli che hanno vinto premi importanti, con i dati base per mostrarli.
// Fonte dei premi: Wikidata (dati aperti, copertura buona ma non completa). Chiave: TMDB_KEY (secret in CI, .env.local in locale).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const OUT = 'public/awards.json'
const CACHE = 'data/awards-cache.json'
const TMDB = 'https://api.themoviedb.org/3'
const CACHE_DAYS = 60

function env(name) {
  if (process.env[name]) return process.env[name].trim()
  if (existsSync('.env.local')) {
    const m = readFileSync('.env.local', 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'))
    if (m) return m[1].trim()
  }
  return ''
}

const tmdbKey = env('TMDB_KEY')
if (!tmdbKey) {
  console.log('TMDB_KEY mancante: salto la generazione di awards.json')
  process.exit(0)
}

// chiave -> etichetta e gli id Wikidata dei premi che la compongono
const AWARDS = {
  oscar: { label: 'Oscar', note: 'almeno una statuetta, in qualsiasi categoria' },
  oscarFilm: { label: 'Oscar miglior film', ids: ['Q102427'] },
  bafta: { label: 'BAFTA miglior film', ids: ['Q139184', 'Q2925687'] },
  goldenGlobe: { label: 'Golden Globe', ids: ['Q1011509', 'Q670282', 'Q1255198'] },
  palme: { label: "Palma d'Oro", ids: ['Q179808'] },
  lion: { label: "Leone d'Oro", ids: ['Q209459'] },
  bear: { label: "Orso d'Oro", ids: ['Q154590'] },
  david: { label: 'David di Donatello miglior film', ids: ['Q768476'] },
  cesar: { label: 'César miglior film', ids: ['Q645595'] },
  efa: { label: 'European Film Award miglior film', ids: ['Q777921'] },
  emmy: { label: 'Emmy miglior serie', ids: ['Q989438', 'Q2110156', 'Q20714679'] },
}
const IDS_TO_KEY = new Map()
for (const [key, a] of Object.entries(AWARDS)) for (const id of a.ids ?? []) IDS_TO_KEY.set(id, key)

const UA = { 'User-Agent': 'marquee-personal-app/1.0 (https://github.com/hedratechnology/marquee)' }

async function sparql(query) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, { headers: UA })
    if (res.ok) return (await res.json()).results.bindings
    if (res.status === 429 || res.status >= 500) await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)))
    else throw new Error(`Wikidata ${res.status}`)
  }
  throw new Error('Wikidata non risponde')
}

/** imdb -> { chiave premio: anno|null } */
async function wikidataAwards() {
  const byImdb = new Map()
  const add = (imdb, key, year) => {
    const cur = byImdb.get(imdb) ?? {}
    // si tiene l'anno più antico noto per quel premio
    if (!(key in cur) || (year && (!cur[key] || year < cur[key]))) cur[key] = year
    byImdb.set(imdb, cur)
  }
  const specific = await sparql(`SELECT ?imdb ?award ?date WHERE {
    VALUES ?award { ${[...IDS_TO_KEY.keys()].map((id) => `wd:${id}`).join(' ')} }
    ?film p:P166 ?st . ?st ps:P166 ?award .
    OPTIONAL { ?st pq:P585 ?date }
    ?film wdt:P345 ?imdb . FILTER(STRSTARTS(?imdb, "tt"))
  }`)
  for (const r of specific) {
    const key = IDS_TO_KEY.get(r.award.value.split('/').pop())
    add(r.imdb.value, key, r.date ? Number(r.date.value.slice(0, 4)) : null)
  }
  // Oscar in qualsiasi categoria: premi conferiti dall'Academy
  const any = await sparql(`SELECT ?imdb (MIN(YEAR(?date)) AS ?y) WHERE {
    ?film p:P166 ?st . ?st ps:P166 ?award . ?award wdt:P1027 wd:Q212329 .
    OPTIONAL { ?st pq:P585 ?date }
    ?film wdt:P345 ?imdb . FILTER(STRSTARTS(?imdb, "tt"))
  } GROUP BY ?imdb`)
  for (const r of any) add(r.imdb.value, 'oscar', r.y ? Number(r.y.value) : null)
  return byImdb
}

async function tmdb(path, params = {}) {
  const url = new URL(TMDB + path)
  const headers = {}
  if (tmdbKey.length > 60) headers.Authorization = `Bearer ${tmdbKey}`
  else url.searchParams.set('api_key', tmdbKey)
  url.searchParams.set('language', 'it-IT')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers })
    if (res.ok) return res.json()
    if (res.status === 429) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
    else if (res.status === 404) return null
    else throw new Error(`TMDB ${res.status}`)
  }
  throw new Error('TMDB rate limit')
}

function loadCache() {
  try {
    return JSON.parse(readFileSync(CACHE, 'utf8'))
  } catch {
    return {}
  }
}

async function inBatches(list, size, fn) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(...(await Promise.all(list.slice(i, i + size).map(fn))))
  return out
}

const started = Date.now()
const awards = await wikidataAwards()
console.log(`titoli premiati su Wikidata: ${awards.size}`)

const cache = loadCache()
const fresh = (e) => e && Date.now() - e.at < CACHE_DAYS * 86400000
const todo = [...awards.keys()].filter((id) => !fresh(cache[id]))
console.log(`da risolvere su TMDB: ${todo.length}`)

await inBatches(todo, 15, async (imdb) => {
  try {
    const f = await tmdb(`/find/${imdb}`, { external_source: 'imdb_id' })
    const m = f?.movie_results?.[0]
    const t = f?.tv_results?.[0]
    const r = m ?? t
    cache[imdb] = r
      ? {
          at: Date.now(),
          type: m ? 'movie' : 'tv',
          id: r.id,
          title: r.title ?? r.name,
          date: r.release_date ?? r.first_air_date ?? '',
          poster: r.poster_path ?? null,
          backdrop: r.backdrop_path ?? null,
          rating: Math.round((r.vote_average ?? 0) * 10) / 10,
          genreIds: r.genre_ids ?? [],
          lang: r.original_language,
          overview: (r.overview ?? '').slice(0, 240),
        }
      : { at: Date.now(), missing: true }
  } catch {
    // si riprova alla prossima esecuzione
  }
})

mkdirSync('data', { recursive: true })
writeFileSync(CACHE, JSON.stringify(cache))

const items = []
for (const [imdb, won] of awards) {
  const c = cache[imdb]
  if (!c || c.missing || !c.poster) continue
  items.push({
    imdb,
    type: c.type,
    id: c.id,
    title: c.title,
    year: c.date.slice(0, 4),
    date: c.date,
    poster: c.poster,
    backdrop: c.backdrop,
    rating: c.rating,
    genreIds: c.genreIds,
    lang: c.lang,
    overview: c.overview,
    awards: won,
  })
}
items.sort((a, b) => b.date.localeCompare(a.date))
mkdirSync('public', { recursive: true })
writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    labels: Object.fromEntries(Object.entries(AWARDS).map(([k, a]) => [k, a.label])),
    items,
  }),
)
console.log(`${OUT}: ${items.length} titoli in ${Math.round((Date.now() - started) / 1000)}s`)
