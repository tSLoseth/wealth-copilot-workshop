import { Link } from 'react-router-dom'
import { fetchInsights } from '../../api/client'
import { fetchRiskInsights, type RiskInsight } from '../../api/riskClient'
import type { Insight, InsightsSummary } from '../../api/types'
import { useCustomerContext } from '../../context/CustomerContext'
import { useDrillDown } from '../../context/DrillDownContext'
import { useViewSettings } from '../../context/ViewSettingsContext'
import { useApiData } from '../../hooks/useApiData'
import { formatKr, formatPct } from '../../utils/format'

const SEVERITY_LABEL: Record<RiskInsight['severity'], string> = {
  info: 'Til info',
  notice: 'Verdt å vite',
  warning: 'Viktig',
}

function RiskInsightCard({ insight }: { insight: RiskInsight }) {
  const { openDrill } = useDrillDown()
  return (
    <article className={`insight-card insight-card--${insight.severity} risk-insight`}>
      <div className="risk-insight__top">
        <span className="insight-card__badge">{SEVERITY_LABEL[insight.severity]}</span>
        {insight.value_display && <span className="risk-insight__value">{insight.value_display}</span>}
      </div>
      <h4>{insight.title}</h4>
      <p>{insight.detail}</p>
      <div className="risk-insight__actions">
        {insight.drill && (
          <button type="button" className="btn btn--secondary" onClick={() => openDrill(insight.drill!)}>
            Se detaljer
          </button>
        )}
        {insight.report_id && (
          <Link to="/rapporter" className="btn btn--secondary">
            Åpne rapport
          </Link>
        )}
      </div>
    </article>
  )
}

// The starter API speaks English and overlaps with the risk insights above, so only the
// savings-related items are kept here, rewritten in Norwegian from their numbers.
function economyInsights(data: InsightsSummary): Insight[] {
  const out: Insight[] = []
  const { savings } = data
  out.push({
    id: 'savings-rate',
    severity: savings.savingsRatePct >= 15 ? 'info' : 'notice',
    title: savings.savingsRatePct >= 15 ? 'Du sparer en god del hver måned' : 'Du sparer lite hver måned',
    detail: `I snitt setter du av ${formatKr(savings.averageMonthlySavings)} i måneden. Det er ${formatPct(savings.savingsRatePct)} av inntekten din.`,
  })
  const cash = data.insights.find((i) => i.id === 'high-cash-allocation')
  const cashPct = cash?.detail.match(/([\d.]+)%/)?.[1]
  if (cash) {
    out.push({
      id: 'high-cash',
      severity: cash.severity,
      title: 'Mye står i kontanter',
      detail: `${cashPct ? `${formatPct(Number(cashPct))} av porteføljen` : 'En stor del av porteføljen'} står i kontanter. Over lang tid kan det gi lavere vekst enn du ellers kunne fått.`,
    })
  }
  return out
}

export function RiskInsightsSection() {
  const { selectedCustomerId } = useCustomerContext()
  const { range } = useViewSettings()
  const risk = useApiData(selectedCustomerId ? `risk-insights|${selectedCustomerId}|${range}` : null, () =>
    fetchRiskInsights(selectedCustomerId!, range),
  )

  return (
    <section className="risk-insights">
      <p className="eyebrow">Innsikter · regelbasert, uten AI</p>
      <h3>Det viktigste vi ser i porteføljen din</h3>
      {risk.error ? (
        <p className="error-state">Kunne ikke hente innsiktene: {risk.error.message}</p>
      ) : !risk.data ? (
        <p className="loading-state">Laster innsikter …</p>
      ) : risk.data.insights.length === 0 ? (
        <p className="empty-state">Vi fant ingenting spesielt å peke på akkurat nå.</p>
      ) : (
        <div className={`insight-grid${risk.loading ? ' is-stale' : ''}`}>
          {risk.data.insights.map((insight) => (
            <RiskInsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}
    </section>
  )
}

export function EconomySection() {
  const { selectedCustomerId } = useCustomerContext()
  const economy = useApiData(selectedCustomerId ? `insights|${selectedCustomerId}` : null, () => fetchInsights(selectedCustomerId!))

  return (
    <section className="panel panel--muted risk-economy">
      <h3>Økonomi og sparing</h3>
      {economy.error ? (
        <p className="error-state">Kunne ikke hente sparetallene: {economy.error.message}</p>
      ) : !economy.data ? (
        <p className="loading-state">Laster …</p>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <p className="stat-card__label">Inntekt per måned (snitt)</p>
              <p className="stat-card__value">{formatKr(economy.data.savings.averageMonthlyIncome)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Utgifter per måned (snitt)</p>
              <p className="stat-card__value">{formatKr(economy.data.savings.averageMonthlyExpenses)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Sparing per måned (snitt)</p>
              <p className="stat-card__value">{formatKr(economy.data.savings.averageMonthlySavings)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Sparerate</p>
              <p className="stat-card__value">{formatPct(economy.data.savings.savingsRatePct)}</p>
              <p className="stat-card__sublabel">Andel av inntekten du setter av</p>
            </div>
          </div>
          <div className="insight-grid">
            {economyInsights(economy.data).map((insight) => (
              <article key={insight.id} className={`insight-card insight-card--${insight.severity}`}>
                <span className="insight-card__badge">{SEVERITY_LABEL[insight.severity]}</span>
                <h4>{insight.title}</h4>
                <p>{insight.detail}</p>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
