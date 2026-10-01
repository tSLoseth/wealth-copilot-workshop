// Deterministic portfolio model behind every metric: positions, look-through
// exposures and a covariance-based risk decomposition.
//
// Educational demo model: fictional companies driven by real index moves.
// Not a real suitability assessment or investment advice.
import { getFundHoldings, getInvestmentsFor, getMarketDataFor, isFund, marketData } from '../data.js'
import type { PeriodStats, RangeKey } from '../reports/types.js'
import { RANGES } from '../reports/types.js'

export const TRADING_DAYS_PER_YEAR = 252

const displayName = (name: string) => name.replace(/\s*\(Fictional\)$/, '')

export interface Position {
  ticker: string
  name: string
  asset_type: string
  sector: string
  geography: string
  quantity: number
  price: number
  value: number
  is_fund: boolean
}

export interface ExposurePath {
  via: string // 'direct' or the fund ticker
  via_name: string
  value: number
}

export interface Exposure {
  ticker: string
  name: string
  asset_type: string
  sector: string
  geography: string
  value: number
  paths: ExposurePath[]
}

export interface PortfolioModel {
  customerId: string
  positions: Position[]
  exposures: Exposure[]
  total: number
  fundHoldingsAsOf: string | null
}

export const DATES: string[] = [...new Set(marketData.map((p) => p.date))].sort()

const returnsCache = new Map<string, number[]>()
export function returnsFor(ticker: string): number[] {
  const cached = returnsCache.get(ticker)
  if (cached) return cached
  const byDate = new Map(getMarketDataFor(ticker).map((p) => [p.date, p.daily_return / 100]))
  const series = DATES.map((d) => byDate.get(d) ?? 0)
  returnsCache.set(ticker, series)
  return series
}

export function hasPriceHistory(ticker: string): boolean {
  return getMarketDataFor(ticker).length > 0
}

const priceCache = new Map<string, number[]>()
// Prices aligned with DATES, carried forward over gaps.
export function pricesFor(ticker: string): number[] {
  const cached = priceCache.get(ticker)
  if (cached) return cached
  const history = getMarketDataFor(ticker)
  const byDate = new Map(history.map((p) => [p.date, p.price]))
  let last = history[0]?.price ?? 0
  const series = DATES.map((d) => (last = byDate.get(d) ?? last))
  priceCache.set(ticker, series)
  return series
}

export function priceOn(ticker: string, date: string): number | undefined {
  const i = DATES.indexOf(date)
  return i >= 0 && hasPriceHistory(ticker) ? pricesFor(ticker)[i] : undefined
}

export interface Window {
  range: RangeKey
  label: string
  start: number // index into DATES
  end: number
  startDate: string
  endDate: string
}

export const DEFAULT_RANGE: RangeKey = '1Y'

export function isRange(value: unknown): value is RangeKey {
  return RANGES.some((r) => r.key === value)
}

export function windowFor(range: RangeKey = DEFAULT_RANGE): Window {
  const end = DATES.length - 1
  const endDate = new Date(`${DATES[end]}T00:00:00Z`)
  const from = new Date(endDate)
  const months: Partial<Record<RangeKey, number>> = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12, '3Y': 36, '5Y': 60 }
  if (months[range]) from.setUTCMonth(from.getUTCMonth() - months[range]!)
  else if (range === 'YTD') from.setUTCMonth(0, 0)
  const fromIso = range === 'ALL' ? DATES[0] : from.toISOString().slice(0, 10)
  let start = DATES.findIndex((d) => d >= fromIso)
  if (start < 0 || start >= end) start = Math.max(0, end - 1)
  return { range, label: RANGES.find((r) => r.key === range)!.label, start, end, startDate: DATES[start], endDate: DATES[end] }
}

export function windowLabel(w: Window) {
  return w.range === 'ALL' ? 'hele perioden' : w.range === 'YTD' ? 'i år' : `siste ${w.label}`
}

// Return, annualised volatility, max drawdown and worst day of a value series.
export function seriesStats(values: number[], dates: string[]): PeriodStats {
  const returns: number[] = []
  let worst = 0
  let worstDate: string | null = null
  let peak = values[0] ?? 0
  let drawdown = 0
  values.forEach((v, i) => {
    if (i > 0 && values[i - 1] > 0) {
      const r = v / values[i - 1] - 1
      returns.push(r)
      if (r < worst) {
        worst = r
        worstDate = dates[i]
      }
    }
    peak = Math.max(peak, v)
    if (peak > 0) drawdown = Math.min(drawdown, v / peak - 1)
  })
  const mean = returns.reduce((s, r) => s + r, 0) / (returns.length || 1)
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(1, returns.length - 1)
  return {
    return_pct: values[0] > 0 ? (values[values.length - 1] / values[0] - 1) * 100 : 0,
    volatility_pct: Math.sqrt(variance * TRADING_DAYS_PER_YEAR) * 100,
    max_drawdown_pct: drawdown * 100,
    worst_day_pct: worst * 100,
    worst_day_date: worstDate,
  }
}

export function portfolioValues(model: PortfolioModel, w: Window): number[] {
  const values = new Array(w.end - w.start + 1).fill(0)
  for (const p of model.positions) {
    const prices = hasPriceHistory(p.ticker) ? pricesFor(p.ticker) : null
    for (let i = w.start; i <= w.end; i += 1) values[i - w.start] += p.quantity * (prices ? prices[i] : p.price)
  }
  return values
}

export function periodReturn(ticker: string, w: Window): number | null {
  if (!hasPriceHistory(ticker)) return null
  const prices = pricesFor(ticker)
  return prices[w.start] > 0 ? (prices[w.end] / prices[w.start] - 1) * 100 : null
}

const modelCache = new Map<string, PortfolioModel>()

export function buildModel(customerId: string): PortfolioModel {
  const cached = modelCache.get(customerId)
  if (cached) return cached

  const byTicker = new Map<string, Position>()
  for (const h of getInvestmentsFor(customerId)) {
    const existing = byTicker.get(h.ticker)
    if (existing) {
      existing.quantity += h.quantity
      existing.value = existing.quantity * existing.price
    } else {
      byTicker.set(h.ticker, {
        ticker: h.ticker,
        name: displayName(h.name),
        asset_type: h.asset_type,
        sector: h.sector,
        geography: h.geography,
        quantity: h.quantity,
        price: h.current_price,
        value: h.quantity * h.current_price,
        is_fund: isFund(h.ticker),
      })
    }
  }
  const positions = [...byTicker.values()].sort((a, b) => b.value - a.value)
  const total = positions.reduce((s, p) => s + p.value, 0)

  const exposures = new Map<string, Exposure>()
  let fundHoldingsAsOf: string | null = null
  const addExposure = (e: Omit<Exposure, 'value' | 'paths'>, path: ExposurePath) => {
    const existing = exposures.get(e.ticker) ?? { ...e, value: 0, paths: [] }
    existing.value += path.value
    existing.paths.push(path)
    exposures.set(e.ticker, existing)
  }
  for (const p of positions) {
    const holdings = getFundHoldings(p.ticker)
    if (holdings.length === 0) {
      addExposure(p, { via: 'direct', via_name: 'Direkte', value: p.value })
      continue
    }
    for (const c of holdings) {
      if (!fundHoldingsAsOf || c.as_of_date < fundHoldingsAsOf) fundHoldingsAsOf = c.as_of_date
      addExposure(
        { ticker: c.constituent_ticker, name: displayName(c.name), asset_type: c.asset_type, sector: c.sector, geography: c.geography },
        { via: p.ticker, via_name: p.name, value: (p.value * c.weight_pct) / 100 },
      )
    }
  }

  const model: PortfolioModel = {
    customerId,
    positions,
    exposures: [...exposures.values()].sort((a, b) => b.value - a.value),
    total,
    fundHoldingsAsOf,
  }
  modelCache.set(customerId, model)
  return model
}

function covariance(a: number[], b: number[]): number {
  const n = a.length
  if (n < 2) return 0
  const meanA = a.reduce((s, v) => s + v, 0) / n
  const meanB = b.reduce((s, v) => s + v, 0) / n
  let sum = 0
  for (let i = 0; i < n; i += 1) sum += (a[i] - meanA) * (b[i] - meanB)
  return sum / (n - 1)
}

export interface RiskDecomposition {
  volatility: number // annualised, as a fraction
  contributions: number[] // fractions summing to 1
  standalone: number[] // annualised standalone volatility per item
}

// Euler decomposition: contribution_i = w_i * (Σw)_i / σ², which sums to 1.
export function decomposeRisk(tickers: string[], weights: number[], w: Window = windowFor()): RiskDecomposition {
  const series = tickers.map((t) => returnsFor(t).slice(w.start + 1, w.end + 1))
  const cov = series.map((a) => series.map((b) => covariance(a, b) * TRADING_DAYS_PER_YEAR))
  const sigmaW = cov.map((row) => row.reduce((s, c, j) => s + c * weights[j], 0))
  const variance = Math.max(0, weights.reduce((s, w, i) => s + w * sigmaW[i], 0))
  return {
    volatility: Math.sqrt(variance),
    contributions: weights.map((w, i) => (variance > 0 ? (w * sigmaW[i]) / variance : 0)),
    standalone: cov.map((row, i) => Math.sqrt(Math.max(0, row[i]))),
  }
}

export function exposureRisk(model: PortfolioModel, w?: Window): RiskDecomposition {
  const weights = model.exposures.map((e) => (model.total > 0 ? e.value / model.total : 0))
  return decomposeRisk(model.exposures.map((e) => e.ticker), weights, w)
}

export function positionRisk(model: PortfolioModel, w?: Window): RiskDecomposition {
  const weights = model.positions.map((p) => (model.total > 0 ? p.value / model.total : 0))
  return decomposeRisk(model.positions.map((p) => p.ticker), weights, w)
}
