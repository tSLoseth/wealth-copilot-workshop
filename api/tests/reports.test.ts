import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { fundHoldings, getInvestmentsFor } from '../src/data.js'
import { computeMetric } from '../src/metrics/catalog.js'
import { STANDARD_REPORTS } from '../src/reports/standard.js'
import { resolveReport, sanitizeScenarios, validateSpec } from '../src/reports/resolve.js'
import type { ReportSpec } from '../src/reports/types.js'

const JONAS = 'CUST-00101'
const ctx = { customerId: JONAS, customScenarios: [], now: new Date('2026-09-10T00:00:00Z') }
const sum = (values: number[]) => values.reduce((s, v) => s + v, 0)

beforeAll(() => {
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.DATABASE_URL
  process.env.ADMIN_TOKEN = 'test-token'
})

describe('look-through data', () => {
  it('every fund sums to 100 %', () => {
    const byFund = new Map<string, number>()
    for (const row of fundHoldings) byFund.set(row.fund_ticker, (byFund.get(row.fund_ticker) ?? 0) + row.weight_pct)
    for (const total of byFund.values()) expect(total).toBeCloseTo(100, 1)
  })

  it('Jonas exists with a technology-heavy portfolio', () => {
    expect(getInvestmentsFor(JONAS).length).toBeGreaterThan(5)
  })
})

describe('metrics', () => {
  it('risk contributions sum to 100 %', () => {
    for (const id of ['risk_by_holding', 'risk_by_sector']) {
      const result = computeMetric(ctx, id)
      expect(sum(result.breakdown!.map((b) => b.secondary ?? 0))).toBeCloseTo(100, 0)
    }
  })

  it('look-through reveals more technology than the labels show', () => {
    const tech = computeMetric(ctx, 'tech_exposure')
    const total = Number(tech.value)
    expect(total).toBeGreaterThan(parseFloat(tech.facts.labelled_pct.replace(',', '.')))
    expect(total).toBeGreaterThan(parseFloat(tech.facts.direct_pct.replace(',', '.')))
  })

  it('flags a moderate profile that swings too much', () => {
    expect(computeMetric(ctx, 'profile_fit').status).toBe('above')
  })

  it('a technology correction hurts more than the direct tech holdings alone', () => {
    const stress = computeMetric(ctx, 'stress_test', { scenario: 'tech-correction' })
    expect(stress.value).toBeLessThan(0)
    expect(stress.breakdown!.some((b) => b.label.includes('Global Equity'))).toBe(true)
  })

  it('rejects unknown scenarios', () => {
    expect(() => computeMetric(ctx, 'stress_test', { scenario: 'nope' })).toThrow()
  })
})

describe('grounding validation', () => {
  const base: ReportSpec = { id: 't', title: 'Test', intro: 'Du har {{tech_exposure.total_pct}} i teknologi.', blocks: [{ type: 'kpi', metric: 'tech_exposure' }] }

  it('accepts placeholders', () => {
    expect(validateSpec(base, ctx)).toEqual([])
  })

  it('rejects numbers written directly in text', () => {
    expect(validateSpec({ ...base, intro: 'Du har 64 % i teknologi.' }, ctx).join()).toMatch(/tall skrevet direkte/)
  })

  it('rejects unknown facts and metrics', () => {
    expect(validateSpec({ ...base, intro: '{{tech_exposure.nope}}' }, ctx).length).toBe(1)
    expect(validateSpec({ ...base, blocks: [{ type: 'kpi', metric: 'nope' }] }, ctx).length).toBe(1)
  })

  it('custom scenario descriptions are generated from the shocks', () => {
    const [scenario] = sanitizeScenarios([{ id: 'x', name: 'Fall', description: 'faller 99 %', sector_shocks: { Technology: -40 } }])
    expect(scenario.description).toContain('40')
    expect(scenario.description).not.toContain('99')
  })

  it('all standard reports are valid and resolve', () => {
    for (const spec of STANDARD_REPORTS) {
      expect(validateSpec(spec, ctx)).toEqual([])
      const report = resolveReport(spec, JONAS, 'standard', ctx.now)
      expect(report.intro).not.toContain('{{')
      expect(report.intro).not.toContain('–.')
    }
  })

  it('handles a customer without investments', () => {
    const report = resolveReport(STANDARD_REPORTS[0], 'CUST-00006', 'standard')
    expect(report.intro).toMatch(/ingen investeringer/)
  })
})

describe('report endpoints', () => {
  const app = createApp()

  it('lists standard reports and the metric catalog', async () => {
    expect((await request(app).get(`/customers/${JONAS}/reports`)).body.reports).toHaveLength(5)
    expect((await request(app).get('/metrics')).body.metrics.length).toBeGreaterThan(10)
  })

  it('returns fund look-through', async () => {
    const res = await request(app).get('/instruments/TECHF/holdings')
    expect(res.status).toBe(200)
    expect(res.body.holdings.length).toBeGreaterThan(5)
  })

  it('rejects an ungrounded saved spec', async () => {
    const res = await request(app).post(`/customers/${JONAS}/reports/resolve`).send({ spec: { id: 'x', title: 'T', intro: 'Du tapte 500 kr', blocks: [{ type: 'kpi', metric: 'total_value' }] } })
    expect(res.status).toBe(400)
  })

  it('falls back to a standard report without an API key and logs the question', async () => {
    const res = await request(app).post(`/customers/${JONAS}/reports/ai`).send({ prompt: 'Bør jeg selge teknologifondet mitt?' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('fallback')
    expect(res.body.flags).toContain('ønsker_råd')
    expect(res.body.report.blocks.length).toBeGreaterThan(0)

    const activity = await request(app).get('/admin/customers/activity').set('x-admin-token', 'test-token')
    expect(activity.body.customers[0].customer_id).toBe(JONAS)
    const list = await request(app).get(`/admin/interactions?customerId=${JONAS}`).set('x-admin-token', 'test-token')
    const id = list.body.interactions[0].id
    const patched = await request(app).patch(`/admin/interactions/${id}`).set('x-admin-token', 'test-token').send({ reviewed: true, advisor_note: 'Ring Jonas' })
    expect(patched.body.reviewed_at).not.toBeNull()
    expect(patched.body.advisor_note).toBe('Ring Jonas')
  })

  it('protects admin endpoints', async () => {
    expect((await request(app).get('/admin/customers/activity')).status).toBe(401)
    expect((await request(app).get('/admin/customers/activity').set('x-admin-token', 'wrong')).status).toBe(401)
  })
})

describe('time ranges, benchmark and drill-down', () => {
  const app = createApp()

  it('risk metrics follow the selected range and carry an OSEBX comparison', () => {
    const short = computeMetric({ ...ctx, range: '1M' }, 'annual_volatility')
    const long = computeMetric({ ...ctx, range: '5Y' }, 'annual_volatility')
    expect(short.period?.range).toBe('1M')
    expect(long.period?.range).toBe('5Y')
    expect(long.benchmark?.label).toBe('OSEBX')
  })

  it('replays a real market episode', () => {
    const episode = computeMetric(ctx, 'historical_episode', { episode: 'tech-2022' })
    expect(episode.value).toBeLessThan(0)
    expect(episode.benchmark).toBeDefined()
  })

  it('group metrics expose drill targets', () => {
    const geo = computeMetric(ctx, 'geography_exposure')
    expect(geo.breakdown!.every((b) => b.drill?.dimension === 'geography')).toBe(true)
  })

  it('serves history with OSEBX on the same dates', async () => {
    const res = await request(app).get(`/customers/${JONAS}/history?range=3Y&benchmark=OSEBX`)
    expect(res.status).toBe(200)
    expect(res.body.portfolio.points[0].index).toBe(100)
    expect(res.body.benchmark.points[0].date).toBe(res.body.portfolio.points[0].date)
    expect(res.body.portfolio.points.length).toBeLessThanOrEqual(400)
  })

  it('serves look-through exposures whose weights sum to 100 %', async () => {
    const res = await request(app).get(`/customers/${JONAS}/exposures?range=1Y`)
    expect(sum(res.body.exposures.map((e: { weight_pct: number }) => e.weight_pct))).toBeCloseTo(100, 0)
    expect(sum(res.body.exposures.map((e: { risk_contribution_pct: number }) => e.risk_contribution_pct))).toBeCloseTo(100, 0)
  })

  it('serves instrument history with the funds that hold it', async () => {
    const res = await request(app).get('/instruments/USTK/history?range=1Y&benchmark=OSEBX')
    expect(res.status).toBe(200)
    expect(res.body.held_by_funds.map((f: { fund_ticker: string }) => f.fund_ticker)).toContain('TECHF')
    expect((await request(app).get('/instruments/NOPE/history')).status).toBe(404)
  })

  it('logs report views and copilot questions for the advisor', async () => {
    await request(app).get(`/customers/${JONAS}/reports/mot-borsen?range=5Y`)
    await request(app).post(`/customers/${JONAS}/copilot`).send({ message: 'Am I diversified?' })
    const res = await request(app).get(`/admin/events?customerId=${JONAS}`).set('x-admin-token', 'test-token')
    const types = res.body.events.map((e: { event_type: string }) => e.event_type)
    expect(types).toContain('report_view')
    expect(types).toContain('copilot_chat')
  })
})

describe('risk page endpoints', () => {
  const app = createApp()

  it('serves a single metric with params and rejects bad params', async () => {
    const ok = await request(app).get(`/customers/${JONAS}/metrics/what_if_shift?sector=Technology&pp=15&range=3Y`)
    expect(ok.status).toBe(200)
    expect(ok.body.period.range).toBe('3Y')
    expect((await request(app).get(`/customers/${JONAS}/metrics/stress_test?scenario=nope`)).status).toBe(400)
  })

  it('ranks risk insights with the profile mismatch first for Jonas', async () => {
    const res = await request(app).get(`/customers/${JONAS}/risk-insights?range=1Y`)
    expect(res.body.insights[0].id).toBe('profile-above')
    expect(res.body.insights.every((i: { detail: string }) => !i.detail.includes('undefined'))).toBe(true)
  })
})
