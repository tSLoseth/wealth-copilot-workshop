import { useState } from 'react'
import type { BreakdownRow } from '../../api/reportTypes'
import { useDrillDown } from '../../context/DrillDownContext'

interface Props {
  rows: BreakdownRow[]
  valueLabel?: string
  riskLabel?: string
  showPaths?: boolean
  initial?: number
}

const OVER_THRESHOLD_PP = 1

export default function RiskBars({ rows, valueLabel = 'Andel av verdien', riskLabel = 'Andel av svingningene', showPaths, initial = 8 }: Props) {
  const { openDrill } = useDrillDown()
  const [all, setAll] = useState(false)
  if (rows.length === 0) return <p className="empty-state">Ingen investeringer å vise.</p>
  const scale = Math.max(...rows.map((r) => Math.max(r.value, r.secondary ?? 0)), 1)
  const visible = all ? rows : rows.slice(0, initial)
  const width = (v: number) => `${Math.max(0, (v / scale) * 100)}%`

  return (
    <div className="riskbars">
      <div className="riskbars__legend">
        <span><i className="dot dot--value" />{valueLabel}</span>
        <span><i className="dot dot--risk" />{riskLabel}</span>
      </div>
      <ul className="riskbars__list">
        {visible.map((row) => {
          const over = (row.secondary ?? 0) - row.value > OVER_THRESHOLD_PP
          const content = (
            <>
              <div className="riskbars__label">
                <span className="riskbars__name">{row.label}</span>
                {over && <span className="riskbars__flag">Bidrar mer enn størrelsen tilsier</span>}
                {showPaths && row.meta?.eies_via && <span className="riskbars__sub">Eies via: {String(row.meta.eies_via)}</span>}
              </div>
              <div className="riskbars__bars">
                <div className="riskbars__bar">
                  <span className="riskbars__fill riskbars__fill--value" style={{ width: width(row.value) }} />
                  <span className="riskbars__num">{row.display}</span>
                </div>
                <div className="riskbars__bar">
                  <span className="riskbars__fill riskbars__fill--risk" style={{ width: width(row.secondary ?? 0) }} />
                  <span className="riskbars__num">{row.secondary_display ?? '–'}</span>
                </div>
              </div>
            </>
          )
          return (
            <li key={`${row.label}-${row.drill?.value ?? ''}`} className={over ? 'is-over' : undefined}>
              {row.drill ? (
                <button type="button" className="riskbars__row" onClick={() => openDrill(row.drill!)} title="Se detaljer">
                  {content}
                </button>
              ) : (
                <div className="riskbars__row">{content}</div>
              )}
            </li>
          )
        })}
      </ul>
      {rows.length > initial && (
        <button type="button" className="link-button" onClick={() => setAll((v) => !v)}>
          {all ? 'Vis færre' : `Vis alle ${rows.length}`}
        </button>
      )}
    </div>
  )
}
