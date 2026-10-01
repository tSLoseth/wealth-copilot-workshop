import type { HoldingSummary } from '../api/types'
import type { PositionRow } from '../api/reportTypes'
import { useDrillDown } from '../context/DrillDownContext'
import { formatKr, formatPct, formatSignedPct } from '../utils/format'
import { ASSET_TYPE_NB } from '../utils/labels'

const displayName = (name: string) => name.replace(/\s*\(Fictional\)$/, '')

export default function HoldingsTable({
  holdings,
  positions,
  periodLabel,
}: {
  holdings: HoldingSummary[]
  positions?: PositionRow[] | null
  periodLabel: string
}) {
  const { openDrill } = useDrillDown()
  if (holdings.length === 0) return <p className="empty-state">Ingen beholdninger å vise.</p>

  const periodReturn = new Map((positions ?? []).map((position) => [position.ticker, position.return_pct]))
  const showPeriod = periodReturn.size > 0

  return (
    <div className="table-scroll">
      <table className="holdings-table">
        <thead>
          <tr>
            <th>Navn</th>
            <th>Type</th>
            <th className="num">Verdi</th>
            <th className="num">Andel</th>
            {showPeriod && <th className="num">Avkastning ({periodLabel})</th>}
            <th className="num">Urealisert gevinst/tap</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((holding) => {
            const name = displayName(holding.name)
            const open = () => openDrill({ dimension: 'instrument', value: holding.ticker, label: name })
            const ret = periodReturn.get(holding.ticker)
            return (
              <tr key={holding.investment_id} className="is-clickable" onClick={open}>
                <td>
                  <button
                    type="button"
                    className="row-link"
                    onClick={(event) => {
                      event.stopPropagation()
                      open()
                    }}
                  >
                    <span className="holdings-table__name">{name}</span>
                    <span className="holdings-table__ticker">{holding.ticker}</span>
                  </button>
                </td>
                <td>{ASSET_TYPE_NB[holding.asset_type] ?? holding.asset_type}</td>
                <td className="num">{formatKr(holding.market_value)}</td>
                <td className="num">{formatPct(holding.weight_pct)}</td>
                {showPeriod && (
                  <td className={`num ${ret === null || ret === undefined ? '' : ret >= 0 ? 'positive' : 'negative'}`}>
                    {ret === null || ret === undefined ? '–' : formatSignedPct(ret)}
                  </td>
                )}
                <td className={`num ${holding.unrealized_gain_loss >= 0 ? 'positive' : 'negative'}`}>
                  {holding.unrealized_gain_loss >= 0 ? '+' : ''}
                  {formatKr(holding.unrealized_gain_loss)} ({formatSignedPct(holding.unrealized_gain_loss_pct)})
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
