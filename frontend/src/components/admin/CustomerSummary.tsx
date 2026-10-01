import type { AiInteraction, CustomerEvent } from '../../api/reportTypes'
import FlagChip from './FlagChip'
import { HIGHLIGHTED_FLAGS, firstName, flagLabel } from './labels'

function countBy(values: string[]): { key: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'nb'))
}

export default function CustomerSummary({
  customerName,
  interactions,
  events,
}: {
  customerName: string
  interactions: AiInteraction[]
  events: CustomerEvent[]
}) {
  const topics = countBy(interactions.flatMap((item) => item.topics))
  const flags = countBy(interactions.flatMap((item) => item.flags))
  const reports = countBy(
    events
      .filter((event) => event.event_type === 'report_view')
      .map((event) => event.report_title ?? event.report_id ?? 'Ukjent rapport'),
  )
  const chatCount = events.filter((event) => event.event_type === 'copilot_chat').length
  const alerts = flags.filter((flag) => HIGHLIGHTED_FLAGS.has(flag.key))
  const isEmpty = interactions.length === 0 && events.length === 0

  return (
    <section className="admin-summary panel" aria-label="Oppsummering">
      <h4>Hva er {firstName(customerName)} opptatt av?</h4>
      {isEmpty ? (
        <p className="muted-small">Ingen aktivitet registrert ennå.</p>
      ) : (
        <>
          {alerts.length > 0 && (
            <div className="admin-summary__alert">
              <strong>Følg opp:</strong>{' '}
              {alerts.map((flag) => `${flagLabel(flag.key)} (${flag.count})`).join(', ')}
            </div>
          )}
          <dl className="admin-summary__stats">
            <div>
              <dt>AI-spørsmål</dt>
              <dd>{interactions.length}</dd>
            </div>
            <div>
              <dt>Rapportvisninger</dt>
              <dd>{reports.reduce((sum, report) => sum + report.count, 0)}</dd>
            </div>
            <div>
              <dt>Chat-spørsmål</dt>
              <dd>{chatCount}</dd>
            </div>
          </dl>
          <div className="admin-summary__grid">
            <div>
              <p className="admin-summary__label">Tema i AI-spørsmål</p>
              {topics.length === 0 ? (
                <p className="muted-small">Ingen tema registrert.</p>
              ) : (
                <div className="chip-row">
                  {topics.map((topic) => (
                    <span key={topic.key} className="chip">
                      {topic.key} ×{topic.count}
                    </span>
                  ))}
                </div>
              )}
              {flags.length > 0 && (
                <div className="chip-row">
                  {flags.map((flag) => (
                    <FlagChip key={flag.key} flag={flag.key} count={flag.count} />
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="admin-summary__label">Mest åpnede rapporter</p>
              {reports.length === 0 ? (
                <p className="muted-small">Har ikke åpnet noen rapporter.</p>
              ) : (
                <ol className="admin-summary__reports">
                  {reports.slice(0, 5).map((report) => (
                    <li key={report.key}>
                      <span>{report.key}</span>
                      <span className="muted-small">×{report.count}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
