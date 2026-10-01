// Shared contract for metrics, reports and the grounded AI. The frontend keeps
// a copy in frontend/src/api/reportTypes.ts - change both together.

export type Severity = 'info' | 'notice' | 'warning'

export interface DataQualityNote {
  severity: Severity
  message: string
}

export interface BreakdownRow {
  label: string
  value: number
  display: string
  // Optional second series, e.g. share of risk next to share of value.
  secondary?: number
  secondary_display?: string
  meta?: Record<string, string | number>
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
