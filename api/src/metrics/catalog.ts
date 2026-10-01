// The metric catalog: the ONLY source of numbers for reports and the AI.
// Every metric is deterministic and returns its value together with the data,
// assumptions and data-quality notes behind it.
import { getCustomer } from '../data.js'
import type { BreakdownRow, DataQualityNote, MetricDefinition, MetricResult, StressScenario } from '../reports/types.js'
import {
  DATES,
  buildModel,
  decomposeRisk,
  exposureRisk,
  hasPriceHistory,
  positionRisk,
  priceOn,
  type Exposure,
  type PortfolioModel,
} from './engine.js'
import { PROFILE_NB, assetTypeNb, dateNb, daysBetween, geographyNb, kr, num, pct, round, sectorNb } from './format.js'

export class MetricError extends Error {}

export interface MetricContext {
  customerId: string
  customScenarios: StressScenario[]
  now: Date
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
  prices: 'market_data.json – daglige kurser',
  funds: 'fund_holdings.json – hva fondene eier',
  profile: 'customers.json – risikoprofilen din',
}

const ASSUMPTIONS = {
  volatility: 'Svingningene er beregnet fra daglige kursendringer de siste 90 dagene og omregnet til ett år (252 handelsdager).',
  covariance: 'Risikobidraget tar hensyn til at investeringer ofte beveger seg sammen, ikke bare hvor mye hver enkelt svinger.',
  constantHoldings: 'Beregningen antar at du har eid de samme investeringene hele perioden. Kjøp og salg er ikke med.',
  lookThrough: 'Fondene er brutt ned i det de faktisk eier, basert på siste rapporterte beholdning fra fondene.',
  bands: 'Intervallene per risikoprofil er illustrative og ikke en ekte egnethetsvurdering.',
  scenario: 'Stresstester er hypotetiske «hva om»-regnestykker, ikke prognoser.',
}

function period() {
  return `${dateNb(DATES[0] ?? null)} – ${dateNb(DATES[DATES.length - 1] ?? null)}`
}

function qualityNotes(model: PortfolioModel, now: Date, kinds: { risk?: boolean; lookThrough?: boolean }): DataQualityNote[] {
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
    notes.push({ severity: 'notice', message: `Beregningen bygger på bare ${DATES.length} dager med kurser. Det er for kort til å si sikkert hvordan porteføljen oppfører seg i et krakk.` })
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
        breakdown: model.positions.map((p) => ({ label: p.name, value: round(share(p.value, model)), display: pct(share(p.value, model)), meta: { ticker: p.ticker, verdi: kr(p.value), type: assetTypeNb(p.asset_type) } })),
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
    facts: ['pct', 'kr'],
    compute(ctx) {
      const model = buildModel(ctx.customerId)
      if (model.total === 0) return empty(model, ctx.now)
      const vol = exposureRisk(model).volatility * 100
      return {
        value: round(vol),
        display: `±${pct(vol)}`,
        unit: '%',
        facts: { pct: `±${pct(vol)}`, kr: `±${kr((model.total * vol) / 100)}` },
        provenance: { sources: [SOURCES.holdings, SOURCES.prices, SOURCES.funds], period: period(), rows_used: model.exposures.length * DATES.length },
        assumptions: [ASSUMPTIONS.volatility, ASSUMPTIONS.covariance, 'I omtrent to av tre år vil verdien endre seg mindre enn dette. I dårlige år kan fallet bli større.', ASSUMPTIONS.constantHoldings],
        data_quality: qualityNotes(model, ctx.now, { risk: true, lookThrough: true }),
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
      const risk = positionRisk(model)
      const rows: BreakdownRow[] = model.positions
        .map((p, i) => ({
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
        provenance: { sources: [SOURCES.holdings, SOURCES.prices], period: period(), rows_used: model.positions.length * DATES.length },
        assumptions: [ASSUMPTIONS.volatility, ASSUMPTIONS.covariance, 'Bidragene summerer til 100 % av svingningene.', ASSUMPTIONS.constantHoldings],
        data_quality: qualityNotes(model, ctx.now, { risk: true }),
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
      const risk = exposureRisk(model)
      const rows = model.exposures
        .map((e, i) => ({
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
        provenance: { sources: [SOURCES.holdings, SOURCES.funds, SOURCES.prices], period: period(), as_of: model.fundHoldingsAsOf ?? undefined, rows_used: rows.length * DATES.length },
        assumptions: [ASSUMPTIONS.lookThrough, ASSUMPTIONS.volatility, ASSUMPTIONS.covariance, ASSUMPTIONS.constantHoldings],
        data_quality: qualityNotes(model, ctx.now, { risk: true, lookThrough: true }),
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
      const risk = exposureRisk(model)
      const groups = groupExposures(model, (e) => e.sector, risk.contributions).sort((a, b) => b.risk - a.risk)
      const tech = groups.find((g) => g.label === 'Technology')
      const top = groups[0]
      return {
        value: round(top.risk),
        display: sectorNb(top.label),
        unit: 'text',
        value_label: 'Andel av verdien',
        secondary_label: 'Andel av svingningene',
        breakdown: groups.map((g) => ({ label: sectorNb(g.label), value: round(g.weight), display: pct(g.weight), secondary: round(g.risk), secondary_display: pct(g.risk), meta: { verdi: kr(g.value) } })),
        facts: {
          top_sector: sectorNb(top.label), top_sector_weight: pct(top.weight), top_sector_risk: pct(top.risk),
          tech_weight: pct(tech?.weight ?? 0), tech_risk: pct(tech?.risk ?? 0),
        },
        provenance: { sources: [SOURCES.holdings, SOURCES.funds, SOURCES.prices], period: period(), as_of: model.fundHoldingsAsOf ?? undefined, rows_used: model.exposures.length * DATES.length },
        assumptions: [ASSUMPTIONS.lookThrough, ASSUMPTIONS.volatility, ASSUMPTIONS.covariance, ASSUMPTIONS.constantHoldings],
        data_quality: qualityNotes(model, ctx.now, { risk: true, lookThrough: true }),
      }
    },
  },
  {
    id: 'profile_fit',
    title: 'Passer svingningene med risikoprofilen din?',
    question: 'Svinger porteføljen mer eller mindre enn det som er vanlig for risikoprofilen din?',
    params: [],
    facts: ['vol', 'profile', 'range', 'status_text', 'horizon'],
    compute(ctx) {
      const model = buildModel(ctx.customerId)
      if (model.total === 0) return empty(model, ctx.now)
      const customer = getCustomer(ctx.customerId)
      const band = customer ? PROFILE_BANDS[customer.risk_profile] : undefined
      const vol = exposureRisk(model).volatility * 100
      const profile = customer ? (PROFILE_NB[customer.risk_profile] ?? customer.risk_profile) : 'Ukjent'
      const status: MetricResult['status'] = !band ? 'unknown' : vol > band.max ? 'above' : vol < band.min ? 'below' : 'within'
      const statusText = {
        above: `Porteføljen svinger mer enn det som er vanlig for en ${profile.toLowerCase()} profil.`,
        below: `Porteføljen svinger mindre enn det som er vanlig for en ${profile.toLowerCase()} profil.`,
        within: `Porteføljen svinger omtrent som forventet for en ${profile.toLowerCase()} profil.`,
        unknown: 'Vi kjenner ikke risikoprofilen din, så vi kan ikke sammenligne.',
      }[status]
      const notes = qualityNotes(model, ctx.now, { risk: true, lookThrough: true })
      if (!band) notes.unshift({ severity: 'warning', message: 'Vi har ingen registrert risikoprofil for deg.' })
      return {
        value: round(vol),
        display: `±${pct(vol)} i året`,
        unit: '%',
        status,
        breakdown: band ? [
          { label: 'Porteføljen din', value: round(vol), display: `±${pct(vol)}` },
          { label: `Vanlig for ${profile.toLowerCase()} profil`, value: band.max, display: `${num(band.min)}–${num(band.max)} %`, meta: { fra: band.min, til: band.max } },
        ] : [],
        facts: { vol: `±${pct(vol)}`, profile: profile.toLowerCase(), range: band ? `${num(band.min)}–${num(band.max)} %` : 'ukjent', status_text: statusText, horizon: customer?.investment_horizon.replace('years', 'år') ?? 'ukjent' },
        provenance: { sources: [SOURCES.profile, SOURCES.holdings, SOURCES.funds, SOURCES.prices], period: period(), rows_used: model.exposures.length * DATES.length + 1 },
        assumptions: [ASSUMPTIONS.bands, ASSUMPTIONS.volatility, ASSUMPTIONS.covariance],
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
        breakdown: groups.map((g) => ({ label: assetTypeNb(g.label), value: round(g.weight), display: pct(g.weight), meta: { verdi: kr(g.value) } })),
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
          .map(([via, g]) => ({ label: g.name, value: round(share(g.value, model)), display: pct(share(g.value, model)), meta: { ticker: via === 'direct' ? '' : via, verdi: kr(g.value) } }))
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
        .map((e) => ({ label: e.name, value: round(share(e.value, model)), display: pct(share(e.value, model)), meta: { ticker: e.ticker, eies_via: pathsText(e, model), antall_steder: e.paths.length } }))
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
        breakdown: groups.map((g) => ({ label: geographyNb(g.label), value: round(g.weight), display: pct(g.weight), meta: { verdi: kr(g.value) } })),
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
        breakdown: invested.slice(0, 10).map((e) => ({ label: e.name, value: round(share(e.value, model)), display: pct(share(e.value, model)), meta: { sektor: sectorNb(e.sector), eies_via: pathsText(e, model) } })),
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
        .map((p) => ({ name: p.name, loss: lossByPosition.get(p.ticker) ?? 0 }))
        .filter((r) => r.loss < 0)
        .sort((a, b) => a.loss - b.loss)
        .map((r) => ({ label: r.name, value: Math.round(r.loss), display: `−${kr(-r.loss)}`, meta: { andel_av_tapet: pct(loss < 0 ? (r.loss / loss) * 100 : 0) } }))
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
    id: 'historical_drawdown',
    title: 'Det verste som skjedde i perioden',
    question: 'Hva var den verste dagen og det største fallet fra en topp de siste 90 dagene?',
    params: [],
    facts: ['worst_day_pct', 'worst_day_date', 'worst_day_kr', 'max_drawdown_pct', 'max_drawdown_kr'],
    compute(ctx) {
      const model = buildModel(ctx.customerId)
      if (model.total === 0) return empty(model, ctx.now)
      const series = DATES.map((d) => model.positions.reduce((s, p) => s + p.quantity * (priceOn(p.ticker, d) ?? p.price), 0))
      let worst = 0
      let worstIdx = -1
      let peak = series[0] ?? 0
      let drawdown = 0
      let drawdownKr = 0
      series.forEach((v, i) => {
        if (i > 0 && series[i - 1] > 0) {
          const r = (v / series[i - 1] - 1) * 100
          if (r < worst) {
            worst = r
            worstIdx = i
          }
        }
        peak = Math.max(peak, v)
        if (peak > 0 && (v / peak - 1) * 100 < drawdown) {
          drawdown = (v / peak - 1) * 100
          drawdownKr = peak - v
        }
      })
      const worstKr = worstIdx > 0 ? series[worstIdx - 1] - series[worstIdx] : 0
      return {
        value: round(drawdown, 2),
        display: pct(drawdown),
        unit: '%',
        breakdown: [
          { label: 'Verste enkeltdag', value: round(worst, 2), display: `${pct(worst, 2)} (${kr(worstKr)})`, meta: { dato: dateNb(DATES[worstIdx] ?? null) } },
          { label: 'Største fall fra en topp', value: round(drawdown, 2), display: `${pct(drawdown, 2)} (${kr(drawdownKr)})` },
        ],
        facts: {
          worst_day_pct: pct(Math.abs(worst), 2), worst_day_date: dateNb(DATES[worstIdx] ?? null), worst_day_kr: kr(worstKr),
          max_drawdown_pct: pct(Math.abs(drawdown), 2), max_drawdown_kr: kr(drawdownKr),
        },
        provenance: { sources: [SOURCES.holdings, SOURCES.prices], period: period(), rows_used: model.positions.length * DATES.length },
        assumptions: [ASSUMPTIONS.constantHoldings, 'Bare 90 dager er med, så et ordentlig krakk kan gi langt større fall.'],
        data_quality: qualityNotes(model, ctx.now, { risk: true }),
      }
    },
  },
  {
    id: 'weight_drift',
    title: 'Slik har fordelingen glidd',
    question: 'Hvordan har andelen i hver sektor endret seg bare fordi kursene har beveget seg?',
    params: [],
    facts: ['top_sector', 'start_pct', 'end_pct', 'change_pp', 'tech_start_pct', 'tech_end_pct'],
    compute(ctx) {
      const model = buildModel(ctx.customerId)
      if (model.total === 0) return empty(model, ctx.now)
      const start = DATES[0]
      const end = DATES[DATES.length - 1]
      const startValue = (e: Exposure) => {
        const ps = priceOn(e.ticker, start)
        const pe = priceOn(e.ticker, end)
        return ps && pe ? e.value * (ps / pe) : e.value
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
        value_label: 'Nå',
        secondary_label: 'For 90 dager siden',
        breakdown: rows.map((r) => ({ label: sectorNb(r.label), value: round(r.end), display: pct(r.end), secondary: round(r.start), secondary_display: pct(r.start), meta: { endring: `${r.change >= 0 ? '+' : '−'}${num(Math.abs(r.change))} prosentpoeng` } })),
        facts: {
          top_sector: sectorNb(top.label), start_pct: pct(top.start), end_pct: pct(top.end), change_pp: `${num(Math.abs(top.change))} prosentpoeng`,
          tech_start_pct: pct(tech?.start ?? 0), tech_end_pct: pct(tech?.end ?? 0),
        },
        provenance: { sources: [SOURCES.holdings, SOURCES.funds, SOURCES.prices], period: period(), rows_used: model.exposures.length * 2 },
        assumptions: [ASSUMPTIONS.constantHoldings, 'Viser bare endring fra kursbevegelser. Vi har ikke historikk over kjøp og salg, så glidningen over flere år kan være større.'],
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
      const weights = model.exposures.map((e) => share(e.value, model) / 100)
      const sectorWeight = model.exposures.reduce((s, e, i) => s + (e.sector === sector ? weights[i] : 0), 0)
      if (sectorWeight === 0) throw new MetricError(`Porteføljen har ingen eksponering mot sektoren "${sector}".`)
      const moved = Math.min(sectorWeight, pp / 100)
      const scale = (sectorWeight - moved) / sectorWeight
      const tickers = [...model.exposures.map((e) => e.ticker), 'CASHNOK']
      const before = decomposeRisk(tickers, [...weights, 0]).volatility * 100
      const after = decomposeRisk(tickers, [...model.exposures.map((e, i) => (e.sector === sector ? weights[i] * scale : weights[i])), moved]).volatility * 100
      return {
        value: round(after),
        display: `±${pct(before)} → ±${pct(after)}`,
        unit: '%',
        value_label: 'Svingninger i året',
        breakdown: [
          { label: 'Slik porteføljen er nå', value: round(before), display: `±${pct(before)}`, meta: { i_kroner: `±${kr((model.total * before) / 100)}` } },
          { label: `Med ${num(moved * 100)} prosentpoeng mindre ${sectorNb(sector).toLowerCase()}`, value: round(after), display: `±${pct(after)}`, meta: { i_kroner: `±${kr((model.total * after) / 100)}` } },
        ],
        facts: {
          sector: sectorNb(sector), moved_pp: `${num(moved * 100)} prosentpoeng`, vol_before: `±${pct(before)}`, vol_after: `±${pct(after)}`,
          kr_before: `±${kr((model.total * before) / 100)}`, kr_after: `±${kr((model.total * after) / 100)}`,
        },
        provenance: { sources: [SOURCES.holdings, SOURCES.funds, SOURCES.prices], period: period(), rows_used: model.exposures.length * DATES.length },
        assumptions: ['Dette er en illustrasjon av hvordan risikoen henger sammen, ikke en anbefaling om å kjøpe eller selge.', 'Kontanter antas å ikke svinge. Skatt, kurtasje og forventet avkastning er ikke med.', ASSUMPTIONS.volatility],
        data_quality: qualityNotes(model, ctx.now, { risk: true, lookThrough: true }),
      }
    },
  },
  {
    id: 'data_freshness',
    title: 'Hvor ferske og komplette dataene er',
    question: 'Hvor gamle er kursene og fondsbeholdningene, og mangler noe?',
    params: [],
    facts: ['price_end', 'days_since_price', 'holdings_as_of', 'days_since_holdings', 'trading_days', 'missing_count'],
    compute(ctx) {
      const model = buildModel(ctx.customerId)
      const end = DATES[DATES.length - 1] ?? null
      const missing = model.positions.filter((p) => p.asset_type !== 'Cash' && !hasPriceHistory(p.ticker))
      const daysPrice = end ? daysBetween(end, ctx.now) : null
      const daysHoldings = model.fundHoldingsAsOf ? daysBetween(model.fundHoldingsAsOf, ctx.now) : null
      return {
        value: daysPrice,
        display: end ? `Kurser per ${dateNb(end)}` : 'Ingen kurser',
        unit: 'text',
        breakdown: [
          { label: 'Siste kurs', value: daysPrice ?? 0, display: `${dateNb(end)} (${daysPrice ?? '?'} dager siden)` },
          { label: 'Fondenes beholdninger', value: daysHoldings ?? 0, display: model.fundHoldingsAsOf ? `${dateNb(model.fundHoldingsAsOf)} (${daysHoldings} dager siden)` : 'Du eier ingen fond' },
          { label: 'Dager med kurshistorikk', value: DATES.length, display: `${DATES.length} dager` },
          { label: 'Investeringer uten kurshistorikk', value: missing.length, display: missing.length ? missing.map((p) => p.name).join(', ') : 'Ingen' },
        ],
        facts: {
          price_end: dateNb(end), days_since_price: String(daysPrice ?? 'ukjent'), holdings_as_of: dateNb(model.fundHoldingsAsOf),
          days_since_holdings: String(daysHoldings ?? 'ukjent'), trading_days: String(DATES.length), missing_count: String(missing.length),
        },
        provenance: { sources: [SOURCES.holdings, SOURCES.prices, SOURCES.funds], period: period(), rows_used: model.positions.length },
        assumptions: [],
        data_quality: qualityNotes(model, ctx.now, { risk: true, lookThrough: model.positions.some((p) => p.is_fund) }),
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
