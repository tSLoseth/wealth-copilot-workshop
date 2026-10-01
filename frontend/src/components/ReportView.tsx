import { useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fetchFundHoldings, type FundHoldingsResponse } from '../api/client'
import type { BreakdownRow, DataQualityNote, MetricResult, ResolvedBlock, ResolvedReport } from '../api/reportTypes'
import { useDrillDown } from '../context/DrillDownContext'
import { useViewSettings } from '../context/ViewSettingsContext'
import { formatDateNo } from '../utils/format'

const VALUE_COLOR = '#0000A0'
const SECONDARY_COLOR = '#E07A1F'

const FUND_TICKERS = new Set(['TECHF', 'GLBEQ', 'NRDEQ', 'EMGEQ', 'GRNEF', 'MFBAL', 'MFCON', 'MFPEN', 'CORPB'])
const FUND_LOOKUP_METRICS = new Set(['tech_exposure', 'overlap', 'risk_by_holding'])

const STATUS_LABELS: Record<string, string> = {
  within: 'Innenfor profilen',
  above: 'Over profilen',
  below: 'Under profilen',
  unknown: 'Ukjent',
}

const SEVERITY_LABELS: Record<DataQualityNote['severity'], string> = {
  info: 'Til info',
  notice: 'Merk',
  warning: 'Viktig',
}

function metaLabel(key: string): string {
  const text = key.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function StatusBadge({ status }: { status?: MetricResult['status'] }) {
  if (!status || status === 'unknown') return null
  return <span className={`status-badge status-badge--${status}`}>{STATUS_LABELS[status]}</span>
}

function DataQualityList({ notes }: { notes: DataQualityNote[] }) {
  if (notes.length === 0) return null
  return (
    <ul className="dq-list">
      {notes.map((note, index) => (
        <li key={index} className={`dq-note dq-note--${note.severity}`}>
          <span className="dq-note__label">{SEVERITY_LABELS[note.severity]}</span>
          {note.message}
        </li>
      ))}
    </ul>
  )
}

function WhyPanel({ metric }: { metric: MetricResult }) {
  const [open, setOpen] = useState(false)
  const { provenance } = metric
  return (
    <div className="why">
      <button type="button" className="why__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? 'Skjul forklaring' : 'Hvorfor ser jeg dette?'}
      </button>
      {open && (
        <div className="why__body">
          <p>
            <strong>Spørsmålet tallet svarer på:</strong> {metric.question}
          </p>
          <dl className="why__facts">
            <dt>Kilder</dt>
            <dd>{provenance.sources.join(', ') || 'Ikke oppgitt'}</dd>
            {provenance.period && (
              <>
                <dt>Periode</dt>
                <dd>{provenance.period}</dd>
              </>
            )}
            {provenance.as_of && (
              <>
                <dt>Data per</dt>
                <dd>{formatDateNo(provenance.as_of)}</dd>
              </>
            )}
            <dt>Datarader brukt</dt>
            <dd>{provenance.rows_used.toLocaleString('nb-NO')}</dd>
          </dl>
          {metric.assumptions.length > 0 && (
            <>
              <h5>Antakelser</h5>
              <ul className="plain-list">
                {metric.assumptions.map((assumption, index) => (
                  <li key={index}>{assumption}</li>
                ))}
              </ul>
            </>
          )}
          {metric.data_quality.length > 0 && (
            <>
              <h5>Datakvalitet</h5>
              <DataQualityList notes={metric.data_quality} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function fundTickersIn(rows: BreakdownRow[]): string[] {
  const found = new Set<string>()
  for (const row of rows) {
    for (const key of ['ticker', 'fund_ticker']) {
      const raw = row.meta?.[key]
      if (typeof raw !== 'string') continue
      raw
        .split(/[\s,]+/)
        .filter((ticker) => FUND_TICKERS.has(ticker))
        .forEach((ticker) => found.add(ticker))
    }
  }
  return [...found]
}

function FundLookup({ tickers }: { tickers: string[] }) {
  const [active, setActive] = useState<string | null>(null)
  const [data, setData] = useState<FundHoldingsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (tickers.length === 0) return null

  async function open(ticker: string) {
    if (active === ticker) {
      setActive(null)
      return
    }
    setActive(ticker)
    setData(null)
    setError(null)
    setLoading(true)
    try {
      setData(await fetchFundHoldings(ticker))
    } catch {
      setError('Klarte ikke å hente innholdet i fondet.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fund-lookup">
      <span className="fund-lookup__label">Se hva fondene inneholder:</span>
      {tickers.map((ticker) => (
        <button
          key={ticker}
          type="button"
          className={`chip chip--button${active === ticker ? ' chip--active' : ''}`}
          onClick={() => open(ticker)}
        >
          {ticker}
        </button>
      ))}
      {active && (
        <div className="fund-lookup__body">
          {loading && <p className="loading-state">Henter innholdet i {active} …</p>}
          {error && <p className="error-state">{error}</p>}
          {data && (
            <>
              <p className="muted-small">
                Innholdet i {data.fund_ticker} per {formatDateNo(data.as_of_date)}
              </p>
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Selskap / papir</th>
                    <th>Sektor</th>
                    <th>Region</th>
                    <th className="num">Andel av fondet</th>
                  </tr>
                </thead>
                <tbody>
                  {data.holdings.map((holding) => (
                    <tr key={holding.constituent_ticker}>
                      <td>
                        {holding.name} <span className="muted-small">{holding.constituent_ticker}</span>
                      </td>
                      <td>{holding.sector}</td>
                      <td>{holding.geography}</td>
                      <td className="num">{holding.weight_pct.toLocaleString('nb-NO')} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function DrillHint({ rows }: { rows: BreakdownRow[] }) {
  const { openDrill } = useDrillDown()
  const drillable = rows.filter((row) => row.drill)
  if (drillable.length === 0) return null
  return (
    <div className="drill-hint">
      <span className="click-hint">Klikk for detaljer:</span>
      {drillable.map((row, index) => (
        <button key={`${row.label}-${index}`} type="button" className="chip chip--button chip--small" onClick={() => openDrill(row.drill!)}>
          {row.label}
        </button>
      ))}
    </div>
  )
}

function BarBlock({ metric }: { metric: MetricResult }) {
  const { openDrill } = useDrillDown()
  const rows = (metric.breakdown ?? []).slice(0, 10)
  if (rows.length === 0) return <p className="empty-state">Ingen data å vise.</p>
  const hasDrill = rows.some((row) => row.drill)
  const onBarClick = (item: { payload?: BreakdownRow }) => {
    if (item?.payload?.drill) openDrill(item.payload.drill)
  }
  const hasSecondary = rows.some((row) => row.secondary !== undefined)
  const valueLabel = metric.value_label ?? 'Verdi'
  const secondaryLabel = metric.secondary_label ?? 'Sammenligning'
  const height = rows.length * (hasSecondary ? 52 : 36) + 70

  return (
    <div className={`report-chart${hasDrill ? ' report-chart--drill' : ''}`}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 8 }} barGap={2}>
          <CartesianGrid horizontal={false} stroke="#e2e8f0" />
          <XAxis type="number" tick={{ fontSize: 12 }} />
          <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 12 }} interval={0} />
          <Tooltip
            cursor={{ fill: '#f1f5f9' }}
            formatter={(_value, name, item) => {
              const row = item.payload as BreakdownRow
              return [name === secondaryLabel ? row.secondary_display ?? row.secondary : row.display, name]
            }}
          />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Bar
            dataKey="value"
            name={valueLabel}
            fill={VALUE_COLOR}
            radius={[0, 4, 4, 0]}
            cursor={hasDrill ? 'pointer' : undefined}
            onClick={onBarClick}
          >
            <LabelList dataKey="display" position="right" style={{ fontSize: 11, fill: '#334155' }} />
          </Bar>
          {hasSecondary && (
            <Bar
              dataKey="secondary"
              name={secondaryLabel}
              fill={SECONDARY_COLOR}
              radius={[0, 4, 4, 0]}
              cursor={hasDrill ? 'pointer' : undefined}
              onClick={onBarClick}
            >
              <LabelList dataKey="secondary_display" position="right" style={{ fontSize: 11, fill: '#334155' }} />
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
      <DrillHint rows={rows} />
    </div>
  )
}

function TableBlock({ metric }: { metric: MetricResult }) {
  const { openDrill } = useDrillDown()
  const rows = metric.breakdown ?? []
  if (rows.length === 0) return <p className="empty-state">Ingen data å vise.</p>
  const hasSecondary = rows.some((row) => row.secondary_display !== undefined)
  const metaKeys = [...new Set(rows.flatMap((row) => Object.keys(row.meta ?? {})))]

  return (
    <div className="table-scroll">
      <table className="report-table">
        <thead>
          <tr>
            <th />
            <th className="num">{metric.value_label ?? 'Verdi'}</th>
            {hasSecondary && <th className="num">{metric.secondary_label ?? 'Sammenligning'}</th>}
            {metaKeys.map((key) => (
              <th key={key}>{metaLabel(key)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${row.label}-${index}`}
              className={row.drill ? 'is-clickable' : undefined}
              onClick={row.drill ? () => openDrill(row.drill!) : undefined}
            >
              <td className="report-table__label">
                {row.drill ? (
                  <button
                    type="button"
                    className="row-link"
                    onClick={(event) => {
                      event.stopPropagation()
                      openDrill(row.drill!)
                    }}
                  >
                    {row.label}
                  </button>
                ) : (
                  row.label
                )}
              </td>
              <td className="num">{row.display}</td>
              {hasSecondary && <td className="num">{row.secondary_display ?? ''}</td>}
              {metaKeys.map((key) => (
                <td key={key}>{row.meta?.[key] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.some((row) => row.drill) && <p className="click-hint">Klikk på en rad for detaljer</p>}
    </div>
  )
}

function ScenarioBlock({ metric, caption }: { metric: MetricResult; caption?: string }) {
  const { openDrill } = useDrillDown()
  const losses = (metric.breakdown ?? []).slice(0, 5)
  return (
    <div className="scenario">
      <p className="scenario__name">{metric.facts.scenario_name ?? metric.title}</p>
      <p className="scenario__loss">{metric.display}</p>
      {(metric.facts.scenario_description || caption) && (
        <p className="scenario__description">{metric.facts.scenario_description ?? caption}</p>
      )}
      {losses.length > 0 && (
        <>
          <h5>Største tap</h5>
          <ol className="scenario__losses">
            {losses.map((row, index) => (
              <li key={`${row.label}-${index}`}>
                {row.drill ? (
                  <button type="button" className="row-link" onClick={() => openDrill(row.drill!)}>
                    {row.label}
                  </button>
                ) : (
                  <span>{row.label}</span>
                )}
                <span className="negative">{row.display}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}

type BandSegment = 'below' | 'within' | 'above'

// Places a value in the profile band, using the band limits (meta.fra/til) from the breakdown.
function bandSegment(metric: MetricResult, value: number | null): BandSegment | null {
  if (value === null) return null
  const band = metric.breakdown?.find((row) => typeof row.meta?.fra === 'number' && typeof row.meta?.til === 'number')
  if (!band?.meta) return null
  const min = band.meta.fra as number
  const max = band.meta.til as number
  return value < min ? 'below' : value > max ? 'above' : 'within'
}

function StatusBlock({ metric }: { metric: MetricResult }) {
  const { showBenchmark } = useViewSettings()
  const benchmark = showBenchmark ? metric.benchmark : undefined
  const benchmarkSegment = benchmark ? bandSegment(metric, benchmark.value) : null
  const segments: { key: BandSegment; label: string }[] = [
    { key: 'below', label: 'Under profilen' },
    { key: 'within', label: 'Innenfor profilen' },
    { key: 'above', label: 'Over profilen' },
  ]
  return (
    <div
      className={`status-band${benchmarkSegment ? ' status-band--with-benchmark' : ''}`}
      role="img"
      aria-label={`${metric.title}: ${metric.display}, ${STATUS_LABELS[metric.status ?? 'unknown']}${benchmark ? `. OSEBX: ${benchmark.display}` : ''}`}
    >
      <div className="status-band__track">
        {segments.map((segment) => (
          <div
            key={segment.key}
            className={`status-band__segment status-band__segment--${segment.key}${metric.status === segment.key ? ' is-active' : ''}`}
          >
            {metric.status === segment.key && <span className="status-band__marker">{metric.display}</span>}
            <span className="status-band__label">{segment.label}</span>
            {benchmarkSegment === segment.key && (
              <span className="status-band__marker status-band__marker--benchmark">OSEBX: {benchmark!.display}</span>
            )}
          </div>
        ))}
      </div>
      {(!metric.status || metric.status === 'unknown') && (
        <p className="muted-small">Vi kunne ikke avgjøre om dette passer profilen din ({metric.display}).</p>
      )}
      {benchmark && !benchmarkSegment && <p className="benchmark-note">OSEBX: {benchmark.display}</p>}
    </div>
  )
}

function BenchmarkNote({ metric }: { metric: MetricResult }) {
  const { showBenchmark } = useViewSettings()
  if (!showBenchmark || !metric.benchmark) return null
  return (
    <p className="benchmark-note" title={metric.benchmark.label}>
      OSEBX: {metric.benchmark.display}
    </p>
  )
}

function MetricBlock({ block, metric }: { block: ResolvedBlock; metric: MetricResult }) {
  let body: ReactNode
  switch (block.type) {
    case 'kpi':
      body = (
        <div className="kpi">
          <p className="kpi__value">{metric.display}</p>
          <BenchmarkNote metric={metric} />
          <StatusBadge status={metric.status} />
        </div>
      )
      break
    case 'bar':
      body = <BarBlock metric={metric} />
      break
    case 'table':
      body = <TableBlock metric={metric} />
      break
    case 'scenario':
      body = <ScenarioBlock metric={metric} caption={block.caption} />
      break
    case 'status':
      body = <StatusBlock metric={metric} />
      break
    default:
      body = <p className="kpi__value">{metric.display}</p>
  }

  const warnings = metric.data_quality.filter((note) => note.severity === 'warning')
  const showCaption = block.caption && !(block.type === 'scenario' && !metric.facts.scenario_description)
  const fundTickers = FUND_LOOKUP_METRICS.has(metric.id) ? fundTickersIn(metric.breakdown ?? []) : []

  return (
    <section className={`report-block report-block--${block.type}`}>
      <header className="report-block__header">
        <h4>{metric.title}</h4>
        <span className="report-block__badges">
          {metric.period && (
            <span className="chip chip--muted chip--small" title={`${formatDateNo(metric.period.start)} – ${formatDateNo(metric.period.end)}`}>
              {metric.period.label}
            </span>
          )}
          {block.type !== 'kpi' && block.type !== 'status' && <StatusBadge status={metric.status} />}
        </span>
      </header>
      {body}
      {block.type !== 'kpi' && block.type !== 'status' && <BenchmarkNote metric={metric} />}
      {showCaption && <p className="report-block__caption">{block.caption}</p>}
      <DataQualityList notes={warnings} />
      <FundLookup tickers={fundTickers} />
      <WhyPanel metric={metric} />
    </section>
  )
}

function ReportBlock({ block }: { block: ResolvedBlock }) {
  if (block.type === 'text' || !block.metric) {
    const text = block.text ?? block.caption
    if (!text) return null
    return (
      <section className="report-block report-block--text">
        <p className="report-text">{text}</p>
      </section>
    )
  }
  return <MetricBlock block={block} metric={block.metric} />
}

function DataBasis({ report }: { report: ResolvedReport }) {
  const basis = report.data_basis
  return (
    <footer className="data-basis">
      <h3>Datagrunnlag</h3>
      <dl className="why__facts">
        <dt>Kilder</dt>
        <dd>{basis.sources.join(', ') || 'Ikke oppgitt'}</dd>
        <dt>Kursperiode</dt>
        <dd>
          {basis.price_history_start || basis.price_history_end
            ? `${formatDateNo(basis.price_history_start)} – ${formatDateNo(basis.price_history_end)}`
            : 'Ikke brukt i denne rapporten'}
        </dd>
        <dt>Fondsinnhold per</dt>
        <dd>{basis.fund_holdings_as_of ? formatDateNo(basis.fund_holdings_as_of) : 'Ikke brukt i denne rapporten'}</dd>
        <dt>Laget</dt>
        <dd>{formatDateNo(report.generated_at, true)}</dd>
      </dl>
      {basis.notes.length > 0 && (
        <>
          <h5>Merknader om dataene</h5>
          <DataQualityList notes={basis.notes} />
        </>
      )}
      {report.assumptions.length > 0 && (
        <>
          <h5>Antakelser</h5>
          <ul className="plain-list">
            {report.assumptions.map((assumption, index) => (
              <li key={index}>{assumption}</li>
            ))}
          </ul>
        </>
      )}
      <p className="disclaimer">{report.disclaimer}</p>
    </footer>
  )
}

const SOURCE_LABELS: Record<ResolvedReport['source'], string> = {
  standard: 'Standardrapport',
  ai: 'Laget av AI',
  saved: 'Lagret rapport',
}

export default function ReportView({ report, actions, controls }: { report: ResolvedReport; actions?: ReactNode; controls?: ReactNode }) {
  return (
    <article className="report">
      <header className="report__header">
        <div>
          <p className="eyebrow">{SOURCE_LABELS[report.source]}</p>
          <h2>{report.title}</h2>
        </div>
        {(controls || actions) && (
          <div className="report__controls">
            {controls}
            {actions && <div className="report__actions">{actions}</div>}
          </div>
        )}
      </header>
      {report.intro && <p className="report__intro">{report.intro}</p>}
      <div className="report__blocks">
        {report.blocks.map((block, index) => (
          <ReportBlock key={index} block={block} />
        ))}
      </div>
      <DataBasis report={report} />
    </article>
  )
}
