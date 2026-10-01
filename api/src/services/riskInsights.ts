// Deterministic, ranked risk insights built only from the metric catalog, so
// every number shown is traceable to a metric and its data.
import { HISTORICAL_EPISODES, computeMetric, type MetricContext } from '../metrics/catalog.js'
import { buildModel } from '../metrics/engine.js'
import type { DrillTarget, RangeKey } from '../reports/types.js'

export interface RiskInsight {
  id: string
  severity: 'info' | 'notice' | 'warning'
  title: string
  detail: string
  metric_id: string
  value_display?: string
  drill?: DrillTarget
  report_id?: string
}

const toNumber = (display: string) => Number(display.replace(/[^\d,-]/g, '').replace(',', '.'))

export function riskInsights(customerId: string, range: RangeKey, now = new Date()): RiskInsight[] {
  if (buildModel(customerId).total === 0) {
    return [{ id: 'no-investments', severity: 'info', title: 'Du har ingen investeringer ennå', detail: 'Når du har investert, ser du her hvor risikoen kommer fra og hvordan den passer profilen din.', metric_id: 'total_value' }]
  }
  const ctx: MetricContext = { customerId, customScenarios: [], now, range }
  const m = (id: string, params: Record<string, string | number> = {}) => computeMetric(ctx, id, params)
  const insights: (RiskInsight & { rank: number })[] = []

  const fit = m('profile_fit')
  if (fit.status === 'above') {
    insights.push({ rank: 100, id: 'profile-above', severity: 'warning', title: 'Porteføljen svinger mer enn profilen din tilsier', detail: `Målt over ${fit.facts.period} svinger den ${fit.facts.vol} i året. Vanlig for en ${fit.facts.profile} profil er ${fit.facts.range}.`, metric_id: 'profile_fit', value_display: fit.facts.vol, report_id: 'risikokilder' })
  } else if (fit.status === 'within') {
    insights.push({ rank: 20, id: 'profile-within', severity: 'info', title: 'Svingningene passer profilen din', detail: `Porteføljen svinger ${fit.facts.vol} i året, innenfor ${fit.facts.range} for en ${fit.facts.profile} profil.`, metric_id: 'profile_fit', value_display: fit.facts.vol })
  }

  const sector = m('risk_by_sector')
  const top = sector.breakdown?.[0]
  if (top && (top.secondary ?? 0) - top.value >= 10) {
    insights.push({ rank: 90, id: 'sector-risk', severity: 'warning', title: `${top.label} står for det meste av svingningene`, detail: `${top.label} er ${top.display} av pengene dine, men står for ${top.secondary_display} av svingningene når fondene er brutt ned.`, metric_id: 'risk_by_sector', value_display: top.secondary_display, drill: top.drill, report_id: 'risikokilder' })
  }

  const tech = m('tech_exposure')
  const hidden = toNumber(tech.facts.via_funds_pct)
  if (hidden >= 5) {
    insights.push({ rank: 80, id: 'hidden-tech', severity: 'notice', title: 'Fondene dine inneholder mye teknologi', detail: `${tech.facts.via_funds_pct} av porteføljen er teknologiselskaper inne i fond. Til sammen har du ${tech.facts.total_pct} i teknologi, mens det ser ut som ${tech.facts.labelled_pct}.`, metric_id: 'tech_exposure', value_display: tech.facts.total_pct, drill: { dimension: 'sector', value: 'Technology', label: 'Teknologi' }, report_id: 'hva-eier-du' })
  }

  const equity = m('equity_share')
  if (equity.status === 'above') {
    insights.push({ rank: 70, id: 'equity-above', severity: 'notice', title: 'Høy aksjeandel for profilen', detail: `Du har ${equity.facts.equity_pct} i aksjer når fondene er brutt ned. Illustrativ grense for ${equity.facts.profile} profil er ${equity.facts.max_pct}.`, metric_id: 'equity_share', value_display: equity.facts.equity_pct, drill: { dimension: 'asset_type', value: 'Equity', label: 'Aksjer' } })
  }

  const overlap = m('overlap')
  const firstOverlap = overlap.breakdown?.[0]
  if (firstOverlap && firstOverlap.value >= 5) {
    insights.push({ rank: 60, id: 'overlap', severity: 'notice', title: `Du eier ${overlap.facts.top_name} flere steder`, detail: `Samlet ${overlap.facts.top_total_pct} av porteføljen: ${overlap.facts.top_paths}.`, metric_id: 'overlap', value_display: overlap.facts.top_total_pct, drill: firstOverlap.drill, report_id: 'hva-eier-du' })
  }

  const worstEpisode = HISTORICAL_EPISODES.map((e) => ({ e, r: m('historical_episode', { episode: e.id }) }))
    .filter(({ r }) => r.breakdown?.[1] && r.breakdown[1].value < (r.breakdown[1].secondary ?? 0))
    .sort((a, b) => (a.r.breakdown![1].value - (a.r.breakdown![1].secondary ?? 0)) - (b.r.breakdown![1].value - (b.r.breakdown![1].secondary ?? 0)))[0]
  if (worstEpisode) {
    insights.push({ rank: 75, id: `episode-${worstEpisode.e.id}`, severity: 'notice', title: `I ${worstEpisode.e.name.toLowerCase()} ville du falt mer enn børsen`, detail: `Dagens portefølje ville falt ${worstEpisode.r.facts.worst_pct} på det verste, mot ${worstEpisode.r.facts.osebx_worst_pct} for Oslo Børs.`, metric_id: 'historical_episode', value_display: `−${worstEpisode.r.facts.worst_pct}`, report_id: 'markedsfall' })
  }

  const drift = m('weight_drift')
  if (Math.abs(Number(drift.value)) >= 3) {
    insights.push({ rank: 50, id: 'drift', severity: 'info', title: `${drift.facts.top_sector} har glidd ${Number(drift.value) > 0 ? 'opp' : 'ned'}`, detail: `Bare fordi kursene har beveget seg, har ${drift.facts.top_sector.toLowerCase()} gått fra ${drift.facts.start_pct} til ${drift.facts.end_pct} av porteføljen over ${drift.facts.period}.`, metric_id: 'weight_drift', value_display: drift.display, drill: drift.breakdown?.[0]?.drill })
  }

  const bench = m('benchmark_comparison')
  insights.push({ rank: 40, id: 'vs-osebx', severity: 'info', title: `Over ${bench.facts.period}: ${bench.facts.return_pct} mot ${bench.facts.osebx_return_pct} for Oslo Børs`, detail: `Porteføljen har gjort det ${bench.facts.diff_pp} ${bench.facts.direction} OSEBX og svingt ${bench.facts.vol} mot ${bench.facts.osebx_vol}.`, metric_id: 'benchmark_comparison', value_display: bench.facts.return_pct, report_id: 'mot-borsen' })

  const conc = m('concentration')
  if (toNumber(conc.facts.top5_pct) >= 40) {
    insights.push({ rank: 45, id: 'concentration', severity: 'info', title: 'Mye i få selskaper', detail: `De fem største selskapene utgjør ${conc.facts.top5_pct}. Du eier ${conc.facts.underlying_n} selskaper, men spredningen tilsvarer omtrent ${conc.facts.effective_n} like store.`, metric_id: 'concentration', value_display: conc.facts.top5_pct, drill: conc.breakdown?.[0]?.drill })
  }

  return insights.sort((a, b) => b.rank - a.rank).map(({ rank: _rank, ...rest }) => rest)
}
