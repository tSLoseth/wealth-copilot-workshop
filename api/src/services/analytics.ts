// Time-range aware history, look-through exposures and instrument detail for
// the interactive dashboards. Same deterministic engine as the metrics.
import { getFundHoldings, getInvestmentsFor, fundHoldings } from '../data.js'
import { DATES, buildModel, exposureRisk, hasPriceHistory, periodReturn, portfolioValues, positionRisk, pricesFor, seriesStats, windowFor, type Window } from '../metrics/engine.js'
import { assetTypeNb, geographyNb, round, sectorNb } from '../metrics/format.js'
import { getAllInstruments } from '../data.js'
import type { DataQualityNote, ExposuresResponse, HistoryPoint, HistoryResponse, InstrumentHistoryResponse, PeriodStats, RangeKey } from '../reports/types.js'
import { osebxOn, osebxSource } from './benchmark.js'

const MAX_POINTS = 400

function roundStats(s: PeriodStats): PeriodStats {
  return { ...s, return_pct: round(s.return_pct, 2), volatility_pct: round(s.volatility_pct, 2), max_drawdown_pct: round(s.max_drawdown_pct, 2), worst_day_pct: round(s.worst_day_pct, 2) }
}

// Evenly thins long series for charts; always keeps the first and last point.
function thin<T>(points: T[]): T[] {
  if (points.length <= MAX_POINTS) return points
  const step = (points.length - 1) / (MAX_POINTS - 1)
  return Array.from({ length: MAX_POINTS }, (_, i) => points[Math.round(i * step)])
}

function indexed(values: number[], dates: string[]): HistoryPoint[] {
  const base = values[0] || 1
  return dates.map((date, i) => ({ date, index: round((values[i] / base) * 100, 2), value: Math.round(values[i]) }))
}

function windowDates(w: Window) {
  return DATES.slice(w.start, w.end + 1)
}

function osebxSeries(w: Window) {
  const dates = windowDates(w)
  const values = osebxOn(dates)
  return { points: thin(indexed(values, dates).map(({ date, index }) => ({ date, index }))), stats: roundStats(seriesStats(values, dates)), source: osebxSource() }
}

export function osebxHistory(range: RangeKey) {
  return osebxSeries(windowFor(range))
}

export function customerHistory(customerId: string, range: RangeKey, withBenchmark: boolean): HistoryResponse {
  const w = windowFor(range)
  const model = buildModel(customerId)
  const dates = windowDates(w)
  const values = portfolioValues(model, w)
  const notes: DataQualityNote[] = [
    { severity: 'info', message: 'Historikken viser hvordan dagens beholdning ville utviklet seg. Kjøp, salg og innskudd er ikke med.' },
    { severity: 'info', message: 'Selskapene er fiktive, men beveger seg med ekte indekser fra Yahoo Finance (OSEBX, S&P 500 og Nasdaq).' },
  ]
  if (model.total === 0) notes.unshift({ severity: 'warning', message: 'Du har ingen investeringer, så det finnes ingen historikk å vise.' })
  const osebx = withBenchmark ? osebxSeries(w) : null
  return {
    customer_id: customerId,
    range,
    start: w.startDate,
    end: w.endDate,
    portfolio: { ...roundStats(seriesStats(values, dates)), points: thin(indexed(values, dates)), start_value: Math.round(values[0] ?? 0), end_value: Math.round(values[values.length - 1] ?? 0) },
    benchmark: osebx ? { ...osebx.stats, points: osebx.points, source: osebx.source } : null,
    notes,
  }
}

export function customerExposures(customerId: string, range: RangeKey): ExposuresResponse {
  const w = windowFor(range)
  const model = buildModel(customerId)
  const share = (v: number) => (model.total > 0 ? round((v / model.total) * 100, 2) : 0)
  const exposureRiskShares = model.total > 0 ? exposureRisk(model, w).contributions : []
  const positionRiskShares = model.total > 0 ? positionRisk(model, w).contributions : []
  const labels = (x: { asset_type: string; sector: string; geography: string }) => ({
    asset_type_label: assetTypeNb(x.asset_type),
    sector_label: sectorNb(x.sector),
    geography_label: geographyNb(x.geography),
  })
  const quantities = new Map<string, number>()
  for (const inv of getInvestmentsFor(customerId)) quantities.set(inv.ticker, (quantities.get(inv.ticker) ?? 0) + inv.quantity)
  return {
    customer_id: customerId,
    range,
    start: w.startDate,
    end: w.endDate,
    total_value: Math.round(model.total),
    positions: model.positions.map((p, i) => ({
      ticker: p.ticker,
      name: p.name,
      asset_type: p.asset_type,
      sector: p.sector,
      geography: p.geography,
      ...labels(p),
      quantity: quantities.get(p.ticker) ?? p.quantity,
      price: round(p.price, 2),
      value: Math.round(p.value),
      weight_pct: share(p.value),
      risk_contribution_pct: round((positionRiskShares[i] ?? 0) * 100, 2),
      return_pct: periodReturn(p.ticker, w) === null ? null : round(periodReturn(p.ticker, w)!, 2),
      is_fund: p.is_fund,
    })),
    exposures: model.exposures.map((e, i) => ({
      ticker: e.ticker,
      name: e.name,
      asset_type: e.asset_type,
      sector: e.sector,
      geography: e.geography,
      ...labels(e),
      value: Math.round(e.value),
      weight_pct: share(e.value),
      risk_contribution_pct: round((exposureRiskShares[i] ?? 0) * 100, 2),
      return_pct: periodReturn(e.ticker, w) === null ? null : round(periodReturn(e.ticker, w)!, 2),
      paths: e.paths.map((p) => ({ via: p.via, via_name: p.via_name, value: Math.round(p.value), weight_pct: share(p.value) })),
    })),
    benchmark_return_pct: round(seriesStats(osebxOn(windowDates(w)), windowDates(w)).return_pct, 2),
  }
}

function instrumentInfo(ticker: string) {
  const own = getAllInstruments().find((i) => i.ticker === ticker)
  if (own) return { name: own.name.replace(/\s*\(Fictional\)$/, ''), asset_type: own.asset_type, sector: own.sector, geography: own.geography }
  const constituent = fundHoldings.find((h) => h.constituent_ticker === ticker)
  if (constituent) return { name: constituent.name.replace(/\s*\(Fictional\)$/, ''), asset_type: constituent.asset_type, sector: constituent.sector, geography: constituent.geography }
  return null
}

export function instrumentHistory(ticker: string, range: RangeKey, withBenchmark: boolean): InstrumentHistoryResponse | null {
  const info = instrumentInfo(ticker)
  if (!info || !hasPriceHistory(ticker)) return null
  const w = windowFor(range)
  const dates = windowDates(w)
  const prices = pricesFor(ticker).slice(w.start, w.end + 1)
  const osebx = withBenchmark ? osebxSeries(w) : null
  const fundName = (fund: string) => instrumentInfo(fund)?.name ?? fund
  return {
    ticker,
    name: info.name,
    asset_type_label: assetTypeNb(info.asset_type),
    sector_label: sectorNb(info.sector),
    geography_label: geographyNb(info.geography),
    range,
    start: w.startDate,
    end: w.endDate,
    points: thin(indexed(prices, dates).map((p, i) => ({ date: p.date, index: p.index, price: round(prices[dates.indexOf(p.date)] ?? prices[i], 2) }))),
    stats: roundStats(seriesStats(prices, dates)),
    benchmark: osebx,
    held_by_funds: fundHoldings
      .filter((h) => h.constituent_ticker === ticker)
      .map((h) => ({ fund_ticker: h.fund_ticker, fund_name: fundName(h.fund_ticker), weight_pct: round(h.weight_pct, 2) }))
      .sort((a, b) => b.weight_pct - a.weight_pct),
    fund_holdings: getFundHoldings(ticker).map((h) => ({
      constituent_ticker: h.constituent_ticker,
      name: h.name.replace(/\s*\(Fictional\)$/, ''),
      sector_label: sectorNb(h.sector),
      geography_label: geographyNb(h.geography),
      weight_pct: round(h.weight_pct, 2),
    })),
  }
}
