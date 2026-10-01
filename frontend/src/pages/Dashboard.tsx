import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCustomerContext } from '../context/CustomerContext'
import { fetchAccounts, fetchInsights, fetchPortfolio, fetchRisk } from '../api/client'
import type { Account, InsightsSummary, PortfolioSummary, RiskSummary } from '../api/types'
import StatCard from '../components/StatCard'
import HistoryChart from '../components/HistoryChart'
import { rangeLabel, useViewSettings } from '../context/ViewSettingsContext'
import { useCustomerHistory } from '../hooks/useApiData'
import { formatKr, formatNum, formatSignedPct } from '../utils/format'
import { RISK_CATEGORY_NB } from '../utils/labels'

function PeriodReturnCard({ customerId }: { customerId: string }) {
  const { range, showBenchmark } = useViewSettings()
  const { data, error } = useCustomerHistory(customerId)
  const label = `Avkastning (${rangeLabel(range)})`
  if (!data) return <StatCard label={label} value={error ? 'Ikke tilgjengelig' : '…'} />
  const value = data.portfolio.return_pct
  const benchmark = showBenchmark && data.benchmark ? `OSEBX: ${formatSignedPct(data.benchmark.return_pct)}` : undefined
  return <StatCard label={label} value={formatSignedPct(value)} sublabel={benchmark} tone={value >= 0 ? 'positive' : 'negative'} />
}

function RiskCard({ risk }: { risk: RiskSummary }) {
  return (
    <div className="stat-card">
      <p className="stat-card__label">Risikoscore</p>
      <p className="stat-card__value">{risk.risk_score}/100</p>
      <p className="stat-card__sublabel">{RISK_CATEGORY_NB[risk.risk_category] ?? risk.risk_category}</p>
      <Link to="/risiko" className="stat-card__link">
        Se hva risikoen består av →
      </Link>
    </div>
  )
}

export default function Dashboard() {
  const { selectedCustomerId, selectedCustomer } = useCustomerContext()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null)
  const [risk, setRisk] = useState<RiskSummary | null>(null)
  const [insights, setInsights] = useState<InsightsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedCustomerId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([fetchAccounts(selectedCustomerId), fetchPortfolio(selectedCustomerId), fetchRisk(selectedCustomerId), fetchInsights(selectedCustomerId)])
      .then(([accountsRes, portfolioRes, riskRes, insightsRes]) => {
        if (cancelled) return
        setAccounts(accountsRes.accounts)
        setPortfolio(portfolioRes)
        setRisk(riskRes)
        setInsights(insightsRes)
      })
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [selectedCustomerId])

  if (loading) return <p className="loading-state">Henter oversikten …</p>
  if (error) return <p className="error-state">Klarte ikke å hente oversikten: {error}</p>
  if (!portfolio || !risk || !insights || !selectedCustomerId) return null

  const cashBalance = accounts
    .filter((a) => a.account_type === 'Current Account' || a.account_type === 'Savings')
    .reduce((sum, a) => sum + a.balance, 0)
  const investmentAccountBalance = accounts
    .filter((a) => a.account_type === 'Investment Account' || a.account_type === 'Pension')
    .reduce((sum, a) => sum + a.balance, 0)
  const netWorth = cashBalance + investmentAccountBalance

  return (
    <div className="page">
      <div className="page-heading">
        <p className="eyebrow">Velkommen tilbake</p>
        <h2>{selectedCustomer ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}` : ''}</h2>
      </div>

      <div className="stat-grid">
        <StatCard label="Nettoformue" value={formatKr(netWorth)} />
        <StatCard label="Bankinnskudd" value={formatKr(cashBalance)} />
        <StatCard label="Investeringer" value={formatKr(portfolio.total_value)} />
        <StatCard
          label="Sparing per måned"
          value={formatKr(insights.savings.averageMonthlySavings)}
          sublabel={`${formatNum(insights.savings.savingsRatePct)} % av inntekten`}
        />
        <PeriodReturnCard customerId={selectedCustomerId} />
        <RiskCard risk={risk} />
      </div>

      <HistoryChart customerId={selectedCustomerId} title="Utvikling i porteføljen" />

      <p className="dashboard-more">
        <Link to="/portfolio">Se sektorer, regioner og største beholdninger i porteføljen →</Link>
      </p>
    </div>
  )
}
