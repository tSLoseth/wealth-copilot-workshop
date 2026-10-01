import { useViewSettings } from '../context/ViewSettingsContext'
import { useCustomerHistory } from '../hooks/useApiData'
import { formatSignedPct } from '../utils/format'
import ViewControls from './ViewControls'
import { BENCHMARK_NAME, BenchmarkStatus, IndexChart, PeriodStatsRow, mergeIndexSeries } from './IndexChart'

const MAIN_LABEL = 'Porteføljen din'

export default function HistoryChart({ customerId, title = 'Utvikling' }: { customerId: string; title?: string }) {
  const { showBenchmark } = useViewSettings()
  const { data, error, loading } = useCustomerHistory(customerId)

  const benchmark = showBenchmark ? data?.benchmark ?? null : null
  const series = data ? mergeIndexSeries(data.portfolio.points, benchmark?.points) : []
  const ariaLabel = data
    ? `${MAIN_LABEL} har endret seg ${formatSignedPct(data.portfolio.return_pct)} i perioden${
        benchmark ? `, mens ${BENCHMARK_NAME} har endret seg ${formatSignedPct(benchmark.return_pct)}` : ''
      }.`
    : ''

  return (
    <section className="panel history-chart" aria-busy={loading}>
      <header className="panel__header history-chart__header">
        <div>
          <h3>{title}</h3>
          <p className="muted-small">
            Endring i prosent fra starten av perioden.
            {loading && data && (
              <span className="updating" role="status">
                {' '}
                Oppdaterer …
              </span>
            )}
          </p>
        </div>
        <ViewControls />
      </header>

      {!data && loading && <p className="loading-state">Henter historikk …</p>}
      {!data && error && <p className="error-state">Klarte ikke å hente historikken. Prøv igjen litt senere.</p>}

      {data && (
        <div className={loading ? 'is-stale' : undefined}>
          <IndexChart data={series} mainLabel={MAIN_LABEL} showBenchmark={showBenchmark} ariaLabel={ariaLabel} />
          <PeriodStatsRow main={data.portfolio} mainLabel={MAIN_LABEL} benchmark={benchmark} />
          <BenchmarkStatus showBenchmark={showBenchmark} available={!!data.benchmark} loading={loading} source={data.benchmark?.source} />
          {data.notes.length > 0 && (
            <ul className="note-list">
              {data.notes.map((note, index) => (
                <li key={index}>{note.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
