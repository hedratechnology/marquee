import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Title } from './tmdb'
import { keyOf } from './store'

export type Tag = 'light' | 'together' | 'time'
export type Reaction = 'slow' | 'characters' | 'ending' | 'more' | 'violent' | 'atmosphere'

export const TAGS: { id: Tag; label: string }[] = [
  { id: 'light', label: 'Serata leggera' },
  { id: 'together', label: 'Da vedere insieme' },
  { id: 'time', label: 'Quando ho più tempo' },
]

export const REACTIONS: { id: Reaction; label: string; positive: boolean }[] = [
  { id: 'more', label: 'Ne voglio altri così', positive: true },
  { id: 'characters', label: 'Bei personaggi', positive: true },
  { id: 'atmosphere', label: 'Ottima atmosfera', positive: true },
  { id: 'slow', label: 'Troppo lento', positive: false },
  { id: 'ending', label: 'Finale deludente', positive: false },
  { id: 'violent', label: 'Troppo violento', positive: false },
]

export interface ReactionEntry {
  at: number
  title: string
  type: Title['type']
  id: number
  genreIds: number[]
  reactions: Reaction[]
}

export interface Prefs {
  providers: number[]
  /** usa i miei abbonamenti in "Scegli per me" e nei consigli */
  useMine: boolean
  aiModel: string
}

export const DEFAULT_PREFS: Prefs = { providers: [], useMine: true, aiModel: 'claude-opus-5-5' }

export interface PersonalSnapshot {
  tags: Record<string, Tag[]>
  reactions: Record<string, ReactionEntry>
  snoozed: Record<string, number>
  prefs: Prefs
}

interface PersonalApi extends PersonalSnapshot {
  toggleTag: (t: Title, tag: Tag) => void
  tagsOf: (t: Title) => Tag[]
  toggleReaction: (t: Title, r: Reaction) => void
  reactionsOf: (t: Title) => Reaction[]
  snooze: (t: Title, days?: number) => void
  isSnoozed: (t: Title) => boolean
  setPrefs: (p: Partial<Prefs>) => void
  restore: (s: Partial<PersonalSnapshot>) => void
}

const Ctx = createContext<PersonalApi | null>(null)

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? { ...(Array.isArray(fallback) ? [] : {}), ...JSON.parse(v) } : fallback
  } catch {
    return fallback
  }
}

export function PersonalProvider({ children }: { children: ReactNode }) {
  const [tags, setTags] = useState<Record<string, Tag[]>>(() => read('tags_v1', {}))
  const [reactions, setReactions] = useState<Record<string, ReactionEntry>>(() => read('reactions_v1', {}))
  const [snoozed, setSnoozed] = useState<Record<string, number>>(() => read('snoozed_v1', {}))
  const [prefs, setPrefsState] = useState<Prefs>(() => ({ ...DEFAULT_PREFS, ...read('prefs_v1', {}) }))

  useEffect(() => localStorage.setItem('tags_v1', JSON.stringify(tags)), [tags])
  useEffect(() => localStorage.setItem('reactions_v1', JSON.stringify(reactions)), [reactions])
  useEffect(() => localStorage.setItem('snoozed_v1', JSON.stringify(snoozed)), [snoozed])
  useEffect(() => localStorage.setItem('prefs_v1', JSON.stringify(prefs)), [prefs])

  const toggleTag = useCallback((t: Title, tag: Tag) => {
    setTags((cur) => {
      const k = keyOf(t)
      const list = cur[k] ?? []
      const next = list.includes(tag) ? list.filter((x) => x !== tag) : [...list, tag]
      const out = { ...cur }
      if (next.length) out[k] = next
      else delete out[k]
      return out
    })
  }, [])

  const toggleReaction = useCallback((t: Title, r: Reaction) => {
    setReactions((cur) => {
      const k = keyOf(t)
      const prev = cur[k]
      const list = prev?.reactions ?? []
      const next = list.includes(r) ? list.filter((x) => x !== r) : [...list, r]
      const out = { ...cur }
      if (next.length) out[k] = { at: Date.now(), title: t.title, type: t.type, id: t.id, genreIds: t.genreIds ?? [], reactions: next }
      else delete out[k]
      return out
    })
  }, [])

  const snooze = useCallback((t: Title, days = 3) => {
    setSnoozed((cur) => ({ ...cur, [keyOf(t)]: Date.now() + days * 86400000 }))
  }, [])

  const setPrefs = useCallback((p: Partial<Prefs>) => setPrefsState((cur) => ({ ...cur, ...p })), [])

  const restore = useCallback((s: Partial<PersonalSnapshot>) => {
    if (s.tags) setTags(s.tags)
    if (s.reactions) setReactions(s.reactions)
    if (s.snoozed) setSnoozed(s.snoozed)
    if (s.prefs) setPrefsState({ ...DEFAULT_PREFS, ...s.prefs })
  }, [])

  const api = useMemo<PersonalApi>(
    () => ({
      tags, reactions, snoozed, prefs,
      toggleTag,
      tagsOf: (t) => tags[keyOf(t)] ?? [],
      toggleReaction,
      reactionsOf: (t) => reactions[keyOf(t)]?.reactions ?? [],
      snooze,
      isSnoozed: (t) => (snoozed[keyOf(t)] ?? 0) > Date.now(),
      setPrefs,
      restore,
    }),
    [tags, reactions, snoozed, prefs, toggleTag, toggleReaction, snooze, setPrefs, restore],
  )

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function usePersonal(): PersonalApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('PersonalProvider mancante')
  return v
}
