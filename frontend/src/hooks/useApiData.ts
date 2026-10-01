import { useEffect, useState } from 'react'
import { fetchExposures, fetchHistory, fetchInstrumentHistory, type ViewParams } from '../api/client'
import type { ExposuresResponse, HistoryResponse, InstrumentHistoryResponse } from '../api/reportTypes'
import { useViewSettings } from '../context/ViewSettingsContext'

const TTL_MS = 5 * 60_000
const cache = new Map<string, { at: number; promise: Promise<unknown> }>()

// Shares one request between components asking for the same data (chart, KPI and drill-down).
export function cachedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise as Promise<T>
  const promise = fetcher()
  cache.set(key, { at: Date.now(), promise })
  promise.catch(() => cache.delete(key))
  return promise
}

export interface ApiData<T> {
  // Keeps the previous result while a new key loads, so charts don't flash empty.
  data: T | null
  error: Error | null
  loading: boolean
}

export function useApiData<T>(key: string | null, fetcher: () => Promise<T>): ApiData<T> {
  const [state, setState] = useState<{ key: string | null; data: T | null; error: Error | null }>({ key: null, data: null, error: null })

  useEffect(() => {
    if (!key) return
    let cancelled = false
    cachedFetch(key, fetcher)
      .then((data) => !cancelled && setState({ key, data, error: null }))
      .catch((error: Error) => !cancelled && setState((current) => ({ key, data: current.data, error })))
    return () => {
      cancelled = true
    }
  }, [key])

  return {
    data: state.data,
    error: state.key === key ? state.error : null,
    loading: key !== null && state.key !== key,
  }
}

export function useCustomerHistory(customerId: string | null, override?: ViewParams): ApiData<HistoryResponse> {
  const settings = useViewSettings()
  const view = override ?? { range: settings.range, benchmark: settings.showBenchmark }
  return useApiData(customerId ? `history|${customerId}|${view.range}|${view.benchmark}` : null, () => fetchHistory(customerId!, view))
}

export function useExposures(customerId: string | null): ApiData<ExposuresResponse> {
  const { range } = useViewSettings()
  return useApiData(customerId ? `exposures|${customerId}|${range}` : null, () => fetchExposures(customerId!, range))
}

export function useInstrumentHistory(ticker: string): ApiData<InstrumentHistoryResponse> {
  const { range, showBenchmark } = useViewSettings()
  return useApiData(`instrument|${ticker}|${range}|${showBenchmark}`, () => fetchInstrumentHistory(ticker, { range, benchmark: showBenchmark }))
}
