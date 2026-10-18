import { useCallback, useEffect, useState } from 'react'

export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'x' | 'other'

export interface Source {
  id: string
  url: string
  name: string
}

export interface Profile {
  id: string
  url: string
  name: string
  platform: Platform
}

export const SUGGESTED_SOURCES: { name: string; url: string }[] = [
  { name: 'MYmovies', url: 'https://www.mymovies.it' },
  { name: 'Rivista del Cinematografo', url: 'https://www.cinematografo.it' },
  { name: 'Sentieri Selvaggi', url: 'https://www.sentieriselvaggi.it' },
  { name: 'Film TV', url: 'https://www.filmtv.it' },
  { name: 'Il Post', url: 'https://www.ilpost.it' },
  { name: 'Metacritic', url: 'https://www.metacritic.com' },
  { name: 'Rotten Tomatoes', url: 'https://www.rottentomatoes.com' },
  { name: 'Letterboxd', url: 'https://letterboxd.com' },
  { name: 'Criterion', url: 'https://www.criterion.com' },
  { name: 'MUBI', url: 'https://mubi.com' },
  { name: 'Roger Ebert', url: 'https://www.rogerebert.com' },
]

/** Accetta un link o un @nome (che vale come profilo Instagram). Restituisce null se non valido. */
export function parseLink(input: string): URL | null {
  let v = input.trim()
  if (!v) return null
  if (v.startsWith('@')) v = `https://www.instagram.com/${v.slice(1)}`
  else if (!/^https?:\/\//i.test(v)) v = `https://${v}`
  try {
    const u = new URL(v)
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return null
    return u
  } catch {
    return null
  }
}

export function detectPlatform(u: URL): Platform {
  const h = u.hostname.replace(/^www\./, '')
  if (h.endsWith('instagram.com')) return 'instagram'
  if (h.endsWith('tiktok.com')) return 'tiktok'
  if (h.endsWith('youtube.com') || h === 'youtu.be') return 'youtube'
  if (h === 'x.com' || h.endsWith('twitter.com')) return 'x'
  return 'other'
}

export function profileName(u: URL): string {
  const seg = u.pathname.split('/').filter(Boolean)[0] ?? ''
  const handle = seg.replace(/^@/, '')
  return handle ? `@${handle}` : u.hostname.replace(/^www\./, '')
}

export const sourceName = (u: URL) => u.hostname.replace(/^www\./, '')

const SOURCES_KEY = 'sources_v1'
const PROFILES_KEY = 'profiles_v1'

function read<T>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function useSources() {
  const [sources, setSources] = useState<Source[]>(() => read<Source>(SOURCES_KEY))
  const [profiles, setProfiles] = useState<Profile[]>(() => read<Profile>(PROFILES_KEY))

  useEffect(() => {
    localStorage.setItem(SOURCES_KEY, JSON.stringify(sources))
  }, [sources])
  useEffect(() => {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
  }, [profiles])

  /** Ritorna un messaggio di errore, oppure null se aggiunto. */
  const addSource = useCallback(
    (input: string, label?: string): string | null => {
      const u = parseLink(input)
      if (!u) return 'Link non valido. Esempio: https://www.mymovies.it'
      const url = u.origin + (u.pathname === '/' ? '' : u.pathname)
      if (sources.some((s) => s.url === url)) return 'Questa fonte è già nell\'elenco.'
      setSources((cur) => [...cur, { id: `s-${Date.now()}`, url, name: label?.trim() || sourceName(u) }])
      return null
    },
    [sources],
  )

  const addProfile = useCallback(
    (input: string): string | null => {
      const u = parseLink(input)
      if (!u) return 'Link non valido. Esempio: https://www.instagram.com/nomeprofilo oppure @nomeprofilo'
      const url = u.origin + u.pathname.replace(/\/$/, '')
      if (profiles.some((p) => p.url === url)) return 'Questo profilo è già nell\'elenco.'
      setProfiles((cur) => [...cur, { id: `p-${Date.now()}`, url, name: profileName(u), platform: detectPlatform(u) }])
      return null
    },
    [profiles],
  )

  const removeSource = useCallback((id: string) => setSources((c) => c.filter((s) => s.id !== id)), [])
  const removeProfile = useCallback((id: string) => setProfiles((c) => c.filter((p) => p.id !== id)), [])
  const replace = useCallback((s?: Source[], p?: Profile[]) => {
    if (Array.isArray(s)) setSources(s)
    if (Array.isArray(p)) setProfiles(p)
  }, [])

  return { sources, profiles, addSource, addProfile, removeSource, removeProfile, replace }
}
