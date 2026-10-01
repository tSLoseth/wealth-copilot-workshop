// Thin fetch wrapper for the Wealth Copilot API.
//
// The API base URL is configurable via VITE_API_URL so the same frontend
// build can point at a local dev server or a deployed API without code
// changes. Defaults to localhost:3000 for local development.
import type {
  Account,
  Customer,
  CopilotReply,
  InsightsSummary,
  Investment,
  PerformanceSummary,
  PortfolioSummary,
  RiskSummary,
  Transaction,
} from './types'
import type {
  AiInteraction,
  AiReportResponse,
  BenchmarkSource,
  CustomerActivity,
  ExposuresResponse,
  HistoryPoint,
  HistoryResponse,
  InstrumentHistoryResponse,
  MetricDefinition,
  PeriodStats,
  RangeKey,
  ReportSpec,
  ReportSummary,
  ResolvedReport,
} from './reportTypes'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init)
  if (!response.ok) {
    throw new ApiError(`Request to ${path} failed with status ${response.status}`, response.status)
  }
  return (await response.json()) as T
}

function getJson<T>(path: string): Promise<T> {
  return requestJson<T>(path)
}

function withQuery(path: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, value)
  const query = search.toString()
  return query ? `${path}?${query}` : path
}

export const BENCHMARK = 'OSEBX'

export interface ViewParams {
  range: RangeKey
  benchmark: boolean
}

function viewQuery(view?: ViewParams): Record<string, string | undefined> {
  return { range: view?.range, benchmark: view?.benchmark ? BENCHMARK : undefined }
}

function sendJson<T>(method: 'POST' | 'PATCH', path: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  return requestJson<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

export async function fetchHealth(): Promise<{ status: string }> {
  return getJson('/health')
}

export async function fetchCustomers(): Promise<{ count: number; customers: Customer[] }> {
  return getJson('/customers')
}

export async function fetchCustomer(customerId: string): Promise<Customer> {
  return getJson(`/customers/${customerId}`)
}

export async function fetchAccounts(customerId: string): Promise<{ accounts: Account[] }> {
  return getJson(`/customers/${customerId}/accounts`)
}

export async function fetchTransactions(customerId: string): Promise<{ transactions: Transaction[] }> {
  return getJson(`/customers/${customerId}/transactions`)
}

export async function fetchInvestments(customerId: string): Promise<{ investments: Investment[] }> {
  return getJson(`/customers/${customerId}/investments`)
}

export async function fetchPortfolio(customerId: string): Promise<PortfolioSummary> {
  return getJson(`/customers/${customerId}/portfolio`)
}

export async function fetchPerformance(customerId: string): Promise<PerformanceSummary> {
  return getJson(`/customers/${customerId}/performance`)
}

export async function fetchRisk(customerId: string): Promise<RiskSummary> {
  return getJson(`/customers/${customerId}/risk`)
}

export async function fetchInsights(customerId: string): Promise<InsightsSummary> {
  return getJson(`/customers/${customerId}/insights`)
}

export async function askCopilot(customerId: string, message: string): Promise<CopilotReply> {
  const response = await fetch(`${API_URL}/customers/${customerId}/copilot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  if (!response.ok) {
    throw new Error(`Copilot request failed with status ${response.status}`)
  }
  return (await response.json()) as CopilotReply
}

export interface FundHolding {
  constituent_ticker: string
  name: string
  asset_type: string
  sector: string
  geography: string
  weight_pct: number
}

export interface FundHoldingsResponse {
  fund_ticker: string
  as_of_date: string
  holdings: FundHolding[]
}

export async function fetchMetrics(): Promise<{ metrics: MetricDefinition[] }> {
  return getJson('/metrics')
}

export async function fetchFundHoldings(ticker: string): Promise<FundHoldingsResponse> {
  return getJson(`/instruments/${encodeURIComponent(ticker)}/holdings`)
}

export async function fetchReports(customerId: string): Promise<{ reports: ReportSummary[] }> {
  return getJson(`/customers/${customerId}/reports`)
}

export async function fetchReport(customerId: string, reportId: string, view?: ViewParams): Promise<ResolvedReport> {
  return getJson(withQuery(`/customers/${customerId}/reports/${encodeURIComponent(reportId)}`, viewQuery(view)))
}

export async function resolveReport(customerId: string, spec: ReportSpec, view?: ViewParams): Promise<ResolvedReport> {
  const { range, benchmark } = viewQuery(view)
  return sendJson('POST', `/customers/${customerId}/reports/resolve`, { spec, range, benchmark })
}

export async function askReportAi(customerId: string, prompt: string, range?: RangeKey): Promise<AiReportResponse> {
  return sendJson('POST', `/customers/${customerId}/reports/ai`, { prompt, range })
}

export async function fetchHistory(customerId: string, view: ViewParams): Promise<HistoryResponse> {
  return getJson(withQuery(`/customers/${customerId}/history`, viewQuery(view)))
}

export async function fetchExposures(customerId: string, range: RangeKey): Promise<ExposuresResponse> {
  return getJson(withQuery(`/customers/${customerId}/exposures`, { range }))
}

export async function fetchInstrumentHistory(ticker: string, view: ViewParams): Promise<InstrumentHistoryResponse> {
  return getJson(withQuery(`/instruments/${encodeURIComponent(ticker)}/history`, viewQuery(view)))
}

export interface BenchmarkResponse {
  points: HistoryPoint[]
  stats: PeriodStats
  source: BenchmarkSource
}

export async function fetchBenchmark(range: RangeKey): Promise<BenchmarkResponse> {
  return getJson(withQuery(`/benchmarks/${BENCHMARK}`, { range }))
}

function adminHeaders(token: string): Record<string, string> {
  return { 'x-admin-token': token }
}

export async function fetchCustomerActivity(token: string): Promise<{ customers: CustomerActivity[] }> {
  return requestJson('/admin/customers/activity', { headers: adminHeaders(token) })
}

export async function fetchInteractions(token: string, customerId: string): Promise<{ interactions: AiInteraction[] }> {
  return requestJson(`/admin/interactions?customerId=${encodeURIComponent(customerId)}`, { headers: adminHeaders(token) })
}

export async function updateInteraction(
  token: string,
  id: string,
  patch: { reviewed?: boolean; advisor_note?: string },
): Promise<AiInteraction> {
  return sendJson('PATCH', `/admin/interactions/${encodeURIComponent(id)}`, patch, adminHeaders(token))
}
