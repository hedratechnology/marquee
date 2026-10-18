import * as tmdb from './tmdb'
import type { MediaType, Query, Title } from './tmdb'
import { aiErrorText, getAiKey, nlSearch } from './ai'
import { affinity } from './taste'
import type { Taste } from './taste'

/** Come ho letto il prompt di una lista. */
export interface Analysis {
  query: Query | null
  keywords: string[]
  summary: string
  notes: string[]
}

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const STOP = new Set(['una', 'uno', 'un', 'che', 'con', 'per', 'del', 'della', 'delle', 'dei', 'degli', 'nel', 'nella', 'sul', 'sulla', 'dal', 'dalla', 'e', 'o', 'il', 'lo', 'la', 'le', 'gli', 'i', 'di', 'da', 'in', 'su', 'a', 'ma', 'non', 'voglio', 'vorrei', 'film', 'serie', 'serata'])
export const words = (s: string) => plain(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w))

const CACHE_KEY = 'list_analysis_v1'
const readCache = (): Record<string, Analysis> => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
  } catch {
    return {}
  }
}
const pending = new Map<string, Promise<Analysis>>()

/** Il prompt diventa filtri e parole chiave: con la chiave Anthropic lo legge l'IA, senza si cerca per parole. */
export function analyze(prompt: string, model: string, mine: number[]): Promise<Analysis> {
  const text = prompt.trim()
  if (!text) return Promise.resolve({ query: null, keywords: [], summary: '', notes: [] })
  const key = `${model}|${mine.join(',')}|${text}`
  const hit = readCache()[key]
  if (hit) return Promise.resolve(hit)
  const live = pending.get(key)
  if (live) return live
  const fallback = (note: string): Analysis => ({ query: null, keywords: words(text).slice(0, 6), summary: '', notes: [note] })
  const p = (getAiKey()
    ? nlSearch(text, model, mine)
        .then((a): Analysis => {
          const out = { query: a.query, keywords: a.keywords, summary: a.summary, notes: a.notes }
          try {
            const all = readCache()
            const keys = Object.keys(all)
            if (keys.length > 40) delete all[keys[0]]
            all[key] = out
            localStorage.setItem(CACHE_KEY, JSON.stringify(all))
          } catch { /* la cache è solo un risparmio */ }
          return out
        })
        .catch((e) => fallback(`${aiErrorText(e)} Intanto cerco per parole.`))
    : Promise.resolve(fallback('Senza la chiave Anthropic cerco solo per parole: la inserisci in Impostazioni per far leggere il prompt all\'IA.'))
  ).finally(() => pending.delete(key))
  pending.set(key, p)
  return p
}

/** I tipi di contenuto di una lista: lo scorrevole film/serie vince su quello dei filtri in alto. */
function listKinds(global: Query['kinds'], type: MediaType): Query['kinds'] {
  if (type === 'movie') return ['film']
  const tv = global.filter((k) => k === 'series' || k === 'miniseries')
  return tv.length ? tv : ['series']
}

/** I filtri in alto fanno da base; ciò che chiede il prompt li restringe. */
export function mergeQueries(global: Query, type: MediaType, a: Query | null): Query {
  const q: Query = { ...global, kinds: listKinds(global.kinds, type) }
  if (!a) return q
  if (a.genres.length) {
    q.genres = a.genres
    q.genreMode = a.genreMode
  }
  if (a.moods.length) q.moods = a.moods
  if (a.yearFrom) q.yearFrom = a.yearFrom
  if (a.yearTo) q.yearTo = a.yearTo
  q.minTmdb = Math.max(global.minTmdb, a.minTmdb)
  if (a.maxRuntime) q.maxRuntime = a.maxRuntime
  if (a.maxEpisode) q.maxEpisode = a.maxEpisode
  if (a.lang) q.lang = a.lang
  if (a.country) q.country = a.country
  if (a.status) q.status = a.status
  if (a.actor) q.actor = a.actor
  if (a.director && type === 'movie') q.director = a.director
  if (a.gentle) q.gentle = true
  if (a.onlyMine) q.onlyMine = true
  if (a.monetization !== 'any') q.monetization = a.monetization
  if (a.hideSeen) q.hideSeen = true
  return q
}

/** Il bacino di candidati: le prime pagine del catalogo con quei filtri, più i titoli che portano il nome cercato. */
export async function fetchPool(prompt: string, type: MediaType, q: Query, mine: number[]): Promise<{ items: Title[]; named: Set<string> }> {
  const hint = Math.max(q.minTmdb, q.minImdb ? Math.max(0, q.minImdb - 1.2) : 0, q.minRt >= 80 ? 6.3 : 0, q.minMeta >= 70 ? 6.3 : 0)
  const eff: Query = {
    ...q,
    providers: q.onlyMine && mine.length ? mine : q.providers,
    minTmdb: Math.round(hint * 10) / 10,
    minImdb: 0, minRt: 0, minMeta: 0, hideSeen: false, strictRatings: false,
    sort: 'popularity',
  }
  const pages = await Promise.all([1, 2, 3].map((p) => tmdb.discover(eff, p).then((r) => r.items).catch(() => [] as Title[])))
  const items: Title[] = []
  const seen = new Set<string>()
  const push = (t: Title) => {
    const k = t.type + t.id
    if (t.type !== type || !t.poster || seen.has(k)) return
    seen.add(k)
    items.push(t)
  }
  pages.flat().forEach(push)
  const named = new Set<string>()
  if (prompt.trim().length >= 3) {
    const found = await tmdb.search(prompt.trim()).catch(() => [] as Title[])
    for (const t of found) {
      if (t.type !== type) continue
      named.add(t.type + t.id)
      push(t)
    }
  }
  return { items, named }
}

export interface Proposal {
  t: Title
  why: string
}

/** Mette in ordine di priorità: voto, gusto personale, parole del prompt e posizione nel catalogo. */
export function rankPool(items: Title[], named: Set<string>, keywords: string[], taste: Taste): Proposal[] {
  const keys = keywords.map(plain).filter(Boolean)
  const scored = items.map((t, i) => {
    const hay = plain(`${t.title} ${t.overview}`)
    const hits = keys.filter((k) => hay.includes(k))
    const aff = affinity(t, taste)
    const score = t.rating / 10 + 0.6 * aff + 0.4 * Math.min(1, hits.length / 2) + (named.has(t.type + t.id) ? 0.6 : 0) + (1 - i / Math.max(1, items.length)) * 0.3
    const why = hits.length ? `Nella trama: ${hits.slice(0, 2).join(', ')}` : named.has(t.type + t.id) ? 'Corrisponde al prompt' : aff > 0.3 ? 'Nei tuoi gusti' : ''
    return { t, why, score }
  })
  return scored.sort((a, b) => b.score - a.score).map(({ t, why }) => ({ t, why }))
}
