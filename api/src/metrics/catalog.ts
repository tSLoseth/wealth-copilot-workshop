// The metric catalog: the ONLY source of numbers for reports and the AI.
// Every metric is deterministic and returns its value together with the data,
// assumptions and data-quality notes behind it.
import { getCustomer } from '../data.js'
import type { BenchmarkValue, BreakdownRow, DataQualityNote, MetricDefinition, MetricResult, PeriodStats, RangeKey, StressScenario } from '../reports/types.js'
import { OSEBX_NAME, osebxOn, osebxSource } from '../services/benchmark.js'
import {
  DATES,
  buildModel,
  decomposeRisk,
  exposureRisk,
  hasPriceHistory,
  portfolioValues,
  positionRisk,
  pricesFor,
  seriesStats,
  windowFor,
  windowLabel,
  type Exposure,
  type PortfolioModel,
  type Window,
} from './engine.js'
import { PROFILE_NB, assetTypeNb, dateNb, daysBetween, geographyNb, kr, num, pct, round, sectorNb } from './format.js'

export class MetricError extends Error {}

export interface MetricContext {
  customerId: string
  customScenarios: StressScenario[]
  now: Date
  range?: RangeKey
}

type Params = Record<string, string | number>
type Computed = Omit<MetricResult, 'id' | 'title' | 'question'>

interface Metric extends MetricDefinition {
  compute(ctx: MetricContext, params: Params): Computed
}

// Illustrative bands per risk profile: expected annual volatility and the
// maximum share of equities. Not a real suitability framework.
export const PROFILE_BANDS: Record<string, { min: number; max: number; maxEquityPct: number }> = {
  Conservative: { min: 0, max: 6, maxEquityPct: 30 },
  Moderate: { min: 4, max: 10, maxEquityPct: 50 },
  Balanced: { min: 7, max: 13, maxEquityPct: 65 },
  Growth: { min: 10, max: 16, maxEquityPct: 85 },
  Aggressive: { min: 13, max: 24, maxEquityPct: 100 },
}

// Real market episodes (dates from the index history), replayed on today's holdings.
export const HISTORICAL_EPISODES = [
  { id: 'oil-2015', name: 'Oljeprisfallet (2015–2016)', start: '2015-05-21', end: '2016-02-11', description: 'Oljeprisen falt kraftig, og Oslo Børs falt med den.' },
  { id: 'autumn-2018', name: 'Børsfallet høsten 2018', start: '2018-10-01', end: '2018-12-24', description: 'Renteuro og handelskrig ga brede fall på verdens børser.' },
  { id: 'covid-2020', name: 'Koronakrakket (2020)', start: '2020-02-19', end: '2020-03-23', description: 'Børsene falt brått da pandemien stengte ned samfunn over hele verden.' },
  { id: 'tech-2022', name: 'Teknologifallet (2022)', start: '2021-11-19', end: '2022-12-28', description: 'Høyere renter traff særlig teknologiaksjer, som falt mer enn resten av markedet.' },
]

export const STRESS_SCENARIOS: StressScenario[] = [
  {
    id: 'broad-market-fall',
    name: 'Bredt aksjefall',
    description: 'Alle aksjer faller 20 %, mens obligasjoner stiger litt. Omtrent som et kraftig, men ikke historisk ekstremt fall.',
    asset_type_shocks: { Equity: -20, Bond: 1, Cash: 0 },
  },
  {
    id: 'tech-correction',
    name: 'Teknologikorreksjon',
    description: 'Teknologiselskaper faller 30 %, mens andre aksjer faller 8 %. Gjelder også teknologi inne i fondene.',
    sector_shocks: { Technology: -30 },
    asset_type_shocks: { Equity: -8, Bond: 0.5, Cash: 0 },
  },
  {
    id: 'rate-shock',
    name: 'Renteoppgang',
    description: 'Rentene stiger brått. Obligasjoner faller 6 % og aksjer faller 10 %.',
    asset_type_shocks: { Equity: -10, Bond: -6, Cash: 0 },
  },
]

const SOURCES = {
  holdings: 'investments.json – beholdningene dine',
  prices: 'market_data.json – daglige kurser (fiktive selskaper drevet av ekte indekser fra Yahoo Finance)',
  osebx: 'Yahoo Finance – Oslo Børs hovedindeks (OSEBX.OL)',
  funds: 'fund_holdings.json – hva fondene eier',
  profile: 'customers.json – risikoprofilen din',
}

const ASSUMPTIONS = {
  volatility: 'Svingningene er beregnet fra daglige kursendringer i valgt periode og omregnet til ett år (252 handelsdager).',
  synthetic: 'Selskapene er fiktive. De beveger seg med ekte indekser (OSEBX for nordiske selskaper, S&P 500 for resten, Nasdaq for teknologi), pluss syntetiske selskapsspesifikke bevegelser. Valuta er ikke med.',
  covariance: 'Risikobidraget tar hensyn til at investeringer ofte beveger seg sammen, ikke bare hvor mye hver enkelt svinger.',
  constantHoldings: 'Beregningen antar at du har eid de samme investeringene hele perioden. Kjøp og salg er ikke med.',
  lookThrough: 'Fondene er brutt ned i det de faktisk eier, basert på siste rapporterte beholdning fra fondene.',
  bands: 'Intervallene per risikoprofil er illustrative og ikke en ekte egnethetsvurdering.',
  scenario: 'Stresstester er hypotetiske «hva om»-regnestykker, ikke prognoser.',
}

function win(ctx: MetricContext) {
  return windowFor(ctx.range)
}

function period(w: Window = windowFor()) {
  return `${dateNb(w.startDate)} – ${dateNb(w.endDate)}`
}

function periodInfo(w: Window): MetricResult['period'] {
  return { range: w.range, label: w.label, start: w.startDate, end: w.endDate }
}

export function osebxStats(w: Window): PeriodStats {
  const dates = DATES.slice(w.start, w.end + 1)
  return seriesStats(osebxOn(dates), dates)
}

function bench(display: string, value: number | null): BenchmarkValue {
  return { label: 'OSEBX', value, display }
}

const signedPct = (v: number, decimals = 1) => `${v >= 0 ? '+' : '−'}${pct(Math.abs(v), decimals)}`

function qualityNotes(model: PortfolioModel, now: Date, kinds: { risk?: boolean; lookThrough?: boolean; window?: Window }): DataQualityNote[] {
  const notes: DataQualityNote[] = []
  const lastPrice = DATES[DATES.length - 1]
  if (lastPrice) {
    const days = daysBetween(lastPrice, now)
    if (days > 3) {
      notes.push({
        severity: days > 30 ? 'warning' : 'notice',
        message: `Kursene er fra ${dateNb(lastPrice)} (${days} dager gamle). Verdiene kan ha endret seg siden.`,
      })
    }
  }
  const missing = model.positions.filter((p) => p.asset_type !== 'Cash' && !hasPriceHistory(p.ticker))
  if (missing.length > 0) {
    notes.push({ severity: 'warning', message: `Vi mangler kurshistorikk for ${missing.map((p) => p.name).join(', ')}. Disse er regnet som om de ikke svinger, så risikoen kan være undervurdert.` })
  }
  if (kinds.lookThrough && model.fundHoldingsAsOf) {
    const days = daysBetween(model.fundHoldingsAsOf, now)
    notes.push({ severity: days > 95 ? 'warning' : 'notice', message: `Fondenes beholdninger er rapportert per ${dateNb(model.fundHoldingsAsOf)} (${days} dager siden). Fondene kan ha endret sammensetning etterpå.` })
  }
  if (kinds.risk) {
    const w = kinds.window ?? windowFor()
    const days = w.end - w.start
    if (days < 120) notes.push({ severity: 'notice', message: `Perioden har bare ${days} handelsdager. Svingninger beregnet over kort tid er usikre – velg en lengre periode for et mer stabilt bilde.` })
  }
  return notes
}

function empty(model: PortfolioModel, now: Date): Computed {
  return {
    value: null,
    display: 'Ingen investeringer',
    unit: 'text',
    facts: {},
    provenance: { sources: [SOURCES.holdings], rows_used: 0 },
    assumptions: [],
    data_quality: [{ severity: 'info', message: 'Du har ingen investeringer ennå, så det er ingen investeringsrisiko å vise.' }, ...qualityNotes(model, now, {})],
  }
}

function share(value: number, model: PortfolioModel) {
  return model.total > 0 ? (value / model.total) * 100 : 0
}

function groupExposures(model: PortfolioModel, key: (e: Exposure) => string, contributions?: number[]) {
  const groups = new Map<string, { weight: number; risk: number; value: number }>()
  model.exposures.forEach((e, i) => {
    const g = groups.get(key(e)) ?? { weight: 0, risk: 0, value: 0 }
    g.value += e.value
    g.weight += share(e.value, model)
    g.risk += (contributions?.[i] ?? 0) * 100
    groups.set(key(e), g)
  })
  return [...groups.entries()].map(([label, g]) => ({ label, ...g }))
}

function pathsText(e: Exposure, model: PortfolioModel) {
  return e.paths
    .sort((a, b) => b.value - a.value)
    .map((p) => `${p.via === 'direct' ? 'Direkte' : p.via_name} ${pct(share(p.value, model))}`)
    .join(' · ')
}

function scenarioById(ctx: MetricContext, id: string): StressScenario {
  const scenario = [...STRESS_SCENARIOS, ...ctx.customScenarios].find((s) => s.id === id)
  if (!scenario) throw new MetricError(`Ukjent scenario "${id}". Gyldige: ${[...STRESS_SCENARIOS, ...ctx.customScenarios].map((s) => s.id).join(', ')}`)
  return scenario
}

function shockFor(e: Exposure, s: StressScenario): number {
  return s.sector_shocks?.[e.sector] ?? s.asset_type_shocks?.[e.asset_type] ?? 0
}

const METRICS: Metric[] = [
  {
    id: 'total_value',
    title: 'Verdien av investeringene',
    question: 'Hva er investeringene dine verdt i dag?',
    params: [],
    facts: ['total', 'positions_count'],
    compute(ctx) {
      const model = buildModel(ctx.customerId)
      if (model.total === 0) return empty(model, ctx.now)
      return {
        value: Math.round(model.total),
        display: kr(model.total),
        unit: 'kr',
        value_label: 'Andel av verdien',
        breakdown: model.positions.map((p) => ({ label: p.name, value: round(share(p.value, model)), display: pct(share(p.value, model)), meta: { ticker: p.ticker, verdi: kr(p.value), type: assetTypeNb(p.asset_type) }, drill: { dimension: 'instrument', value: p.ticker, label: p.name } })),
        facts: { total: kr(model.total), positions_count: String(model.positions.length) },
        provenance: { sources: [SOURCES.holdings], as_of: DATES[DATES.length - 1], rows_used: model.positions.length },
        assumptions: ['Verdien er antall andeler ganger siste kurs.'],
        data_quality: qualityNotes(model, ctx.now, {}),
      }
    },
  },
  {
    id: 'annual_volatility',
    title: 'Forventede svingninger i et typisk år',
    question: 'Hvor mye kan verdien gå opp og ned i løpet av et vanlig år?',
    params: [],
    facts: ['pct', 'kr', 'bad_year_kr', 'osebx_pct', 'period'],
    compute(ctx) {
      const model = buildModel(ctx.customerId)
      if (model.total === 0) return empty(model, ctx.now)
      const w = win(ctx)
      const vol = exposureRisk(model, w).volatility * 100
      const osebx = osebxStats(w).volatility_pct
      return {
        value: round(vol),
        display: `±${pct(vol)}`,
        unit: '%',
        benchmark: bench(`±${pct(osebx)}`, round(osebx)),
        period: periodInfo(w),
        facts: { pct: `±${pct(vol)}`, kr: `±${kr((model.total * vol) / 100)}`, bad_year_kr: kr((model.total * vol * 1.645) / 100), osebx_pct: `±${pct(osebx)}`, period: windowLabel(w) },
        provenance: { sources: [SOURCES.holdings, SOURCES.prices, SOURCES.funds, SOURCES.osebx], period: period(w), rows_used: model.exposures.length * (w.end - w.start) },
        assumptions: [ASSUMPTIONS.volatility, ASSUMPTIONS.covariance, 'I omtrent to av tre år vil verdien endre seg mindre enn dette. Et dårlig år (som skjer omtrent én gang hvert tjuende år) kan gi et fall på rundt 1,6 ganger dette.', ASSUMPTIONS.constantHoldings, ASSUMPTIONS.synthetic],
        data_quality: qualityNotes(model, ctx.now, { risk: true, lookThrough: true, window: w }),
      }
    },
  },
  {
    id: 'risk_by_holding',
    title: 'Risiko per investering du eier',
    question: 'Hvilke av investeringene dine står for mest av svingningene?',
    params: [],
    facts: ['top_name', 'top_weight', 'top_risk', 'second_name', 'second_weight', 'second_risk'],
    compute(ctx) {
      const model = buildModel(ctx.customerId)
      if (model.total === 0) return empty(model, ctx.now)
      const w = win(ctx)
      const risk = positionRisk(model, w)
      const rows: BreakdownRow[] = model.positions
        .map((p, i) => ({
          drill: { dimension: 'instrument' as const, value: p.ticker, label: p.name },
          label: p.name,
          value: round(share(p.value, model)),
          display: pct(share(p.value, model)),
          secondary: round(risk.contributions[i] * 100),
          secondary_display: pct(risk.contributions[i] * 100),
          meta: { ticker: p.ticker, fond: p.is_fund ? 'ja' : 'nei', svingning_alene: `±${pct(risk.standalone[i] * 100)}` },
        }))
        .sort((a, b) => (b.secondary ?? 0) - (a.secondary ?? 0))
      const [top, second] = rows
      return {
        value: top.secondary ?? null,
        display: top.label,
        unit: 'text',
        value_label: 'Andel av verdien',
        secondary_label: 'Andel av svingningene',
        breakdown: rows,
        facts: {
          top_name: top.label, top_weight: top.display, top_risk: top.secondary_display ?? '',
          second_name: second?.label ?? '', second_weight: second?.display ?? '', second_risk: second?.secondary_display ?? '',
        },
        period: periodInfo(w),
        provenance: { sources: [SOURCES.holdings, SOURCES.prices], period: period(w), rows_used: model.positions.length * (w.end - w.start) },
        assumptions: [ASSUMPTIONS.volatility, ASSUMPTIONS.covariance, 'Bidragene summerer til 100 % av svingningene.', ASSUMPTIONS.constantHoldings, ASSUMPTIONS.synthetic],
        data_quality: qualityNotes(model, ctx.now, { risk: true, window: w }),
      }
    },
  },
  {
    id: 'risk_by_underlying',
    title: 'Risiko per selskap du egentlig eier',
    question: 'Hvilke selskaper – også inne i fondene – står for mest av svingningene?',
    params: [],
    facts: ['top_name', 'top_weight', 'top_risk', 'top_paths', 'underlying_count'],
    compute(ctx) {
      const model = buildModel(ctx.customerId)
      if (model.total === 0) return empty(model, ctx.now)
      const w = win(ctx)
      const risk = exposureRisk(model, w)
      const rows = model.exposures
        .map((e, i) => ({
          drill: { dimension: 'instrument' as const, value: e.ticker, label: e.name },
          label: e.name,
          value: round(share(e.value, model)),
          display: pct(share(e.value, model)),
          secondary: round(risk.contributions[i] * 100),
          secondary_display: pct(risk.contributions[i] * 100),
          meta: { ticker: e.ticker, sektor: sectorNb(e.sector), eies_via: pathsText(e, model) },
        }))
        .sort((a, b) => (b.secondary ?? 0) - (a.secondary ?? 0))
      const top = rows[0]
      return {
        value: top.secondary ?? null,
        display: top.label,
        unit: 'text',
        value_label: 'Andel av verdien',
        secondary_label: 'Andel av svingningene',
        breakdown: rows.slice(0, 12),
        facts: { top_name: top.label, top_weight: top.display, top_risk: top.secondary_display ?? '', top_paths: String(top.meta.eies_via), underlying_count: String(rows.length) },
        period: periodInfo(w),
        provenance: { sources: [SOURCES.holdings, SOURCES.funds, SOURCES.prices], period: period(w), as_of: model.fundHoldingsAsOf ?? undefined, rows_used: rows.length * (w.end - w.start) },
        assumptions: [ASSUMPTIONS.lookThrough, ASSUMPTIONS.volatility, ASSUMPTIONS.covariance, ASSUMPTIONS.constantHoldings, ASSUMPTIONS.synthetic],
        data_quality: qualityNotes(model, ctx.now, { risk: true, lookThrough: true, window: w }),
      }
    },
  },
  {
    id: 'risk_by_sector',
    title: 'Risiko per sektor',
    question: 'Hvilke bransjer står for mest av svingningene, når fondene er brutt ned?',
    params: [],
    facts: ['top_sector', 'top_sector_weight', 'top_sector_risk', 'tech_weight', 'tech_risk'],
    compute(ctx) {
      const model = buildModel(ctx.customerId)
      if (model.total === 0) return empty(model, ctx.now)
      const w = win(ctx)
      const risk = exposureRisk(model, w)
      const groups = groupExposures(model, (e) => e.sector, risk.contributions).sort((a, b) => b.risk - a.risk)
      const tech = groups.find((g) => g.label === 'Technology')
      const top = groups[0]
      return {
        value: round(top.risk),
        display: sectorNb(top.label),
        unit: 'text',
        value_label: 'Andel av verdien',
        secondary_label: 'Andel av svingningene',
        breakdown: groups.map((g) => ({ label: sectorNb(g.label), value: round(g.weight), display: pct(g.weight), secondary: round(g.risk), secondary_display: pct(g.risk), meta: { verdi: kr(g.value) }, drill: { dimension: 'sector' as const, value: g.label, label: sectorNb(g.label) } })),
        facts: {
          top_sector: sectorNb(top.label), top_sector_weight: pct(top.weight), top_sector_risk: pct(top.risk),
          tech_weight: pct(tech?.weight ?? 0), tech_risk: pct(tech?.risk ?? 0),
        },
        period: periodInfo(w),
        provenance: { sources: [SOURCES.holdings, SOURCES.funds, SOURCES.prices], period: period(w), as_of: model.fundHoldingsAsOf ?? undefined, rows_used: model.exposures.length * (w.end - w.start) },
        assumptions: [ASSUMPTIONS.lookThrough, ASSUMPTIONS.volatility, ASSUMPTIONS.covariance, ASSUMPTIONS.constantHoldings, ASSUMPTIONS.synthetic],
        data_quality: qualityNotes(model, ctx.now, { risk: true, lookThrough: true, window: w }),
      }
    },
  },
  {
    id: 'profile_fit',
    title: 'Passer svingningene med risikoprofilen din?',
    question: 'Svinger porteføljen mer eller mindre enn det som er vanlig for risikoprofilen din?',
    params: [],
    facts: ['vol', 'profile', 'range', 'status_text', 'horizon', 'osebx_vol', 'period'],
    compute(ctx) {
      const model = buildModel(ctx.customerId)
      if (model.total === 0) return empty(model, ctx.now)
      const customer = getCustomer(ctx.customerId)
      const band = customer ? PROFILE_BANDS[customer.risk_profile] : undefined
      const w = win(ctx)
      const vol = exposureRisk(model, w).volatility * 100
      const osebx = osebxStats(w).volatility_pct
      const profile = customer ? (PROFILE_NB[customer.risk_profile] ?? customer.risk_profile) : 'Ukjent'
      const status: MetricResult['status'] = !band ? 'unknown' : vol > band.max ? 'above' : vol < band.min ? 'below' : 'within'
      const statusText = {
        above: `Porteføljen svinger mer enn det som er vanlig for en ${profile.toLowerCase()} profil.`,
        below: `Porteføljen svinger mindre enn det som er vanlig for en ${profile.toLowerCase()} profil.`,
        within: `Porteføljen svinger omtrent som forventet for en ${profile.toLowerCase()} profil.`,
        unknown: 'Vi kjenner ikke risikoprofilen din, så vi kan ikke sammenligne.',
      }[status]
      const notes = qualityNotes(model, ctx.now, { risk: true, lookThrough: true, window: w })
      if (!band) notes.unshift({ severity: 'warning', message: 'Vi har ingen registrert risikoprofil for deg.' })
      return {
        value: round(vol),
        display: `±${pct(vol)} i året`,
        unit: '%',
        status,
        benchmark: bench(`±${pct(osebx)}`, round(osebx)),
        period: periodInfo(w),
        breakdown: band ? [
          { label: 'Porteføljen din', value: round(vol), display: `±${pct(vol)}` },
          { label: `Vanlig for ${profile.toLowerCase()} profil`, value: band.max, display: `${num(band.min)}–${num(band.max)} %`, meta: { fra: band.min, til: band.max } },
        ] : [],
        facts: { vol: `±${pct(vol)}`, profile: profile.toLowerCase(), range: band ? `${num(band.min)}–${num(band.max)} %` : 'ukjent', status_text: statusText, horizon: customer?.investment_horizon.replace('years', 'år') ?? 'ukjent', osebx_vol: `±${pct(osebx)}`, period: windowLabel(w) },
        provenance: { sources: [SOURCES.profile, SOURCES.holdings, SOURCES.funds, SOURCES.prices, SOURCES.osebx], period: period(w), rows_used: model.exposures.length * (w.end - w.start) + 1 },
        assumptions: [ASSUMPTIONS.bands, ASSUMPTIONS.volatility, ASSUMPTIONS.covariance, ASSUMPTIONS.synthetic],
        data_quality: notes,
      }
    },
  },
  {
    id: 'equity_share',
    title: 'Andel aksjer',
    question: 'Hvor mye av pengene står i aksjer, også inne i fondene, sammenlignet med grensen for profilen din?',
    params: [],
    facts: ['equity_pct', 'max_pct', 'profile'],
    compute(ctx) {
      const model = buildModel(ctx.customerId)
      if (model.total === 0) return empty(model, ctx.now)
      const customer = getCustomer(ctx.customerId)
      const band = customer ? PROFILE_BANDS[customer.risk_profile] : undefined
      const groups = groupExposures(model, (e) => e.asset_type).sort((a, b) => b.weight - a.weight)
      const equity = groups.find((g) => g.label === 'Equity')?.weight ?? 0
      const status: MetricResult['status'] = !band ? 'unknown' : equity > band.maxEquityPct ? 'above' : 'within'
      return {
        value: round(equity),
        display: pct(equity),
        unit: '%',
        status,
        value_label: 'Andel av verdien',
        breakdown: groups.map((g) => ({ label: assetTypeNb(g.label), value: round(g.weight), display: pct(g.weight), meta: { verdi: kr(g.value) }, drill: { dimension: 'asset_type' as const, value: g.label, label: assetTypeNb(g.label) } })),
        facts: { equity_pct: pct(equity), max_pct: band ? pct(band.maxEquityPct, 0) : 'ukjent', profile: customer ? (PROFILE_NB[customer.risk_profile] ?? customer.risk_profile).toLowerCase() : 'ukjent' },
        provenance: { sources: [SOURCES.profile, SOURCES.holdings, SOURCES.funds], as_of: model.fundHoldingsAsOf ?? undefined, rows_used: model.exposures.length },
        assumptions: [ASSUMPTIONS.lookThrough, ASSUMPTIONS.bands],
        data_quality: qualityNotes(model, ctx.now, { lookThrough: true }),
      }
    },
  },
  {
    id: 'tech_exposure',
    title: 'Hvor mye teknologi du egentlig eier',
    question: 'Hvor stor del av pengene står i teknologiselskaper, direkte og inne i fondene?',
    params: [],
    facts: ['total_pct', 'total_kr', 'direct_pct', 'via_funds_pct', 'labelled_pct'],
    compute(ctx) {
      const model = buildModel(ctx.customerId)
      if (model.total === 0) return empty(model, ctx.now)
      const byPath = new Map<string, { name: string; value: number }>()
      for (const e of model.exposures.filter((x) => x.sector === 'Technology')) {
        for (const p of e.paths) {
          const g = byPath.get(p.via) ?? { name: p.via === 'direct' ? 'Aksjer du eier direkte' : p.via_name, value: 0 }
          g.value += p.value
          byPath.set(p.via, g)
        }
      }
      const total = [...byPath.values()].reduce((s, g) => s + g.value, 0)
      const direct = byPath.get('direct')?.value ?? 0
      const labelled = model.positions.filter((p) => p.sector === 'Technology').reduce((s, p) => s + p.value, 0)
      return {
        value: round(share(total, model)),
        display: pct(share(total, model)),
        unit: '%',
        value_label: 'Andel av porteføljen',
        breakdown: [...byPath.entries()]
          .map(([via, g]) => ({ label: g.name, value: round(share(g.value, model)), display: pct(share(g.value, model)), meta: { ticker: via === 'direct' ? '' : via, verdi: kr(g.value) }, drill: via === 'direct' ? { dimension: 'sector' as const, value: 'Technology', label: 'Teknologi' } : { dimension: 'instrument' as const, value: via, label: g.name } }))
          .sort((a, b) => b.value - a.value),
        facts: {
          total_pct: pct(share(total, model)), total_kr: kr(total), direct_pct: pct(share(direct, model)),
          via_funds_pct: pct(share(total - direct, model)), labelled_pct: pct(share(labelled, model)),
        },
        provenance: { sources: [SOURCES.holdings, SOURCES.funds], as_of: model.fundHoldingsAsOf ?? undefined, rows_used: model.exposures.length },
        assumptions: [ASSUMPTIONS.lookThrough, '«Merket som teknologi» betyr investeringer som selv er kategorisert som teknologi, for eksempel et teknologifond.'],
        data_quality: qualityNotes(model, ctx.now, { lookThrough: true }),
      }
    },
  },
  {
    id: 'overlap',
    title: 'Selskaper du eier flere steder',
    question: 'Hvilke selskaper eier du både direkte og gjennom ett eller flere fond?',
    params: [],
    facts: ['count', 'top_name', 'top_total_pct', 'top_paths'],
    compute(ctx) {
      const model = buildModel(ctx.customerId)
      if (model.total === 0) return empty(model, ctx.now)
      const rows = model.exposures
        .filter((e) => e.paths.length >= 2 && e.asset_type !== 'Cash')
        .map((e) => ({ label: e.name, value: round(share(e.value, model)), display: pct(share(e.value, model)), meta: { ticker: e.ticker, eies_via: pathsText(e, model), antall_steder: e.paths.length }, drill: { dimension: 'instrument' as const, value: e.ticker, label: e.name } }))
        .sort((a, b) => b.value - a.value)
      const top = rows[0]
      return {
        value: rows.length,
        display: top ? top.label : 'Ingen overlapp',
        unit: 'count',
        value_label: 'Samlet andel av porteføljen',
        breakdown: rows.slice(0, 10),
        facts: { count: String(rows.length), top_name: top?.label ?? 'ingen', top_total_pct: top?.display ?? '0 %', top_paths: top ? String(top.meta.eies_via) : '' },
        provenance: { sources: [SOURCES.holdings, SOURCES.funds], as_of: model.fundHoldingsAsOf ?? undefined, rows_used: model.exposures.length },
        assumptions: [ASSUMPTIONS.lookThrough],
        data_quality: qualityNotes(model, ctx.now, { lookThrough: true }),
      }
    },
  },
  {
    id: 'geography_exposure',
    title: 'Hvor i verden pengene står',
    question: 'Hvilke land og regioner er du eksponert mot når fondene er brutt ned?',
    params: [],
    facts: ['top_region', 'top_pct', 'us_pct', 'nordic_pct'],
    compute(ctx) {
      const model = buildModel(ctx.customerId)
      if (model.total === 0) return empty(model, ctx.now)
      const groups = groupExposures(model, (e) => e.geography).sort((a, b) => b.weight - a.weight)
      const nordic = groups.filter((g) => ['Norway', 'Sweden', 'Denmark', 'Finland', 'Nordics'].includes(g.label)).reduce((s, g) => s + g.weight, 0)
      return {
        value: round(groups[0].weight),
        display: geographyNb(groups[0].label),
        unit: 'text',
        value_label: 'Andel av porteføljen',
        breakdown: groups.map((g) => ({ label: geographyNb(g.label), value: round(g.weight), display: pct(g.weight), meta: { verdi: kr(g.value) }, drill: { dimension: 'geography' as const, value: g.label, label: geographyNb(g.label) } })),
        facts: { top_region: geographyNb(groups[0].label), top_pct: pct(groups[0].weight), us_pct: pct(groups.find((g) => g.label === 'United States')?.weight ?? 0), nordic_pct: pct(nordic) },
        provenance: { sources: [SOURCES.holdings, SOURCES.funds], as_of: model.fundHoldingsAsOf ?? undefined, rows_used: model.exposures.length },
        assumptions: [ASSUMPTIONS.lookThrough, 'Kontanter og norske obligasjoner regnes som Norge/Norden.'],
        data_quality: qualityNotes(model, ctx.now, { lookThrough: true }),
      }
    },
  },
  {
    id: 'concentration',
    title: 'Hvor spredt du egentlig er',
    question: 'Hvor mye av pengene står i de største selskapene, og hvor mange selskaper tilsvarer spredningen?',
    params: [],
    facts: ['top5_pct', 'effective_n', 'underlying_n', 'positions_n', 'top_name', 'top_pct'],
    compute(ctx) {
      const model = buildModel(ctx.customerId)
      if (model.total === 0) return empty(model, ctx.now)
      const invested = model.exposures.filter((e) => e.asset_type !== 'Cash')
      const investedTotal = invested.reduce((s, e) => s + e.value, 0)
      const hhi = invested.reduce((s, e) => s + (e.value / investedTotal) ** 2, 0)
      const top5 = invested.slice(0, 5).reduce((s, e) => s + e.value, 0)
      const effective = hhi > 0 ? 1 / hhi : 0
      return {
        value: round(effective),
        display: `${num(effective, 0)} selskaper`,
        unit: 'count',
        value_label: 'Andel av porteføljen',
        breakdown: invested.slice(0, 10).map((e) => ({ label: e.name, value: round(share(e.value, model)), display: pct(share(e.value, model)), meta: { sektor: sectorNb(e.sector), eies_via: pathsText(e, model) }, drill: { dimension: 'instrument' as const, value: e.ticker, label: e.name } })),
        facts: {
          top5_pct: pct(share(top5, model)), effective_n: num(effective, 0), underlying_n: String(invested.length), positions_n: String(model.positions.length),
          top_name: invested[0]?.name ?? '', top_pct: pct(share(invested[0]?.value ?? 0, model)),
        },
        provenance: { sources: [SOURCES.holdings, SOURCES.funds], as_of: model.fundHoldingsAsOf ?? undefined, rows_used: model.exposures.length },
        assumptions: [ASSUMPTIONS.lookThrough, '«Effektivt antall selskaper» er 1 delt på summen av kvadrerte vekter (Herfindahl). Har du 20 selskaper der to er veldig store, er du i praksis spredt som på færre.'],
        data_quality: qualityNotes(model, ctx.now, { lookThrough: true }),
      }
    },
  },
  {
    id: 'stress_test',
    title: 'Stresstest',
    question: 'Hvor mye kan du tape i kroner hvis et bestemt markedsfall skjer?',
    params: [{ name: 'scenario', description: 'ID for et innebygd scenario, eller id-en til et custom_scenario i rapporten.', values: STRESS_SCENARIOS.map((s) => s.id) }],
    facts: ['scenario_name', 'scenario_description', 'loss_kr', 'loss_pct', 'value_after', 'biggest_loser', 'biggest_loser_kr'],
    compute(ctx, params) {
      const model = buildModel(ctx.customerId)
      if (model.total === 0) return empty(model, ctx.now)
      const scenario = scenarioById(ctx, String(params.scenario ?? ''))
      const lossByPosition = new Map<string, number>()
      for (const e of model.exposures) {
        const shock = shockFor(e, scenario) / 100
        for (const p of e.paths) {
          const key = p.via === 'direct' ? e.ticker : p.via
          lossByPosition.set(key, (lossByPosition.get(key) ?? 0) + p.value * shock)
        }
      }
      const loss = [...lossByPosition.values()].reduce((s, v) => s + v, 0)
      const rows = model.positions
        .map((p) => ({ name: p.name, ticker: p.ticker, loss: lossByPosition.get(p.ticker) ?? 0 }))
        .filter((r) => r.loss < 0)
        .sort((a, b) => a.loss - b.loss)
        .map((r) => ({ label: r.name, value: Math.round(r.loss), display: `−${kr(-r.loss)}`, meta: { andel_av_tapet: pct(loss < 0 ? (r.loss / loss) * 100 : 0) }, drill: { dimension: 'instrument' as const, value: r.ticker, label: r.name } }))
      const lossPct = share(loss, model)
      return {
        value: round(lossPct),
        display: loss < 0 ? `−${kr(-loss)}` : kr(loss),
        unit: 'kr',
        value_label: 'Tap i kroner',
        breakdown: rows,
        facts: {
          scenario_name: scenario.name, scenario_description: scenario.description,
          loss_kr: kr(Math.abs(loss)), loss_pct: pct(Math.abs(lossPct)), value_after: kr(model.total + loss),
          biggest_loser: rows[0]?.label ?? 'ingen', biggest_loser_kr: rows[0] ? kr(-rows[0].value) : '0 kr',
        },
        provenance: { sources: [SOURCES.holdings, SOURCES.funds], as_of: model.fundHoldingsAsOf ?? undefined, rows_used: model.exposures.length },
        assumptions: [ASSUMPTIONS.scenario, ASSUMPTIONS.lookThrough, 'Fallet treffer selskapene inne i fondene, så et teknologifall rammer også teknologi i brede globalfond.', scenario.description],
        data_quality: qualityNotes(model, ctx.now, { lookThrough: true }),
      }
    },
  },
  {
    id: 'historical_episode',
    title: 'Slik ville det gått i et ekte markedsfall',
    question: 'Hvor mye ville dagens portefølje falt i et faktisk markedsfall fra historien, sammenlignet med OSEBX?',
    params: [{ name: 'episode', description: 'Historisk periode med ekte indeksbevegelser.', values: HISTORICAL_EPISODES.map((e) => e.id) }],
    facts: ['episode_name', 'start', 'end', 'portfolio_pct', 'portfolio_kr', 'osebx_pct', 'worst_pct', 'osebx_worst_pct'],
    compute(ctx, params) {
      const model = buildModel(ctx.customerId)
      if (model.total === 0) return empty(model, ctx.now)
      const episode = HISTORICAL_EPISODES.find((e) => e.id === params.episode)
      if (!episode) throw new MetricError(`Ukjent episode "${params.episode}". Gyldige: ${HISTORICAL_EPISODES.map((e) => e.id).join(', ')}`)
      const start = DATES.findIndex((d) => d >= episode.start)
      const end = DATES.findIndex((d) => d >= episode.end)
      if (start < 0 || end <= start) throw new MetricError('Perioden finnes ikke i kurshistorikken.')
      const w: Window = { range: 'ALL', label: episode.name, start, end, startDate: DATES[start], endDate: DATES[end] }
      const dates = DATES.slice(start, end + 1)
      const p = seriesStats(portfolioValues(model, w), dates)
      const o = seriesStats(osebxOn(dates), dates)
      const changeKr = (model.total * p.return_pct) / 100
      return {
        value: round(p.return_pct),
        display: signedPct(p.return_pct),
        unit: '%',
        benchmark: bench(signedPct(o.return_pct), round(o.return_pct)),
        value_label: 'Din portefølje',
        secondary_label: 'OSEBX',
        breakdown: [
          { label: 'Endring i perioden', value: round(p.return_pct), display: signedPct(p.return_pct), secondary: round(o.return_pct), secondary_display: signedPct(o.return_pct) },
          { label: 'Største fall underveis', value: round(p.max_drawdown_pct), display: pct(p.max_drawdown_pct), secondary: round(o.max_drawdown_pct), secondary_display: pct(o.max_drawdown_pct) },
        ],
        facts: {
          episode_name: episode.name, start: dateNb(DATES[start]), end: dateNb(DATES[end]),
          portfolio_pct: pct(Math.abs(p.return_pct)), portfolio_kr: kr(Math.abs(changeKr)), osebx_pct: pct(Math.abs(o.return_pct)),
          worst_pct: pct(Math.abs(p.max_drawdown_pct)), osebx_worst_pct: pct(Math.abs(o.max_drawdown_pct)),
        },
        provenance: { sources: [SOURCES.holdings, SOURCES.prices, SOURCES.osebx], period: `${dateNb(DATES[start])} – ${dateNb(DATES[end])}`, rows_used: model.positions.length * (end - start) },
        assumptions: [`${episode.name}: ${episode.description}`, 'Regnestykket bruker dagens beholdning og verdi, som om du hadde eid akkurat dette da.', ASSUMPTIONS.synthetic],
        data_quality: qualityNotes(model, ctx.now, {}),
      }
    },
  },
  {
    id: 'benchmark_comparison',
    title: 'Porteføljen din mot Oslo Børs',
    question: 'Hvordan har porteføljen gått og svingt sammenlignet med OSEBX i valgt periode?',
    params: [],
    facts: ['period', 'return_pct', 'osebx_return_pct', 'diff_pp', 'direction', 'vol', 'osebx_vol', 'max_dd', 'osebx_max_dd', 'change_kr'],
    compute(ctx) {
      const model = buildModel(ctx.customerId)
      if (model.total === 0) return empty(model, ctx.now)
      const w = win(ctx)
      const dates = DATES.slice(w.start, w.end + 1)
      const values = portfolioValues(model, w)
      const p = seriesStats(values, dates)
      const o = osebxStats(w)
      const diff = p.return_pct - o.return_pct
      const change = values[values.length - 1] - values[0]
      return {
        value: round(p.return_pct),
        display: signedPct(p.return_pct),
        unit: '%',
        benchmark: bench(signedPct(o.return_pct), round(o.return_pct)),
        period: periodInfo(w),
        value_label: 'Din portefølje',
        secondary_label: OSEBX_NAME,
        breakdown: [
          { label: 'Avkastning', value: round(p.return_pct), display: signedPct(p.return_pct), secondary: round(o.return_pct), secondary_display: signedPct(o.return_pct) },
          { label: 'Svingninger (årlig)', value: round(p.volatility_pct), display: `±${pct(p.volatility_pct)}`, secondary: round(o.volatility_pct), secondary_display: `±${pct(o.volatility_pct)}` },
          { label: 'Største fall', value: round(p.max_drawdown_pct), display: pct(p.max_drawdown_pct), secondary: round(o.max_drawdown_pct), secondary_display: pct(o.max_drawdown_pct) },
          { label: 'Verste dag', value: round(p.worst_day_pct, 2), display: pct(p.worst_day_pct, 2), secondary: round(o.worst_day_pct, 2), secondary_display: pct(o.worst_day_pct, 2) },
        ],
        facts: {
          period: windowLabel(w), return_pct: signedPct(p.return_pct), osebx_return_pct: signedPct(o.return_pct),
          diff_pp: `${num(Math.abs(diff))} prosentpoeng`, direction: diff >= 0 ? 'bedre enn' : 'svakere enn',
          vol: `±${pct(p.volatility_pct)}`, osebx_vol: `±${pct(o.volatility_pct)}`,
          max_dd: pct(Math.abs(p.max_drawdown_pct)), osebx_max_dd: pct(Math.abs(o.max_drawdown_pct)),
          change_kr: `${change >= 0 ? '+' : '−'}${kr(Math.abs(change))}`,
        },
        provenance: { sources: [SOURCES.holdings, SOURCES.prices, SOURCES.osebx], period: period(w), rows_used: model.positions.length * (w.end - w.start) },
        assumptions: [ASSUMPTIONS.constantHoldings, ASSUMPTIONS.synthetic, 'OSEBX er en ren norsk aksjeindeks. Porteføljen din har også utenlandske aksjer, obligasjoner og kontanter, så den er ikke direkte sammenlignbar.'],
        data_quality: qualityNotes(model, ctx.now, { risk: true, window: w }),
      }
    },
  },
  {
    id: 'historical_drawdown',
    title: 'Det verste som skjedde i perioden',
    question: 'Hva var den verste dagen og det største fallet fra en topp i valgt periode?',
    params: [],
    facts: ['worst_day_pct', 'worst_day_date', 'worst_day_kr', 'max_drawdown_pct', 'max_drawdown_kr', 'osebx_max_drawdown_pct', 'period'],
    compute(ctx) {
      const model = buildModel(ctx.customerId)
      if (model.total === 0) return empty(model, ctx.now)
      const w = win(ctx)
      const series = portfolioValues(model, w)
      const dates = DATES.slice(w.start, w.end + 1)
      const p = seriesStats(series, dates)
      const o = osebxStats(w)
      let peak = series[0]
      let drawdownKr = 0
      for (const v of series) {
        peak = Math.max(peak, v)
        drawdownKr = Math.max(drawdownKr, peak - v)
      }
      const worstIdx = p.worst_day_date ? dates.indexOf(p.worst_day_date) : -1
      const worstKr = worstIdx > 0 ? series[worstIdx - 1] - series[worstIdx] : 0
      return {
        value: round(p.max_drawdown_pct, 2),
        display: pct(p.max_drawdown_pct),
        unit: '%',
        benchmark: bench(pct(o.max_drawdown_pct), round(o.max_drawdown_pct, 2)),
        period: periodInfo(w),
        value_label: 'Din portefølje',
        secondary_label: 'OSEBX',
        breakdown: [
          { label: 'Verste enkeltdag', value: round(p.worst_day_pct, 2), display: `${pct(p.worst_day_pct, 2)} (${kr(worstKr)})`, secondary: round(o.worst_day_pct, 2), secondary_display: pct(o.worst_day_pct, 2), meta: { dato: dateNb(p.worst_day_date) } },
          { label: 'Største fall fra en topp', value: round(p.max_drawdown_pct, 2), display: `${pct(p.max_drawdown_pct, 2)} (${kr(drawdownKr)})`, secondary: round(o.max_drawdown_pct, 2), secondary_display: pct(o.max_drawdown_pct, 2) },
        ],
        facts: {
          worst_day_pct: pct(Math.abs(p.worst_day_pct), 2), worst_day_date: dateNb(p.worst_day_date), worst_day_kr: kr(worstKr),
          max_drawdown_pct: pct(Math.abs(p.max_drawdown_pct), 2), max_drawdown_kr: kr(drawdownKr), osebx_max_drawdown_pct: pct(Math.abs(o.max_drawdown_pct), 2),
          period: windowLabel(w),
        },
        provenance: { sources: [SOURCES.holdings, SOURCES.prices, SOURCES.osebx], period: period(w), rows_used: model.positions.length * (w.end - w.start) },
        assumptions: [ASSUMPTIONS.constantHoldings, ASSUMPTIONS.synthetic],
        data_quality: qualityNotes(model, ctx.now, { risk: true, window: w }),
      }
    },
  },
  {
    id: 'weight_drift',
    title: 'Slik har fordelingen glidd',
    question: 'Hvordan har andelen i hver sektor endret seg i valgt periode bare fordi kursene har beveget seg?',
    params: [],
    facts: ['top_sector', 'start_pct', 'end_pct', 'change_pp', 'tech_start_pct', 'tech_end_pct', 'period'],
    compute(ctx) {
      const model = buildModel(ctx.customerId)
      if (model.total === 0) return empty(model, ctx.now)
      const w = win(ctx)
      const startValue = (e: Exposure) => {
        if (!hasPriceHistory(e.ticker)) return e.value
        const prices = pricesFor(e.ticker)
        return prices[w.end] > 0 ? e.value * (prices[w.start] / prices[w.end]) : e.value
      }
      const startTotal = model.exposures.reduce((s, e) => s + startValue(e), 0)
      const sectors = new Map<string, { start: number; end: number }>()
      for (const e of model.exposures) {
        const g = sectors.get(e.sector) ?? { start: 0, end: 0 }
        g.start += (startValue(e) / startTotal) * 100
        g.end += share(e.value, model)
        sectors.set(e.sector, g)
      }
      const rows = [...sectors.entries()]
        .map(([label, g]) => ({ label, ...g, change: g.end - g.start }))
        .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      const top = rows[0]
      const tech = sectors.get('Technology')
      return {
        value: round(top.change),
        display: `${top.change >= 0 ? '+' : '−'}${num(Math.abs(top.change))} prosentpoeng`,
        unit: 'pp',
        period: periodInfo(w),
        value_label: 'Nå',
        secondary_label: `Ved start (${dateNb(w.startDate)})`,
        breakdown: rows.map((r) => ({ label: sectorNb(r.label), value: round(r.end), display: pct(r.end), secondary: round(r.start), secondary_display: pct(r.start), meta: { endring: `${r.change >= 0 ? '+' : '−'}${num(Math.abs(r.change))} prosentpoeng` }, drill: { dimension: 'sector' as const, value: r.label, label: sectorNb(r.label) } })),
        facts: {
          top_sector: sectorNb(top.label), start_pct: pct(top.start), end_pct: pct(top.end), change_pp: `${num(Math.abs(top.change))} prosentpoeng`,
          tech_start_pct: pct(tech?.start ?? 0), tech_end_pct: pct(tech?.end ?? 0), period: windowLabel(w),
        },
        provenance: { sources: [SOURCES.holdings, SOURCES.funds, SOURCES.prices], period: period(w), rows_used: model.exposures.length * 2 },
        assumptions: [ASSUMPTIONS.constantHoldings, 'Viser bare endring fra kursbevegelser. Vi har ikke historikk over kjøp og salg, så den faktiske glidningen kan være annerledes.', ASSUMPTIONS.synthetic],
        data_quality: qualityNotes(model, ctx.now, { lookThrough: true }),
      }
    },
  },
  {
    id: 'what_if_shift',
    title: 'Hva om en del av en sektor var kontanter?',
    question: 'Hvor mye mindre ville porteføljen svinget hvis en del av en sektor i stedet sto i kontanter?',
    params: [
      { name: 'sector', description: 'Sektor på engelsk, som i dataene.', values: ['Technology', 'Financials', 'Healthcare', 'Energy', 'Industrials', 'Consumer Discretionary', 'Consumer Staples', 'Materials', 'Utilities'] },
      { name: 'pp', description: 'Prosentpoeng av porteføljen som flyttes til kontanter (1–100).' },
    ],
    facts: ['sector', 'moved_pp', 'vol_before', 'vol_after', 'kr_before', 'kr_after'],
    compute(ctx, params) {
      const model = buildModel(ctx.customerId)
      if (model.total === 0) return empty(model, ctx.now)
      const sector = String(params.sector ?? '')
      const pp = Number(params.pp)
      if (!sector || !Number.isFinite(pp) || pp <= 0 || pp > 100) throw new MetricError('what_if_shift trenger sector (engelsk sektornavn) og pp (1–100).')
      const w = win(ctx)
      const weights = model.exposures.map((e) => share(e.value, model) / 100)
      const sectorWeight = model.exposures.reduce((s, e, i) => s + (e.sector === sector ? weights[i] : 0), 0)
      if (sectorWeight === 0) throw new MetricError(`Porteføljen har ingen eksponering mot sektoren "${sector}".`)
      const moved = Math.min(sectorWeight, pp / 100)
      const scale = (sectorWeight - moved) / sectorWeight
      const tickers = [...model.exposures.map((e) => e.ticker), 'CASHNOK']
      const before = decomposeRisk(tickers, [...weights, 0], w).volatility * 100
      const after = decomposeRisk(tickers, [...model.exposures.map((e, i) => (e.sector === sector ? weights[i] * scale : weights[i])), moved], w).volatility * 100
      return {
        value: round(after),
        display: `±${pct(before)} → ±${pct(after)}`,
        unit: '%',
        period: periodInfo(w),
        value_label: 'Svingninger i året',
        breakdown: [
          { label: 'Slik porteføljen er nå', value: round(before), display: `±${pct(before)}`, meta: { i_kroner: `±${kr((model.total * before) / 100)}` } },
          { label: `Med ${num(moved * 100)} prosentpoeng mindre ${sectorNb(sector).toLowerCase()}`, value: round(after), display: `±${pct(after)}`, meta: { i_kroner: `±${kr((model.total * after) / 100)}` } },
        ],
        facts: {
          sector: sectorNb(sector), moved_pp: `${num(moved * 100)} prosentpoeng`, vol_before: `±${pct(before)}`, vol_after: `±${pct(after)}`,
          kr_before: `±${kr((model.total * before) / 100)}`, kr_after: `±${kr((model.total * after) / 100)}`,
        },
        provenance: { sources: [SOURCES.holdings, SOURCES.funds, SOURCES.prices], period: period(w), rows_used: model.exposures.length * (w.end - w.start) },
        assumptions: ['Dette er en illustrasjon av hvordan risikoen henger sammen, ikke en anbefaling om å kjøpe eller selge.', 'Kontanter antas å ikke svinge. Skatt, kurtasje og forventet avkastning er ikke med.', ASSUMPTIONS.volatility],
        data_quality: qualityNotes(model, ctx.now, { risk: true, lookThrough: true, window: w }),
      }
    },
  },
  {
    id: 'data_freshness',
    title: 'Hvor ferske og komplette dataene er',
    question: 'Hvor gamle er kursene og fondsbeholdningene, og mangler noe?',
    params: [],
    facts: ['price_end', 'days_since_price', 'holdings_as_of', 'days_since_holdings', 'history_start', 'missing_count', 'osebx_mode', 'osebx_fetched'],
    compute(ctx) {
      const model = buildModel(ctx.customerId)
      const end = DATES[DATES.length - 1] ?? null
      const missing = model.positions.filter((p) => p.asset_type !== 'Cash' && !hasPriceHistory(p.ticker))
      const daysPrice = end ? daysBetween(end, ctx.now) : null
      const daysHoldings = model.fundHoldingsAsOf ? daysBetween(model.fundHoldingsAsOf, ctx.now) : null
      const osebx = osebxSource()
      return {
        value: daysPrice,
        display: end ? `Kurser per ${dateNb(end)}` : 'Ingen kurser',
        unit: 'text',
        breakdown: [
          { label: 'Siste kurs', value: daysPrice ?? 0, display: `${dateNb(end)} (${daysPrice ?? '?'} dager siden)` },
          { label: 'Kurshistorikk fra', value: 0, display: dateNb(DATES[0] ?? null) },
          { label: 'Fondenes beholdninger', value: daysHoldings ?? 0, display: model.fundHoldingsAsOf ? `${dateNb(model.fundHoldingsAsOf)} (${daysHoldings} dager siden)` : 'Du eier ingen fond' },
          { label: 'OSEBX fra Yahoo Finance', value: 0, display: `${osebx.mode === 'live' ? 'Hentet live' : 'Lagret kopi'} ${dateNb(osebx.fetched_at.slice(0, 10))}, siste kurs ${dateNb(osebx.last_date)}` },
          { label: 'Investeringer uten kurshistorikk', value: missing.length, display: missing.length ? missing.map((p) => p.name).join(', ') : 'Ingen' },
        ],
        facts: {
          price_end: dateNb(end), days_since_price: String(daysPrice ?? 'ukjent'), holdings_as_of: dateNb(model.fundHoldingsAsOf),
          days_since_holdings: String(daysHoldings ?? 'ukjent'), history_start: dateNb(DATES[0] ?? null), missing_count: String(missing.length),
          osebx_mode: osebx.mode === 'live' ? 'hentet live' : 'en lagret kopi', osebx_fetched: dateNb(osebx.fetched_at.slice(0, 10)),
        },
        provenance: { sources: [SOURCES.holdings, SOURCES.prices, SOURCES.funds, SOURCES.osebx], period: period(windowFor('ALL')), rows_used: model.positions.length },
        assumptions: [ASSUMPTIONS.synthetic],
        data_quality: qualityNotes(model, ctx.now, { lookThrough: model.positions.some((p) => p.is_fund) }),
      }
    },
  },
]

const METRIC_BY_ID = new Map(METRICS.map((m) => [m.id, m]))

export function listMetrics(): MetricDefinition[] {
  return METRICS.map(({ id, title, question, params, facts }) => ({ id, title, question, params, facts }))
}

export function getMetricDefinition(id: string): MetricDefinition | undefined {
  return METRIC_BY_ID.get(id)
}

export function computeMetric(ctx: MetricContext, id: string, params: Params = {}): MetricResult {
  const metric = METRIC_BY_ID.get(id)
  if (!metric) throw new MetricError(`Ukjent metrikk "${id}".`)
  return { id, title: metric.title, question: metric.question, ...metric.compute(ctx, params) }
}
