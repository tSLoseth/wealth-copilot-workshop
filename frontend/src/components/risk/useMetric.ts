import { fetchMetric } from '../../api/riskClient'
import type { MetricResult } from '../../api/reportTypes'
import { useViewSettings } from '../../context/ViewSettingsContext'
import { useApiData, type ApiData } from '../../hooks/useApiData'

// Metrics that don't depend on the selected period are cached across range changes.
const RANGE_FREE = new Set(['equity_share', 'tech_exposure', 'overlap', 'stress_test', 'historical_episode'])

export function useMetric(
  customerId: string | null,
  metricId: string,
  params: Record<string, string | number> = {},
  enabled = true,
): ApiData<MetricResult> {
  const { range } = useViewSettings()
  const paramKey = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&')
  const rangeKey = RANGE_FREE.has(metricId) ? '-' : range
  const key = customerId && enabled ? `metric|${customerId}|${metricId}|${rangeKey}|${paramKey}` : null
  return useApiData(key, () => fetchMetric(customerId!, metricId, range, params))
}

export function isEmptyMetric(metric: MetricResult | null | undefined): boolean {
  return !!metric && metric.value === null && metric.display === 'Ingen investeringer'
}
