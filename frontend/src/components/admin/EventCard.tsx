import type { CustomerEvent } from '../../api/reportTypes'
import { formatDateNo } from '../../utils/format'
import { rangeLabel, sourceLabel } from './labels'

function ReportViewCard({ event }: { event: CustomerEvent }) {
  const source = sourceLabel(event.report_source)
  const period = rangeLabel(event.range)
  return (
    <li className="timeline__item timeline__item--event timeline__item--report">
      <div className="timeline__meta">
        <span className="event-kind event-kind--report">
          Åpnet rapport
        </span>
        <time dateTime={event.created_at}>{formatDateNo(event.created_at, true)}</time>
      </div>
      <p className="timeline__event-title">{event.report_title ?? event.report_id ?? 'Ukjent rapport'}</p>
      {(source || period) && (
        <div className="chip-row">
          {source && <span className="chip chip--muted">{source}</span>}
          {period && <span className="chip chip--muted">Periode: {period}</span>}
        </div>
      )}
    </li>
  )
}

function ChatCard({ event }: { event: CustomerEvent }) {
  return (
    <li className="timeline__item timeline__item--event timeline__item--chat">
      <div className="timeline__meta">
        <span className="event-kind event-kind--chat">
          Spurte Wealth Copilot
        </span>
        <time dateTime={event.created_at}>{formatDateNo(event.created_at, true)}</time>
        {event.intent && <span className="chip chip--mono">{event.intent}</span>}
      </div>
      <p className="timeline__event-title">«{event.prompt ?? ''}»</p>
      {event.answer && (
        <details className="event-answer">
          <summary>Vis svaret kunden fikk</summary>
          <p>{event.answer}</p>
        </details>
      )}
    </li>
  )
}

export default function EventCard({ event }: { event: CustomerEvent }) {
  return event.event_type === 'copilot_chat' ? <ChatCard event={event} /> : <ReportViewCard event={event} />
}
