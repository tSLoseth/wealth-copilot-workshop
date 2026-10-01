import { useEffect, useState } from 'react'
import type { MetricResult } from '../../api/reportTypes'
import { SECTOR_NB } from '../../utils/labels'
import { WhyToggle } from './RiskParts'
import { useMetric } from './useMetric'

const ALLOWED = ['Technology', 'Financials', 'Healthcare', 'Energy', 'Industrials', 'Consumer Discretionary', 'Consumer Staples', 'Materials', 'Utilities']

// Parses "±148 510 kr" back to a number so the difference can be shown.
function krNumber(text?: string | number): number | null {
  if (text === undefined) return null
  const n = Number(String(text).replace(/[^\d]/g, ''))
  return Number.isFinite(n) && String(text).match(/\d/) ? n : null
}

export default function WhatIf({ customerId, sectors }: { customerId: string; sectors: MetricResult | null }) {
  const options = (sectors?.breakdown ?? [])
    .filter((row) => row.drill && ALLOWED.includes(row.drill.value) && row.value > 0)
    .map((row) => ({ value: row.drill!.value, label: SECTOR_NB[row.drill!.value] ?? row.label, weight: row.value }))
  const [sector, setSector] = useState('Technology')
  const [pp, setPp] = useState(15)
  const [debounced, setDebounced] = useState({ sector, pp })

  useEffect(() => {
    const timer = setTimeout(() => setDebounced({ sector, pp }), 300)
    return () => clearTimeout(timer)
  }, [sector, pp])

  const activeSector = options.some((o) => o.value === debounced.sector) ? debounced.sector : options[0]?.value
  const shownSector = options.some((o) => o.value === sector) ? sector : options[0]?.value
  const selected = options.find((o) => o.value === shownSector)
  const enabled = !!activeSector && debounced.pp > 0
  const result = useMetric(customerId, 'what_if_shift', { sector: activeSector ?? '', pp: debounced.pp }, enabled)
  const metric = enabled ? result.data : null
  const [before, after] = metric?.breakdown ?? []
  const krBefore = krNumber(before?.meta?.i_kroner)
  const krAfter = krNumber(after?.meta?.i_kroner)

  if (options.length === 0) return <p className="empty-state">Porteføljen har ingen aksjesektorer å flytte fra.</p>

  return (
    <div className="whatif">
      <p className="whatif__disclaimer">Illustrasjon, ikke et råd</p>
      <div className="whatif__controls">
        <label className="whatif__field">
          <span>Sektor</span>
          <select value={shownSector} onChange={(e) => setSector(e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} ({o.weight.toLocaleString('nb-NO')} % av porteføljen)
              </option>
            ))}
          </select>
        </label>
        <label className="whatif__field whatif__field--slider">
          <span>
            Flytt <strong>{pp} prosentpoeng</strong> av porteføljen fra {selected?.label.toLowerCase() ?? 'sektoren'} til kontanter
          </span>
          <input type="range" min={0} max={40} step={1} value={pp} onChange={(e) => setPp(Number(e.target.value))} aria-label="Prosentpoeng som flyttes" />
          <span className="whatif__scale">
            <span>0</span>
            <span>20</span>
            <span>40</span>
          </span>
        </label>
      </div>

      {debounced.pp === 0 ? (
        <p className="empty-state">Dra i glidebryteren for å se hvordan svingningene endrer seg.</p>
      ) : result.error ? (
        <p className="error-state">{result.error.message}</p>
      ) : !metric ? (
        <div className="risk-skeleton risk-skeleton--short" aria-label="Regner ut" />
      ) : (
        <div className={`whatif__result${result.loading ? ' is-stale' : ''}`}>
          <div className="whatif__col">
            <p className="whatif__cap">Slik porteføljen er nå</p>
            <p className="whatif__big">{before?.display}</p>
            <p className="whatif__kr">{String(before?.meta?.i_kroner ?? '')} i et vanlig år</p>
          </div>
          <span className="whatif__arrow" aria-hidden>
            →
          </span>
          <div className="whatif__col whatif__col--after">
            <p className="whatif__cap">{after?.label}</p>
            <p className="whatif__big">{after?.display}</p>
            <p className="whatif__kr">{String(after?.meta?.i_kroner ?? '')} i et vanlig år</p>
          </div>
          {krBefore !== null && krAfter !== null && (
            <p className="whatif__delta">
              Det er ca. <strong>{Math.abs(krBefore - krAfter).toLocaleString('nb-NO')} kr</strong> {krAfter <= krBefore ? 'mindre' : 'mer'} svingning i et vanlig
              år. Kontanter svinger ikke, men gir heller ikke avkastning.
            </p>
          )}
        </div>
      )}
      <WhyToggle metrics={[metric]} />
    </div>
  )
}
