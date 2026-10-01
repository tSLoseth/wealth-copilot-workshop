import { Router, type NextFunction, type Request, type Response } from 'express'
import { getCustomer, getFundHoldings } from '../data.js'
import { listMetrics } from '../metrics/catalog.js'
import { AI_MODEL, generateAiReport } from '../reports/ai.js'
import { resolveReport, sanitizeScenarios, validateSpec } from '../reports/resolve.js'
import { getStandardReport, listStandardReports } from '../reports/standard.js'
import type { AiReportResponse, ReportSpec } from '../reports/types.js'
import { customerActivity, listInteractions, logInteraction, updateInteraction } from '../services/interactionLog.js'

export const reportsRouter = Router()

reportsRouter.get('/metrics', (_req, res) => {
  res.json({ metrics: listMetrics() })
})

reportsRouter.get('/instruments/:ticker/holdings', (req, res) => {
  const holdings = getFundHoldings(req.params.ticker)
  if (holdings.length === 0) return res.status(404).json({ error: 'Not a fund with known holdings' })
  res.json({
    fund_ticker: req.params.ticker,
    as_of_date: holdings[0].as_of_date,
    holdings: holdings.map(({ constituent_ticker, name, asset_type, sector, geography, weight_pct }) => ({ constituent_ticker, name, asset_type, sector, geography, weight_pct })),
  })
})

reportsRouter.get('/customers/:customerId/reports', (req, res) => {
  if (!getCustomer(req.params.customerId)) return res.status(404).json({ error: 'Customer not found' })
  res.json({ reports: listStandardReports() })
})

reportsRouter.get('/customers/:customerId/reports/:reportId', (req, res) => {
  if (!getCustomer(req.params.customerId)) return res.status(404).json({ error: 'Customer not found' })
  const spec = getStandardReport(req.params.reportId)
  if (!spec) return res.status(404).json({ error: 'Report not found' })
  res.json(resolveReport(spec, req.params.customerId, 'standard'))
})

// Re-renders a saved spec with fresh numbers. Validated exactly like AI output.
reportsRouter.post('/customers/:customerId/reports/resolve', (req, res) => {
  const customerId = req.params.customerId
  if (!getCustomer(customerId)) return res.status(404).json({ error: 'Customer not found' })
  const raw = req.body?.spec as ReportSpec | undefined
  if (!raw || typeof raw !== 'object') return res.status(400).json({ error: 'Body must include "spec"' })
  const spec: ReportSpec = { ...raw, id: String(raw.id ?? 'saved'), custom_scenarios: sanitizeScenarios(raw.custom_scenarios) }
  const errors = validateSpec(spec, { customerId, customScenarios: spec.custom_scenarios ?? [], now: new Date() })
  if (errors.length) return res.status(400).json({ error: 'Invalid report spec', details: errors })
  res.json(resolveReport(spec, customerId, 'saved'))
})

// Simple in-memory limiter so a public demo URL can't burn through the API key.
const WINDOW_MS = 10 * 60 * 1000
const MAX_AI_CALLS = Number(process.env.AI_RATE_LIMIT ?? 10)
const hits = new Map<string, number[]>()
function aiRateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.ip ?? 'unknown'
  const recent = (hits.get(key) ?? []).filter((t) => Date.now() - t < WINDOW_MS)
  if (recent.length >= MAX_AI_CALLS) return res.status(429).json({ error: 'For mange AI-forespørsler. Prøv igjen om noen minutter.' })
  hits.set(key, [...recent, Date.now()])
  next()
}

reportsRouter.post('/customers/:customerId/reports/ai', aiRateLimit, async (req, res) => {
  const customerId = req.params.customerId
  if (!getCustomer(customerId)) return res.status(404).json({ error: 'Customer not found' })
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : ''
  if (!prompt) return res.status(400).json({ error: 'Body must include a non-empty "prompt"' })
  if (prompt.length > 1000) return res.status(400).json({ error: 'Prompt is too long (max 1000 characters)' })

  const started = Date.now()
  const result = await generateAiReport(customerId, prompt)
  const interactionId = await logInteraction({
    customer_id: customerId,
    prompt,
    status: result.status,
    report_title: result.report?.title ?? null,
    summary: result.report?.intro ?? null,
    customer_notice: result.customer_notice ?? null,
    spec: result.spec ?? null,
    metrics_used: result.metrics_used,
    topics: result.topics,
    flags: result.flags,
    tool_trace: result.trace,
    model: result.model ?? (result.status === 'fallback' ? null : AI_MODEL),
    latency_ms: Date.now() - started,
  })
  const body: AiReportResponse = {
    interaction_id: interactionId,
    status: result.status,
    customer_notice: result.customer_notice,
    report: result.report,
    spec: result.spec,
    trace: result.trace,
    topics: result.topics,
    flags: result.flags,
  }
  res.json(body)
})

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.ADMIN_TOKEN
  if (!expected) return res.status(503).json({ error: 'ADMIN_TOKEN is not configured on the server' })
  if (req.header('x-admin-token') !== expected) return res.status(401).json({ error: 'Unauthorized' })
  next()
}

reportsRouter.get('/admin/customers/activity', requireAdmin, async (_req, res, next) => {
  try {
    res.json({ customers: await customerActivity() })
  } catch (err) {
    next(err)
  }
})

reportsRouter.get('/admin/interactions', requireAdmin, async (req, res, next) => {
  try {
    const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : undefined
    res.json({ interactions: await listInteractions(customerId) })
  } catch (err) {
    next(err)
  }
})

reportsRouter.patch('/admin/interactions/:id', requireAdmin, async (req, res, next) => {
  try {
    const patch: { reviewed?: boolean; advisor_note?: string } = {}
    if (typeof req.body?.reviewed === 'boolean') patch.reviewed = req.body.reviewed
    if (typeof req.body?.advisor_note === 'string') patch.advisor_note = req.body.advisor_note.slice(0, 2000)
    const updated = await updateInteraction(req.params.id, patch)
    if (!updated) return res.status(404).json({ error: 'Interaction not found' })
    res.json(updated)
  } catch (err) {
    next(err)
  }
})
