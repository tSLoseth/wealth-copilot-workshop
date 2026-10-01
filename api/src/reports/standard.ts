// Hand-written standard reports for case B. Same ReportSpec format the AI
// produces, so both go through the same validation and rendering.
import type { ReportSpec, ReportSummary } from './types.js'

export const STANDARD_REPORTS: (ReportSpec & { description: string })[] = [
  {
    id: 'risikokilder',
    title: 'Hvor kommer risikoen fra, og passer det profilen din?',
    description: 'Hvilke investeringer og sektorer som gir svingningene, og hvordan det passer risikoprofilen din.',
    intro:
      'Målt over {{annual_volatility.period}} svinger porteføljen din rundt {{annual_volatility.pct}} i et typisk år, omtrent {{annual_volatility.kr}}. Oslo Børs svingte {{annual_volatility.osebx_pct}} i samme periode. {{profile_fit.status_text}} Et dårlig år, som skjer omtrent én gang hvert tjuende år, kan koste rundt {{annual_volatility.bad_year_kr}}.',
    blocks: [
      { type: 'kpi', metric: 'annual_volatility', caption: 'Forventede svingninger i et typisk år, målt over {{annual_volatility.period}}. Klikk på søylene under for å se hva som ligger bak.' },
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
    description: 'Ekte markedsfall fra historien spilt av på porteføljen din, og tre hypotetiske fall regnet om til kroner.',
    intro:
      'Hadde du eid dagens portefølje under {{historical_episode(episode=tech-2022).episode_name}}, ville den falt {{historical_episode(episode=tech-2022).worst_pct}} på det verste – mot {{historical_episode(episode=tech-2022).osebx_worst_pct}} for Oslo Børs. Under ser du flere ekte fall og noen «hva om»-regnestykker. Ingen av dem er spådommer.',
    blocks: [
      { type: 'bar', metric: 'historical_episode', params: { episode: 'tech-2022' }, caption: 'Under teknologifallet fra {{historical_episode(episode=tech-2022).start}} til {{historical_episode(episode=tech-2022).end}} ville dagens portefølje falt {{historical_episode(episode=tech-2022).worst_pct}} på det verste, mens Oslo Børs falt {{historical_episode(episode=tech-2022).osebx_worst_pct}}.' },
      { type: 'bar', metric: 'historical_episode', params: { episode: 'covid-2020' }, caption: 'Under koronakrakket ville porteføljen falt {{historical_episode(episode=covid-2020).worst_pct}} på få uker. Oslo Børs falt {{historical_episode(episode=covid-2020).osebx_worst_pct}}.' },
      { type: 'scenario', metric: 'stress_test', params: { scenario: 'tech-correction' } },
      { type: 'scenario', metric: 'stress_test', params: { scenario: 'broad-market-fall' } },
      { type: 'scenario', metric: 'stress_test', params: { scenario: 'rate-shock' } },
      { type: 'table', metric: 'historical_drawdown', caption: 'Det verste i {{historical_drawdown.period}}: {{historical_drawdown.worst_day_date}} falt porteføljen {{historical_drawdown.worst_day_pct}} på én dag ({{historical_drawdown.worst_day_kr}}).' },
      { type: 'bar', metric: 'what_if_shift', params: { sector: 'Technology', pp: 15 }, caption: 'Til illustrasjon, ikke som anbefaling: med {{what_if_shift(sector=Technology,pp=15).moved_pp}} mindre teknologi ville svingningene gått fra {{what_if_shift(sector=Technology,pp=15).vol_before}} til {{what_if_shift(sector=Technology,pp=15).vol_after}}.' },
    ],
  },
  {
    id: 'mot-borsen',
    title: 'Porteføljen din mot Oslo Børs',
    description: 'Avkastning, svingninger og fall sammenlignet med OSEBX i perioden du har valgt.',
    intro:
      'Over {{benchmark_comparison.period}} har porteføljen din gått {{benchmark_comparison.return_pct}}, mot {{benchmark_comparison.osebx_return_pct}} for Oslo Børs. Det er {{benchmark_comparison.diff_pp}} {{benchmark_comparison.direction}} børsen. Samtidig har den svingt {{benchmark_comparison.vol}} i året, mot {{benchmark_comparison.osebx_vol}} for OSEBX.',
    blocks: [
      { type: 'kpi', metric: 'benchmark_comparison', caption: 'Endring i kroner i perioden: {{benchmark_comparison.change_kr}}.' },
      { type: 'table', metric: 'benchmark_comparison', caption: 'Din portefølje og OSEBX side om side.' },
      { type: 'text', text: 'Høyere avkastning har ofte kommet sammen med større svingninger. Porteføljen din har mye teknologi og utenlandske aksjer, mens OSEBX er norske aksjer med mye energi og finans. Derfor kan de gå ganske ulikt fra år til år. Velg en annen tidshorisont øverst for å se hvordan bildet endrer seg.' },
      { type: 'bar', metric: 'geography_exposure', caption: 'OSEBX er bare Norge. Du har {{geography_exposure.us_pct}} i USA og {{geography_exposure.nordic_pct}} i Norden.' },
    ],
  },
  {
    id: 'datagrunnlag',
    title: 'Datagrunnlag og antakelser',
    description: 'Hvor gamle og komplette dataene er, hva beregningene antar, og hva vi ikke kan svare på.',
    intro: 'Kursene er per {{data_freshness.price_end}}, fondenes beholdninger er per {{data_freshness.holdings_as_of}}, og OSEBX er {{data_freshness.osebx_mode}} fra Yahoo Finance. Her ser du hva tallene i rapportene bygger på.',
    blocks: [
      { type: 'table', metric: 'data_freshness' },
      {
        type: 'text',
        text:
          'Dette kan vi ikke svare på ennå:\n• Hvordan porteføljen faktisk har endret seg. Vi har ikke historikk over kjøp og salg, så historikken viser dagens beholdning bakover i tid (kurser fra {{data_freshness.history_start}}).\n• Ekte selskaper: selskapene er fiktive, men beveger seg med ekte indekser fra Yahoo Finance.\n• Investeringer du har i andre banker.\n• Om porteføljen passer hele den økonomiske situasjonen din. Det krever en samtale med rådgiveren din.',
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
