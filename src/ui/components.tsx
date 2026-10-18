import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import * as tmdb from '../tmdb'
import type { Title } from '../tmdb'
import { requestRatings, useRatings } from '../omdb'
import type { Ratings } from '../omdb'
import { Icon } from './icons'
import { quickLine } from '../decide'
import { useLists, useOpen } from './ctx'

export const num = (n: number) => String(n).replace('.', ',')

/** Spiegazione breve di un punteggio, mostrata al passaggio del mouse. */
export function scoreTip(label: string): string {
  if (label.startsWith('IMDb')) return 'Voto del pubblico su IMDb, da 0 a 10'
  if (label.startsWith('RT')) return 'Rotten Tomatoes: percentuale di critici favorevoli'
  if (label.startsWith('MC')) return 'Metacritic: media dei voti della critica, da 0 a 100'
  if (label.startsWith('TMDB')) return 'Voto del pubblico su TMDB, da 0 a 10'
  return label
}

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
  const ref = useRef<HTMLDivElement>(null)
  const [facts, setFacts] = useState<tmdb.Facts | null>(null)
  const fav = t ? has('favorites', t) : false
  const watch = t ? has('watchlist', t) : false
  const go = () => t && open(t)

  // voti e dati rapidi (durata, stagioni) si cercano solo per le schede che compaiono sullo schermo
  useEffect(() => {
    const el = ref.current
    if (!el || !t) return
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        if (!scores) requestRatings([t], true)
        tmdb.titleFacts(t.type, t.id).then(setFacts)
        obs.disconnect()
      }
    }, { rootMargin: '200px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [t, scores])

  const r = t ? R.get(t) : undefined
  const votes = scores ?? (t ? scoreChips(t, r, R.enabled) : [])
  const loadingVotes = !scores && !!t && R.enabled && !r && votes.length === 0

  return (
    <div className="card" ref={ref}>
      <div className="poster">
        <button className="open" onClick={go} aria-label={`Apri ${name}`}>
          {t?.poster ? <img loading="lazy" src={`${tmdb.IMG}/w342${t.poster}`} alt="" /> : <div className="noimg">{name}</div>}
        </button>
        {rank !== undefined && <span className="rank">{rank}</span>}
        {tag && <span className={'tag ' + (tagTone === 'gold' ? 'gold' : '')} data-tip="Quando esce dal catalogo della piattaforma">{tag}</span>}
        <div className="qa">
          <button className={fav ? 'on' : ''} disabled={!t} aria-pressed={fav} aria-label={fav ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'} data-tip={fav ? 'Nei preferiti: tocca per togliere' : 'Aggiungi ai preferiti'} onClick={() => t && toggle('favorites', t)}>
            <Icon name="star" size={16} fill={fav} />
          </button>
          <button className={watch ? 'on' : ''} disabled={!t} aria-pressed={watch} aria-label={watch ? 'Togli da Da vedere' : 'Aggiungi a Da vedere'} data-tip={watch ? 'In «Da vedere»: tocca per togliere' : 'Aggiungi a «Da vedere»'} onClick={() => t && toggle('watchlist', t)}>
            <Icon name="bookmark" size={16} fill={watch} />
          </button>
        </div>
        {topScore && (
          <div className="score">
            <span className="top" data-tip="Punteggio Marquee da 0 a 100: critica, pubblico e premi">{topScore}</span>
          </div>
        )}
      </div>
      <button className="meta" onClick={go}>
        <b>{name}</b>
        <span>{sub}</span>
        {t && facts && quickLine({ type: t.type, genreIds: t.genreIds ?? [], ...facts }) && (
          <span className="qline">{quickLine({ type: t.type, genreIds: t.genreIds ?? [], ...facts })}</span>
        )}
        {(votes.length > 0 || loadingVotes) && (
          <span className="votes">
            {votes.map((c, i) => (
              <span key={c} data-tip={scoreTip(c)}>{i > 0 && <i aria-hidden="true"> · </i>}{c}</span>
            ))}
            {loadingVotes && <span className="faint">Voti…</span>}
          </span>
        )}
      </button>
    </div>
  )
}

export function TitleGrid({ items, empty }: { items: Title[]; empty?: ReactNode }) {
  if (!items.length) return <>{empty ?? <p className="muted">Nessun risultato.</p>}</>
  return (
    <div className="grid">
      {items.map((t) => (
        <PosterCard key={t.type + t.id} t={t} name={t.title} sub={t.note ?? `${t.year} · ${t.type === 'movie' ? 'Film' : 'Serie'}`} />
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

export function Sheet({ title, onClose, children, drawer, className = '', foot }: {
  title?: string; onClose: () => void; children: ReactNode; drawer?: boolean; className?: string; foot?: ReactNode
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
      <div className={'panel ' + className + (foot ? ' has-foot' : '')} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="panel-head">
            <h2>{title}</h2>
            <button className="iconbtn" onClick={onClose} aria-label="Chiudi" data-tip="Chiudi"><Icon name="x" /></button>
          </div>
        )}
        {foot ? (
          <>
            <div className="panel-body">{children}</div>
            <div className="panel-foot">{foot}</div>
          </>
        ) : (
          children
        )}
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

export function Range({ label, value, min, max, step, suffix = '', color, empty = 'Tutti', onChange }: {
  label: string; value: number; min: number; max: number; step: number; suffix?: string; color?: string; empty?: string; onChange: (v: number) => void
}) {
  const p = ((value - min) / (max - min)) * 100
  return (
    <label className="rng">
      <span className="k">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} style={{ ['--p' as string]: `${p}%`, ...(color ? { ['--rc' as string]: color } : {}) }} onChange={(e) => onChange(+e.target.value)} />
      <span className="v">{value ? num(value) + suffix : empty}</span>
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
