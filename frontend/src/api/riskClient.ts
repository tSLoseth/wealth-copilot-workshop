import { ApiError } from './client'
import type { DrillTarget, MetricResult, RangeKey } from './reportTypes'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export interface RiskInsight {
  id: string
  severity: 'info' | 'notice' | 'warning'
  title: string
  detail: string
  metric_id: string
  value_display?: string
  drill?: DrillTarget
  report_id?: string
}

export interface RiskInsightsResponse {
  customer_id: string
  range: RangeKey
  insights: RiskInsight[]
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`)
  if (!response.ok) {
    let message = `Request to ${path} failed with status ${response.status}`
    try {
      const body = (await response.json()) as { error?: string }
      if (body?.error) message = body.error
    } catch {
      // Body was not JSON; keep the generic message.
    }
    throw new ApiError(message, response.status)
  }
  return (await response.json()) as T
}

export function fetchMetric(
  customerId: string,
  metricId: string,
  range: RangeKey,
  params: Record<string, string | number> = {},
): Promise<MetricResult> {
  const search = new URLSearchParams({ range })
  for (const [key, value] of Object.entries(params)) search.set(key, String(value))
  return getJson(`/customers/${encodeURIComponent(customerId)}/metrics/${encodeURIComponent(metricId)}?${search}`)
}

export function fetchRiskInsights(customerId: string, range: RangeKey): Promise<RiskInsightsResponse> {
  return getJson(`/customers/${encodeURIComponent(customerId)}/risk-insights?range=${range}`)
}
