import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { DrillTarget, ExposureRow, PositionRow } from '../api/reportTypes'
import { useCustomerContext } from '../context/CustomerContext'
import { useDrillDown } from '../context/DrillDownContext'
import { rangeLabel, useViewSettings } from '../context/ViewSettingsContext'
import { useExposures, useInstrumentHistory } from '../hooks/useApiData'
import {
  GROUP_DIMENSIONS,
  filterExposures,
  filterPositions,
  formatPaths,
  groupBy,
  summarize,
  type GroupDimension,
} from '../utils/drill'
import { formatDateNo, formatKr, formatNum, formatPct, formatSignedPct } from '../utils/format'
import { DIMENSION_NB } from '../utils/labels'
import { BENCHMARK_NAME, BenchmarkStatus, IndexChart, PeriodStatsRow, mergeIndexSeries } from './IndexChart'

const LIST_LIMIT = 20
const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

function signedClass(value: number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return value >= 0 ? 'positive' : 'negative'
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string | null; tone?: string }) {
  return (
    <div className="drill-kpi">
      <dt>{label}</dt>
      <dd>
        <span className={`drill-kpi__value ${tone ?? ''}`}>{value}</span>
        {sub && <span className="drill-kpi__sub">{sub}</span>}
      </dd>
    </div>
  )
}

function ShareBar({ pct, max }: { pct: number; max: number }) {
  const width = max > 0 ? Math.max(2, Math.min(100, (pct / max) * 100)) : 0
  return (
    <span className="share-bar" aria-hidden="true">
      <span className="share-bar__fill" style={{ width: `${width}%` }} />
    </span>
  )
}

function ExposureList({ rows, onOpen }: { rows: ExposureRow[]; onOpen: (row: ExposureRow) => void }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? rows : rows.slice(0, LIST_LIMIT)
  const max = Math.max(...rows.map((row) => row.weight_pct), 0)
  return (
    <>
      <ul className="drill-list">
        {visible.map((row) => (
          <li key={row.ticker}>
            <button type="button" className="drill-row" onClick={() => onOpen(row)}>
              <span className="drill-row__top">
                <span className="drill-row__name">
                  {row.name} <span className="muted-small">{row.ticker}</span>
                </span>
                <span className="drill-row__value">{formatPct(row.weight_pct)}</span>
              </span>
              <ShareBar pct={row.weight_pct} max={max} />
              <span className="drill-row__meta">
                <span>Risiko {formatPct(row.risk_contribution_pct)}</span>
                <span className={signedClass(row.return_pct)}>
                  Avkastning {row.return_pct === null ? '–' : formatSignedPct(row.return_pct)}
                </span>
                {row.paths.length > 0 && <span>Eies via {formatPaths(row.paths)}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {rows.length > LIST_LIMIT && (
        <button type="button" className="link-button" onClick={() => setShowAll((value) => !value)}>
          {showAll ? 'Vis færre' : `Vis alle (${rows.length})`}
        </button>
      )}
    </>
  )
}

function PositionList({ rows, onOpen }: { rows: PositionRow[]; onOpen: (row: PositionRow) => void }) {
  return (
    <ul className="drill-list">
      {rows.map((row) => (
        <li key={row.ticker}>
          <button type="button" className="drill-row" onClick={() => onOpen(row)}>
            <span className="drill-row__top">
              <span className="drill-row__name">
                {row.name} <span className="muted-small">{row.ticker}</span>
              </span>
              <span className="drill-row__value">{formatPct(row.weight_pct)}</span>
            </span>
            <span className="drill-row__meta">
              <span>{formatKr(row.value)}</span>
              {row.is_fund && <span>Fond – klikk for å se hva det eier</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function GroupView({ target, dimension, customerId }: { target: DrillTarget; dimension: GroupDimension; customerId: string }) {
  const { range, showBenchmark } = useViewSettings()
  const { openDrill } = useDrillDown()
  const { data, error } = useExposures(customerId)

  if (!data) {
    return error ? <p className="error-state">Klarte ikke å hente detaljene. Prøv igjen litt senere.</p> : <p className="loading-state">Henter detaljer …</p>
  }

  const rows = filterExposures(data.exposures, target)
  const positions = filterPositions(data.positions, target)
  const summary = summarize(rows)
  const openInstrument = (row: { ticker: string; name: string }) => openDrill({ dimension: 'instrument', value: row.ticker, label: row.name })
  const benchmarkReturn = showBenchmark && data.benchmark_return_pct !== null ? `${BENCHMARK_NAME}: ${formatSignedPct(data.benchmark_return_pct)}` : null

  if (rows.length === 0) {
    return (
      <div className="drill-section">
        <p>
          Når vi ser gjennom fondene, finner vi ikke noe du eier som hører til «{target.label}».
          {positions.length > 0 && ' Det er fondene selv som er registrert slik. Velg et fond for å se hva det faktisk eier.'}
        </p>
        {positions.length > 0 && <PositionList rows={positions} onOpen={openInstrument} />}
      </div>
    )
  }

  const otherDimensions = GROUP_DIMENSIONS.filter((other) => other !== dimension)

  return (
    <>
      <dl className="drill-kpis">
        <Kpi label="Andel av porteføljen" value={formatPct(summary.weight_pct)} />
        <Kpi label="Verdi" value={formatKr(summary.value)} />
        <Kpi label="Andel av risikoen" value={formatPct(summary.risk_pct)} sub="av svingningene i porteføljen" />
        <Kpi
          label={`Avkastning (${rangeLabel(range)})`}
          value={summary.return_pct === null ? 'Ikke tilgjengelig' : formatSignedPct(summary.return_pct)}
          tone={signedClass(summary.return_pct)}
          sub={benchmarkReturn}
        />
      </dl>
      {summary.risk_pct > summary.weight_pct * 1.2 && summary.weight_pct > 0 && (
        <p className="callout callout--notice drill-callout">Denne delen står for mer av svingningene enn av verdien i porteføljen.</p>
      )}

      <section className="drill-section">
        <h3>Det du eier her ({rows.length})</h3>
        <p className="muted-small">Andel av hele porteføljen. Klikk for å se mer om hvert papir.</p>
        <ExposureList rows={rows} onOpen={openInstrument} />
      </section>

      {otherDimensions.map((other) => {
        const groups = groupBy(rows, other)
        if (groups.length < 2) return null
        const max = Math.max(...groups.map((group) => group.value))
        return (
          <section key={other} className="drill-section">
            <h3>Fordelt på {DIMENSION_NB[other].toLowerCase()}</h3>
            <ul className="drill-list drill-list--compact">
              {groups.map((group) => {
                const share = summary.value > 0 ? (group.value / summary.value) * 100 : 0
                return (
                  <li key={group.key}>
                    <button
                      type="button"
                      className="drill-row"
                      onClick={() => openDrill({ dimension: other, value: group.key, label: group.label })}
                      aria-label={`${group.label}: ${formatPct(share)} av denne delen. Åpne hele gruppen.`}
                    >
                      <span className="drill-row__top">
                        <span className="drill-row__name">{group.label}</span>
                        <span className="drill-row__value">{formatPct(share)}</span>
                      </span>
                      <ShareBar pct={group.value} max={max} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </>
  )
}

function InstrumentView({ ticker, label, customerId }: { ticker: string; label: string; customerId: string }) {
  const { range, showBenchmark } = useViewSettings()
  const { openDrill } = useDrillDown()
  const history = useInstrumentHistory(ticker)
  const exposures = useExposures(customerId)

  const exposure = exposures.data?.exposures.find((row) => row.ticker === ticker)
  const position = exposures.data?.positions.find((row) => row.ticker === ticker)
  const ownedFunds = new Set((exposures.data?.positions ?? []).filter((row) => row.is_fund).map((row) => row.ticker))
  const info = history.data ?? exposure ?? position
  const name = history.data?.name ?? exposure?.name ?? position?.name ?? label
  const lastPoint = history.data?.points[history.data.points.length - 1]
  const benchmark = showBenchmark ? history.data?.benchmark ?? null : null
  const openInstrument = (nextTicker: string, nextLabel: string) => openDrill({ dimension: 'instrument', value: nextTicker, label: nextLabel })

  return (
    <>
      <div className="chip-row">
        <span className="chip chip--mono">{ticker}</span>
        {info?.asset_type_label && <span className="chip">{info.asset_type_label}</span>}
        {info?.sector_label && <span className="chip">{info.sector_label}</span>}
        {info?.geography_label && <span className="chip">{info.geography_label}</span>}
      </div>

      <section className="drill-section">
        <h3>Det du eier</h3>
        {!exposures.data && !exposures.error && <p className="loading-state">Henter porteføljen din …</p>}
        {exposures.error && !exposures.data && <p className="error-state">Klarte ikke å hente hva du eier akkurat nå.</p>}
        {exposures.data && (
          <>
            {exposure && (
              <dl className="drill-kpis">
                <Kpi label="Andel av porteføljen" value={formatPct(exposure.weight_pct)} />
                <Kpi label="Verdi" value={formatKr(exposure.value)} />
                <Kpi label="Andel av risikoen" value={formatPct(exposure.risk_contribution_pct)} />
                <Kpi
                  label={`Avkastning (${rangeLabel(range)})`}
                  value={exposure.return_pct === null ? 'Ikke tilgjengelig' : formatSignedPct(exposure.return_pct)}
                  tone={signedClass(exposure.return_pct)}
                />
              </dl>
            )}
            {exposure && exposure.paths.length > 0 && (
              <p className="drill-paths">
                <strong>Eies via:</strong> {formatPaths(exposure.paths)}
              </p>
            )}
            {!exposure && position && (
              <p>
                Du eier {position.is_fund ? 'fondet' : 'dette'} direkte: {formatPct(position.weight_pct)} av porteføljen ({formatKr(position.value)}).
                {position.is_fund && ' Når vi ser gjennom fondet, fordeles verdien på papirene det eier (se under).'}
              </p>
            )}
            {!exposure && !position && <p className="muted-small">Du eier ikke dette, verken direkte eller gjennom fondene dine.</p>}
          </>
        )}
      </section>

      <section className="drill-section">
        <h3>
          Kursutvikling <span className="chip chip--muted">{rangeLabel(range)}</span>
        </h3>
        {!history.data && !history.error && <p className="loading-state">Henter kurser …</p>}
        {history.error && !history.data && <p className="muted-small">Kursutvikling er ikke tilgjengelig for dette papiret.</p>}
        {history.data && (
          <div className={history.loading ? 'is-stale' : undefined}>
            <IndexChart
              data={mergeIndexSeries(history.data.points, benchmark?.points)}
              mainLabel={name}
              showBenchmark={showBenchmark}
              height={220}
              ariaLabel={`${name} har endret seg ${formatSignedPct(history.data.stats.return_pct)} i perioden${
                benchmark ? `, ${BENCHMARK_NAME} ${formatSignedPct(benchmark.stats.return_pct)}` : ''
              }.`}
            />
            {lastPoint && (
              <p className="muted-small">
                Siste kurs {formatNum(lastPoint.price, 2)} ({formatDateNo(lastPoint.date)})
              </p>
            )}
            <PeriodStatsRow main={history.data.stats} mainLabel={name} benchmark={benchmark?.stats} />
            <BenchmarkStatus
              showBenchmark={showBenchmark}
              available={!!history.data.benchmark}
              loading={history.loading}
              source={history.data.benchmark?.source}
            />
          </div>
        )}
      </section>

      {history.data && history.data.fund_holdings.length > 0 && (
        <section className="drill-section">
          <h3>Dette eier fondet ({history.data.fund_holdings.length})</h3>
          <ul className="drill-list drill-list--compact">
            {history.data.fund_holdings.map((holding) => (
              <li key={holding.constituent_ticker}>
                <button type="button" className="drill-row" onClick={() => openInstrument(holding.constituent_ticker, holding.name)}>
                  <span className="drill-row__top">
                    <span className="drill-row__name">
                      {holding.name} <span className="muted-small">{holding.constituent_ticker}</span>
                    </span>
                    <span className="drill-row__value">{formatPct(holding.weight_pct)}</span>
                  </span>
                  <span className="drill-row__meta">
                    <span>{holding.sector_label}</span>
                    <span>{holding.geography_label}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {history.data && history.data.held_by_funds.length > 0 && (
        <section className="drill-section">
          <h3>Eies også av disse fondene</h3>
          <ul className="drill-list drill-list--compact">
            {history.data.held_by_funds.map((fund) => (
              <li key={fund.fund_ticker}>
                <button type="button" className="drill-row" onClick={() => openInstrument(fund.fund_ticker, fund.fund_name)}>
                  <span className="drill-row__top">
                    <span className="drill-row__name">
                      {fund.fund_name} <span className="muted-small">{fund.fund_ticker}</span>
                    </span>
                    <span className="drill-row__value">{formatPct(fund.weight_pct)} av fondet</span>
                  </span>
                  {ownedFunds.has(fund.fund_ticker) && (
                    <span className="drill-row__meta">
                      <span className="chip">Du eier dette fondet</span>
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

export default function DrillDownPanel() {
  const { stack, goTo, back, close } = useDrillDown()
  const { selectedCustomerId } = useCustomerContext()
  const panelRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const current = stack[stack.length - 1]
  const open = stack.length > 0

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [open, close])

  useEffect(() => {
    headingRef.current?.focus()
    panelRef.current?.querySelector('.drill-panel__body')?.scrollTo?.({ top: 0 })
  }, [current])

  if (!current || !selectedCustomerId) return null

  // Keeps keyboard focus inside the dialog while it is open.
  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab' || !panelRef.current) return
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="drill-root">
      <div className="drill-backdrop" onClick={close} aria-hidden="true" />
      <div className="drill-panel" role="dialog" aria-modal="true" aria-labelledby="drill-title" ref={panelRef} onKeyDown={trapFocus}>
        <header className="drill-panel__header">
          <div className="drill-panel__toolbar">
            {stack.length > 1 ? (
              <button type="button" className="link-button drill-panel__back" onClick={back}>
                ← Tilbake
              </button>
            ) : (
              <span />
            )}
            <button type="button" className="drill-panel__close" onClick={close} aria-label="Lukk detaljer">
              <span aria-hidden="true">×</span>
            </button>
          </div>
          {stack.length > 1 && (
            <nav aria-label="Brødsmulesti">
              <ol className="breadcrumb">
                {stack.map((target, index) => (
                  <li key={`${target.dimension}-${target.value}`}>
                    {index < stack.length - 1 ? (
                      <button type="button" onClick={() => goTo(index)}>
                        {target.label}
                      </button>
                    ) : (
                      <span aria-current="page">{target.label}</span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <p className="eyebrow">{DIMENSION_NB[current.dimension]}</p>
          <h2 id="drill-title" ref={headingRef} tabIndex={-1}>
            {current.label}
          </h2>
        </header>
        <div className="drill-panel__body">
          {current.dimension === 'instrument' ? (
            <InstrumentView key={current.value} ticker={current.value} label={current.label} customerId={selectedCustomerId} />
          ) : (
            <GroupView key={`${current.dimension}-${current.value}`} target={current} dimension={current.dimension} customerId={selectedCustomerId} />
          )}
        </div>
      </div>
    </div>
  )
}
