import * as tmdb from './tmdb'
import type { Detail, GenreEntry, Kind, Mood, Query, Title } from './tmdb'

export const AI_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 · la più accurata' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 · equilibrata' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 · la più economica' },
]

export const getAiKey = () => localStorage.getItem('anthropic_key') ?? ''
export const setAiKey = (k: string) => localStorage.setItem('anthropic_key', k.trim())

export class AiError extends Error {}

/** Messaggio leggibile per un errore dell'API (si riconosce dal codice di stato, non dal testo). */
export function aiErrorText(e: unknown): string {
  if (e instanceof AiError) return e.message
  const err = e as { status?: number; name?: string; message?: string }
  if (err?.status === 401) return 'Chiave Anthropic non valida. Controllala in Impostazioni.'
  if (err?.status === 403) return 'La chiave Anthropic non ha i permessi per questo modello.'
  if (err?.status === 429) return 'Troppe richieste ad Anthropic: riprova tra un momento.'
  if (err?.status === 400) return `Richiesta non accettata da Anthropic: ${err.message ?? ''}`.trim()
  if (typeof err?.status === 'number') return `Errore di Anthropic (${err.status}). Riprova.`
  if (err?.name?.startsWith('APIConnection')) return 'Non riesco a contattare Anthropic: controlla la connessione.'
  return "Qualcosa è andato storto con l'IA. Riprova."
}

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })

interface AskOptions {
  model: string
  system: string
  user: string
  schema: Record<string, unknown>
  maxTokens?: number
}

/** Chiede a Claude una risposta JSON che rispetta lo schema. La chiave resta sul dispositivo. */
async function askJson<T>({ model, system, user, schema, maxTokens = 8000 }: AskOptions): Promise<T> {
  const key = getAiKey()
  if (!key) throw new AiError('Inserisci la chiave Anthropic in Impostazioni.')
  // l'SDK pesa parecchio: si scarica solo quando serve davvero l'IA
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true })
  const res = await client.beta.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    // se il modello rifiuta per motivi di sicurezza, l'API riprova da sola su un modello di riserva (non disponibile per Haiku)
    ...(model === 'claude-haiku-5-5' ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
  })
  if (res.stop_reason === 'refusal') throw new AiError('Il modello ha rifiutato la richiesta. Prova a riformularla.')
  if (res.stop_reason === 'max_tokens') throw new AiError('La risposta è stata troncata. Riprova con una richiesta più semplice.')
  const text = res.content.find((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')?.text
  if (!text) throw new AiError('Risposta vuota dal modello. Riprova.')
  try {
    return JSON.parse(text) as T
  } catch {
    throw new AiError('Risposta non leggibile dal modello. Riprova.')
  }
}

// ---------------------------------------------------------------- frase libera → filtri

export interface NlQuery {
  summary: string
  /** parole chiave in italiano (temi, ambientazione) da cercare nelle trame */
  keywords: string[]
  kinds: Kind[]
  moods: Mood[]
  genres: string[]
  genreMode: 'all' | 'any'
  maxFilmMinutes: number | null
  maxEpisodeMinutes: number | null
  yearFrom: number | null
  yearTo: number | null
  language: string | null
  country: string | null
  minRating: number | null
  status: 'ended' | 'ongoing' | null
  gentle: boolean
  hideSeen: boolean
  onlyMine: boolean
  monetization: 'any' | 'flatrate' | 'rent' | 'buy'
  actor: string | null
  director: string | null
  company: 'solo' | 'couple' | 'friends' | 'family' | null
}

const NL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary', 'keywords', 'kinds', 'moods', 'genres', 'genreMode', 'maxFilmMinutes', 'maxEpisodeMinutes', 'yearFrom', 'yearTo',
    'language', 'country', 'minRating', 'status', 'gentle', 'hideSeen', 'onlyMine', 'monetization', 'actor', 'director', 'company',
  ],
  properties: {
    summary: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
    kinds: { type: 'array', items: { type: 'string', enum: ['film', 'series', 'miniseries', 'doc', 'animation'] } },
    moods: { type: 'array', items: { type: 'string', enum: ['light', 'cozy', 'intense', 'mystery', 'fun', 'adventure'] } },
    genres: { type: 'array', items: { type: 'string' } },
    genreMode: { type: 'string', enum: ['all', 'any'] },
    maxFilmMinutes: nullable({ type: 'number' }),
    maxEpisodeMinutes: nullable({ type: 'number' }),
    yearFrom: nullable({ type: 'number' }),
    yearTo: nullable({ type: 'number' }),
    language: nullable({ type: 'string' }),
    country: nullable({ type: 'string' }),
    minRating: nullable({ type: 'number' }),
    status: nullable({ type: 'string', enum: ['ended', 'ongoing'] }),
    gentle: { type: 'boolean' },
    hideSeen: { type: 'boolean' },
    onlyMine: { type: 'boolean' },
    monetization: { type: 'string', enum: ['any', 'flatrate', 'rent', 'buy'] },
    actor: nullable({ type: 'string' }),
    director: nullable({ type: 'string' }),
    company: nullable({ type: 'string', enum: ['solo', 'couple', 'friends', 'family'] }),
  },
}

function nlSystem(genres: GenreEntry[]): string {
  const year = new Date().getFullYear()
  return `Sei il motore di ricerca di un'app italiana per scegliere film e serie TV. Trasformi la richiesta dell'utente in filtri strutturati.

Regole:
- Imposta solo ciò che l'utente ha espresso o implicato chiaramente. Il resto resta vuoto, null, false o "any".
- kinds: film, series (serie TV), miniseries, doc (documentari), animation. Se non specificato, lascia l'elenco vuoto.
- moods: light (leggero), cozy (rassicurante), intense (intenso, drammatico), mystery (misterioso), fun (divertente), adventure (avventuroso).
- genres: usa SOLO nomi di questo elenco, scritti esattamente così: ${genres.map((g) => g.name).join(', ')}. Usa genreMode "all" quando i generi devono valere insieme ("thriller psicologico"), "any" quando basta uno.
- maxFilmMinutes: durata massima di un film in minuti ("sotto le due ore" = 120). maxEpisodeMinutes: durata massima di un episodio ("episodi brevi" = 35).
- yearFrom / yearTo: anni (l'anno corrente è ${year}; "recente" = ultimi 5 anni; "anni 90" = 1990-1999).
- language: codice ISO 639-1 della lingua originale (es. "ko"). country: codice ISO 3166-1 del paese di produzione (es. "KR", "IT").
- minRating: voto minimo da 0 a 10 solo se chiede qualità alta ("bellissimo", "ben fatto" = 7.5).
- status: "ended" per serie concluse, "ongoing" per serie ancora in corso.
- gentle: true per "poco violento", "senza violenza", "per tutta la famiglia".
- hideSeen: true se esclude i già visti. onlyMine: true se parla dei propri abbonamenti o di piattaforme che ha. monetization: "rent" se parla di noleggio, "buy" di acquisto, "flatrate" se vuole solo ciò che è incluso nell'abbonamento.
- actor / director: solo nomi propri indicati dall'utente.
- company: con chi guarda (solo, couple, friends, family) se lo dice.
- keywords: da 2 a 5 parole chiave in italiano (temi, ambientazione, tipo di personaggi) utili a cercare nelle trame; lascia vuoto se la richiesta è solo di filtri.
- summary: una frase in italiano, breve, che riassume come hai capito la richiesta.
Non inventare filtri non richiesti.`
}

export async function parseQuery(phrase: string, genres: GenreEntry[], model: string): Promise<NlQuery> {
  return askJson<NlQuery>({ model, system: nlSystem(genres), user: phrase, schema: NL_SCHEMA, maxTokens: 6000 })
}

export interface NlApplied {
  query: Query
  summary: string
  notes: string[]
  keywords: string[]
}

/** Traduce la risposta del modello in una Query dell'app, risolvendo nomi di persone e generi. */
export async function nlToQuery(nl: NlQuery, genres: GenreEntry[], mine: number[]): Promise<NlApplied> {
  const q: Query = { ...tmdb.emptyQuery, moods: [], genres: [], providers: [] }
  const notes: string[] = []
  // i valori enumerati possono tornare con maiuscole diverse: si normalizza e si scartano quelli sconosciuti
  const lc = (v: string) => v.toLowerCase()
  const kinds = nl.kinds.map(lc).filter((k): k is Kind => ['film', 'series', 'miniseries', 'doc', 'animation'].includes(k))
  if (kinds.length) q.kinds = kinds
  const moods = nl.moods.map(lc).filter((m): m is Mood => tmdb.MOODS.some((x) => x.id === m))
  const wanted = nl.genres
    .map((n) => genres.find((g) => g.name.toLowerCase() === n.toLowerCase())?.name)
    .filter((x): x is string => !!x)
  q.genres = [...new Set(wanted)]
  // con generi espliciti l'umore non cambierebbe nulla: si evita il filtro doppio
  q.moods = q.genres.length ? [] : moods
  q.genreMode = lc(nl.genreMode) === 'any' ? 'any' : 'all'
  if (nl.maxFilmMinutes) q.maxRuntime = Math.round(nl.maxFilmMinutes)
  if (nl.maxEpisodeMinutes) q.maxEpisode = Math.round(nl.maxEpisodeMinutes)
  if (nl.yearFrom) q.yearFrom = String(Math.round(nl.yearFrom))
  if (nl.yearTo) q.yearTo = String(Math.round(nl.yearTo))
  if (nl.language) q.lang = nl.language.toLowerCase()
  if (nl.country) q.country = nl.country.toUpperCase()
  if (nl.minRating) q.minTmdb = Math.min(9, Math.round(nl.minRating * 10) / 10)
  if (nl.status) q.status = lc(nl.status) === 'ongoing' ? 'ongoing' : 'ended'
  q.gentle = nl.gentle
  q.hideSeen = nl.hideSeen
  q.monetization = (['any', 'flatrate', 'rent', 'buy'].includes(lc(nl.monetization)) ? lc(nl.monetization) : 'any') as Query['monetization']
  if (nl.onlyMine) {
    if (mine.length) q.onlyMine = true
    else notes.push('Hai chiesto i tuoi abbonamenti, ma non ne hai ancora indicati: li imposti in Impostazioni.')
  }
  if (nl.actor) {
    const [p] = await tmdb.searchPerson(nl.actor).catch(() => [])
    if (p) q.actor = p
    else notes.push(`Non ho trovato l'attore «${nl.actor}».`)
  }
  if (nl.director) {
    const [p] = await tmdb.searchPerson(nl.director).catch(() => [])
    if (p) q.director = p
    else notes.push(`Non ho trovato il regista «${nl.director}».`)
  }
  if (nl.genres.length > wanted.length) notes.push('Qualche genere non l\'ho riconosciuto e l\'ho ignorato.')
  if (q.director && !q.kinds.includes('film')) notes.push('Il filtro regista vale solo per i film.')
  return { query: q, summary: nl.summary, notes, keywords: (nl.keywords ?? []).filter((k) => k.trim()).slice(0, 6) }
}

/** Dalla frase ai filtri pronti per Esplora, in un solo passaggio. */
export async function nlSearch(phrase: string, model: string, mine: number[]): Promise<NlApplied> {
  const genres = await tmdb.genreList()
  const parsed = await parseQuery(phrase, genres, model)
  return nlToQuery(parsed, genres, mine)
}

// ---------------------------------------------------------------- scheda senza spoiler

export interface Blurb {
  atmosphere: string
  pace: string
  effort: string
  likeIf: string
  mightPutOff: string
  forYou: string
}

const BLURB_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['atmosphere', 'pace', 'effort', 'likeIf', 'mightPutOff', 'forYou'],
  properties: {
    atmosphere: { type: 'string' },
    pace: { type: 'string' },
    effort: { type: 'string' },
    likeIf: { type: 'string' },
    mightPutOff: { type: 'string' },
    forYou: { type: 'string' },
  },
}

const BLURB_SYSTEM = `Sei una guida di visione per un'app italiana. Scrivi una scheda breve e utile per decidere se guardare un titolo stasera.

Regole ferree:
- NIENTE SPOILER: non rivelare colpi di scena, morti, identità nascoste, come finisce, né eventi oltre le premesse della trama fornita.
- Non inventare. Usa i dati forniti e ciò che sai con certezza del titolo. Se non lo conosci abbastanza, scrivilo ("Non ho abbastanza informazioni su…") e limitati ai dati: meglio una scheda onesta e corta che una sbagliata.
- Frasi brevi e concrete, in italiano, una per campo (massimo 25 parole ciascuna).
Campi:
- atmosphere: il tono e l'atmosfera.
- pace: il ritmo (lento, regolare, serrato) e come si sviluppa, senza spoiler.
- effort: quanto impegno richiede (attenzione, durata, pesantezza emotiva).
- likeIf: completa la frase «Potrebbe piacerti se…» scrivendo SOLO il seguito (es. «ami i thriller psicologici»), senza ripetere l'inizio.
- mightPutOff: completa la frase «Potrebbe frenarti se…» scrivendo SOLO il seguito, senza ripetere l'inizio.
- forYou: perché potrebbe fare al caso di QUESTA persona, usando il profilo di gusto fornito; se il profilo è vuoto, scrivi una frase neutra sul tipo di spettatore adatto.`

function blurbUser(t: Title, d: Detail | undefined, taste: string, genreNames: string[]): string {
  const facts = [
    `Titolo: ${t.title}${t.year ? ` (${t.year})` : ''}`,
    `Tipo: ${t.type === 'movie' ? 'film' : 'serie TV'}`,
    genreNames.length ? `Generi: ${genreNames.join(', ')}` : '',
    d?.runtimeMin ? `Durata: ${d.runtimeMin} minuti` : '',
    d?.seasons ? `Stagioni: ${d.seasons}${d.episodes ? `, episodi: ${d.episodes}` : ''}${d.episodeRuntime ? `, circa ${d.episodeRuntime} min a episodio` : ''}` : '',
    d?.status ? `Stato: ${d.status}` : '',
    d?.certification ? `Classificazione: ${d.certification}` : '',
    d?.cast?.length ? `Cast principale: ${d.cast.slice(0, 5).map((c) => c.name).join(', ')}` : '',
    t.rating ? `Voto TMDB: ${t.rating}` : '',
    t.overview ? `Trama (premessa): ${t.overview}` : '',
    `Profilo di gusto della persona: ${taste || 'nessun dato ancora'}`,
  ]
  return facts.filter(Boolean).join('\n')
}

const BLURB_KEY = 'blurbs_v1'
type BlurbCache = Record<string, { at: number; model: string; data: Blurb }>

function readBlurbs(): BlurbCache {
  try {
    return JSON.parse(localStorage.getItem(BLURB_KEY) ?? '{}')
  } catch {
    return {}
  }
}

/** Toglie l'inizio «Potrebbe piacerti/frenarti se» se il modello lo ripete: l'etichetta lo dice già. */
export const stripLead = (s: string) => {
  const t = s.replace(/^\s*potrebbe\s+(piacerti|frenarti)\s+se\s*/i, '').trim()
  return t ? t[0].toUpperCase() + t.slice(1) : s
}

export const cachedBlurb = (t: Pick<Title, 'type' | 'id'>): Blurb | undefined => readBlurbs()[`${t.type}:${t.id}`]?.data

export async function makeBlurb(t: Title, d: Detail | undefined, taste: string, genres: GenreEntry[], model: string): Promise<Blurb> {
  const names = (t.genreIds ?? []).map((id) => tmdb.genreName(genres, id)).filter((x): x is string => !!x)
  const data = await askJson<Blurb>({ model, system: BLURB_SYSTEM, user: blurbUser(t, d, taste, names), schema: BLURB_SCHEMA, maxTokens: 6000 })
  try {
    const all = readBlurbs()
    all[`${t.type}:${t.id}`] = { at: Date.now(), model, data }
    // si tengono le ultime 150 schede per non riempire il browser
    const keep = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, 150)
    localStorage.setItem(BLURB_KEY, JSON.stringify(Object.fromEntries(keep)))
  } catch {
    // storage pieno: la scheda resta comunque visibile
  }
  return data
}
