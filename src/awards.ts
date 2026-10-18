import type { MediaType } from './tmdb'

export interface AwardItem {
  imdb: string
  type: MediaType
  id: number
  title: string
  year: string
  date: string
  poster: string | null
  backdrop: string | null
  rating: number
  genreIds: number[]
  lang: string
  overview: string
  /** chiave del premio -> anno in cui è stato vinto (se noto) */
  awards: Record<string, number | null>
}

export interface AwardsFile {
  generatedAt: string
  labels: Record<string, string>
  items: AwardItem[]
}

/** Premi selezionabili nei filtri, nell'ordine in cui si mostrano. */
export const AWARD_OPTIONS: { id: string; label: string }[] = [
  { id: 'oscar', label: 'Oscar' },
  { id: 'oscarFilm', label: 'Oscar miglior film' },
  { id: 'bafta', label: 'BAFTA' },
  { id: 'goldenGlobe', label: 'Golden Globe' },
  { id: 'palme', label: "Palma d'Oro" },
  { id: 'lion', label: "Leone d'Oro" },
  { id: 'bear', label: "Orso d'Oro" },
  { id: 'david', label: 'David di Donatello' },
  { id: 'cesar', label: 'César' },
  { id: 'efa', label: 'European Film Award' },
  { id: 'emmy', label: 'Emmy' },
]

export const awardLabel = (id: string) => AWARD_OPTIONS.find((a) => a.id === id)?.label ?? id

let promise: Promise<AwardsFile | null> | null = null

export function loadAwards(): Promise<AwardsFile | null> {
  promise ??= fetch(`${import.meta.env.BASE_URL}awards.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d && Array.isArray(d.items) ? (d as AwardsFile) : null))
    .catch(() => null)
  return promise
}

let indexPromise: Promise<Map<string, string[]> | null> | null = null

/** "tipo:id" -> chiavi dei premi vinti, per filtrare qualsiasi elenco di titoli. */
export function loadAwardIndex(): Promise<Map<string, string[]> | null> {
  indexPromise ??= loadAwards().then((f) => (f ? new Map(f.items.map((i) => [`${i.type}:${i.id}`, Object.keys(i.awards)])) : null))
  return indexPromise
}
