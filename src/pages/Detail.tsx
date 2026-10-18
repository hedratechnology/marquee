import { useEffect, useRef, useState } from 'react'
import * as tmdb from '../tmdb'
import type { Detail as DetailData, Title } from '../tmdb'
import { requestRatings, useRatings } from '../omdb'
import { Chip, Sheet, TitleRail, num } from '../ui/components'
import { Icon } from '../ui/icons'
import { useLists } from '../ui/ctx'
import type { ListName } from '../store'
import { REACTIONS, TAGS, usePersonal } from '../personal'
import { effortLabel } from '../pick'
import { Expect } from '../ui/Expect'

const MAIN: { l: ListName; label: string; on: string; icon: string }[] = [
  { l: 'watchlist', label: 'Da vedere', on: 'In lista', icon: 'bookmark' },
  { l: 'favorites', label: 'Preferito', on: 'Preferito', icon: 'star' },
  { l: 'seen', label: 'Visto', on: 'Visto', icon: 'check' },
]

const OTHER: { l: ListName; label: string }[] = [
  { l: 'started', label: 'Iniziato' },
  { l: 'dropped', label: 'Abbandonato' },
  { l: 'hidden', label: 'Nascondi' },
]

export function Detail({ t, close }: { t: Title; close: () => void }) {
  const [d, setD] = useState<DetailData | null>(null)
  const [similar, setSimilar] = useState<Title[]>([])
  const R = useRatings()
  const { has, toggle } = useLists()
  const p = usePersonal()
  const top = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setD(null)
    setSimilar([])
    top.current?.scrollIntoView({ block: 'start' })
    requestRatings([t])
    tmdb.detail(t.type, t.id).then(setD).catch(() => setD(null))
    tmdb.recommendations(t.type, t.id).then((r) => setSimilar(r.filter((x) => x.poster).slice(0, 14))).catch(() => setSimilar([]))
  }, [t])

  const r = R.get(t)
  const backdrop = d?.backdrop ?? t.backdrop
  const watched = has('seen', t) || has('started', t) || has('dropped', t) || has('favorites', t)
  const reactions = p.reactionsOf(t)
  const effort = d ? effortLabel(d) : ''
  const statusLabel = d?.status === 'Ended' || d?.status === 'Canceled' ? 'Conclusa' : d?.status === 'Returning Series' ? 'In corso' : ''

  return (
    <Sheet onClose={close} className="detail">
      <div ref={top} />
      <div className="detail-hero">
        {backdrop && <img src={`${tmdb.IMG}/w780${backdrop}`} alt="" />}
        <button className="iconbtn close" onClick={close} aria-label="Chiudi" data-tip="Chiudi"><Icon name="x" /></button>
        <div className="inner">
          {t.poster && <img src={`${tmdb.IMG}/w342${t.poster}`} alt="" />}
          <div>
            <span className="eyebrow">{t.type === 'movie' ? 'Film' : 'Serie TV'}</span>
            <h2>{t.title}</h2>
            <div className="meta-line">
              {t.year && <span>{t.year}</span>}
              {d?.runtime && <span className="dot">{d.runtime}</span>}
              {d && d.genres.length > 0 && <span className="dot">{d.genres.slice(0, 3).join(', ')}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="detail-body">
        <div className="row">
          {MAIN.map((m) => (
            <button key={m.l} className={'btn' + (has(m.l, t) ? ' on' : '')} aria-pressed={has(m.l, t)} onClick={() => toggle(m.l, t)}>
              <Icon name={m.icon} size={16} fill={has(m.l, t) && m.icon === 'star'} /> {has(m.l, t) ? m.on : m.label}
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 4 }}>
          {OTHER.map((o) => <Chip key={o.l} on={has(o.l, t)} onClick={() => toggle(o.l, t)}>{o.label}</Chip>)}
        </div>

        {has('watchlist', t) && (
          <div className="subgroup">
            <span className="eyebrow">Quando lo guardi</span>
            <div className="row">
              {TAGS.map((g) => <Chip key={g.id} on={p.tagsOf(t).includes(g.id)} onClick={() => p.toggleTag(t, g.id)}>{g.label}</Chip>)}
            </div>
          </div>
        )}

        {watched && (
          <div className="subgroup">
            <span className="eyebrow">Com'è stato? Mi aiuta a proporti di meglio</span>
            <div className="row">
              {REACTIONS.map((x) => <Chip key={x.id} on={reactions.includes(x.id)} onClick={() => p.toggleReaction(t, x.id)}>{x.label}</Chip>)}
            </div>
          </div>
        )}

        <div className="scorebox">
          {r?.imdb !== undefined && <div className="gold"><b>{num(r.imdb)}</b><span>IMDb</span></div>}
          {r?.rt !== undefined && <div><b>{r.rt}%</b><span>Rotten Tomatoes</span></div>}
          {r?.meta !== undefined && <div><b>{r.meta}</b><span>Metacritic</span></div>}
          {t.rating > 0 && <div><b>{num(t.rating)}</b><span>TMDB</span></div>}
        </div>

        {d && (effort || statusLabel || d.certification) && (
          <div className="facts">
            {effort && <span>{effort}</span>}
            {statusLabel && <span>{statusLabel}</span>}
            {d.certification && <span>Classificazione {d.certification}</span>}
          </div>
        )}

        <p>{t.overview || 'Nessuna trama disponibile.'}</p>

        <Expect t={t} detail={d ?? undefined} />

        {d && (
          <>
            <h3>Dove guardarlo in Italia</h3>
            {d.providers.length ? (
              <div className="logos">
                {d.providers.map((x) => <img key={x.id} src={`${tmdb.IMG}/w92${x.logo}`} alt={x.name} title={x.name} />)}
              </div>
            ) : (
              <p className="muted">Non è in streaming con abbonamento.</p>
            )}
            {(d.rent.length > 0 || d.buy.length > 0) && (
              <p className="muted" style={{ marginTop: 10 }}>
                {d.rent.length > 0 && <>Noleggio: {d.rent.slice(0, 4).map((x) => x.name).join(', ')}. </>}
                {d.buy.length > 0 && <>Acquisto: {d.buy.slice(0, 4).map((x) => x.name).join(', ')}.</>}
              </p>
            )}
            {d.trailer && <p style={{ marginTop: 14 }}><a className="btn sm" href={d.trailer} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}><Icon name="play" size={14} fill /> Guarda il trailer</a></p>}
            {d.cast.length > 0 && (
              <>
                <h3>Cast</h3>
                <div className="cast">{d.cast.map((c) => <span key={c.id}>{c.name}</span>)}</div>
              </>
            )}
          </>
        )}
        <TitleRail title="Simili" items={similar} />
      </div>
    </Sheet>
  )
}
