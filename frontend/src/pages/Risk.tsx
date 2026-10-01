import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { MetricResult } from '../api/reportTypes'
import { useCustomerContext } from '../context/CustomerContext'
import { useDrillDown } from '../context/DrillDownContext'
import { useViewSettings } from '../context/ViewSettingsContext'
import { EPISODES, EpisodeCard, StressCard, useEpisodes, useStressTests } from '../components/risk/MarketFalls'
import ProfileGauge from '../components/risk/ProfileGauge'
import RiskBars from '../components/risk/RiskBars'
import { PeriodChip, RangePicker, RiskSection } from '../components/risk/RiskParts'
import WhatIf from '../components/risk/WhatIf'
import { isEmptyMetric, useMetric } from '../components/risk/useMetric'

const STATUS_TEXT: Record<string, string> = { within: 'Innenfor profilen', above: 'Over profilen', below: 'Under profilen' }

type View = 'holding' | 'underlying' | 'sector'

const VIEWS: { key: View; label: string; hint: string }[] = [
  { key: 'holding', label: 'Det du eier', hint: 'Fondene og aksjene slik de står i depotet ditt.' },
  { key: 'underlying', label: 'Det du egentlig eier', hint: 'Selskapene inne i fondene, lagt sammen med aksjene du eier direkte.' },
  { key: 'sector', label: 'Sektor', hint: 'Bransjene pengene står i, når fondene er brutt ned.' },
]

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' }) {
  return (
    <div className={`risk-kpi${tone ? ` risk-kpi--${tone}` : ''}`}>
      <p className="risk-kpi__label">{label}</p>
      <p className="risk-kpi__value">{value}</p>
      {sub && <p className="risk-kpi__sub">{sub}</p>}
    </div>
  )
}

function EquityBar({ metric }: { metric: MetricResult }) {
  const max = parseFloat((metric.facts.max_pct ?? '').replace(',', '.'))
  const value = metric.value ?? 0
  return (
    <div className={`risk-kpi${metric.status === 'above' ? ' risk-kpi--warn' : ''}`}>
      <p className="risk-kpi__label">Andel aksjer (også inne i fond)</p>
      <p className="risk-kpi__value">{metric.display}</p>
      <div className="equity-bar" aria-hidden>
        <span className="equity-bar__fill" style={{ width: `${Math.min(100, value)}%` }} />
        {Number.isFinite(max) && <span className="equity-bar__max" style={{ left: `${max}%` }} />}
      </div>
      <p className="risk-kpi__sub">Grense for {metric.facts.profile} profil: {metric.facts.max_pct}</p>
    </div>
  )
}

export default function Risk() {
  const { selectedCustomerId, selectedCustomer } = useCustomerContext()
  const { showBenchmark } = useViewSettings()
  const { openDrill } = useDrillDown()
  const id = selectedCustomerId
  const name = selectedCustomer ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}` : ''
  const [view, setView] = useState<View>('underlying')

  const fit = useMetric(id, 'profile_fit')
  const vol = useMetric(id, 'annual_volatility')
  const equity = useMetric(id, 'equity_share')
  const byHolding = useMetric(id, 'risk_by_holding')
  const byUnderlying = useMetric(id, 'risk_by_underlying')
  const bySector = useMetric(id, 'risk_by_sector')
  const tech = useMetric(id, 'tech_exposure')
  const overlap = useMetric(id, 'overlap')
  const episodes = useEpisodes(id)
  const stress = useStressTests(id)

  if (!id) return <p className="loading-state">Laster kunde …</p>
  if (fit.error && !fit.data) return <p className="error-state">Kunne ikke hente risikotallene: {fit.error.message}</p>
  if (!fit.data) return <div className="page"><div className="risk-skeleton risk-skeleton--hero" aria-label="Laster risikotall" /></div>

  if (isEmptyMetric(fit.data)) {
    return (
      <div className="page risk-page">
        <div className="page-heading">
          <p className="eyebrow">Risiko</p>
          <h2>Risiko – hvor kommer svingningene fra?</h2>
        </div>
        <section className="panel risk-empty">
          <h3>Ingen investeringer ennå</h3>
          <p>{name ? `${name} har` : 'Du har'} ingen fond eller aksjer registrert, så det er ingen investeringsrisiko å vise.</p>
          <p>Når du begynner å investere, viser vi her hvor mye porteføljen kan svinge og hva som driver svingningene.</p>
        </section>
      </div>
    )
  }

  const bars = { holding: byHolding, underlying: byUnderlying, sector: bySector }[view]
  const f = fit.data
  const v = vol.data
  const episodeData = episodes.map((e) => e.data)
  const episodeScale = Math.max(
    5,
    ...episodeData.flatMap((m) => (m?.breakdown ?? []).flatMap((r) => [Math.abs(r.value), showBenchmark ? Math.abs(r.secondary ?? 0) : 0])),
  )
  const techData = tech.data
  const overlapRows = (overlap.data?.breakdown ?? []).slice(0, 5)

  return (
    <div className="page risk-page">
      <div className="page-heading risk-heading">
        <div>
          <p className="eyebrow">Risiko{name ? ` · ${name}` : ''}</p>
          <h2>Risiko – hvor kommer svingningene fra?</h2>
          <p className="page-heading__lead">
            Her ser du hvor mye porteføljen kan gå opp og ned, hvilke investeringer som står for svingningene, og om det passer med
            profilen din. Klikk på en rad for å se detaljer.
          </p>
        </div>
        <RangePicker />
      </div>

      <RiskSection
        eyebrow="Profil"
        title="Passer porteføljen profilen din?"
        period={<PeriodChip metric={f} />}
        metrics={[f, v, equity.data]}
      >
        <div className="risk-hero">
          <div className="risk-hero__main">
            <div className="risk-hero__status">
              {f.status && f.status !== 'unknown' && <span className={`status-badge status-badge--${f.status}`}>{STATUS_TEXT[f.status]}</span>}
              <span className="risk-hero__profile">
                Profil: <strong>{f.facts.profile}</strong> · Tidshorisont: <strong>{f.facts.horizon}</strong>
              </span>
            </div>
            <p className="risk-hero__text">{f.facts.status_text}</p>
            <ProfileGauge fit={f} showBenchmark={showBenchmark} />
            <p className="risk-hero__note">
              Vanlig svingning for {f.facts.profile} profil er {f.facts.range} i året.
              {showBenchmark && f.benchmark?.display && ` Oslo Børs (OSEBX) svinget ${f.benchmark.display} i samme periode.`}
            </p>
          </div>
          <div className="risk-hero__kpis">
            {v && <Kpi label="Vanlige svingninger i et år" value={v.facts.pct ?? v.display} sub={`Omtrent ${v.facts.kr} opp eller ned`} />}
            {v?.facts.bad_year_kr && (
              <Kpi label="Et dårlig år (ca. 1 av 20)" value={`−${v.facts.bad_year_kr}`} sub="Så mye kan verdien falle i et uvanlig dårlig år" tone="warn" />
            )}
            {equity.data && !isEmptyMetric(equity.data) && <EquityBar metric={equity.data} />}
          </div>
        </div>
      </RiskSection>

      <RiskSection
        eyebrow="Kilder til risiko"
        title="Hvor kommer risikoen fra?"
        lead="Den blå streken viser hvor stor del av pengene som står der. Den oransje viser hvor stor del av svingningene det står for. Er oransje lengst, bidrar investeringen mer til svingningene enn størrelsen tilsier."
        period={<PeriodChip metric={bars.data} />}
        metrics={[bars.data]}
        loading={bars.loading}
        error={bars.error}
      >
        <div className="segmented risk-toggle" role="tablist" aria-label="Velg visning">
          {VIEWS.map((option) => (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={view === option.key}
              className={view === option.key ? 'is-active' : undefined}
              onClick={() => setView(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="risk-toggle__hint">{VIEWS.find((o) => o.key === view)?.hint}</p>
        {bars.data && <RiskBars key={view} rows={bars.data.breakdown ?? []} showPaths={view === 'underlying'} />}
      </RiskSection>

      <RiskSection
        eyebrow="Fondsinnhold"
        title="Skjult risiko i fondene"
        lead="Fond kan inneholde de samme selskapene som du allerede eier. Da blir du mer avhengig av dem enn det ser ut som."
        period={<PeriodChip metric={techData} />}
        metrics={[techData, overlap.data]}
        loading={tech.loading}
        error={tech.error}
      >
        {techData && !isEmptyMetric(techData) && (
          <div className="hidden-risk">
            <div className="hidden-risk__compare">
              <div>
                <p className="hidden-risk__cap">Ser ut som</p>
                <p className="hidden-risk__num">{techData.facts.labelled_pct}</p>
                <p className="hidden-risk__sub">merket som teknologi</p>
              </div>
              <span className="hidden-risk__arrow" aria-hidden>
                →
              </span>
              <div>
                <p className="hidden-risk__cap">Egentlig</p>
                <p className="hidden-risk__num hidden-risk__num--strong">{techData.facts.total_pct}</p>
                <p className="hidden-risk__sub">i teknologiselskaper ({techData.facts.total_kr})</p>
              </div>
            </div>
            <div className="hidden-risk__stack" aria-label="Hvor teknologien kommer fra">
              {(techData.breakdown ?? []).map((row, index) => (
                <button
                  key={row.label}
                  type="button"
                  className={`hidden-risk__seg hidden-risk__seg--${index % 5}`}
                  style={{ flexGrow: Math.max(row.value, 0.5) }}
                  title={`${row.label}: ${row.display}`}
                  onClick={() => row.drill && openDrill(row.drill)}
                >
                  <span>{row.label}</span>
                  <strong>{row.display}</strong>
                </button>
              ))}
            </div>
          </div>
        )}
        {overlapRows.length > 0 && (
          <>
            <h4 className="risk-subhead">Selskaper du eier flere steder ({overlap.data?.facts.count})</h4>
            <ul className="overlap-list">
              {overlapRows.map((row) => (
                <li key={row.label}>
                  <button type="button" onClick={() => row.drill && openDrill(row.drill)}>
                    <span className="overlap-list__name">{row.label}</span>
                    <span className="overlap-list__paths">{String(row.meta?.eies_via ?? '')}</span>
                    <strong className="overlap-list__total">{row.display}</strong>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </RiskSection>

      <RiskSection
        eyebrow="Historie og scenarioer"
        title="Slik ville det gått i ekte markedsfall"
        lead="Vi har spilt av ekte markedsfall fra historien med porteføljen du har i dag. Under ser du også tre tenkte scenarioer, regnet i kroner."
        period={<span className="chip chip--small risk-period">Dagens portefølje, historiske kurser</span>}
        metrics={[episodeData.find(Boolean), stress[0].data]}
        loading={episodes.every((e) => e.loading)}
      >
        <div className="episode-grid">
          {episodes.map((e, i) =>
            e.data && !isEmptyMetric(e.data) ? (
              <EpisodeCard key={EPISODES[i].id} metric={e.data} blurb={EPISODES[i].blurb} scale={episodeScale} showBenchmark={showBenchmark} />
            ) : e.error ? (
              <p key={EPISODES[i].id} className="error-state">Kunne ikke hente perioden: {e.error.message}</p>
            ) : (
              <div key={EPISODES[i].id} className="risk-skeleton risk-skeleton--card" />
            ),
          )}
        </div>
        <h4 className="risk-subhead">Hva om det skjer i morgen?</h4>
        <div className="stress-grid">
          {stress.map((s, i) =>
            s.data && !isEmptyMetric(s.data) ? (
              <StressCard key={i} metric={s.data} />
            ) : s.error ? (
              <p key={i} className="error-state">Kunne ikke regne ut scenarioet: {s.error.message}</p>
            ) : (
              <div key={i} className="risk-skeleton risk-skeleton--card" />
            ),
          )}
        </div>
      </RiskSection>

      <section className="panel risk-section">
        <header className="risk-section__head">
          <div>
            <p className="eyebrow">Utforsk</p>
            <h3>Hva om?</h3>
            <p className="risk-section__lead">
              Se hvordan svingningene ville endret seg hvis en del av pengene i en sektor i stedet sto i kontanter.
            </p>
          </div>
          <PeriodChip metric={bySector.data} />
        </header>
        <WhatIf customerId={id} sectors={bySector.data} />
      </section>

      <section className="risk-cta">
        <div>
          <h3>Vil du gå videre?</h3>
          <p>Lag en rapport du kan ta vare på, eller snakk med rådgiveren din om hva som passer for deg.</p>
        </div>
        <div className="risk-cta__actions">
          <Link to="/rapporter" className="btn btn--primary">
            Lag en rapport om dette
          </Link>
          <span className="btn btn--secondary risk-cta__static">Snakk med rådgiveren din</span>
        </div>
      </section>
    </div>
  )
}
