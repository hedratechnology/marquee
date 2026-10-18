import { useCallback, useEffect, useState } from 'react'
import * as tmdb from './tmdb'
import type { Detail, Filters, MediaType, Title } from './tmdb'
import { useLists } from './store'
import type { ListName } from './store'

type Tab = 'explore' | 'search' | 'recs' | 'lists' | 'settings'
type Opener = (t: Title) => void

const LIST_LABEL: Record<ListName, string> = { watchlist: 'Da vedere', seen: 'Visti', favorites: 'Preferiti' }

function errText(e: unknown) {
  const m = e instanceof Error ? e.message : ''
  if (m === 'NO_KEY') return 'Inserisci la chiave TMDB in Impostazioni.'
  if (m === 'BAD_KEY') return 'Chiave TMDB non valida.'
  return 'Errore di rete. Riprova.'
}

function Grid({ items, open, empty }: { items: Title[]; open: Opener; empty?: string }) {
  if (!items.length) return <p className="muted">{empty ?? 'Nessun risultato.'}</p>
  return (
    <div className="grid">
      {items.map((t) => (
        <button key={t.type + t.id} className="card" onClick={() => open(t)}>
          {t.poster ? <img loading="lazy" src={`${tmdb.IMG}/w342${t.poster}`} alt={t.title} /> : <div className="noimg">{t.title}</div>}
          <div className="meta">
            <b>{t.title}</b>
            <span className="muted">
              {t.year} · ★ {t.rating}
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}

function Explore({ open }: { open: Opener }) {
  const [f, setF] = useState<Filters>({ type: 'movie', providers: [], sort: 'popularity.desc', page: 1 })
  const [gen, setGen] = useState<{ id: number; name: string }[]>([])
  const [items, setItems] = useState<Title[]>([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [actor, setActor] = useState<{ id: number; name: string } | null>(null)
  const [q, setQ] = useState('')
  const [sugg, setSugg] = useState<{ id: number; name: string }[]>([])

  useEffect(() => {
    tmdb.genres(f.type).then(setGen).catch(() => setGen([]))
  }, [f.type])

  const run = useCallback(
    async (append: boolean) => {
      setLoading(true)
      setErr('')
      try {
        const res = actor ? await tmdb.discoverByActor(actor.id, f.type) : await tmdb.discover(f)
        setItems((cur) => (append && !actor ? [...cur, ...res] : res))
      } catch (e) {
        setErr(errText(e))
      } finally {
        setLoading(false)
      }
    },
    [f, actor],
  )

  // Ricarica quando cambiano i filtri (page 1) o si chiede la pagina successiva
  useEffect(() => {
    run(f.page > 1)
  }, [run, f.page])

  const set = (p: Partial<Filters>) => setF((c) => ({ ...c, ...p, page: 1 }))
  const toggleProv = (id: number) =>
    set({ providers: f.providers.includes(id) ? f.providers.filter((x) => x !== id) : [...f.providers, id] })

  async function findActor(v: string) {
    setQ(v)
    if (v.length < 2) return setSugg([])
    try {
      setSugg(await tmdb.searchPerson(v))
    } catch {
      setSugg([])
    }
  }

  return (
    <>
      <h1>Esplora</h1>
      <div className="row">
        {(['movie', 'tv'] as MediaType[]).map((t) => (
          <button key={t} className={f.type === t ? 'on' : ''} onClick={() => set({ type: t, genre: undefined })}>
            {t === 'movie' ? 'Film' : 'Serie TV'}
          </button>
        ))}
        <select className="grow" value={f.genre ?? ''} onChange={(e) => set({ genre: e.target.value ? +e.target.value : undefined })}>
          <option value="">Tutti i generi</option>
          {gen.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>
      <div className="row">
        <input className="grow" type="number" placeholder="Dall'anno (es. 2015)" value={f.yearFrom ?? ''} onChange={(e) => set({ yearFrom: e.target.value })} />
        <select value={f.minRating ?? 0} onChange={(e) => set({ minRating: +e.target.value })}>
          <option value={0}>Qualsiasi voto</option>
          {[6, 7, 8].map((v) => (
            <option key={v} value={v}>Voto ≥ {v}</option>
          ))}
        </select>
        <select value={f.sort} onChange={(e) => set({ sort: e.target.value })}>
          <option value="popularity.desc">Più popolari</option>
          <option value="vote_average.desc">Voto più alto</option>
          <option value={f.type === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc'}>Più recenti</option>
        </select>
      </div>
      <div className="row">
        {tmdb.PROVIDERS.map((p) => (
          <button key={p.id} className={'chip ' + (f.providers.includes(p.id) ? 'on' : '')} onClick={() => toggleProv(p.id)}>
            {p.name}
          </button>
        ))}
      </div>
      <div className="row">
        {actor ? (
          <button className="on" onClick={() => { setActor(null); setQ('') }}>Attore: {actor.name} ✕</button>
        ) : (
          <input className="grow" placeholder="Filtra per attore/attrice…" value={q} onChange={(e) => findActor(e.target.value)} />
        )}
      </div>
      {!actor && sugg.length > 0 && (
        <div className="sugg">
          {sugg.map((s) => (
            <button key={s.id} className="chip" onClick={() => { setActor(s); setSugg([]) }}>{s.name}</button>
          ))}
        </div>
      )}
      {err && <p className="err">{err}</p>}
      <Grid items={items} open={open} />
      {!actor && items.length > 0 && (
        <div className="row">
          <button disabled={loading} onClick={() => setF((c) => ({ ...c, page: c.page + 1 }))}>
            {loading ? 'Carico…' : 'Carica altri'}
          </button>
        </div>
      )}
    </>
  )
}

function Search({ open }: { open: Opener }) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Title[]>([])
  const [err, setErr] = useState('')

  useEffect(() => {
    if (q.trim().length < 2) return setItems([])
    const h = setTimeout(() => {
      tmdb.search(q).then((r) => { setItems(r); setErr('') }).catch((e) => setErr(errText(e)))
    }, 350)
    return () => clearTimeout(h)
  }, [q])

  return (
    <>
      <h1>Cerca</h1>
      <input style={{ width: '100%' }} autoFocus placeholder="Titolo di film o serie…" value={q} onChange={(e) => setQ(e.target.value)} />
      {err && <p className="err">{err}</p>}
      <Grid items={items} open={open} empty={q.length < 2 ? 'Scrivi almeno 2 lettere.' : undefined} />
    </>
  )
}

function Recs({ open, favorites, seen }: { open: Opener; favorites: Title[]; seen: Title[] }) {
  const [items, setItems] = useState<Title[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const base = favorites.slice(0, 8)
    if (!base.length) return
    setLoading(true)
    Promise.all(base.map((t) => tmdb.recommendations(t.type, t.id).catch(() => [] as Title[])))
      .then((all) => {
        const score = new Map<string, { t: Title; n: number }>()
        for (const t of all.flat()) {
          const k = t.type + t.id
          const cur = score.get(k)
          if (cur) cur.n++
          else score.set(k, { t, n: 1 })
        }
        const known = new Set([...favorites, ...seen].map((t) => t.type + t.id))
        setItems(
          [...score.values()]
            .filter((x) => !known.has(x.t.type + x.t.id) && x.t.poster)
            .sort((a, b) => b.n - a.n || b.t.rating - a.t.rating)
            .slice(0, 30)
            .map((x) => x.t),
        )
      })
      .catch((e) => setErr(errText(e)))
      .finally(() => setLoading(false))
  }, [favorites, seen])

  return (
    <>
      <h1>Consigli per te</h1>
      <p className="muted">Basati sui tuoi preferiti. Titoli già visti o preferiti esclusi.</p>
      {err && <p className="err">{err}</p>}
      {loading && <p className="muted">Carico…</p>}
      <Grid items={items} open={open} empty="Aggiungi qualche titolo ai Preferiti (♥) per ricevere consigli." />
    </>
  )
}

function Lists({ open, lists }: { open: Opener; lists: Record<ListName, Title[]> }) {
  const [tab, setTab] = useState<ListName>('watchlist')
  return (
    <>
      <h1>Le mie liste</h1>
      <div className="row">
        {(Object.keys(LIST_LABEL) as ListName[]).map((l) => (
          <button key={l} className={tab === l ? 'on' : ''} onClick={() => setTab(l)}>
            {LIST_LABEL[l]} ({lists[l].length})
          </button>
        ))}
      </div>
      <Grid items={lists[tab]} open={open} empty="Lista vuota." />
    </>
  )
}

function Settings({ lists, replace }: { lists: Record<ListName, Title[]>; replace: (l: Record<ListName, Title[]>) => void }) {
  const [key, setKey] = useState(tmdb.getKey())
  const [saved, setSaved] = useState(false)

  function exportJson() {
    const blob = new Blob([JSON.stringify(lists, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'film-liste.json'
    a.click()
  }
  async function importJson(file: File) {
    try {
      replace(JSON.parse(await file.text()))
    } catch {
      alert('File non valido.')
    }
  }

  return (
    <>
      <h1>Impostazioni</h1>
      <h2>Chiave TMDB</h2>
      <p className="muted">
        Si crea gratis su themoviedb.org (Impostazioni → API). Resta salvata solo in questo dispositivo. Vanno bene sia la chiave API v3 sia il token "Read Access".
      </p>
      <div className="row">
        <input className="grow" type="password" value={key} onChange={(e) => { setKey(e.target.value); setSaved(false) }} placeholder="Incolla qui la chiave" />
        <button className="primary" onClick={() => { tmdb.setKey(key); setSaved(true) }}>Salva</button>
      </div>
      {saved && <p className="muted">Salvata ✓ Vai su Esplora.</p>}
      <h2>Backup liste</h2>
      <div className="row">
        <button onClick={exportJson}>Esporta</button>
        <label>
          <button onClick={(e) => (e.currentTarget.nextElementSibling as HTMLInputElement).click()}>Importa</button>
          <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        </label>
      </div>
      <p className="muted">I dati sono nel browser: per usarli su un altro dispositivo, esporta e importa.</p>
    </>
  )
}

function DetailSheet({
  t, close, has, toggle, open,
}: {
  t: Title
  close: () => void
  has: (l: ListName, t: Title) => boolean
  toggle: (l: ListName, t: Title) => void
  open: Opener
}) {
  const [d, setD] = useState<Detail | null>(null)
  const [similar, setSimilar] = useState<Title[]>([])

  useEffect(() => {
    setD(null)
    tmdb.detail(t.type, t.id).then(setD).catch(() => setD(null))
    tmdb.recommendations(t.type, t.id).then((r) => setSimilar(r.slice(0, 12))).catch(() => setSimilar([]))
  }, [t])

  return (
    <div className="modal" onClick={close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="hd">
          {t.poster && <img src={`${tmdb.IMG}/w342${t.poster}`} alt="" />}
          <div>
            <h1 style={{ marginTop: 0 }}>{t.title}</h1>
            <div className="muted">
              {t.year} · ★ {t.rating}
              {d?.runtime ? ` · ${d.runtime}` : ''}
            </div>
            {d && <div className="muted">{d.genres.join(', ')}</div>}
          </div>
        </div>
        <div className="row">
          {(Object.keys(LIST_LABEL) as ListName[]).map((l) => (
            <button key={l} className={has(l, t) ? 'on' : ''} onClick={() => toggle(l, t)}>
              {l === 'favorites' ? '♥ ' : ''}{LIST_LABEL[l]}
            </button>
          ))}
        </div>
        <p>{t.overview || 'Nessuna trama disponibile.'}</p>
        {d && (
          <>
            <h2>Dove guardarlo (Italia)</h2>
            {d.providers.length ? (
              <div className="logos">
                {d.providers.map((p) => (
                  <img key={p.id} src={`${tmdb.IMG}/w92${p.logo}`} alt={p.name} title={p.name} />
                ))}
              </div>
            ) : (
              <p className="muted">Non in streaming incluso in abbonamento.</p>
            )}
            {d.trailer && <p><a href={d.trailer} target="_blank" rel="noreferrer">▶ Trailer</a></p>}
            <h2>Cast</h2>
            <p className="muted">{d.cast.map((c) => c.name).join(' · ')}</p>
          </>
        )}
        {similar.length > 0 && (
          <>
            <h2>Simili</h2>
            <Grid items={similar} open={open} />
          </>
        )}
        <div className="row"><button onClick={close}>Chiudi</button></div>
      </div>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab>(tmdb.getKey() ? 'explore' : 'settings')
  const [sel, setSel] = useState<Title | null>(null)
  const { lists, has, toggle, replace } = useLists()

  const tabs: [Tab, string][] = [
    ['explore', 'Esplora'], ['search', 'Cerca'], ['recs', 'Consigli'], ['lists', 'Liste'], ['settings', 'Impost.'],
  ]

  return (
    <>
      {tab === 'explore' && <Explore open={setSel} />}
      {tab === 'search' && <Search open={setSel} />}
      {tab === 'recs' && <Recs open={setSel} favorites={lists.favorites} seen={lists.seen} />}
      {tab === 'lists' && <Lists open={setSel} lists={lists} />}
      {tab === 'settings' && <Settings lists={lists} replace={replace} />}
      {sel && <DetailSheet t={sel} close={() => setSel(null)} has={has} toggle={toggle} open={setSel} />}
      <nav>
        {tabs.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>
    </>
  )
}
