import { useEffect, useState } from 'react'
import { askReportAi, fetchCustomer, fetchPortfolio, fetchReport, fetchReports } from '../../api/client'
import type { Customer, PortfolioSummary } from '../../api/types'
import type { AiReportResponse, ReportSummary, ResolvedReport } from '../../api/reportTypes'
import ReportView from '../ReportView'
import { PROFILE_NB } from '../../utils/labels'
import { formatKr } from '../../utils/format'

// Advisor's view of one customer: profile, the customer's reports and a grounded AI question box.
export default function AdvisorCustomerPanel({ customerId }: { customerId: string }) {
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null)
  const [reports, setReports] = useState<ReportSummary[]>([])
  const [report, setReport] = useState<ResolvedReport | null>(null)
  const [ai, setAi] = useState<AiReportResponse | null>(null)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setReport(null)
    setAi(null)
    setError(null)
    Promise.all([fetchCustomer(customerId), fetchPortfolio(customerId), fetchReports(customerId)])
      .then(([c, p, r]) => {
        setCustomer(c)
        setPortfolio(p)
        setReports(r.reports)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Kunne ikke hente kunden'))
  }, [customerId])

  async function openReport(reportId: string) {
    setBusy(true)
    setAi(null)
    try {
      setReport(await fetchReport(customerId, reportId, { range: '1Y', benchmark: true }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke hente rapporten')
    } finally {
      setBusy(false)
    }
  }

  async function ask() {
    if (!prompt.trim()) return
    setBusy(true)
    setReport(null)
    try {
      setAi(await askReportAi(customerId, `[Rådgiver] ${prompt.trim()}`, '1Y'))
      setPrompt('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI-spørsmålet feilet')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel advisor-panel">
      <h4>Kundeprofil</h4>
      {customer && (
        <dl className="advisor-profile">
          <div><dt>Navn</dt><dd>{customer.first_name} {customer.last_name}</dd></div>
          <div><dt>Alder</dt><dd>{customer.age} år</dd></div>
          <div><dt>Risikoprofil</dt><dd>{PROFILE_NB[customer.risk_profile] ?? customer.risk_profile}</dd></div>
          <div><dt>Horisont</dt><dd>{customer.investment_horizon.replace('years', 'år')}</dd></div>
          <div><dt>Årsinntekt</dt><dd>{formatKr(customer.annual_income)}</dd></div>
          <div><dt>Kunde siden</dt><dd>{customer.customer_since}</dd></div>
          {portfolio && <div><dt>Investeringer</dt><dd>{formatKr(portfolio.total_value)}</dd></div>}
        </dl>
      )}

      <h4>Kundens rapporter</h4>
      <div className="advisor-reports">
        {reports.map((r) => (
          <button key={r.id} type="button" className="btn btn--secondary" disabled={busy} onClick={() => openReport(r.id)}>
            {r.title}
          </button>
        ))}
      </div>

      <h4>Spør AI-en om kunden</h4>
      <form
        className="advisor-ask"
        onSubmit={(e) => {
          e.preventDefault()
          ask()
        }}
      >
        <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="F.eks. Hvor kommer risikoen til kunden fra?" aria-label="Spørsmål om kunden" />
        <button type="submit" className="btn btn--primary" disabled={busy || !prompt.trim()}>
          {busy ? 'Henter …' : 'Spør'}
        </button>
      </form>
      <p className="advisor-note">Rådgiverspørsmål merkes «[Rådgiver]» i loggen. Alle tall kommer fra metrikkatalogen.</p>

      {error && <p className="error-state">{error}</p>}
      {ai?.customer_notice && <p className="ai-notice">{ai.customer_notice}</p>}
      {ai?.report && <ReportView report={ai.report} />}
      {report && <ReportView report={report} />}
    </section>
  )
}
