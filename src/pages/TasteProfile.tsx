import * as tmdb from '../tmdb'
import type { Title } from '../tmdb'
import { REACTIONS, usePersonal } from '../personal'
import { confidence, genreBars, tasteInsights } from '../taste'
import { Chip, Empty } from '../ui/components'
import { useLists, useOpen, useTaste } from '../ui/ctx'
import { useGenres } from '../ui/data'
import { Icon } from '../ui/icons'
import { keyOf } from '../store'

function Bars({ items, color }: { items: { id: number; name: string; value: number }[]; color: string }) {
  return (
    <div className="gbars">
      {items.map((g) => (
        <div key={g.id} className="gbar">
          <span>{g.name}</span>
          <div className="gtrack"><i style={{ width: `${Math.round(Math.abs(g.value) * 100)}%`, background: color }} /></div>
        </div>
      ))}
    </div>
  )
}

/** "Il tuo gusto": cosa ho capito, quanto sono sicuro e un modo veloce per insegnarmelo con le reazioni. */
export function TasteProfile() {
  const { lists } = useLists()
  const p = usePersonal()
  const { taste } = useTaste()
  const genres = useGenres()
  const open = useOpen()
  const conf = confidence(taste)
  const insights = tasteInsights(taste, genres)
  const bars = genreBars(taste, genres)

  // titoli visti (o iniziati, o preferiti) a cui non hai ancora detto com'è andata
  const seen = new Map<string, Title>()
  for (const t of [...lists.seen, ...lists.favorites, ...lists.started, ...lists.dropped]) seen.set(keyOf(t), t)
  const toRate = [...seen.values()].filter((t) => p.reactionsOf(t).length === 0).slice(0, 6)
  const known = new Map<string, Title>()
  for (const l of Object.values(lists)) for (const t of l) known.set(keyOf(t), t)
  const reacted = Object.values(p.reactions).filter((r) => r.reactions.length).sort((a, b) => b.at - a.at).slice(0, 8)

  const asTitle = (r: (typeof reacted)[number]): Title =>
    known.get(`${r.type}:${r.id}`) ?? { id: r.id, type: r.type, title: r.title, year: '', date: '', poster: null, rating: 0, popularity: 0, genreIds: r.genreIds, overview: '' }

  const row = (t: Title) => (
    <li key={keyOf(t)} className="trow">
      <button className="rthumb" onClick={() => open(t)} aria-label={`Dettagli di ${t.title}`} data-tip="Vedi i dettagli">
        {t.poster ? <img src={`${tmdb.IMG}/w154${t.poster}`} alt="" /> : <span>{t.title}</span>}
      </button>
      <div className="rinfo">
        <b>{t.title}</b>
        <div className="row">
          {REACTIONS.map((r) => (
            <Chip key={r.id} on={p.reactionsOf(t).includes(r.id)} onClick={() => p.toggleReaction(t, r.id)}>{r.label}</Chip>
          ))}
        </div>
      </div>
    </li>
  )

  return (
    <>
      <p className="lede">
        Più mi dici com'è andata, meglio capisco cosa proporti. Una reazione vale più di quattro stelline: mi dice <i>perché</i> un titolo ti è piaciuto o no.
      </p>

      <div className="tastegrid">
        <section className="cardbox">
          <h2>Cosa ho capito di te</h2>
          <div className="confrow">
            <div className="meter" role="progressbar" aria-valuenow={conf.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Precisione del profilo"><i style={{ width: `${conf.pct}%` }} /></div>
            <b>{conf.pct}%</b>
          </div>
          <p className="muted" style={{ margin: '6px 0 14px' }}><b style={{ color: 'var(--text)' }}>{conf.label}.</b> {conf.next}</p>
          {insights.length > 0 ? (
            <ul className="insights">
              {insights.map((i) => <li key={i}>{i}</li>)}
            </ul>
          ) : (
            <p className="muted">Non ho ancora abbastanza dati.</p>
          )}
        </section>

        <section className="cardbox">
          <h2>Generi</h2>
          {bars.likes.length === 0 && bars.dislikes.length === 0 ? (
            <p className="muted">Compariranno quando avrai salvato o valutato qualche titolo.</p>
          ) : (
            <>
              {bars.likes.length > 0 && (
                <>
                  <span className="eyebrow">Ti piacciono</span>
                  <Bars items={bars.likes} color="#34d399" />
                </>
              )}
              {bars.dislikes.length > 0 && (
                <>
                  <span className="eyebrow" style={{ display: 'block', marginTop: 14 }}>Eviti</span>
                  <Bars items={bars.dislikes} color="#fb7185" />
                </>
              )}
            </>
          )}
        </section>
      </div>

      <section className="cardbox">
        <h2>Insegnami: com'è andata?</h2>
        {toRate.length ? (
          <>
            <p className="muted" style={{ margin: '4px 0 6px' }}>Un tocco per titolo basta. Puoi sceglierne più di una.</p>
            <ul className="tlist">{toRate.map(row)}</ul>
          </>
        ) : (
          <Empty
            icon="check"
            title={seen.size ? 'Hai valutato tutto' : 'Nessun titolo da valutare'}
            text={seen.size ? 'Quando guarderai altro, segnalo come visto e torna qui.' : 'Segna come visti i titoli che hai guardato (dal dettaglio) e potrai lasciare le tue reazioni.'}
          />
        )}
      </section>

      {reacted.length > 0 && (
        <section className="cardbox">
          <div className="row between">
            <h2>Le tue reazioni</h2>
            <button className="btn sm" onClick={() => { if (confirm('Cancello tutte le reazioni? Il profilo ripartirà dai titoli salvati.')) p.restore({ reactions: {} }) }}>
              <Icon name="x" size={14} /> Azzera le reazioni
            </button>
          </div>
          <ul className="tlist">{reacted.map((r) => row(asTitle(r)))}</ul>
        </section>
      )}
    </>
  )
}
