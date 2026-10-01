import { useState } from 'react'
import type { AiInteraction } from '../../api/reportTypes'
import { formatDateNo } from '../../utils/format'
import FlagChip from './FlagChip'
import { STATUS_LABELS } from './labels'

export type InteractionPatch = { reviewed?: boolean; advisor_note?: string }

export default function InteractionCard({
  interaction,
  onPatch,
}: {
  interaction: AiInteraction
  onPatch: (id: string, patch: InteractionPatch) => Promise<boolean>
}) {
  const [note, setNote] = useState(interaction.advisor_note ?? '')
  const [noteState, setNoteState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const reviewed = interaction.reviewed_at !== null

  async function saveNote() {
    if (note === (interaction.advisor_note ?? '')) return
    setNoteState('saving')
    setNoteState((await onPatch(interaction.id, { advisor_note: note })) ? 'saved' : 'error')
  }

  return (
    <li className={`timeline__item${reviewed ? ' is-reviewed' : ''}`}>
      <div className="timeline__meta">
        <span className="event-kind event-kind--ai">
          Spurte AI-en om en rapport
        </span>
        <time dateTime={interaction.created_at}>{formatDateNo(interaction.created_at, true)}</time>
        <span className={`status-pill status-pill--${interaction.status}`}>{STATUS_LABELS[interaction.status]}</span>
        {interaction.latency_ms > 0 && <span className="muted-small">{(interaction.latency_ms / 1000).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} s</span>}
      </div>
      <p className="timeline__prompt">«{interaction.prompt}»</p>
      {interaction.report_title && (
        <p>
          <strong>Rapport:</strong> {interaction.report_title}
        </p>
      )}
      {interaction.customer_notice && <div className="callout callout--notice">{interaction.customer_notice}</div>}
      {interaction.summary && <p className="timeline__summary">{interaction.summary}</p>}
      {(interaction.topics.length > 0 || interaction.flags.length > 0) && (
        <div className="chip-row">
          {interaction.flags.map((flag) => (
            <FlagChip key={flag} flag={flag} />
          ))}
          {interaction.topics.map((topic) => (
            <span key={topic} className="chip">
              {topic}
            </span>
          ))}
        </div>
      )}
      {interaction.metrics_used.length > 0 && (
        <p className="muted-small">
          Beregninger brukt:{' '}
          {interaction.metrics_used.map((metric) => (
            <code key={metric} className="inline-code">
              {metric}
            </code>
          ))}
        </p>
      )}
      {(interaction.spec || interaction.tool_trace.length > 0) && (
        <details className="ai-trace">
          <summary>Spesifikasjon og sporing</summary>
          {interaction.tool_trace.length > 0 && (
            <ol className="ai-trace__steps">
              {interaction.tool_trace.map((step, index) => (
                <li key={index}>
                  <code>{step.tool}</code>
                  <span>{step.summary}</span>
                </li>
              ))}
            </ol>
          )}
          {interaction.spec && <pre className="code-block">{JSON.stringify(interaction.spec, null, 2)}</pre>}
          {interaction.model && <p className="muted-small">Modell: {interaction.model}</p>}
        </details>
      )}
      <div className="timeline__advisor">
        <label className="checkbox">
          <input type="checkbox" checked={reviewed} onChange={(event) => onPatch(interaction.id, { reviewed: event.target.checked })} />
          {reviewed ? `Gjennomgått ${formatDateNo(interaction.reviewed_at, true)}` : 'Marker som gjennomgått'}
        </label>
        <label htmlFor={`note-${interaction.id}`} className="muted-small">
          Notat fra rådgiver{' '}
          {noteState === 'saving' && '· lagrer …'}
          {noteState === 'saved' && '· lagret'}
          {noteState === 'error' && <span className="negative">· klarte ikke å lagre</span>}
        </label>
        <textarea
          id={`note-${interaction.id}`}
          rows={2}
          value={note}
          placeholder="F.eks. «Ring Jonas og gå gjennom teknologiandelen»"
          onChange={(event) => {
            setNote(event.target.value)
            setNoteState('idle')
          }}
          onBlur={saveNote}
        />
      </div>
    </li>
  )
}
