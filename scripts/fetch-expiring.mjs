// Scarica i titoli in scadenza in Italia e li scrive in public/expiring.json.
// La chiave arriva da STREAMING_KEY (secret di GitHub in CI, .env.local in locale).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const OUT = 'public/expiring.json'
const API = 'https://api.movieofthenight.com/v4/changes'
const CATALOGS = 'netflix,prime,disney,hbo,apple,paramount,now,mubi'
const HORIZON_DAYS = 45
const MAX_PAGES = 10

function loadKey() {
  if (process.env.STREAMING_KEY) return process.env.STREAMING_KEY.trim()
  if (existsSync('.env.local')) {
    const m = readFileSync('.env.local', 'utf8').match(/^STREAMING_KEY=(.*)$/m)
    if (m) return m[1].trim()
  }
  return ''
}

function write(items, error) {
  mkdirSync('public', { recursive: true })
  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), country: 'it', error, items }))
  console.log(`${OUT}: ${items.length} titoli${error ? ` (errore: ${error})` : ''}`)
}

const key = loadKey()
if (!key) {
  write([], 'chiave mancante')
  process.exit(0)
}

const limit = Date.now() / 1000 + HORIZON_DAYS * 86400
const byKey = new Map()
let cursor

try {
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      country: 'it',
      catalogs: CATALOGS,
      change_type: 'expiring',
      item_type: 'show',
      order_direction: 'asc',
      include_unknown_dates: 'false',
    })
    if (cursor) params.set('cursor', cursor)
    const res = await fetch(`${API}?${params}`, { headers: { 'X-API-Key': key } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const d = await res.json()
    for (const c of d.changes) {
      if (c.streamingOptionType !== 'subscription' || c.timestamp > limit) continue
      const s = d.shows?.[c.showId]
      const [type, id] = String(s?.tmdbId ?? '').split('/')
      if (!s || !id || (type !== 'movie' && type !== 'tv')) continue
      const k = `${type}${id}:${c.service.id}`
      const prev = byKey.get(k)
      if (prev && prev.expiresAt <= c.timestamp) continue
      byKey.set(k, {
        type,
        id: Number(id),
        title: s.title,
        year: s.releaseYear ?? null,
        imdb: typeof s.rating === 'number' ? s.rating / 10 : null,
        service: c.service.id,
        serviceName: c.service.name,
        expiresAt: c.timestamp,
        link: c.link ?? null,
      })
    }
    const last = d.changes.at(-1)
    cursor = d.nextCursor
    if (!d.hasMore || !cursor || !last || last.timestamp > limit) break
  }
  write([...byKey.values()].sort((a, b) => a.expiresAt - b.expiresAt))
} catch (e) {
  // Non blocca il deploy: il sito funziona anche senza la sezione
  write([], String(e.message ?? e))
}
