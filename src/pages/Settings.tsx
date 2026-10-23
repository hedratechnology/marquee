import { useState } from 'react'
import type { ReactNode } from 'react'
import * as tmdb from '../tmdb'
import { getOmdbKey, setOmdbKey } from '../omdb'
import type { Lists } from '../store'
import type { useViews } from '../views'
import { SUGGESTED_SOURCES } from '../sources'
import type { Platform, useSources } from '../sources'
import { Chip } from '../ui/components'
import { Icon } from '../ui/icons'
import { AI_MODELS, getAiKey, getOwnAiKey, setAiKey } from '../ai'
import { usePersonal } from '../personal'

type ViewsApi = ReturnType<typeof useViews>
const PLATFORM_LABEL: Record<Platform, string> = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', x: 'X', other: 'Link' }

const SECTIONS = [
  { id: 'connections', icon: 'link', label: 'Collegamenti' },
  { id: 'platforms', icon: 'film', label: 'Abbonamenti' },
  { id: 'prefs', icon: 'globe', label: 'Lingua e disponibilità' },
  { id: 'people', icon: 'users', label: 'Liste della home' },
  { id: 'ai', icon: 'spark', label: 'Intelligenza artificiale' },
  { id: 'sources', icon: 'list', label: 'Fonti e profili' },
  { id: 'backup', icon: 'down', label: 'Backup' },
]

function Section({ id, icon, title, desc, children }: { id: string; icon: string; title: string; desc?: string; children: ReactNode }) {
  return (
    <section className="setsec" id={`set-${id}`}>
      <header>
        <span className="seticon"><Icon name={icon} size={20} /></span>
        <div>
          <h2>{title}</h2>
          {desc && <p className="muted">{desc}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}

function Status({ ok, label }: { ok: boolean; label: string }) {
  return <span className={'status' + (ok ? ' ok' : '')}><i />{label}</span>
}

/** Una chiave di accesso: stato, campo e pulsante per salvarla. */
function ConnRow({ name, desc, required, value, onSave, placeholder, getUrl, getHow }: {
  name: string; desc: string; required?: boolean; value: string; onSave: (v: string) => void; placeholder: string; getUrl: string; getHow: string
}) {
  const [v, setV] = useState(value)
  const [saved, setSaved] = useState(false)
  const [show, setShow] = useState(false)
  const [copied, setCopied] = useState(false)
  const connected = !!(saved ? v : value)
  return (
    <div className="connrow">
      <div className="connhead">
        <div>
          <b>{name}</b>
          <p className="muted">{desc}</p>
          <p className="muted">
            <a href={getUrl} target="_blank" rel="noreferrer">Ottieni la chiave</a> · {getHow}
          </p>
        </div>
        <Status ok={connected} label={connected ? 'Collegato' : required ? 'Obbligatorio' : 'Facoltativo'} />
      </div>
      <div className="row keyrow">
        <input className="field" type={show ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={v} placeholder={placeholder} onChange={(e) => { setV(e.target.value); setSaved(false) }} />
        <button className="iconbtn" type="button" aria-label={show ? 'Nascondi la chiave' : 'Mostra la chiave'} aria-pressed={show} data-tip={show ? 'Nascondi la chiave' : 'Mostra la chiave'} onClick={() => setShow((x) => !x)}>
          <Icon name={show ? 'eyeoff' : 'eye'} size={18} />
        </button>
        <button
          className="iconbtn"
          type="button"
          disabled={!v}
          aria-label="Copia la chiave"
          data-tip={copied ? 'Copiata' : 'Copia la chiave'}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(v)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } catch {
              setShow(true) // se il browser non permette di copiare, almeno la si può selezionare a mano
            }
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} size={18} />
        </button>
        <button className="btn gold" onClick={() => { onSave(v); setSaved(true) }}>{saved ? 'Salvata' : 'Salva'}</button>
      </div>
    </div>
  )
}

function LinkList({ title, help, placeholder, items, onAdd, onRemove, extra }: {
  title: string; help: string; placeholder: string
  items: { id: string; url: string; name: string; tag?: string }[]
  onAdd: (v: string) => string | null
  onRemove: (id: string) => void
  extra?: ReactNode
}) {
  const [v, setV] = useState('')
  const [err, setErr] = useState('')
  function add() {
    const e = onAdd(v)
    setErr(e ?? '')
    if (!e) setV('')
  }
  return (
    <div className="sublist">
      <b>{title}</b>
      <p className="muted">{help}</p>
      <div className="row">
        <input className="field" value={v} placeholder={placeholder} onChange={(e) => { setV(e.target.value); setErr('') }} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn gold" onClick={add}>Aggiungi</button>
      </div>
      {err && <p className="err">{err}</p>}
      {extra}
      {items.length > 0 && (
        <ul className="links">
          {items.map((i) => (
            <li key={i.id}>
              <a href={i.url} target="_blank" rel="noreferrer">{i.name}</a>
              {i.tag && <span className="muted">{i.tag}</span>}
              <button className="btn sm" aria-label={`Rimuovi ${i.name}`} onClick={() => onRemove(i.id)}>Rimuovi</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function Settings({ lists, views, replaceLists, src }: {
  lists: Lists; views: ViewsApi; replaceLists: (l: Lists) => void; src: ReturnType<typeof useSources>
}) {
  const personal = usePersonal()
  const [version, setVersion] = useState(0) // per aggiornare gli stati dopo aver salvato una chiave
  const tmdbOk = !!tmdb.getKey()
  const omdbOk = !!getOmdbKey()
  const aiOk = !!getAiKey()
  void version

  function exportJson() {
    const data = {
      lists, views: views.views, sources: src.sources, profiles: src.profiles,
      personal: { tags: personal.tags, reactions: personal.reactions, snoozed: personal.snoozed, prefs: personal.prefs },
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    a.download = 'marquee-backup.json'
    a.click()
  }
  async function importJson(file: File) {
    try {
      const d = JSON.parse(await file.text())
      replaceLists(d.lists ?? d)
      if (Array.isArray(d.views)) views.replace(d.views)
      src.replace(d.sources, d.profiles)
      if (d.personal) personal.restore(d.personal)
    } catch {
      alert('File non valido.')
    }
  }
  const missing = SUGGESTED_SOURCES.filter((s) => !src.sources.some((x) => x.url.replace(/\/$/, '') === s.url))
  const jump = (id: string) => document.getElementById(`set-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <>
      <h1 className="page-title">Impostazioni</h1>
      <p className="lede">Tutto resta su questo dispositivo: chiavi, liste e preferenze.</p>
      <div className="statusrow" aria-label="Stato dei collegamenti">
        <Status ok={tmdbOk} label="Film e serie" />
        <Status ok={omdbOk} label="Voti IMDb e Rotten Tomatoes" />
        <Status ok={aiOk} label="Intelligenza artificiale" />
      </div>

      <div className="setgrid">
        <nav className="setnav" aria-label="Sezioni delle impostazioni">
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => jump(s.id)}><Icon name={s.icon} size={18} />{s.label}</button>
          ))}
        </nav>

        <div className="setmain">
          <Section id="connections" icon="link" title="Collegamenti" desc="Le chiavi gratuite che fanno funzionare Marquee. Restano solo su questo dispositivo.">
            <ConnRow name="TMDB" required desc="Film, serie, cast e dove guardarli. È gratuita." value={tmdb.getKey()} onSave={(v) => { tmdb.setKey(v); setVersion((n) => n + 1) }} placeholder="Chiave API o token Read Access" getUrl="https://www.themoviedb.org/settings/api" getHow="Crea un account, poi Impostazioni → API → richiedi una chiave (uso personale) e copia la «API Key»." />
            <ConnRow name="OMDb" desc="Voti di IMDb, Rotten Tomatoes e Metacritic. Il piano gratuito dà 1.000 richieste al giorno." value={getOmdbKey()} onSave={(v) => { setOmdbKey(v); setVersion((n) => n + 1) }} placeholder="Chiave OMDb" getUrl="https://www.omdbapi.com/apikey.aspx" getHow="Scegli il piano FREE, inserisci l'email e clicca il link di attivazione che ti arriva." />
            <ConnRow name="Anthropic" desc="Per cercare con una frase e per le schede «Cosa aspettarti». Ogni richiesta ha un piccolo costo a tuo carico." value={getOwnAiKey()} onSave={(v) => { setAiKey(v); setVersion((n) => n + 1) }} placeholder="sk-ant-…" getUrl="https://console.anthropic.com/settings/keys" getHow="Accedi alla Console Anthropic, aggiungi un po' di credito in Billing, poi API keys → Create key e copia la chiave (inizia con sk-ant-)." />
          </Section>

          <Section id="platforms" icon="film" title="I tuoi abbonamenti" desc="Compaiono già selezionati nei filtri e in «Scegli per me», così vedi solo ciò che puoi guardare davvero.">
            <div className="row">
              {tmdb.PROVIDERS.map((pr) => (
                <Chip key={pr.id} on={personal.prefs.providers.includes(pr.id)} onClick={() => personal.setPrefs({ providers: personal.prefs.providers.includes(pr.id) ? personal.prefs.providers.filter((x) => x !== pr.id) : [...personal.prefs.providers, pr.id] })}>{pr.name}</Chip>
              ))}
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <Chip on={personal.prefs.useMine} onClick={() => personal.setPrefs({ useMine: !personal.prefs.useMine })}>Usa i miei abbonamenti nei consigli e nei filtri</Chip>
            </div>
          </Section>

          <Section id="prefs" icon="globe" title="Lingua e disponibilità" desc="Il punto di partenza dei filtri: puoi sempre cambiarlo per una singola ricerca.">
            <div className="row">
              <Chip on={personal.prefs.onlyItaly} onClick={() => personal.setPrefs({ onlyItaly: !personal.prefs.onlyItaly })}>Solo titoli guardabili in italiano</Chip>
            </div>
            <p className="muted" style={{ margin: '8px 0 14px' }}>Disponibili in Italia (abbonamento, noleggio o acquisto): di solito doppiati o sottotitolati.</p>
            <label className="fieldlabel">Lingua originale preferita</label>
            <div className="row">
              <Chip on={!personal.prefs.lang} onClick={() => personal.setPrefs({ lang: '' })}>Qualsiasi</Chip>
              {tmdb.LANGS.map((l) => <Chip key={l.id} on={personal.prefs.lang === l.id} onClick={() => personal.setPrefs({ lang: personal.prefs.lang === l.id ? '' : l.id })}>{l.label}</Chip>)}
            </div>
          </Section>

          <Section id="people" icon="users" title="Liste della home" desc="I nomi delle due liste personali, accanto a «Insieme».">
            <div className="row" style={{ gap: 10 }}>
              {[0, 1].map((i) => (
                <input
                  key={i}
                  value={personal.prefs.people[i]}
                  maxLength={20}
                  aria-label={`Nome della lista ${i + 1}`}
                  onChange={(e) => personal.setPrefs({ people: (i === 0 ? [e.target.value, personal.prefs.people[1]] : [personal.prefs.people[0], e.target.value]) as [string, string] })}
                  onBlur={(e) => !e.target.value.trim() && personal.setPrefs({ people: (i === 0 ? ['Luca', personal.prefs.people[1]] : [personal.prefs.people[0], 'Lara']) as [string, string] })}
                />
              ))}
            </div>
          </Section>

          <Section id="ai" icon="spark" title="Intelligenza artificiale" desc="Le richieste partono dal tuo dispositivo verso Anthropic con la tua chiave. Se il modello rifiuta una richiesta, l'API riprova con un modello di riserva (tranne Haiku).">
            <label className="fieldlabel" htmlFor="ai-model">Modello</label>
            <select id="ai-model" className="field" style={{ width: '100%', maxWidth: 420 }} value={personal.prefs.aiModel} onChange={(e) => personal.setPrefs({ aiModel: e.target.value })}>
              {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <div className="row" style={{ marginTop: 14 }}>
              <Chip on={personal.prefs.autoBlurb} onClick={() => personal.setPrefs({ autoBlurb: !personal.prefs.autoBlurb })}>Scheda automatica quando apro un titolo</Chip>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>Senza questa opzione le schede dettagliate si generano solo se premi il pulsante: ogni scheda usa una piccola richiesta all'IA.</p>
            <p className="muted" style={{ marginTop: 10 }}>Per spendere meno scegli Haiku. La ricerca con una frase è in Esplora e in Cerca → «Descrivi con l'IA».</p>
          </Section>

          <Section id="sources" icon="list" title="Fonti e profili" desc="Siti e profili di cui ti fidi per i consigli. Le fonti compaiono nella scheda Il meglio.">
            <LinkList
              title="Fonti di qualità"
              help="Riviste e siti di cinema."
              placeholder="https://www.mymovies.it"
              items={src.sources}
              onAdd={(v) => src.addSource(v)}
              onRemove={src.removeSource}
              extra={missing.length > 0 && (
                <div className="row" style={{ marginTop: 12 }}>
                  <span className="muted">Suggerite</span>
                  {missing.map((m) => <Chip key={m.url} onClick={() => src.addSource(m.url, m.name)}>+ {m.name}</Chip>)}
                </div>
              )}
            />
            <LinkList
              title="Profili da cui prendere spunto"
              help="Instagram, TikTok, YouTube o altro: incolla il link oppure scrivi @nomeprofilo."
              placeholder="https://www.instagram.com/nomeprofilo"
              items={src.profiles.map((p) => ({ id: p.id, url: p.url, name: p.name, tag: PLATFORM_LABEL[p.platform] }))}
              onAdd={(v) => src.addProfile(v)}
              onRemove={src.removeProfile}
            />
          </Section>

          <Section id="backup" icon="down" title="Backup" desc="Liste, ricerche salvate, fonti, profili, reazioni e abbonamenti (non le chiavi). Utile per passare da un dispositivo all'altro.">
            <div className="row">
              <button className="btn" onClick={exportJson}>Esporta</button>
              <label className="btn" style={{ cursor: 'pointer' }}>
                Importa
                <input type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
              </label>
            </div>
          </Section>

          <p className="muted" style={{ margin: '8px 4px 0' }}>Questo prodotto usa l'API di TMDB ma non è approvato o certificato da TMDB.</p>
        </div>
      </div>
    </>
  )
}
