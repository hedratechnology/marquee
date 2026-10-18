import { useEffect, useState } from 'react'
import type { MediaType, Title } from '../tmdb'
import { PosterCard, Chip, Empty, SkeletonGrid, num } from '../ui/components'

interface BestItem {
  type: MediaType
  id: number
  title: string
  year: string
  date: string
  poster: string | null
  backdrop?: string | null
  overview: string
  genreIds: number[]
  lang: string
  score: number
  imdb: number | null
  votes: number | null
  rt: number | null
  meta: number | null
  awards: { name: string; year: string | null }[]
}

type Filter = 'all' | 'movie' | 'tv' | 'it'
const PAGE = 48

const asTitle = (i: BestItem): Title => ({
  id: i.id, type: i.type, title: i.title, year: i.year, date: i.date, poster: i.poster, backdrop: i.backdrop,
  rating: i.imdb ?? 0, popularity: 0, genreIds: i.genreIds, overview: i.overview,
})

export function Best({ seen, sources }: { seen: Title[]; sources: { id: string; url: string; name: string }[] }) {
  const [data, setData] = useState<{ generatedAt: string; items: BestItem[] } | null | undefined>(undefined)
  const [filter, setFilter] = useState<Filter>('all')
  const [onlyAwards, setOnlyAwards] = useState(false)
  const [hideSeen, setHideSeen] = useState(false)
  const [shown, setShown] = useState(PAGE)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}best.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d && Array.isArray(d.items) ? d : null))
      .catch(() => setData(null))
  }, [])

  const seenSet = new Set(seen.map((t) => t.type + t.id))
  const all = data?.items ?? []
  const list = all.filter((i) => {
    if (filter === 'movie' && i.type !== 'movie') return false
    if (filter === 'tv' && i.type !== 'tv') return false
    if (filter === 'it' && i.lang !== 'it') return false
    if (onlyAwards && i.awards.length === 0) return false
    if (hideSeen && seenSet.has(i.type + i.id)) return false
    return true
  })
  const reset = () => setShown(PAGE)

  return (
    <>
      <h1 className="page-title">Il meglio</h1>
      <p className="lede">Una classifica da 0 a 100 che unisce critica (Metacritic, Rotten Tomatoes), pubblico (IMDb) e premi vinti.</p>

      <div className="row" style={{ marginBottom: 22 }}>
        {([['all', 'Tutti'], ['movie', 'Film'], ['tv', 'Serie'], ['it', 'Italiani']] as [Filter, string][]).map(([k, label]) => (
          <Chip key={k} on={filter === k} onClick={() => { setFilter(k); reset() }}>{label}</Chip>
        ))}
        <Chip on={onlyAwards} onClick={() => { setOnlyAwards((v) => !v); reset() }}>Con premi</Chip>
        <Chip on={hideSeen} onClick={() => { setHideSeen((v) => !v); reset() }}>Nascondi visti</Chip>
      </div>

      {data === undefined && <SkeletonGrid />}
      {data === null && (
        <Empty icon="star" title="Classifica in preparazione" text="Compare dopo il primo aggiornamento automatico, che si ripete ogni settimana." />
      )}
      {data && list.length === 0 && <Empty title="Nessun titolo" text="Prova a togliere qualche filtro." />}
      {data && list.length > 0 && (
        <div className="grid">
          {list.slice(0, shown).map((i, n) => (
            <PosterCard
              key={i.type + i.id}
              t={asTitle(i)}
              name={i.title}
              rank={n + 1}
              sub={i.awards.length ? i.awards.map((a) => (a.year ? `${a.name} ${a.year}` : a.name)).join(' · ') : `${i.year} · ${i.type === 'movie' ? 'Film' : 'Serie'}`}
              topScore={num(i.score)}
              scores={[...(i.imdb !== null ? [`IMDb ${num(i.imdb)}`] : []), ...(i.rt !== null ? [`RT ${i.rt}%`] : [])]}
            />
          ))}
        </div>
      )}
      {data && list.length > shown && (
        <div className="row center" style={{ margin: '28px 0' }}><button className="btn" onClick={() => setShown((n) => n + PAGE)}>Mostra altri</button></div>
      )}

      {data && (
        <p className="muted" style={{ marginTop: 24 }}>
          Aggiornata il {new Date(data.generatedAt).toLocaleDateString('it-IT')}. I premi (Oscar, Palma d'Oro, Leone d'Oro, Orso d'Oro, David di Donatello, Golden Globe, César, Emmy) vengono da Wikidata; per le serie la copertura è parziale.
        </p>
      )}
      <details className="how">
        <summary>Come si calcola il punteggio</summary>
        <p className="muted">
          Critica = media di Metascore e Rotten Tomatoes. Pubblico = voto IMDb, con almeno 10.000 voti. Il punteggio è 55% critica e 45% pubblico;
          se manca uno dei due (succede spesso per le serie, che di solito hanno solo il voto IMDb), l'altro pesa il 96%. Ogni premio vinto aggiunge 3 punti, fino a 9. Entrano in classifica solo i titoli da 80 in su.
        </p>
      </details>

      {sources.length > 0 && (
        <>
          <h2 className="sec" style={{ margin: '28px 0 12px' }}>Le tue fonti</h2>
          <div className="row">
            {sources.map((s) => <a key={s.id} className="chip" href={s.url} target="_blank" rel="noreferrer">{s.name}</a>)}
          </div>
        </>
      )}
    </>
  )
}
