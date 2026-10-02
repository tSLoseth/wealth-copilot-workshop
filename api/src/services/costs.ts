// Illustrative yearly product costs (ongoing charges) and what they add up to
// over time. Fictional fees for fictional funds - not real price lists.
import { buildModel } from '../metrics/engine.js'
import { assetTypeNb } from '../metrics/format.js'

export const YEARLY_FEE_PCT: Record<string, number> = {
  TECHF: 1.5, GLBEQ: 0.2, NRDEQ: 0.25, EMGEQ: 0.35, GRNEF: 0.75,
  MFBAL: 1.2, MFCON: 0.9, MFPEN: 0.8, CORPB: 0.4,
}
const ASSUMED_RETURN_PCT = 5

export function customerCosts(customerId: string) {
  const model = buildModel(customerId)
  const rows = model.positions.map((p) => {
    const fee = YEARLY_FEE_PCT[p.ticker] ?? 0
    return { ticker: p.ticker, name: p.name, type: assetTypeNb(p.asset_type), value: Math.round(p.value), fee_pct: fee, yearly_kr: Math.round((p.value * fee) / 100) }
  }).sort((a, b) => b.yearly_kr - a.yearly_kr)
  const yearly = rows.reduce((s, r) => s + r.yearly_kr, 0)
  const weightedFee = model.total > 0 ? (yearly / model.total) * 100 : 0
  // Value after N years with and without the fee drag, at an assumed return.
  const projection = [1, 5, 10, 20].map((years) => {
    const gross = model.total * (1 + ASSUMED_RETURN_PCT / 100) ** years
    const net = model.total * (1 + (ASSUMED_RETURN_PCT - weightedFee) / 100) ** years
    return { years, without_costs: Math.round(gross), with_costs: Math.round(net), cost_kr: Math.round(gross - net) }
  })
  return {
    customer_id: customerId,
    total_value: Math.round(model.total),
    yearly_cost_kr: yearly,
    weighted_fee_pct: Number(weightedFee.toFixed(2)),
    rows,
    projection,
    assumptions: [
      `Kostnadene er illustrative årlige fondskostnader for fiktive fond. Enkeltaksjer og kontanter har ingen løpende kostnad her (kurtasje ved kjøp/salg er ikke med).`,
      `Framskrivingen antar ${ASSUMED_RETURN_PCT} % årlig avkastning før kostnader og at dagens beholdning står urørt. Det er et regneeksempel, ikke en prognose.`,
    ],
  }
}
