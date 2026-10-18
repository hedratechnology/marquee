import type { Mood, Title } from './tmdb'
import { MOODS } from './tmdb'
import { candidates } from './pick'
import type { Company, PickContext, Time } from './pick'

export type Mark = 'y' | 'm' | 'n'

export interface TogetherPayload {
  v: 1
  /** nome di chi ha creato la scelta */
  n: string
  m: Mood
  t: Time
  c: Company
  /** titoli: "m123" film, "t456" serie */
  ids: string[]
  /** segni di chi ha creato la scelta, uno per titolo */
  a: string
}

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))

export const encodePayload = (p: TogetherPayload) => b64(JSON.stringify(p))

export function decodePayload(s: string): TogetherPayload | null {
  try {
    const p = JSON.parse(unb64(s)) as TogetherPayload
    if (p.v !== 1 || !Array.isArray(p.ids) || typeof p.a !== 'string') return null
    return p
  } catch {
    return null
  }
}

export const idOf = (t: Pick<Title, 'type' | 'id'>) => (t.type === 'movie' ? 'm' : 't') + t.id
export function parseId(s: string): { type: 'movie' | 'tv'; id: number } | null {
  const id = Number(s.slice(1))
  if (!Number.isFinite(id) || id <= 0) return null
  return { type: s[0] === 'm' ? 'movie' : 'tv', id }
}

export const marksToString = (titles: Title[], marks: Record<string, Mark>) => titles.map((t) => marks[idOf(t)] ?? 'm').join('')
export const stringToMarks = (ids: string[], s: string): Record<string, Mark> =>
  Object.fromEntries(ids.map((id, i) => [id, (['y', 'm', 'n'].includes(s[i]) ? s[i] : 'm') as Mark]))

const VALUE: Record<Mark, number> = { y: 2, m: 1, n: -3 }

export interface Outcome {
  title: Title
  a: Mark
  b: Mark
  score: number
  label: string
}

function moodFit(t: Title, mood?: Mood): number {
  if (!mood) return 0
  const ids = MOODS.find((m) => m.id === mood)?.[t.type] ?? []
  return (t.genreIds ?? []).some((g) => ids.includes(g)) ? 1 : 0
}

function label(a: Mark, b: Mark): string {
  if (a === 'y' && b === 'y') return 'Piace a entrambi'
  if ((a === 'y' && b === 'm') || (a === 'm' && b === 'y')) return 'Un sì e un forse'
  if (a === 'm' && b === 'm') return 'Due forse'
  if (a === 'n' || b === 'n') return 'Qualcuno ha detto no'
  return 'Possibile'
}

/** Combina le scelte: vince chi mette d'accordo entrambi, un no pesa molto. */
export function combine(titles: Title[], a: Record<string, Mark>, b: Record<string, Mark>, moods: { a?: Mood; b?: Mood }): Outcome[] {
  return titles
    .map((t) => {
      const ma = a[idOf(t)] ?? 'm'
      const mb = b[idOf(t)] ?? 'm'
      const score = VALUE[ma] + VALUE[mb] + 0.4 * moodFit(t, moods.a) + 0.4 * moodFit(t, moods.b)
      return { title: t, a: ma, b: mb, score, label: label(ma, mb) }
    })
    .sort((x, y) => y.score - x.score)
}

/** Insieme di titoli tra cui scegliere: soprattutto nel tono richiesto, più qualche jolly di un altro umore. */
export async function buildPool(mood: Mood, time: Time, company: Company, mine: number[], ctx: PickContext): Promise<Title[]> {
  const main = await candidates({ mood, time, company, gentle: false, mine }, ctx)
  const altMood: Mood = mood === 'light' ? 'adventure' : 'light'
  const jolly = await candidates({ mood: altMood, time, company, gentle: false, mine }, ctx)
  const seen = new Set<string>()
  const out: Title[] = []
  const push = (t: Title) => {
    const k = idOf(t)
    if (!seen.has(k) && out.length < 12) {
      seen.add(k)
      out.push(t)
    }
  }
  main.slice(0, 9).forEach((c) => push(c.title))
  jolly.forEach((c) => push(c.title))
  main.slice(9).forEach((c) => push(c.title))
  return out
}
