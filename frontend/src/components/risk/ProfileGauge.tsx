import type { MetricResult } from '../../api/reportTypes'
import { formatNum } from '../../utils/format'

interface Props {
  fit: MetricResult
  showBenchmark: boolean
}

export default function ProfileGauge({ fit, showBenchmark }: Props) {
  const band = fit.breakdown?.[1]?.meta
  const min = Number(band?.fra)
  const max = Number(band?.til)
  const vol = fit.value ?? 0
  const osebx = showBenchmark ? fit.benchmark?.value ?? null : null
  if (!band || !Number.isFinite(min) || !Number.isFinite(max)) {
    return <p className="empty-state">Vi kjenner ikke risikoprofilen din, så vi kan ikke sammenligne svingningene med den.</p>
  }

  const scale = Math.max(max * 1.8, vol * 1.2, (osebx ?? 0) * 1.2, 1)
  const at = (v: number) => `${Math.min(100, Math.max(0, (v / scale) * 100))}%`
  const zones = [
    { key: 'below', label: 'Under', from: 0, to: min },
    { key: 'within', label: 'Innenfor', from: min, to: max },
    { key: 'above', label: 'Over', from: max, to: scale },
  ]

  return (
    <div className="gauge" role="img" aria-label={`Porteføljen svinger ±${formatNum(vol)} % i året. Vanlig for profilen er ${formatNum(min)}–${formatNum(max)} %.`}>
      <div className="gauge__track">
        {zones.map((z) => (
          <div
            key={z.key}
            className={`gauge__zone gauge__zone--${z.key}${fit.status === z.key ? ' is-current' : ''}`}
            style={{ left: at(z.from), width: `calc(${at(z.to)} - ${at(z.from)})` }}
          >
            <span>{z.label}</span>
          </div>
        ))}
        {osebx !== null && (
          <div className="gauge__marker gauge__marker--bench" style={{ left: at(osebx) }}>
            <span className="gauge__tag">OSEBX ±{formatNum(osebx)} %</span>
          </div>
        )}
        <div className="gauge__marker gauge__marker--you" style={{ left: at(vol) }}>
          <span className="gauge__tag">Du ±{formatNum(vol)} %</span>
        </div>
      </div>
      <div className="gauge__axis">
        <span>0 %</span>
        <span style={{ left: at(min) }}>{formatNum(min)} %</span>
        <span style={{ left: at(max) }}>{formatNum(max)} %</span>
      </div>
    </div>
  )
}
