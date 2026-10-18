import * as tmdb from '../tmdb'
import type { Query } from '../tmdb'
import { num } from './components'

export function errText(e: unknown) {
  const m = e instanceof Error ? e.message : ''
  if (m === 'NO_KEY') return 'Inserisci la chiave TMDB in Impostazioni.'
  if (m === 'BAD_KEY') return 'Chiave TMDB non valida.'
  return 'Errore di rete. Riprova.'
}

export function summary(q: Query): string {
  const parts = [tmdb.KINDS.filter((k) => q.kinds.includes(k.id)).map((k) => k.label).join(', ')]
  if (q.genre) parts.push(q.genre)
  if (q.minImdb) parts.push(`IMDb ${num(q.minImdb)}+`)
  if (q.minRt) parts.push(`RT ${q.minRt}%+`)
  if (q.minMeta) parts.push(`Meta ${q.minMeta}+`)
  if (q.minTmdb) parts.push(`TMDB ${num(q.minTmdb)}+`)
  if (q.providers.length) parts.push(tmdb.PROVIDERS.filter((p) => q.providers.includes(p.id)).map((p) => p.name).join('/'))
  if (q.yearFrom || q.yearTo) parts.push(`${q.yearFrom || '…'}–${q.yearTo || '…'}`)
  if (q.actor) parts.push(q.actor.name)
  return parts.join(' · ')
}

export const DAY = 86400000
export function daysLabel(ts: number) {
  const d = Math.ceil((ts * 1000 - Date.now()) / DAY)
  return d <= 0 ? 'Oggi' : d === 1 ? 'Domani' : `${d} giorni`
}
