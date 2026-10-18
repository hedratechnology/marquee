import { useEffect } from 'react'
import type { ReactNode } from 'react'
import * as tmdb from '../tmdb'
import type { Title } from '../tmdb'
import { requestRatings, useRatings } from '../omdb'
import type { Ratings } from '../omdb'
import { Icon } from './icons'
import { useLists, useOpen } from './ctx'

export const num = (n: number) => String(n).replace('.', ',')

export function scoreChips(t: Title, r: Ratings | undefined, enabled: boolean): string[] {
  const list: string[] = []
  if (r?.imdb !== undefined) list.push(`IMDb ${num(r.imdb)}`)
  if (r?.rt !== undefined) list.push(`RT ${r.rt}%`)
  if (r?.meta !== undefined) list.push(`MC ${r.meta}`)
  if (!list.length && (!enabled || r) && t.rating > 0) list.push(`TMDB ${num(t.rating)}`)
  return list
}

interface CardProps {
  t?: Title
  name: string
  sub: string
  tag?: string
  tagTone?: 'red' | 'gold'
  rank?: number
  scores?: string[]
  topScore?: string
}

export function PosterCard({ t, name, sub, tag, tagTone = 'red', rank, scores, topScore }: CardProps) {
  const R = useRatings()
  const { has, toggle } = useLists()
  const open = useOpen()
  const fav = t ? has('favorites', t) : false
  const watch = t ? has('watchlist', t) : false
  const go = () => t && open(t)
  const chips = scores ?? (t ? scoreChips(t, R.get(t), R.enabled) : [])
  return (
    <div className="card">
      <div className="poster">
        <button className="open" onClick={go} aria-label={`Apri ${name}`}>
          {t?.poster ? <img loading="lazy" src={`${tmdb.IMG}/w342${t.poster}`} alt="" /> : <div className="noimg">{name}</div>}
        </button>
        {rank !== undefined && <span className="rank">{rank}</span>}
        {tag && <span className={'tag ' + (tagTone === 'gold' ? 'gold' : '')}>{tag}</span>}
        <div className="qa">
          <button className={fav ? 'on' : ''} disabled={!t} aria-pressed={fav} aria-label={fav ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'} onClick={() => t && toggle('favorites', t)}>
            <Icon name="star" size={16} fill={fav} />
          </button>
          <button className={watch ? 'on' : ''} disabled={!t} aria-pressed={watch} aria-label={watch ? 'Togli da Da vedere' : 'Aggiungi a Da vedere'} onClick={() => t && toggle('watchlist', t)}>
            <Icon name="bookmark" size={16} fill={watch} />
          </button>
        </div>
        {(chips.length > 0 || topScore) && (
          <div className="score">
            {topScore && <span className="top">{topScore}</span>}
            {chips.map((c) => <span key={c}>{c}</span>)}
          </div>
        )}
      </div>
      <button className="meta" onClick={go}>
        <b>{name}</b>
        <span>{sub}</span>
      </button>
    </div>
  )
}

export function TitleGrid({ items, empty }: { items: Title[]; empty?: ReactNode }) {
  useEffect(() => requestRatings(items), [items])
  if (!items.length) return <>{empty ?? <p className="muted">Nessun risultato.</p>}</>
  return (
    <div className="grid">
      {items.map((t) => (
        <PosterCard key={t.type + t.id} t={t} name={t.title} sub={`${t.year} · ${t.type === 'movie' ? 'Film' : 'Serie'}`} />
      ))}
    </div>
  )
}

export function Rail({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rail-wrap">
      <div className="rail-head">
        <h2 className="sec">{title}</h2>
        {action}
      </div>
      <div className="rail">{children}</div>
    </section>
  )
}

export function TitleRail({ title, items, action }: { title: string; items: Title[]; action?: ReactNode }) {
  useEffect(() => requestRatings(items), [items])
  if (!items.length) return null
  return (
    <Rail title={title} action={action}>
      {items.map((t) => (
        <PosterCard key={t.type + t.id} t={t} name={t.title} sub={`${t.year} · ${t.type === 'movie' ? 'Film' : 'Serie'}`} />
      ))}
    </Rail>
  )
}

export function SkeletonGrid({ n = 12 }: { n?: number }) {
  return (
    <div className="grid" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => <div key={i} className="skel" />)}
    </div>
  )
}

export function Sheet({ title, onClose, children, drawer, className = '' }: {
  title?: string; onClose: () => void; children: ReactNode; drawer?: boolean; className?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
  return (
    <div className={'overlay' + (drawer ? ' drawer' : '')} onClick={onClose}>
      <div className={'panel ' + className} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="panel-head">
            <h2>{title}</h2>
            <button className="iconbtn" onClick={onClose} aria-label="Chiudi"><Icon name="x" /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export function Chip({ on, children, onClick }: { on?: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button className={'chip' + (on ? ' on' : '')} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  )
}

export function Range({ label, value, min, max, step, suffix = '', onChange }: {
  label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (v: number) => void
}) {
  const p = ((value - min) / (max - min)) * 100
  return (
    <label className="rng">
      <span className="k">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} style={{ ['--p' as string]: `${p}%` }} onChange={(e) => onChange(+e.target.value)} />
      <span className="v">{value ? num(value) + suffix : 'Tutti'}</span>
    </label>
  )
}

export function Empty({ icon = 'film', title, text, action }: { icon?: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="art"><Icon name={icon} size={64} /></div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  )
}

export function Option<T extends string>({ value, current, onPick, title, hint }: {
  value: T; current: T | undefined; onPick: (v: T) => void; title: string; hint?: string
}) {
  return (
    <button className={'opt' + (current === value ? ' on' : '')} aria-pressed={current === value} onClick={() => onPick(value)}>
      <b>{title}</b>
      {hint && <span>{hint}</span>}
    </button>
  )
}
