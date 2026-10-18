import { useEffect, useRef, useState } from 'react'
import * as tmdb from '../tmdb'
import type { Detail as DetailData, Title } from '../tmdb'
import { requestRatings, useRatings } from '../omdb'
import { Sheet, TitleRail, num } from '../ui/components'
import { Icon } from '../ui/icons'
import { useLists } from '../ui/ctx'
import type { ListName } from '../store'

export function Detail({ t, close }: { t: Title; close: () => void }) {
  const [d, setD] = useState<DetailData | null>(null)
  const [similar, setSimilar] = useState<Title[]>([])
  const R = useRatings()
  const { has, toggle } = useLists()
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
  const action = (l: ListName, label: string, icon: string, onLabel = label) => (
    <button className={'btn' + (has(l, t) ? ' on' : '')} aria-pressed={has(l, t)} onClick={() => toggle(l, t)}>
      <Icon name={icon} size={16} fill={has(l, t) && icon === 'star'} /> {has(l, t) ? onLabel : label}
    </button>
  )

  return (
    <Sheet onClose={close} className="detail">
      <div ref={top} />
      <div className="detail-hero">
        {backdrop && <img src={`${tmdb.IMG}/w780${backdrop}`} alt="" />}
        <button className="iconbtn close" onClick={close} aria-label="Chiudi"><Icon name="x" /></button>
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
          {action('watchlist', 'Da vedere', 'bookmark', 'In lista')}
          {action('favorites', 'Preferito', 'star', 'Preferito')}
          {action('seen', 'Visto', 'check', 'Visto')}
        </div>

        <div className="scorebox">
          {r?.imdb !== undefined && <div className="gold"><b>{num(r.imdb)}</b><span>IMDb</span></div>}
          {r?.rt !== undefined && <div><b>{r.rt}%</b><span>Rotten Tomatoes</span></div>}
          {r?.meta !== undefined && <div><b>{r.meta}</b><span>Metacritic</span></div>}
          {(t.rating > 0) && <div><b>{num(t.rating)}</b><span>TMDB</span></div>}
        </div>

        <p>{t.overview || 'Nessuna trama disponibile.'}</p>

        {d && (
          <>
            <h3>Dove guardarlo in Italia</h3>
            {d.providers.length ? (
              <div className="logos">
                {d.providers.map((p) => <img key={p.id} src={`${tmdb.IMG}/w92${p.logo}`} alt={p.name} title={p.name} />)}
              </div>
            ) : (
              <p className="muted">Non è in streaming con abbonamento.</p>
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
