import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import * as tmdb from '../tmdb'
import type { Kind, Mood, Query, Title } from '../tmdb'
import { AWARD_OPTIONS } from '../awards'
import { getOmdbKey } from '../omdb'
import { Chip, Range, Sheet } from '../ui/components'
import { Icon } from '../ui/icons'
import { activeChips } from '../ui/helpers'

const toggleIn = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
const THIS_YEAR = new Date().getFullYear()
const MIN_YEAR = 1920

type CatId = 'what' | 'where' | 'score' | 'time' | 'who' | 'order'

const CATS: { id: CatId; label: string; hint: string; icon: string; color: string }[] = [
  { id: 'what', label: 'Cosa', hint: 'Tipo, umore, generi', icon: 'film', color: '#a78bfa' },
  { id: 'where', label: 'Dove guardarlo', hint: 'Abbonamenti e disponibilità', icon: 'tv', color: '#60a5fa' },
  { id: 'score', label: 'Voti e premi', hint: 'IMDb, Rotten Tomatoes, Oscar', icon: 'star', color: '#fbbf24' },
  { id: 'time', label: 'Tempo e ritmo', hint: 'Anno, durata, violenza', icon: 'clock', color: '#34d399' },
  { id: 'who', label: 'Chi e dove', hint: 'Persone, paesi, lingue', icon: 'globe', color: '#fb7185' },
  { id: 'order', label: 'Ordine', hint: 'Come mostrare i risultati', icon: 'sliders', color: '#a1a1aa' },
]

/** A quale categoria appartiene un filtro attivo (per i conteggi nel menu). */
function catOf(key: string): CatId {
  if (/^(mood|genre|mode)/.test(key)) return 'what'
  if (/^(prov|mine|mon|italy)/.test(key)) return 'where'
  if (/^(imdb|rt|meta|tmdb|strict|award)/.test(key)) return 'score'
  if (/^(year|runtime|episode|status|gentle)/.test(key)) return 'time'
  if (/^(actor|director|country|lang)/.test(key)) return 'who'
  return 'order'
}

const KIND_ICON: Record<Kind, string> = { film: 'film', series: 'tv', miniseries: 'list', doc: 'globe', animation: 'spark' }
const KIND_HINT: Record<Kind, string> = {
  film: 'Lungometraggi', series: 'Serie TV', miniseries: 'Storie chiuse in poche puntate', doc: 'Storie vere', animation: 'Disegnati e in CGI',
}

const PRESETS: { id: string; label: string; color: string; patch: Partial<Query> }[] = [
  { id: 'new', label: 'Appena usciti', color: '#34d399', patch: { yearFrom: String(THIS_YEAR - 1), sort: 'recent' } },
  { id: 'good', label: 'Ben recensiti', color: '#fbbf24', patch: { minImdb: 7.5, minRt: 80 } },
  { id: 'awards', label: 'Premiati', color: '#fbbf24', patch: { awards: ['oscar', 'bafta', 'goldenGlobe', 'palme', 'lion', 'bear'] } },
  { id: 'quick', label: 'Serata veloce', color: '#60a5fa', patch: { kinds: ['film'], maxRuntime: 100, minTmdb: 6.8 } },
  { id: 'binge', label: 'Serie da maratona', color: '#a78bfa', patch: { kinds: ['series'], status: 'ended', minTmdb: 7.5 } },
  { id: 'family', label: 'Per tutti', color: '#fb7185', patch: { moods: ['cozy'], gentle: true } },
]

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="blk">
      <h3>{title}</h3>
      {hint && <p className="blk-h">{hint}</p>}
      {children}
    </section>
  )
}

function Tile({ on, onClick, icon, title, hint }: { on: boolean; onClick: () => void; icon?: string; title: string; hint?: string }) {
  return (
    <button className={'tile' + (on ? ' on' : '')} aria-pressed={on} onClick={onClick} data-tip={hint}>
      {icon && <span className="ti"><Icon name={icon} size={18} /></span>}
      <b>{title}</b>
      {hint && <span>{hint}</span>}
    </button>
  )
}

function Switch({ on, onChange, label, hint }: { on: boolean; onChange: () => void; label: string; hint?: string }) {
  return (
    <button className={'sw' + (on ? ' on' : '')} role="switch" aria-checked={on} onClick={onChange}>
      <span className="track"><span className="knob" /></span>
      <span className="swt"><b>{label}</b>{hint && <small>{hint}</small>}</span>
    </button>
  )
}

function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg2" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} className={o.v === value ? 'on' : ''} aria-pressed={o.v === value} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  )
}

interface Props {
  q: Query
  /** filtri di partenza (con gli abbonamenti già selezionati) */
  base: Query
  set: (p: Partial<Query>) => void
  reset: () => void
  count: number
  preview: Title[]
  loading: boolean
  /** abbonamenti salvati in Impostazioni */
  savedProviders: number[]
  onSaveProviders: (ids: number[]) => void
  onClose: () => void
}

/** Lo strumento dei filtri: categorie a sinistra, controlli al centro, anteprima dal vivo a destra. */
export function FilterStudio({ q, base, set, reset, count, preview, loading, savedProviders, onSaveProviders, onClose }: Props) {
  const hasMine = savedProviders.length > 0
  const [cat, setCat] = useState<CatId>('what')
  const [genres, setGenres] = useState<tmdb.GenreEntry[]>([])
  const [actorQ, setActorQ] = useState('')
  const [dirQ, setDirQ] = useState('')
  const [sugg, setSugg] = useState<{ id: number; name: string }[]>([])
  const [suggFor, setSuggFor] = useState<'actor' | 'director'>('actor')

  useEffect(() => {
    tmdb.genreList().then(setGenres).catch(() => setGenres([]))
  }, [])

  const chips = activeChips(q, base)
  const counts: Record<CatId, number> = { what: 0, where: 0, score: 0, time: 0, who: 0, order: 0 }
  for (const c of chips) counts[catOf(c.key)]++
  const current = CATS.find((c) => c.id === cat)!
  const types = tmdb.kindTypes(q.kinds)
  const genreOptions = genres.filter((g) => types.some((t) => g[t] !== undefined))
  const hasSeries = q.kinds.some((k) => k === 'series' || k === 'miniseries')
  const yearFrom = Number(q.yearFrom) || MIN_YEAR
  const yearTo = Number(q.yearTo) || THIS_YEAR

  async function find(v: string, who: 'actor' | 'director') {
    if (who === 'actor') setActorQ(v)
    else setDirQ(v)
    setSuggFor(who)
    if (v.length < 2) return setSugg([])
    try {
      setSugg(await tmdb.searchPerson(v))
    } catch {
      setSugg([])
    }
  }

  const panels: Record<CatId, ReactNode> = {
    what: (
      <>
        <Block title="Che cosa vuoi vedere">
          <div className="tiles compact">
            {tmdb.KINDS.map((k) => (
              <Tile key={k.id} on={q.kinds.includes(k.id)} icon={KIND_ICON[k.id]} title={k.label} hint={KIND_HINT[k.id]}
                onClick={() => (q.kinds.length > 1 || !q.kinds.includes(k.id) ? set({ kinds: toggleIn<Kind>(q.kinds, k.id), genres: [] }) : undefined)} />
            ))}
          </div>
        </Block>
        <Block title="Che umore hai" hint="Una stima basata sui generi: puoi sceglierne più di uno.">
          <div className="tiles small compact">
            {tmdb.MOODS.map((m) => (
              <Tile key={m.id} on={q.moods.includes(m.id)} title={m.label} hint={m.hint} onClick={() => set({ moods: toggleIn<Mood>(q.moods, m.id) })} />
            ))}
          </div>
        </Block>
        <Block title="Generi">
          <div className="row">
            {genreOptions.map((g) => <Chip key={g.name} on={q.genres.includes(g.name)} onClick={() => set({ genres: toggleIn(q.genres, g.name) })}>{g.name}</Chip>)}
          </div>
          {q.genres.length > 1 && (
            <div style={{ marginTop: 10 }}>
              <Seg label="Come combinare i generi" value={q.genreMode} onChange={(v) => set({ genreMode: v })} options={[{ v: 'all', label: 'Tutti insieme' }, { v: 'any', label: 'Almeno uno' }]} />
            </div>
          )}
        </Block>
      </>
    ),
    where: (
      <>
        <Block title="Cosa puoi guardare davvero">
          <div className="switches">
            <Switch on={q.onlyItaly} onChange={() => set({ onlyItaly: !q.onlyItaly })} label="Guardabili in italiano" hint="Disponibili in Italia, di solito doppiati o sottotitolati" />
          </div>
        </Block>
        <Block title="Le tue piattaforme" hint={hasMine ? 'Sono già selezionati i tuoi abbonamenti (Impostazioni). Aggiungi o togli per questa ricerca.' : 'Scegli le piattaforme che ti interessano. Puoi salvarle come tuoi abbonamenti.'}>
          <div className="row">
            {tmdb.PROVIDERS.map((p) => (
              <Chip key={p.id} on={q.providers.includes(p.id)} onClick={() => set({ providers: toggleIn(q.providers, p.id) })}>
                {savedProviders.includes(p.id) && <i className="mine-dot" aria-hidden="true" />}{p.name}
              </Chip>
            ))}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            {hasMine && <button className="btn sm" onClick={() => set({ providers: savedProviders })} data-tip="Rimetti solo i tuoi abbonamenti">I miei abbonamenti</button>}
            <button className="btn sm" disabled={!q.providers.length} onClick={() => set({ providers: [] })} data-tip="Mostra titoli di qualsiasi piattaforma">Tutte le piattaforme</button>
            {q.providers.length > 0 && JSON.stringify([...q.providers].sort()) !== JSON.stringify([...savedProviders].sort()) && (
              <button className="btn sm gold" onClick={() => onSaveProviders(q.providers)} data-tip="Aggiorna gli abbonamenti salvati in Impostazioni">Salva come miei abbonamenti</button>
            )}
          </div>
          {hasMine && <p className="blk-h">Il puntino · segna le piattaforme che hai tra i tuoi abbonamenti.</p>}
          {q.actor && q.providers.length > 0 && <p className="blk-h">Con un attore selezionato le piattaforme non si applicano.</p>}
        </Block>
        <Block title="Come lo guardi">
          <Seg label="Disponibilità" value={q.monetization} onChange={(v) => set({ monetization: v })}
            options={[{ v: 'any', label: 'Tutte' }, { v: 'flatrate', label: 'Abbonamento' }, { v: 'rent', label: 'Noleggio' }, { v: 'buy', label: 'Acquisto' }]} />
        </Block>
      </>
    ),
    score: (
      <>
        <Block title="Voti minimi" hint={getOmdbKey() ? 'Contano solo i voti che esistono: quelli mancanti non escludono il titolo.' : 'Per IMDb, Rotten Tomatoes e Metacritic serve la chiave OMDb (Impostazioni).'}>
          <Range label="IMDb" color="#f5c518" value={q.minImdb} min={0} max={9.5} step={0.1} onChange={(v) => set({ minImdb: v })} />
          <Range label="Rotten Tomatoes" color="#fa5a3c" value={q.minRt} min={0} max={100} step={5} suffix="%" onChange={(v) => set({ minRt: v })} />
          <Range label="Metacritic" color="#66cc33" value={q.minMeta} min={0} max={100} step={5} onChange={(v) => set({ minMeta: v })} />
          <Range label="TMDB" color="#01b4e4" value={q.minTmdb} min={0} max={9} step={0.1} onChange={(v) => set({ minTmdb: v })} />
          {(q.minImdb > 0 || q.minRt > 0 || q.minMeta > 0) && (
            <div style={{ marginTop: 8 }}>
              <Switch on={q.strictRatings} onChange={() => set({ strictRatings: !q.strictRatings })} label="Servono tutti i voti" hint="Escludi i titoli senza uno dei voti richiesti (serie e novità ne hanno spesso meno)" />
            </div>
          )}
        </Block>
        <Block title="Premi vinti" hint="Dati da Wikidata, buoni ma non completi. Con un premio attivo piattaforme e durata non si applicano.">
          <div className="tiles small compact">
            {AWARD_OPTIONS.map((a) => <Tile key={a.id} on={q.awards.includes(a.id)} icon="trophy" title={a.label} onClick={() => set({ awards: toggleIn(q.awards, a.id) })} />)}
          </div>
        </Block>
      </>
    ),
    time: (
      <>
        <Block title="Anno di uscita">
          <div className="row" style={{ marginBottom: 8 }}>
            {[
              { l: 'Ultimo anno', f: String(THIS_YEAR - 1), t: undefined },
              { l: 'Anni 2020', f: '2020', t: '2029' },
              { l: 'Anni 2010', f: '2010', t: '2019' },
              { l: 'Anni 2000', f: '2000', t: '2009' },
              { l: 'Anni 90', f: '1990', t: '1999' },
              { l: 'Classici', f: undefined, t: '1979' },
            ].map((p) => (
              <Chip key={p.l} on={q.yearFrom === p.f && q.yearTo === p.t} onClick={() => set({ yearFrom: p.f, yearTo: p.t })}>{p.l}</Chip>
            ))}
          </div>
          <label className="rng">
            <span className="k">Dal</span>
            <input type="range" min={MIN_YEAR} max={THIS_YEAR} step={1} value={yearFrom} style={{ ['--p' as string]: `${((yearFrom - MIN_YEAR) / (THIS_YEAR - MIN_YEAR)) * 100}%`, ['--rc' as string]: '#34d399' }}
              onChange={(e) => set({ yearFrom: +e.target.value <= MIN_YEAR ? undefined : e.target.value })} />
            <span className="v">{q.yearFrom ?? 'Sempre'}</span>
          </label>
          <label className="rng">
            <span className="k">Al</span>
            <input type="range" min={MIN_YEAR} max={THIS_YEAR} step={1} value={yearTo} style={{ ['--p' as string]: `${((yearTo - MIN_YEAR) / (THIS_YEAR - MIN_YEAR)) * 100}%`, ['--rc' as string]: '#34d399' }}
              onChange={(e) => set({ yearTo: +e.target.value >= THIS_YEAR ? undefined : e.target.value })} />
            <span className="v">{q.yearTo ?? 'Oggi'}</span>
          </label>
        </Block>
        <Block title="Quanto dura">
          <p className="blk-h" style={{ marginTop: 0 }}>Film</p>
          <Seg label="Durata dei film" value={q.maxRuntime ?? 0} onChange={(v) => set({ maxRuntime: v || undefined })}
            options={[{ v: 0, label: 'Qualsiasi' }, { v: 90, label: 'Sotto 90 min' }, { v: 120, label: 'Sotto 2 ore' }, { v: 150, label: 'Sotto 2h30' }]} />
          <p className="blk-h">Episodi</p>
          <Seg label="Durata degli episodi" value={q.maxEpisode ?? 0} onChange={(v) => set({ maxEpisode: v || undefined })}
            options={[{ v: 0, label: 'Qualsiasi' }, { v: 30, label: 'Sotto 30 min' }, { v: 45, label: 'Sotto 45 min' }, { v: 60, label: 'Sotto 1 ora' }]} />
        </Block>
        <Block title="Ritmo e tono">
          <div className="switches">
            {hasSeries && (
              <Seg label="Stato delle serie" value={q.status ?? 'any'} onChange={(v) => set({ status: v === 'any' ? undefined : v })}
                options={[{ v: 'any', label: 'Qualsiasi serie' }, { v: 'ended', label: 'Concluse' }, { v: 'ongoing', label: 'In corso' }]} />
            )}
            <Switch on={q.gentle} onChange={() => set({ gentle: !q.gentle })} label="Poco violento" hint="Esclude horror e guerra e le classificazioni più dure (è una stima)" />
          </div>
        </Block>
      </>
    ),
    who: (
      <>
        <Block title="Persone">
          <div className="row">
            {q.actor ? (
              <button className="btn sm on" onClick={() => { set({ actor: undefined }); setActorQ('') }}>Con {q.actor.name} <Icon name="x" size={14} /></button>
            ) : (
              <input className="field" placeholder="Attore o attrice…" value={actorQ} onChange={(e) => find(e.target.value, 'actor')} />
            )}
            {q.director ? (
              <button className="btn sm on" onClick={() => { set({ director: undefined }); setDirQ('') }}>Regia di {q.director.name} <Icon name="x" size={14} /></button>
            ) : (
              <input className="field" placeholder="Regista (solo film)…" value={dirQ} onChange={(e) => find(e.target.value, 'director')} />
            )}
          </div>
          {sugg.length > 0 && (
            <div className="row" style={{ marginTop: 10 }}>
              {sugg.map((s) => <Chip key={s.id} onClick={() => { set(suggFor === 'actor' ? { actor: s } : { director: s }); setSugg([]) }}>{s.name}</Chip>)}
            </div>
          )}
        </Block>
        <Block title="Paese di produzione">
          <div className="row">
            {tmdb.COUNTRIES.map((c) => <Chip key={c.id} on={q.country === c.id} onClick={() => set({ country: q.country === c.id ? undefined : c.id })}>{c.label}</Chip>)}
          </div>
        </Block>
        <Block title="Lingua originale" hint="È la lingua in cui è stato girato: «Guardabili in italiano» (in Dove guardarlo) dice se lo trovi qui.">
          <div className="row">
            {tmdb.LANGS.map((l) => <Chip key={l.id} on={q.lang === l.id} onClick={() => set({ lang: q.lang === l.id ? undefined : l.id })}>{l.label}</Chip>)}
          </div>
        </Block>
      </>
    ),
    order: (
      <>
        <Block title="Ordina per">
          <Seg label="Ordine" value={q.sort} onChange={(v) => set({ sort: v })}
            options={[{ v: 'popularity', label: 'Più popolari' }, { v: 'rating', label: 'Voto più alto' }, { v: 'recent', label: 'Più recenti' }]} />
        </Block>
        <Block title="Cosa nascondere">
          <div className="switches">
            <Switch on={q.hideSeen} onChange={() => set({ hideSeen: !q.hideSeen })} label="Nascondi i già visti" hint="Quelli che hai segnato come visti" />
          </div>
        </Block>
      </>
    ),
  }

  return (
    <Sheet
      onClose={onClose}
      className="studio"
      foot={
        <>
          <button className="btn" onClick={reset} data-tip="Torna ai filtri di partenza">Azzera tutto{chips.length ? ` · ${chips.length}` : ''}</button>
          <button className="btn gold" onClick={onClose}>{loading ? 'Cerco…' : `Mostra ${count} titoli`}</button>
        </>
      }
    >
      <div className="studio-head">
        <h2>Filtri</h2>
        <div className="presets" role="group" aria-label="Scorciatoie">
          {PRESETS.map((p) => (
            <button key={p.id} className="preset" style={{ ['--c' as string]: p.color }} onClick={() => set(p.patch)} data-tip="Applica questa scorciatoia">
              <i />{p.label}
            </button>
          ))}
        </div>
        <button className="iconbtn" onClick={onClose} aria-label="Chiudi" data-tip="Chiudi"><Icon name="x" /></button>
      </div>

      <div className="studio-body">
        <nav className="studio-nav" aria-label="Categorie dei filtri">
          {CATS.map((c) => (
            <button key={c.id} className={'cat' + (c.id === cat ? ' on' : '')} style={{ ['--c' as string]: c.color }} aria-current={c.id === cat} onClick={() => setCat(c.id)}>
              <span className="ci"><Icon name={c.icon} size={18} /></span>
              <span className="ct"><b>{c.label}</b><small>{c.hint}</small></span>
              {counts[c.id] > 0 && <span className="badge">{counts[c.id]}</span>}
            </button>
          ))}
        </nav>

        <div className="studio-content" style={{ ['--c' as string]: current.color }}>
          <div className="cat-title"><span style={{ background: current.color }} />{current.label}</div>
          {panels[cat]}
        </div>

        <aside className="studio-preview" aria-label="Anteprima dei risultati">
          <div className="pv-count">
            <b>{loading ? '…' : count}</b>
            <span>{count === 1 ? 'titolo' : 'titoli'}</span>
          </div>
          <div className="pv-grid">
            {loading && preview.length === 0
              ? Array.from({ length: 9 }, (_, i) => <div key={i} className="skel" />)
              : preview.slice(0, 9).map((t) => (
                  <div key={t.type + t.id} className="pv-th" title={t.title}>
                    {t.poster ? <img src={`${tmdb.IMG}/w154${t.poster}`} alt={t.title} /> : <span>{t.title}</span>}
                  </div>
                ))}
          </div>
          {!loading && count === 0 && <p className="blk-h">Nessun risultato: prova a togliere qualche filtro.</p>}
          {chips.length > 0 && (
            <>
              <div className="pv-label">Filtri attivi</div>
              <div className="row">
                {chips.map((c) => (
                  <button key={c.key} className="achip" onClick={() => set(c.clear)} aria-label={`Togli il filtro ${c.label}`} data-tip="Togli questo filtro">
                    {c.label} <Icon name="x" size={12} />
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>
    </Sheet>
  )
}
