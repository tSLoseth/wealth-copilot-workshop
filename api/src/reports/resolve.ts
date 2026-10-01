// Turns a ReportSpec into a ResolvedReport. All numbers come from the metric
// catalog; free text may only contain numbers through {{metric.fact}}
// placeholders, which is what makes AI-written reports grounded.
import { DATES, buildModel } from '../metrics/engine.js'
import { assetTypeNb, num, sectorNb } from '../metrics/format.js'
import { MetricError, computeMetric, getMetricDefinition, type MetricContext } from '../metrics/catalog.js'
import type { BlockType, DataQualityNote, MetricResult, ReportSpec, ResolvedBlock, ResolvedReport, StressScenario } from './types.js'

const PLACEHOLDER = /\{\{\s*([a-z_]+)(?:\(([^)]*)\))?\.([a-z0-9_]+)\s*\}\}/g
const BLOCK_TYPES: BlockType[] = ['kpi', 'bar', 'table', 'scenario', 'status', 'text']
const STATUS_METRICS = new Set(['profile_fit', 'equity_share'])

export const DISCLAIMER = 'Pedagogisk demomodell basert på syntetiske data. Ikke investeringsråd og ikke en ekte egnethetsvurdering.'

function parseParams(raw: string | undefined): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  if (!raw) return params
  for (const pair of raw.split(',')) {
    const [key, value] = pair.split('=').map((s) => s.trim())
    if (!key || value === undefined) continue
    params[key] = value !== '' && Number.isFinite(Number(value)) ? Number(value) : value
  }
  return params
}

function stripPlaceholders(text: string) {
  return text.replace(PLACEHOLDER, '')
}

export function validateSpec(spec: ReportSpec, ctx: MetricContext): string[] {
  const errors: string[] = []
  if (!spec || typeof spec !== 'object') return ['Rapporten mangler.']
  if (!spec.title?.trim()) errors.push('Rapporten mangler tittel.')
  if (!Array.isArray(spec.blocks) || spec.blocks.length === 0) errors.push('Rapporten må ha minst én blokk.')
  if ((spec.blocks?.length ?? 0) > 12) errors.push('Rapporten kan ha maks 12 blokker.')

  const checkText = (where: string, text: string | undefined) => {
    if (!text) return
    if (/\d/.test(stripPlaceholders(text))) {
      errors.push(`${where}: inneholder tall skrevet direkte. Alle tall må komme fra plassholdere som {{metric_id.fact}}.`)
    }
    for (const match of text.matchAll(PLACEHOLDER)) {
      const [whole, metricId, rawParams, fact] = match
      const def = getMetricDefinition(metricId)
      if (!def) {
        errors.push(`${where}: ${whole} viser til ukjent metrikk "${metricId}".`)
        continue
      }
      if (!def.facts.includes(fact)) {
        errors.push(`${where}: ${whole} – metrikken "${metricId}" har ikke fact "${fact}". Gyldige: ${def.facts.join(', ')}.`)
        continue
      }
      try {
        computeMetric(ctx, metricId, parseParams(rawParams))
      } catch (err) {
        errors.push(`${where}: ${whole} – ${err instanceof Error ? err.message : 'ugyldige parametere'}`)
      }
    }
    const leftovers = stripPlaceholders(text).match(/\{\{[^}]*\}\}/g)
    if (leftovers) errors.push(`${where}: ugyldig plassholder-syntaks ${leftovers.join(', ')}. Bruk {{metric_id.fact}} eller {{metric_id(param=verdi).fact}}.`)
  }

  checkText('Tittel', spec.title)
  checkText('Intro', spec.intro)
  spec.blocks?.forEach((block, i) => {
    const where = `Blokk ${i + 1}`
    if (!BLOCK_TYPES.includes(block.type)) {
      errors.push(`${where}: ukjent type "${block.type}".`)
      return
    }
    checkText(`${where} (caption)`, block.caption)
    if (block.type === 'text') {
      if (!block.text?.trim()) errors.push(`${where}: tekstblokk uten tekst.`)
      checkText(where, block.text)
      return
    }
    if (!block.metric) {
      errors.push(`${where}: mangler metric.`)
      return
    }
    if (block.type === 'scenario' && block.metric !== 'stress_test') errors.push(`${where}: scenario-blokker må bruke stress_test.`)
    if (block.type === 'status' && !STATUS_METRICS.has(block.metric)) errors.push(`${where}: status-blokker kan bare bruke ${[...STATUS_METRICS].join(' eller ')}.`)
    try {
      const result = computeMetric(ctx, block.metric, block.params ?? {})
      if ((block.type === 'bar' || block.type === 'table') && !result.breakdown?.length) {
        errors.push(`${where}: metrikken "${block.metric}" har ingen fordeling å vise som ${block.type}. Bruk kpi.`)
      }
    } catch (err) {
      errors.push(`${where}: ${err instanceof MetricError ? err.message : 'kunne ikke beregnes'}`)
    }
  })
  return errors
}

export function fillPlaceholders(text: string, ctx: MetricContext, used?: Set<string>): string {
  return text.replace(PLACEHOLDER, (_whole, metricId: string, rawParams: string | undefined, fact: string) => {
    try {
      const result = computeMetric(ctx, metricId, parseParams(rawParams))
      used?.add(metricId)
      return result.facts[fact] ?? '–'
    } catch {
      return '–'
    }
  })
}

export function resolveReport(spec: ReportSpec, customerId: string, source: ResolvedReport['source'], now = new Date()): ResolvedReport {
  const ctx: MetricContext = { customerId, customScenarios: spec.custom_scenarios ?? [], now }
  const metrics: MetricResult[] = []
  const hasInvestments = buildModel(customerId).total > 0
  const specBlocks = hasInvestments ? spec.blocks : spec.blocks.filter((b) => b.metric === 'data_freshness')
  const blocks: ResolvedBlock[] = specBlocks.map((block) => {
    const caption = block.caption ? fillPlaceholders(block.caption, ctx) : undefined
    if (block.type === 'text') return { type: 'text', caption, text: fillPlaceholders(block.text ?? '', ctx) }
    const metric = computeMetric(ctx, block.metric!, block.params ?? {})
    metrics.push(metric)
    return { type: block.type, caption, metric }
  })

  const notes = new Map<string, DataQualityNote>()
  for (const m of metrics) for (const n of m.data_quality) notes.set(n.message, n)
  const order = { warning: 0, notice: 1, info: 2 }
  const assumptions = [...new Set(metrics.flatMap((m) => m.assumptions))]
  const sources = [...new Set(metrics.flatMap((m) => m.provenance.sources))]

  return {
    id: spec.id,
    title: fillPlaceholders(spec.title, ctx),
    intro: hasInvestments ? fillPlaceholders(spec.intro ?? '', ctx) : 'Du har ingen investeringer ennå, så det er ingen investeringsrisiko å vise. Når du har investert, ser du her hvor risikoen kommer fra.',
    source,
    blocks,
    data_basis: {
      sources,
      price_history_start: DATES[0] ?? null,
      price_history_end: DATES[DATES.length - 1] ?? null,
      fund_holdings_as_of: buildModel(customerId).fundHoldingsAsOf,
      notes: [...notes.values()].sort((a, b) => order[a.severity] - order[b.severity]),
    },
    assumptions,
    disclaimer: DISCLAIMER,
    generated_at: now.toISOString(),
  }
}

export function sanitizeScenarios(raw: unknown): StressScenario[] {
  if (!Array.isArray(raw)) return []
  const clamp = (record: unknown) => {
    if (!record || typeof record !== 'object') return undefined
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(record)) {
      const n = Number(v)
      if (Number.isFinite(n)) out[k] = Math.max(-100, Math.min(100, n))
    }
    return out
  }
  return raw.slice(0, 5).flatMap((s) => {
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || typeof s.name !== 'string') return []
    const scenario = { id: s.id, name: s.name, description: '', sector_shocks: clamp(s.sector_shocks), asset_type_shocks: clamp(s.asset_type_shocks) }
    return [{ ...scenario, description: describeScenario(scenario) }]
  })
}

// Custom scenario descriptions are generated from the shocks themselves, so
// the text can never disagree with the numbers that were applied.
function describeScenario(s: StressScenario): string {
  const part = (label: string, v: number) => `${label} ${v >= 0 ? '+' : '−'}${num(Math.abs(v))} %`
  const parts = [
    ...Object.entries(s.sector_shocks ?? {}).map(([k, v]) => part(sectorNb(k), v)),
    ...Object.entries(s.asset_type_shocks ?? {}).filter(([k]) => k !== 'Cash').map(([k, v]) => part(`${assetTypeNb(k)}${s.sector_shocks && Object.keys(s.sector_shocks).length ? ' ellers' : ''}`, v)),
  ]
  return `Hypotetisk scenario: ${parts.join(', ') || 'ingen endring'}.`
}
