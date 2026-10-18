import type { GenreEntry, MediaType } from './tmdb'
import { MOODS } from './tmdb'
import type { Mood } from './tmdb'
import { affinity, matchingGenres } from './taste'
import type { Taste } from './taste'

/** I dati di un titolo che bastano per aiutarti a decidere, senza leggere la trama oltre la premessa. */
export interface DecideInput {
  type: MediaType
  genreIds: number[]
  runtimeMin?: number | null
  episodeRuntime?: number | null
  seasons?: number | null
  episodes?: number | null
  status?: string | null
  certification?: string | null
}

export interface DecisionSheet {
  atmosphere: string
  pace: string
  effort: string
  /** 'leggero' | 'medio' | 'impegnativo' | '' */
  effortLevel: string
  likeIf: string[]
  putOff: string[]
}

const MOOD_TEXT: Record<Mood, string> = {
  light: 'leggera e scorrevole',
  cozy: 'calda e rassicurante',
  intense: 'intensa e coinvolgente',
  mystery: 'misteriosa, di tensione costante',
  fun: 'divertente',
  adventure: 'avventurosa, di ampio respiro',
}

const MOOD_SHORT: Record<Mood, string> = {
  light: 'Leggero', cozy: 'Rassicurante', intense: 'Intenso', mystery: 'Misterioso', fun: 'Divertente', adventure: 'Avventuroso',
}

const EXTRA_TONE: Record<number, string> = {
  27: 'inquietante', 878: 'visionaria', 36: 'di ricostruzione storica', 99: 'reale e informativa', 37: 'polverosa e aspra', 10402: 'musicale', 10749: 'sentimentale', 16: 'dal tratto disegnato',
}

/** L'umore più vicino ai generi del titolo (stima). */
export function moodOf(genreIds: number[], type: MediaType): Mood | null {
  let best: Mood | null = null
  let score = 0
  for (const m of MOODS) {
    const hits = genreIds.filter((g) => m[type].includes(g)).length
    if (hits > score) {
      score = hits
      best = m.id
    }
  }
  return best
}

export const moodLabel = (genreIds: number[], type: MediaType) => {
  const m = moodOf(genreIds, type)
  return m ? MOOD_SHORT[m] : ''
}

const FAST = [28, 10759, 53, 27, 12, 80]
const SLOW = [18, 36, 99, 10749, 37]
const EASY = [35, 16, 10751, 10762]

type PaceKind = 'fast' | 'slow' | 'easy' | 'even'

function paceKind(i: DecideInput): PaceKind {
  const count = (list: number[]) => i.genreIds.filter((g) => list.includes(g)).length
  const long = (i.type === 'movie' && (i.runtimeMin ?? 0) > 140) || (i.type === 'tv' && (i.episodeRuntime ?? 0) > 55)
  const short = (i.type === 'movie' && (i.runtimeMin ?? 999) <= 95) || (i.type === 'tv' && (i.episodeRuntime ?? 999) <= 30)
  const f = count(FAST)
  const s = count(SLOW) + (long ? 1 : 0)
  const e = count(EASY) + (short ? 1 : 0)
  if (e > f && e >= s) return 'easy'
  if (f > s) return 'fast'
  if (s > f) return 'slow'
  return 'even'
}

const PACE_TEXT: Record<PaceKind, string> = {
  fast: 'Serrato: gli eventi si susseguono, poche pause',
  slow: 'Riflessivo: prende il suo tempo e lavora sui personaggi',
  easy: 'Scorrevole: si segue senza fatica',
  even: 'Regolare: né di corsa né lento',
}

export const paceLabel = (i: DecideInput) => ({ fast: 'Ritmo serrato', slow: 'Ritmo riflessivo', easy: 'Scorrevole', even: 'Ritmo regolare' })[paceKind(i)]

export const fmtDuration = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}` : `${m} min`)

function effortOf(i: DecideInput): { text: string; level: string } {
  if (i.type === 'movie') {
    const m = i.runtimeMin
    if (!m) return { text: '', level: '' }
    if (m < 95) return { text: `Leggero: dura ${fmtDuration(m)}, ci sta in una serata qualsiasi`, level: 'leggero' }
    if (m < 135) return { text: `Medio: dura ${fmtDuration(m)}, una serata normale`, level: 'medio' }
    return { text: `Impegnativo: dura ${fmtDuration(m)}, serve una serata libera`, level: 'impegnativo' }
  }
  const parts: string[] = []
  if (i.seasons) parts.push(`${i.seasons} ${i.seasons === 1 ? 'stagione' : 'stagioni'}`)
  if (i.episodes) parts.push(`${i.episodes} episodi`)
  if (i.episodeRuntime) parts.push(`da circa ${i.episodeRuntime} min`)
  const hours = i.episodes && i.episodeRuntime ? Math.round((i.episodes * i.episodeRuntime) / 60) : 0
  const level = !hours ? '' : hours <= 10 ? 'leggero' : hours <= 30 ? 'medio' : 'impegnativo'
  const status = i.status === 'Ended' || i.status === 'Canceled' ? 'è conclusa' : i.status === 'Returning Series' ? 'è ancora in corso' : ''
  const head = level === 'leggero' ? 'Leggero' : level === 'medio' ? 'Medio' : level === 'impegnativo' ? 'Impegnativo' : ''
  const text = [head && `${head}:`, parts.join(', '), hours ? `circa ${hours} ore in tutto` : '', status].filter(Boolean).join(' ')
  return { text: text.replace(': ,', ':'), level }
}

const LIKE: Record<number, string> = {
  53: 'ami la tensione e vuoi sapere come va a finire',
  9648: 'ti piacciono gli enigmi da risolvere',
  80: 'ti attirano storie criminali e morali ambigue',
  18: 'cerchi storie di personaggi e di relazioni',
  35: 'vuoi staccare la testa e sorridere',
  878: 'ti affascinano idee e mondi nuovi',
  10765: 'ti affascinano idee e mondi nuovi',
  28: "ami il ritmo e le scene d'azione",
  10759: "ami il ritmo e le scene d'azione",
  12: 'ti piace partire per un viaggio',
  10749: "ti piacciono le storie d'amore",
  16: 'apprezzi uno stile visivo particolare',
  99: 'ti piace imparare qualcosa di vero',
  36: 'ti interessano epoche e fatti reali',
  14: 'ami i mondi immaginari',
  27: 'ti piace avere un po\' di paura',
  10751: 'cerchi qualcosa da guardare insieme',
  10752: 'ti interessano storie di conflitti',
  10768: 'ti interessano storie di conflitti',
  37: 'ami paesaggi aspri e storie di frontiera',
  10402: 'la musica fa parte della storia',
}

const HARD = [27, 80, 53, 10752, 10768]

export function decisionSheet(i: DecideInput, taste: Taste, genres: GenreEntry[]): DecisionSheet {
  const mood = moodOf(i.genreIds, i.type)
  const extras = i.genreIds.map((g) => EXTRA_TONE[g]).filter(Boolean).slice(0, 1)
  const atmosphere = mood ? [MOOD_TEXT[mood], ...extras].join(', ') : extras[0] ?? ''
  const eff = effortOf(i)
  const kind = paceKind(i)

  const likeIf: string[] = []
  const mine = matchingGenres({ genreIds: i.genreIds }, taste, genres)
  if (mine.length && affinity({ genreIds: i.genreIds }, taste) > 0.3) likeIf.push(`è nei tuoi generi preferiti (${mine.join(', ').toLowerCase()})`)
  for (const g of i.genreIds) {
    const t = LIKE[g]
    if (t && !likeIf.includes(t)) likeIf.push(t)
    if (likeIf.length >= 2) break
  }

  const putOff: string[] = []
  const cert = i.certification ?? ''
  if (/^(VM|R$|NC|18|16)/i.test(cert)) putOff.push(`classificazione ${cert}: contenuti per un pubblico adulto`)
  if (taste.slowAverse && (kind === 'slow' || (i.runtimeMin ?? 0) > 130)) putOff.push('hai trovato lenti altri titoli: questo potrebbe esserlo')
  if (taste.gentle && i.genreIds.some((g) => HARD.includes(g))) putOff.push('hai detto di preferire poca violenza e qui ci possono essere scene dure')
  if (i.genreIds.includes(27)) putOff.push('ci sono scene di paura e possibile violenza')
  else if (i.genreIds.some((g) => HARD.includes(g)) && putOff.length < 2) putOff.push('può avere scene tese o dure')
  if (i.type === 'movie' && (i.runtimeMin ?? 0) > 150) putOff.push('è molto lungo e chiede attenzione')
  if (i.type === 'tv' && (i.seasons ?? 0) >= 5) putOff.push('è lunga: serve costanza per arrivare in fondo')
  if (i.type === 'tv' && i.status === 'Returning Series') putOff.push('è ancora in corso: potresti restare ad aspettare nuovi episodi')
  if (i.genreIds.includes(99)) putOff.push('è più informativo che emozionante')
  if (i.genreIds.includes(35) && !i.genreIds.includes(18)) putOff.push('se cerchi una storia seria, il tono è leggero')

  return {
    atmosphere: atmosphere ? atmosphere[0].toUpperCase() + atmosphere.slice(1) : '',
    pace: PACE_TEXT[kind],
    effort: eff.text,
    effortLevel: eff.level,
    likeIf: likeIf.slice(0, 2),
    putOff: putOff.slice(0, 2),
  }
}

/** Riga breve per le schede degli elenchi: durata o impegno, umore e ritmo. */
export function quickLine(i: DecideInput): string {
  const parts: string[] = []
  if (i.type === 'movie' && i.runtimeMin) parts.push(fmtDuration(i.runtimeMin))
  else if (i.type === 'tv') {
    if (i.seasons) parts.push(`${i.seasons} ${i.seasons === 1 ? 'stagione' : 'stagioni'}`)
    if (i.episodeRuntime) parts.push(`${i.episodeRuntime} min`)
  }
  const m = moodLabel(i.genreIds, i.type)
  if (m) parts.push(m)
  return parts.join(' · ')
}
