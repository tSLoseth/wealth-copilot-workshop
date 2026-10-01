import type { MetricResult } from '../../api/reportTypes'
import { useDrillDown } from '../../context/DrillDownContext'
import { useMetric } from './useMetric'

export const EPISODES = [
  { id: 'oil-2015', blurb: 'Oljeprisen falt kraftig, og Oslo Børs falt med den.' },
  { id: 'autumn-2018', blurb: 'Renteuro og handelskrig ga brede fall på verdens børser.' },
  { id: 'covid-2020', blurb: 'Børsene falt brått da pandemien stengte ned samfunn.' },
  { id: 'tech-2022', blurb: 'Høyere renter traff særlig teknologiaksjer.' },
]

export const SCENARIOS = ['broad-market-fall', 'tech-correction', 'rate-shock']

interface PairProps {
  label: string
  you: { v: number; d: string }
  bench?: { v: number; d?: string }
  scale: number
  showBenchmark: boolean
}

function Pair({ label, you, bench, scale, showBenchmark }: PairProps) {
  const width = (v: number) => `${Math.min(100, (Math.abs(v) / scale) * 100)}%`
  return (
    <div className="pair">
      <p className="pair__label">{label}</p>
      <div className="pair__row">
        <span className="pair__who">Du</span>
        <span className="pair__track">
          <span className={`pair__fill ${you.v < 0 ? 'is-neg' : 'is-pos'}`} style={{ width: width(you.v) }} />
        </span>
        <span className="pair__num">{you.d}</span>
      </div>
      {showBenchmark && bench && (
        <div className="pair__row pair__row--bench">
          <span className="pair__who">OSEBX</span>
          <span className="pair__track">
            <span className="pair__fill is-bench" style={{ width: width(bench.v) }} />
          </span>
          <span className="pair__num">{bench.d}</span>
        </div>
      )}
    </div>
  )
}

export function EpisodeCard({ metric, blurb, scale, showBenchmark }: { metric: MetricResult; blurb: string; scale: number; showBenchmark: boolean }) {
  const [change, worst] = metric.breakdown ?? []
  const worse = !!worst && worst.secondary !== undefined && worst.value < worst.secondary
  return (
    <article className={`episode${worse ? ' episode--worse' : ''}`}>
      <h4>{metric.facts.episode_name}</h4>
      <p className="episode__dates">
        {metric.facts.start} – {metric.facts.end}
      </p>
      <p className="episode__blurb">{blurb}</p>
      {change && (
        <Pair
          label="Endring i perioden"
          you={{ v: change.value, d: change.display }}
          bench={change.secondary !== undefined ? { v: change.secondary, d: change.secondary_display } : undefined}
          scale={scale}
          showBenchmark={showBenchmark}
        />
      )}
      {worst && (
        <Pair
          label="Verste fall underveis"
          you={{ v: worst.value, d: worst.display }}
          bench={worst.secondary !== undefined ? { v: worst.secondary, d: worst.secondary_display } : undefined}
          scale={scale}
          showBenchmark={showBenchmark}
        />
      )}
      {change && (
        <p className="episode__kr">
          For deg i dag: {change.value < 0 ? 'ned' : 'opp'} ca. <strong>{metric.facts.portfolio_kr}</strong>
        </p>
      )}
      {worse && showBenchmark && <span className="episode__flag">Falt mer enn børsen</span>}
    </article>
  )
}

export function StressCard({ metric }: { metric: MetricResult }) {
  const { openDrill } = useDrillDown()
  const losers = (metric.breakdown ?? []).slice(0, 3)
  return (
    <article className="stress">
      <h4>{metric.facts.scenario_name}</h4>
      <p className="stress__desc">{metric.facts.scenario_description}</p>
      <p className="stress__loss">{metric.display}</p>
      <p className="stress__sub">
        {metric.facts.loss_pct} av porteføljen · igjen: {metric.facts.value_after}
      </p>
      {losers.length > 0 && (
        <>
          <p className="stress__head">Taper mest</p>
          <ul className="stress__list">
            {losers.map((row) => (
              <li key={row.label}>
                <button type="button" onClick={() => row.drill && openDrill(row.drill)} disabled={!row.drill}>
                  <span>{row.label}</span>
                  <strong>{row.display}</strong>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  )
}

export function useEpisodes(customerId: string | null) {
  return [
    useMetric(customerId, 'historical_episode', { episode: EPISODES[0].id }),
    useMetric(customerId, 'historical_episode', { episode: EPISODES[1].id }),
    useMetric(customerId, 'historical_episode', { episode: EPISODES[2].id }),
    useMetric(customerId, 'historical_episode', { episode: EPISODES[3].id }),
  ]
}

export function useStressTests(customerId: string | null) {
  return [
    useMetric(customerId, 'stress_test', { scenario: SCENARIOS[0] }),
    useMetric(customerId, 'stress_test', { scenario: SCENARIOS[1] }),
    useMetric(customerId, 'stress_test', { scenario: SCENARIOS[2] }),
  ]
}
