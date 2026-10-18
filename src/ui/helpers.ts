import * as tmdb from '../tmdb'
import type { Query } from '../tmdb'
import { num } from './components'

export function errText(e: unknown) {
  const m = e instanceof Error ? e.message : ''
  if (m === 'NO_KEY') return 'Inserisci la chiave TMDB in Impostazioni.'
  if (m === 'BAD_KEY') return 'Chiave TMDB non valida.'
  return 'Errore di rete. Riprova.'
}

export interface ActiveChip {
  key: string
  label: string
  /** campi da azzerare per togliere questo filtro */
  clear: Partial<Query>
}

const MONETIZATION: Record<string, string> = { flatrate: 'In abbonamento', rent: 'Noleggio', buy: 'Acquisto' }

/** Elenco dei filtri attivi, ognuno rimovibile. */
export function activeChips(q: Query): ActiveChip[] {
  const out: ActiveChip[] = []
  const add = (key: string, label: string, clear: Partial<Query>) => out.push({ key, label, clear })
  for (const m of q.moods) {
    add('mood-' + m, tmdb.MOODS.find((x) => x.id === m)?.label ?? m, { moods: q.moods.filter((x) => x !== m) })
  }
  for (const g of q.genres) add('genre-' + g, g, { genres: q.genres.filter((x) => x !== g) })
  if (q.genres.length > 1) add('mode', q.genreMode === 'any' ? 'Almeno un genere' : 'Tutti i generi', { genreMode: q.genreMode === 'any' ? 'all' : 'any' })
  for (const id of q.providers) {
    add('prov-' + id, tmdb.PROVIDERS.find((p) => p.id === id)?.name ?? String(id), { providers: q.providers.filter((x) => x !== id) })
  }
  if (!q.onlyItaly) add('italy', 'Anche non disponibili in Italia', { onlyItaly: true })
  if (q.onlyMine) add('mine', 'Solo i miei abbonamenti', { onlyMine: false })
  if (q.monetization !== 'any') add('mon', MONETIZATION[q.monetization], { monetization: 'any' })
  if (q.actor) add('actor', `Con ${q.actor.name}`, { actor: undefined })
  if (q.director) add('director', `Regia di ${q.director.name}`, { director: undefined })
  if (q.status) add('status', q.status === 'ended' ? 'Serie concluse' : 'Serie in corso', { status: undefined })
  if (q.country) add('country', tmdb.COUNTRIES.find((c) => c.id === q.country)?.label ?? q.country, { country: undefined })
  if (q.lang) add('lang', tmdb.LANGS.find((l) => l.id === q.lang)?.label ?? q.lang, { lang: undefined })
  if (q.yearFrom || q.yearTo) add('year', `${q.yearFrom || '…'}–${q.yearTo || '…'}`, { yearFrom: undefined, yearTo: undefined })
  if (q.maxRuntime) add('runtime', `Film sotto ${q.maxRuntime} min`, { maxRuntime: undefined })
  if (q.maxEpisode) add('episode', `Episodi sotto ${q.maxEpisode} min`, { maxEpisode: undefined })
  if (q.gentle) add('gentle', 'Poco violento', { gentle: false })
  if (q.minImdb) add('imdb', `IMDb ${num(q.minImdb)}+`, { minImdb: 0 })
  if (q.minRt) add('rt', `Rotten Tomatoes ${q.minRt}%+`, { minRt: 0 })
  if (q.minMeta) add('meta', `Metacritic ${q.minMeta}+`, { minMeta: 0 })
  if (q.minTmdb) add('tmdb', `TMDB ${num(q.minTmdb)}+`, { minTmdb: 0 })
  if (q.strictRatings && (q.minImdb || q.minRt || q.minMeta)) add('strict', 'Servono tutti i voti', { strictRatings: false })
  if (q.hideSeen) add('seen', 'Nascondi i visti', { hideSeen: false })
  return out
}

export function summary(q: Query): string {
  const kinds = tmdb.KINDS.filter((k) => q.kinds.includes(k.id)).map((k) => k.label).join(', ')
  return [kinds, ...activeChips(q).map((c) => c.label)].join(' · ')
}

export const DAY = 86400000
export function daysLabel(ts: number) {
  const d = Math.ceil((ts * 1000 - Date.now()) / DAY)
  return d <= 0 ? 'Oggi' : d === 1 ? 'Domani' : `${d} giorni`
}
