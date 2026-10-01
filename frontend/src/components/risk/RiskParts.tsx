import { useState, type ReactNode } from 'react'
import type { DataQualityNote, MetricResult, RangeKey } from '../../api/reportTypes'
import { useViewSettings } from '../../context/ViewSettingsContext'
import { formatDateNo } from '../../utils/format'

export const RISK_RANGES: { key: RangeKey; label: string }[] = [
  { key: '1M', label: '1 md' },
  { key: '3M', label: '3 md' },
  { key: '6M', label: '6 md' },
  { key: 'YTD', label: 'Hittil i år' },
  { key: '1Y', label: '1 år' },
  { key: '3Y', label: '3 år' },
  { key: '5Y', label: '5 år' },
  { key: 'ALL', label: 'Alt' },
]

export function RangePicker() {
  const { range, setRange } = useViewSettings()
  return (
    <div className="segmented risk-range" role="group" aria-label="Periode for svingningene">
      {RISK_RANGES.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={range === option.key}
          className={range === option.key ? 'is-active' : undefined}
          onClick={() => setRange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function PeriodChip({ metric, fallback }: { metric?: MetricResult | null; fallback?: string }) {
  const text = metric?.period
    ? `Basert på ${metric.period.label.toLowerCase()}`
    : metric?.provenance.period ?? (metric?.provenance.as_of ? `Fondsdata per ${formatDateNo(metric.provenance.as_of)}` : fallback)
  if (!text) return null
  return <span className="chip chip--small risk-period">{text}</span>
}

const SEVERITY: Record<DataQualityNote['severity'], string> = { info: 'Til info', notice: 'Merk', warning: 'Viktig' }

function unique<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const k = key(item)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export function WhyToggle({ metrics }: { metrics: (MetricResult | null | undefined)[] }) {
  const [open, setOpen] = useState(false)
  const list = metrics.filter((m): m is MetricResult => !!m)
  if (list.length === 0) return null
  const sources = unique(list.flatMap((m) => m.provenance.sources), (s) => s)
  const periods = unique(list.map((m) => m.provenance.period).filter((p): p is string => !!p), (p) => p)
  const asOf = list.find((m) => m.provenance.as_of)?.provenance.as_of
  const assumptions = unique(list.flatMap((m) => m.assumptions), (a) => a)
  const notes = unique(list.flatMap((m) => m.data_quality), (n) => n.message)
  const rows = list.reduce((sum, m) => sum + m.provenance.rows_used, 0)

  return (
    <div className="why">
      <button type="button" className="why__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? 'Skjul forklaring' : 'Hvorfor ser jeg dette?'}
      </button>
      {open && (
        <div className="why__body">
          <p>
            <strong>Spørsmålet tallene svarer på:</strong> {unique(list, (m) => m.question).map((m) => m.question).join(' ')}
          </p>
          <dl className="why__facts">
            <dt>Kilder</dt>
            <dd>{sources.join(', ') || 'Ikke oppgitt'}</dd>
            {periods.length > 0 && (
              <>
                <dt>Periode</dt>
                <dd>{periods.join(' · ')}</dd>
              </>
            )}
            {asOf && (
              <>
                <dt>Fondsdata per</dt>
                <dd>{formatDateNo(asOf)}</dd>
              </>
            )}
            <dt>Datarader brukt</dt>
            <dd>{rows.toLocaleString('nb-NO')}</dd>
          </dl>
          {assumptions.length > 0 && (
            <>
              <h5>Antakelser</h5>
              <ul className="plain-list">
                {assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </>
          )}
          {notes.length > 0 && (
            <>
              <h5>Datakvalitet</h5>
              <ul className="dq-list">
                {notes.map((note) => (
                  <li key={note.message} className={`dq-note dq-note--${note.severity}`}>
                    <span className="dq-note__label">{SEVERITY[note.severity]}</span>
                    {note.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}

interface SectionProps {
  id?: string
  eyebrow?: string
  title: string
  lead?: ReactNode
  period?: ReactNode
  metrics: (MetricResult | null | undefined)[]
  loading?: boolean
  error?: Error | null
  children: ReactNode
}

export function RiskSection({ id, eyebrow, title, lead, period, metrics, loading, error, children }: SectionProps) {
  return (
    <section className="panel risk-section" id={id}>
      <header className="risk-section__head">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h3>{title}</h3>
          {lead && <p className="risk-section__lead">{lead}</p>}
        </div>
        {period}
      </header>
      {error ? (
        <p className="error-state">Kunne ikke hente tallene: {error.message}</p>
      ) : loading && metrics.every((m) => !m) ? (
        <div className="risk-skeleton" aria-label="Laster" />
      ) : (
        children
      )}
      <WhyToggle metrics={metrics} />
    </section>
  )
}
