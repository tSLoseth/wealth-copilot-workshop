import { useEffect, useState } from 'react'
import { useCustomerContext } from '../context/CustomerContext'
import { fetchPortfolio } from '../api/client'
import type { PortfolioSummary } from '../api/types'
import AllocationPieChart from '../components/AllocationPieChart'
import HistoryChart from '../components/HistoryChart'
import HoldingsTable from '../components/HoldingsTable'
import { rangeLabel, useViewSettings } from '../context/ViewSettingsContext'
import { useExposures } from '../hooks/useApiData'
import { formatKr, formatNum, formatSignedPct } from '../utils/format'

export default function Portfolio() {
  const { selectedCustomerId } = useCustomerContext()
  const { range } = useViewSettings()
  const exposures = useExposures(selectedCustomerId)
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedCustomerId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchPortfolio(selectedCustomerId)
      .then((portfolioRes) => !cancelled && setPortfolio(portfolioRes))
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [selectedCustomerId])

  if (loading) return <p className="loading-state">Henter porteføljen …</p>
  if (error) return <p className="error-state">Klarte ikke å hente porteføljen: {error}</p>
  if (!portfolio || !selectedCustomerId) return null

  return (
    <div className="page">
      <div className="page-heading">
        <p className="eyebrow">Investeringene dine</p>
        <h2>Portefølje</h2>
      </div>

      <HistoryChart customerId={selectedCustomerId} title="Utvikling i porteføljen" />

      <div className="chart-grid">
        <AllocationPieChart title="Aktivatype" dimension="asset_type" holdings={portfolio.allocation_by_asset_type} customerId={selectedCustomerId} />
        <AllocationPieChart title="Region" dimension="geography" holdings={portfolio.allocation_by_geography} customerId={selectedCustomerId} />
        <AllocationPieChart title="Sektor" dimension="sector" holdings={portfolio.allocation_by_sector} customerId={selectedCustomerId} />
      </div>

      <section className="panel">
        <h3>Største beholdninger</h3>
        <HoldingsTable holdings={portfolio.largest_holdings} positions={exposures.data?.positions} periodLabel={rangeLabel(range)} />
        <p className="click-hint">Klikk på en beholdning for detaljer</p>
      </section>

      <section className="panel panel--muted">
        <h3>Oppsummering</h3>
        <p>Samlet verdi: {formatKr(portfolio.total_value)}</p>
        <p>
          Kontanter: {formatKr(portfolio.cash_value)} ({formatNum(portfolio.cash_percentage)} %)
        </p>
        <p>
          Urealisert gevinst/tap: {formatKr(portfolio.unrealized_gain_loss)} ({formatSignedPct(portfolio.unrealized_gain_loss_pct)})
        </p>
      </section>
    </div>
  )
}
