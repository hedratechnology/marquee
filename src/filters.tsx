import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import * as tmdb from './tmdb'
import type { Query } from './tmdb'
import { usePersonal } from './personal'
import type { Prefs } from './personal'
import { activeChips } from './ui/helpers'
import type { ActiveChip } from './ui/helpers'

/** I filtri di partenza: dalle preferenze salvate in Impostazioni (abbonamenti, lingua, disponibilità in Italia). */
export function baseQuery(prefs: Prefs): Query {
  return {
    ...tmdb.emptyQuery,
    providers: prefs.useMine ? prefs.providers : [],
    onlyItaly: prefs.onlyItaly,
    lang: prefs.lang || undefined,
  }
}

const norm = (q: Query) => JSON.stringify({ ...q, providers: [...q.providers].sort(), kinds: [...q.kinds].sort() })
const sameList = (a: number[], b: number[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())

export interface FilterApi {
  q: Query
  base: Query
  /** cambia alcuni filtri (e stacca la ricerca salvata, se c'era) */
  set: (patch: Partial<Query>) => void
  /** sostituisce tutti i filtri (ricerca salvata, frase dell'IA, scorciatoie) */
  setQuery: (q: Query, note?: string, viewId?: string | null) => void
  reset: () => void
  open: boolean
  setOpen: (v: boolean) => void
  toggleOpen: () => void
  viewId: string | null
  note: string
  chips: ActiveChip[]
  isFiltered: boolean
  /** quanti titoli mostra la pagina corrente (null = non applicabile) */
  stats: { count: number | null; loading: boolean }
  report: (count: number | null, loading?: boolean) => void
}

const Ctx = createContext<FilterApi | null>(null)

export function FilterProvider({ children }: { children: ReactNode }) {
  const { prefs } = usePersonal()
  const base = useMemo(() => baseQuery(prefs), [prefs])
  const [q, setQ] = useState<Query>(base)
  const [open, setOpen] = useState(false)
  const [viewId, setViewId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [stats, setStats] = useState<{ count: number | null; loading: boolean }>({ count: null, loading: false })
  const lastBase = useRef(base)

  // se cambi abbonamenti, lingua o disponibilità in Impostazioni, i filtri non ancora toccati si aggiornano
  useEffect(() => {
    const old = lastBase.current
    setQ((c) => ({
      ...c,
      providers: sameList(c.providers, old.providers) ? base.providers : c.providers,
      onlyItaly: c.onlyItaly === old.onlyItaly ? base.onlyItaly : c.onlyItaly,
      lang: c.lang === old.lang ? base.lang : c.lang,
    }))
    lastBase.current = base
  }, [base])

  const set = useCallback((patch: Partial<Query>) => {
    setViewId(null)
    setQ((c) => ({ ...c, ...patch }))
  }, [])
  const setQuery = useCallback((query: Query, info = '', view: string | null = null) => {
    setQ(query)
    setNote(info)
    setViewId(view)
  }, [])
  const reset = useCallback(() => {
    setQ(base)
    setNote('')
    setViewId(null)
  }, [base])
  const toggleOpen = useCallback(() => setOpen((o) => !o), [])
  const report = useCallback((count: number | null, loading = false) => {
    setStats((s) => (s.count === count && s.loading === loading ? s : { count, loading }))
  }, [])

  const chips = useMemo(() => activeChips(q, base), [q, base])
  const isFiltered = useMemo(() => norm(q) !== norm(base), [q, base])

  const api = useMemo<FilterApi>(
    () => ({ q, base, set, setQuery, reset, open, setOpen, toggleOpen, viewId, note, chips, isFiltered, stats, report }),
    [q, base, set, setQuery, reset, open, toggleOpen, viewId, note, chips, isFiltered, stats, report],
  )
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useFilters(): FilterApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('FilterProvider mancante')
  return v
}

/** Una pagina dichiara quanti titoli mostra, per il contatore della barra filtri. */
export function useReportCount(count: number | null, loading: boolean, active: boolean) {
  const { report } = useFilters()
  useEffect(() => {
    if (active) report(count, loading)
  }, [active, count, loading, report])
}
