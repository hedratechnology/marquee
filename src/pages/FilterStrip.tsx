import { useFilters } from '../filters'
import { exploreOnly } from '../filtering'
import { Icon } from '../ui/icons'

/** Striscia sotto l'intestazione: i filtri attivi, ognuno si toglie con un tocco. */
export function FilterStrip({ showNotice }: { showNotice: boolean }) {
  const F = useFilters()
  const outside = showNotice ? exploreOnly(F.q, F.base) : []
  if (!F.chips.length && !outside.length) return null
  return (
    <div className="fstrip" aria-label="Filtri attivi">
      <div className="row">
        {F.chips.map((c) => (
          <button key={c.key} className="achip" onClick={() => F.set(c.clear)} aria-label={`Togli il filtro ${c.label}`} data-tip="Togli questo filtro">
            {c.label} <Icon name="x" size={12} />
          </button>
        ))}
        <button className="btn sm" onClick={F.reset} data-tip="Torna ai filtri di partenza"><Icon name="x" size={14} /> Azzera i filtri</button>
        <button className="link" onClick={() => F.setOpen(true)}>Modifica</button>
      </div>
      {outside.length > 0 && (
        <p className="muted" style={{ margin: '8px 0 0' }}>
          In questa pagina valgono tipo, genere, anno, voti e premi. Gli altri ({outside.join(', ')}) valgono in Esplora.
        </p>
      )}
    </div>
  )
}
