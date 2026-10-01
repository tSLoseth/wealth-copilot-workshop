// Hand-written standard reports for case B. Same ReportSpec format the AI
// produces, so both go through the same validation and rendering.
import type { ReportSpec, ReportSummary } from './types.js'

export const STANDARD_REPORTS: (ReportSpec & { description: string })[] = [
  {
    id: 'risikokilder',
    title: 'Hvor kommer risikoen fra, og passer det profilen din?',
    description: 'Hvilke investeringer og sektorer som gir svingningene, og hvordan det passer risikoprofilen din.',
    intro:
      'Porteføljen din kan svinge rundt {{annual_volatility.pct}} i et typisk år, omtrent {{annual_volatility.kr}}. {{profile_fit.status_text}} Under ser du hva svingningene kommer fra.',
    blocks: [
      { type: 'status', metric: 'profile_fit', caption: 'For en {{profile_fit.profile}} profil er det vanlig med svingninger på {{profile_fit.range}} i året. Din portefølje ligger på {{profile_fit.vol}}.' },
      { type: 'bar', metric: 'risk_by_holding', caption: 'Lengden på søylene viser andelen av pengene og andelen av svingningene. Når risikosøylen er lengst, bidrar investeringen mer til svingningene enn størrelsen tilsier.' },
      { type: 'text', text: '{{risk_by_holding.top_name}} er {{risk_by_holding.top_weight}} av pengene dine, men står for {{risk_by_holding.top_risk}} av svingningene. {{risk_by_holding.second_name}} er {{risk_by_holding.second_weight}} av pengene og står for {{risk_by_holding.second_risk}}.' },
      { type: 'bar', metric: 'risk_by_sector', caption: 'Når fondene brytes ned, står {{risk_by_sector.top_sector}} for {{risk_by_sector.top_sector_risk}} av svingningene, men {{risk_by_sector.top_sector_weight}} av pengene.' },
      { type: 'status', metric: 'equity_share', caption: 'Inkludert aksjene inne i fondene har du {{equity_share.equity_pct}} i aksjer. Illustrativ grense for {{equity_share.profile}} profil: {{equity_share.max_pct}}.' },
    ],
  },
  {
    id: 'hva-eier-du',
    title: 'Hva eier du egentlig?',
    description: 'Fondene brutt ned i selskapene de eier: skjult teknologi, overlapp og hvor i verden pengene står.',
    intro:
      'Det ser ut som {{tech_exposure.labelled_pct}} av porteføljen er teknologi. Når vi ser inn i fondene, er det egentlig {{tech_exposure.total_pct}}, omtrent {{tech_exposure.total_kr}}.',
    blocks: [
      { type: 'kpi', metric: 'tech_exposure', caption: '{{tech_exposure.direct_pct}} eier du direkte, og {{tech_exposure.via_funds_pct}} ligger inne i fondene.' },
      { type: 'bar', metric: 'tech_exposure', caption: 'Hvor teknologien din kommer fra' },
      { type: 'table', metric: 'overlap', caption: 'Du eier {{overlap.count}} selskaper flere steder. Størst er {{overlap.top_name}} med {{overlap.top_total_pct}} totalt: {{overlap.top_paths}}.' },
      { type: 'kpi', metric: 'concentration', caption: 'De fem største selskapene utgjør {{concentration.top5_pct}} av porteføljen. Du eier {{concentration.underlying_n}} selskaper, men spredningen tilsvarer omtrent {{concentration.effective_n}} like store.' },
      { type: 'bar', metric: 'geography_exposure', caption: '{{geography_exposure.us_pct}} står i USA og {{geography_exposure.nordic_pct}} i Norden.' },
      { type: 'bar', metric: 'weight_drift', caption: 'Bare fordi kursene har beveget seg, har {{weight_drift.top_sector}} gått fra {{weight_drift.start_pct}} til {{weight_drift.end_pct}} av porteføljen.' },
    ],
  },
  {
    id: 'markedsfall',
    title: 'Hva om markedet faller?',
    description: 'Tre hypotetiske fall regnet om til kroner, og det verste som faktisk skjedde de siste 90 dagene.',
    intro:
      'Dette er «hva om»-regnestykker, ikke spådommer. Ved en teknologikorreksjon kan porteføljen falle med omtrent {{stress_test(scenario=tech-correction).loss_kr}}, eller {{stress_test(scenario=tech-correction).loss_pct}}.',
    blocks: [
      { type: 'scenario', metric: 'stress_test', params: { scenario: 'tech-correction' } },
      { type: 'scenario', metric: 'stress_test', params: { scenario: 'broad-market-fall' } },
      { type: 'scenario', metric: 'stress_test', params: { scenario: 'rate-shock' } },
      { type: 'table', metric: 'historical_drawdown', caption: 'Det verste som faktisk skjedde: {{historical_drawdown.worst_day_date}} falt porteføljen {{historical_drawdown.worst_day_pct}} på én dag ({{historical_drawdown.worst_day_kr}}).' },
      { type: 'bar', metric: 'what_if_shift', params: { sector: 'Technology', pp: 15 }, caption: 'Til illustrasjon, ikke som anbefaling: med {{what_if_shift(sector=Technology,pp=15).moved_pp}} mindre teknologi ville svingningene gått fra {{what_if_shift(sector=Technology,pp=15).vol_before}} til {{what_if_shift(sector=Technology,pp=15).vol_after}}.' },
    ],
  },
  {
    id: 'datagrunnlag',
    title: 'Datagrunnlag og antakelser',
    description: 'Hvor gamle og komplette dataene er, hva beregningene antar, og hva vi ikke kan svare på.',
    intro: 'Kursene er per {{data_freshness.price_end}}, og fondenes beholdninger er per {{data_freshness.holdings_as_of}}. Her ser du hva tallene i rapportene bygger på.',
    blocks: [
      { type: 'table', metric: 'data_freshness' },
      {
        type: 'text',
        text:
          'Dette kan vi ikke svare på ennå:\n• Hvordan porteføljen har endret seg over flere år. Vi har ikke historikk over kjøp og salg, bare kursene de siste {{data_freshness.trading_days}} dagene.\n• Investeringer du har i andre banker.\n• Om porteføljen passer hele den økonomiske situasjonen din. Det krever en samtale med rådgiveren din.',
      },
      { type: 'kpi', metric: 'total_value', caption: 'Beregningene bygger på {{total_value.positions_count}} investeringer, til sammen {{total_value.total}}.' },
    ],
  },
]

export function listStandardReports(): ReportSummary[] {
  return STANDARD_REPORTS.map(({ id, title, description }) => ({ id, title, description }))
}

export function getStandardReport(id: string): ReportSpec | undefined {
  return STANDARD_REPORTS.find((r) => r.id === id)
}
