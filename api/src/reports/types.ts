// Shared contract for metrics, reports and the grounded AI. The frontend keeps
// a copy in frontend/src/api/reportTypes.ts - change both together.

export type Severity = 'info' | 'notice' | 'warning'

export interface DataQualityNote {
  severity: Severity
  message: string
}

export type RangeKey = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y' | 'ALL'

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: '1M', label: '1 md' },
  { key: '3M', label: '3 md' },
  { key: '6M', label: '6 md' },
  { key: 'YTD', label: 'I år' },
  { key: '1Y', label: '1 år' },
  { key: '3Y', label: '3 år' },
  { key: '5Y', label: '5 år' },
  { key: 'ALL', label: 'Alt' },
]

export type DrillDimension = 'sector' | 'geography' | 'asset_type' | 'instrument'

export interface DrillTarget {
  dimension: DrillDimension
  // Raw value as in the data (e.g. "United States", "Technology", a ticker).
  value: string
  label: string
}

export interface BenchmarkValue {
  label: string
  value: number | null
  display: string
}

export interface BreakdownRow {
  label: string
  value: number
  display: string
  // Optional second series, e.g. share of risk next to share of value.
  secondary?: number
  secondary_display?: string
  meta?: Record<string, string | number>
  // Set when clicking the row should open the drill-down panel.
  drill?: DrillTarget
}

export interface MetricResult {
  id: string
  title: string
  question: string
  value: number | null
  display: string
  unit: 'kr' | '%' | 'pp' | 'count' | 'text'
  value_label?: string
  secondary_label?: string
  breakdown?: BreakdownRow[]
  // Flat, pre-formatted facts the AI may reference as {{metric_id.fact}}.
  facts: Record<string, string>
  status?: 'within' | 'above' | 'below' | 'unknown'
  // The same measure for OSEBX over the same period, when it is comparable.
  benchmark?: BenchmarkValue
  period?: { range: RangeKey; label: string; start: string; end: string }
  provenance: {
    sources: string[]
    period?: string
    as_of?: string
    rows_used: number
  }
  assumptions: string[]
  data_quality: DataQualityNote[]
}

export interface MetricDefinition {
  id: string
  title: string
  question: string
  params: { name: string; description: string; values?: string[] }[]
  facts: string[]
}

export interface StressScenario {
  id: string
  name: string
  description: string
  // Shock in percent applied to underlying exposures. Sector beats asset type.
  sector_shocks?: Record<string, number>
  asset_type_shocks?: Record<string, number>
}

export type BlockType = 'kpi' | 'bar' | 'table' | 'scenario' | 'status' | 'text'

export interface ReportBlockSpec {
  type: BlockType
  metric?: string
  params?: Record<string, string | number>
  caption?: string
  text?: string
}

export interface ReportSpec {
  id: string
  title: string
  intro: string
  blocks: ReportBlockSpec[]
  custom_scenarios?: StressScenario[]
}

export interface ResolvedBlock {
  type: BlockType
  caption?: string
  text?: string
  metric?: MetricResult
}

export interface ResolvedReport {
  id: string
  title: string
  intro: string
  source: 'standard' | 'ai' | 'saved'
  blocks: ResolvedBlock[]
  data_basis: {
    sources: string[]
    price_history_start: string | null
    price_history_end: string | null
    fund_holdings_as_of: string | null
    notes: DataQualityNote[]
  }
  assumptions: string[]
  disclaimer: string
  generated_at: string
}

export interface ReportSummary {
  id: string
  title: string
  description: string
}

export interface AiTraceStep {
  tool: string
  input: unknown
  summary: string
}

export interface AiReportResponse {
  interaction_id: string
  status: 'ok' | 'refused' | 'fallback' | 'error'
  // Shown above the report, e.g. "we can't give advice, but here is an illustration".
  customer_notice?: string
  report?: ResolvedReport
  spec?: ReportSpec
  trace: AiTraceStep[]
  topics: string[]
  flags: string[]
}

export interface AiInteraction {
  id: string
  customer_id: string
  customer_name: string
  created_at: string
  prompt: string
  status: AiReportResponse['status']
  report_title: string | null
  summary: string | null
  customer_notice: string | null
  spec: ReportSpec | null
  metrics_used: string[]
  topics: string[]
  flags: string[]
  tool_trace: AiTraceStep[]
  model: string | null
  latency_ms: number
  reviewed_at: string | null
  advisor_note: string | null
}

export interface CustomerActivity {
  customer_id: string
  customer_name: string
  risk_profile: string
  question_count: number
  unreviewed_count: number
  last_asked_at: string
  last_active_at: string
  report_view_count: number
  copilot_question_count: number
  top_reports: { title: string; count: number }[]
  topics: { topic: string; count: number }[]
  flags: { flag: string; count: number }[]
}

export const TOPICS = [
  'teknologieksponering',
  'markedsfall',
  'profil-match',
  'diversifisering',
  'fondsinnhold',
  'risikokilder',
  'datagrunnlag',
  'annet',
] as const

export const FLAGS = ['ønsker_råd', 'mangler_data', 'bekymring', 'utenfor_tema'] as const

export interface BenchmarkSource {
  provider: 'Yahoo Finance'
  symbol: string
  name: string
  mode: 'live' | 'snapshot'
  fetched_at: string
  last_date: string
}

export interface PeriodStats {
  return_pct: number
  volatility_pct: number
  max_drawdown_pct: number
  worst_day_pct: number
  worst_day_date: string | null
}

export interface HistoryPoint {
  date: string
  // Indexed to 100 at the start of the period.
  index: number
  value?: number
}

export interface HistoryResponse {
  customer_id: string
  range: RangeKey
  start: string
  end: string
  portfolio: PeriodStats & { points: HistoryPoint[]; start_value: number; end_value: number }
  benchmark: (PeriodStats & { points: HistoryPoint[]; source: BenchmarkSource }) | null
  notes: DataQualityNote[]
}

export interface ExposurePathRow {
  via: string
  via_name: string
  value: number
  weight_pct: number
}

export interface ExposureRow {
  ticker: string
  name: string
  asset_type: string
  sector: string
  geography: string
  asset_type_label: string
  sector_label: string
  geography_label: string
  value: number
  weight_pct: number
  risk_contribution_pct: number
  return_pct: number | null
  paths: ExposurePathRow[]
}

export interface PositionRow {
  ticker: string
  name: string
  asset_type: string
  sector: string
  geography: string
  asset_type_label: string
  sector_label: string
  geography_label: string
  quantity: number
  price: number
  value: number
  weight_pct: number
  risk_contribution_pct: number
  return_pct: number | null
  is_fund: boolean
}

export interface ExposuresResponse {
  customer_id: string
  range: RangeKey
  start: string
  end: string
  total_value: number
  positions: PositionRow[]
  exposures: ExposureRow[]
  benchmark_return_pct: number | null
}

export interface InstrumentHistoryResponse {
  ticker: string
  name: string
  asset_type_label: string
  sector_label: string
  geography_label: string
  range: RangeKey
  start: string
  end: string
  points: (HistoryPoint & { price: number })[]
  stats: PeriodStats
  benchmark: { points: HistoryPoint[]; stats: PeriodStats; source: BenchmarkSource } | null
  held_by_funds: { fund_ticker: string; fund_name: string; weight_pct: number }[]
  fund_holdings: { constituent_ticker: string; name: string; sector_label: string; geography_label: string; weight_pct: number }[]
}

export type CustomerEventType = 'report_view' | 'copilot_chat'

// Report views (standard, saved and AI reports) and Wealth Copilot chat questions.
export interface CustomerEvent {
  id: string
  customer_id: string
  created_at: string
  event_type: CustomerEventType
  report_id: string | null
  report_title: string | null
  report_source: string | null
  range: string | null
  prompt: string | null
  answer: string | null
  intent: string | null
}
