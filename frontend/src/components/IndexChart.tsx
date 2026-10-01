import { useId } from 'react'
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { BenchmarkSource, HistoryPoint, PeriodStats } from '../api/reportTypes'
import { formatDateNo, formatPct, formatPp, formatShortDate, formatSignedPct } from '../utils/format'

export const PORTFOLIO_COLOR = '#0000a0'
export const BENCHMARK_COLOR = '#e8590c'
export const BENCHMARK_NAME = 'OSEBX'

export interface IndexPoint {
  date: string
  main: number
  benchmark?: number
}

// Both series arrive indexed to 100 on the same dates; we only align them by date.
export function mergeIndexSeries(main: HistoryPoint[], benchmark: HistoryPoint[] | null | undefined): IndexPoint[] {
  const byDate = new Map((benchmark ?? []).map((point) => [point.date, point.index]))
  return main.map((point) => ({ date: point.date, main: point.index, benchmark: byDate.get(point.date) }))
}

function spansYears(data: IndexPoint[]): boolean {
  if (data.length < 2) return false
  return new Date(data[data.length - 1].date).getTime() - new Date(data[0].date).getTime() > 400 * 86_400_000
}

function axisDate(date: string, longSpan: boolean): string {
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  return longSpan
    ? parsed.toLocaleDateString('nb-NO', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    : formatShortDate(date)
}

interface IndexTooltipProps {
  active?: boolean
  label?: string
  payload?: { payload: IndexPoint }[]
  mainLabel: string
  showBenchmark: boolean
}

function IndexTooltip({ active, payload, label, mainLabel, showBenchmark }: IndexTooltipProps) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  const hasBenchmark = showBenchmark && point.benchmark !== undefined
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__date">{formatDateNo(label)}</p>
      <p>
        <span className="swatch" style={{ background: PORTFOLIO_COLOR }} aria-hidden="true" />
        {mainLabel}: <strong>{formatSignedPct(point.main - 100)}</strong>
      </p>
      {hasBenchmark && (
        <>
          <p>
            <span className="swatch swatch--dashed" style={{ borderColor: BENCHMARK_COLOR }} aria-hidden="true" />
            {BENCHMARK_NAME}: <strong>{formatSignedPct(point.benchmark! - 100)}</strong>
          </p>
          <p className="chart-tooltip__diff">Forskjell: {formatPp(point.main - point.benchmark!)}</p>
        </>
      )}
    </div>
  )
}

export function IndexChart({
  data,
  mainLabel,
  showBenchmark,
  height = 280,
  ariaLabel,
}: {
  data: IndexPoint[]
  mainLabel: string
  showBenchmark: boolean
  height?: number
  ariaLabel: string
}) {
  const fillId = `index-fill-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  if (data.length === 0) return <p className="empty-state">Ingen historikk å vise for denne perioden.</p>
  const longSpan = spansYears(data)
  const hasBenchmark = showBenchmark && data.some((point) => point.benchmark !== undefined)

  return (
    <>
      <ul className="chart-legend" aria-hidden="true">
        <li>
          <span className="swatch" style={{ background: PORTFOLIO_COLOR }} />
          {mainLabel}
        </li>
        {hasBenchmark && (
          <li>
            <span className="swatch swatch--dashed" style={{ borderColor: BENCHMARK_COLOR }} />
            {BENCHMARK_NAME} (Oslo Børs hovedindeks)
          </li>
        )}
      </ul>
      <div role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PORTFOLIO_COLOR} stopOpacity={0.16} />
                <stop offset="100%" stopColor={PORTFOLIO_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tickFormatter={(date: string) => axisDate(date, longSpan)} minTickGap={48} tick={{ fontSize: 12, fill: '#475569' }} />
            <YAxis
              domain={['auto', 'auto']}
              tickFormatter={(value: number) => (Math.abs(value - 100) < 0.5 ? '0 %' : formatSignedPct(value - 100, 0))}
              width={58}
              tick={{ fontSize: 12, fill: '#475569' }}
            />
            <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="2 4" />
            <Tooltip content={<IndexTooltip mainLabel={mainLabel} showBenchmark={showBenchmark} />} />
            <Area type="monotone" dataKey="main" name={mainLabel} stroke={PORTFOLIO_COLOR} strokeWidth={2} fill={`url(#${fillId})`} dot={false} isAnimationActive={false} />
            {hasBenchmark && (
              <Line
                type="monotone"
                dataKey="benchmark"
                name={BENCHMARK_NAME}
                stroke={BENCHMARK_COLOR}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

const STAT_ROWS: { key: string; label: string; format: (stats: PeriodStats) => string; sub?: (stats: PeriodStats) => string | null }[] = [
  { key: 'return', label: 'Avkastning', format: (s) => formatSignedPct(s.return_pct) },
  { key: 'volatility', label: 'Svingninger (årlig)', format: (s) => `±${formatPct(s.volatility_pct)}` },
  { key: 'drawdown', label: 'Største fall', format: (s) => formatPct(-Math.abs(s.max_drawdown_pct)) },
  {
    key: 'worst',
    label: 'Verste dag',
    format: (s) => formatPct(-Math.abs(s.worst_day_pct)),
    sub: (s) => (s.worst_day_date ? formatShortDate(s.worst_day_date, true) : null),
  },
]

export function PeriodStatsRow({ main, mainLabel, benchmark }: { main: PeriodStats; mainLabel: string; benchmark?: PeriodStats | null }) {
  return (
    <dl className="period-stats">
      {STAT_ROWS.map((row) => (
        <div key={row.key} className="period-stats__item">
          <dt>{row.label}</dt>
          <dd>
            <span className="period-stats__value">
              {benchmark && <span className="swatch" style={{ background: PORTFOLIO_COLOR }} aria-hidden="true" />}
              <span className="visually-hidden">{mainLabel}: </span>
              {row.format(main)}
              {row.sub?.(main) && <span className="muted-small"> {row.sub(main)}</span>}
            </span>
            {benchmark && (
              <span className="period-stats__value period-stats__value--benchmark">
                <span className="swatch swatch--dashed" style={{ borderColor: BENCHMARK_COLOR }} aria-hidden="true" />
                {BENCHMARK_NAME}: {row.format(benchmark)}
                {row.sub?.(benchmark) && <span className="muted-small"> {row.sub(benchmark)}</span>}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function BenchmarkSourceLine({ source }: { source: BenchmarkSource }) {
  return (
    <p className="source-line">
      {BENCHMARK_NAME}: {source.provider}, hentet {formatDateNo(source.fetched_at, true)} ({source.mode === 'live' ? 'live' : 'lagret kopi'}
      {source.last_date ? `, kurser til ${formatDateNo(source.last_date)}` : ''})
    </p>
  )
}

export function BenchmarkStatus({
  showBenchmark,
  available,
  loading,
  source,
}: {
  showBenchmark: boolean
  available: boolean
  loading: boolean
  source?: BenchmarkSource
}) {
  if (!showBenchmark || loading) return null
  if (!available) return <p className="source-line source-line--warning">{BENCHMARK_NAME}-data er ikke tilgjengelig akkurat nå.</p>
  return source ? <BenchmarkSourceLine source={source} /> : null
}
