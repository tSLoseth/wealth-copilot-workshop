import { useEffect, useState } from 'react'
import { ApiError, fetchCustomerActivity, fetchInteractions, updateInteraction } from '../api/client'
import type { AiInteraction, CustomerActivity } from '../api/reportTypes'
import { formatDateNo } from '../utils/format'

const TOKEN_KEY = 'wc.adminToken'
const HIGHLIGHTED_FLAGS = new Set(['ønsker_råd', 'bekymring'])

const STATUS_LABELS: Record<AiInteraction['status'], string> = {
  ok: 'Rapport laget',
  refused: 'Avvist',
  fallback: 'Standardrapport brukt',
  error: 'Feil',
}

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function writeToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // sessionStorage unavailable: the token only lives in component state.
  }
}

function flagLabel(flag: string): string {
  return flag.replace(/_/g, ' ')
}

function FlagChip({ flag, count }: { flag: string; count?: number }) {
  return (
    <span className={`chip${HIGHLIGHTED_FLAGS.has(flag) ? ' chip--alert' : ' chip--muted'}`}>
      {flagLabel(flag)}
      {count !== undefined && count > 1 && ` ×${count}`}
    </span>
  )
}

function TokenForm({ onSubmit, error }: { onSubmit: (token: string) => void; error: string | null }) {
  const [value, setValue] = useState('')
  return (
    <form
      className="admin-login panel"
      onSubmit={(event) => {
        event.preventDefault()
        if (value.trim()) onSubmit(value.trim())
      }}
    >
      <h3>Logg inn som rådgiver</h3>
      <p className="muted-small">Skriv inn tilgangskoden for rådgiveroversikten.</p>
      <label htmlFor="admin-token">Tilgangskode</label>
      <input id="admin-token" type="password" autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} />
      {error && <p className="error-state">{error}</p>}
      <button type="submit" className="btn btn--primary" disabled={!value.trim()}>
        Åpne oversikten
      </button>
    </form>
  )
}

function InteractionCard({
  interaction,
  onPatch,
}: {
  interaction: AiInteraction
  onPatch: (id: string, patch: { reviewed?: boolean; advisor_note?: string }) => Promise<boolean>
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

export default function Admin() {
  const [token, setToken] = useState<string | null>(() => readToken())
  const [authError, setAuthError] = useState<string | null>(null)
  const [activity, setActivity] = useState<CustomerActivity[] | null>(null)
  const [activityError, setActivityError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [interactions, setInteractions] = useState<AiInteraction[] | null>(null)
  const [interactionsError, setInteractionsError] = useState<string | null>(null)

  function handleError(err: unknown, setMessage: (message: string) => void, fallback: string) {
    if (err instanceof ApiError && err.status === 401) {
      writeToken(null)
      setToken(null)
      setAuthError('Tilgangskoden var feil eller har utløpt. Prøv igjen.')
      return
    }
    setMessage(fallback)
  }

  function login(value: string) {
    writeToken(value)
    setAuthError(null)
    setToken(value)
  }

  function logout() {
    writeToken(null)
    setToken(null)
    setActivity(null)
    setSelectedId(null)
    setInteractions(null)
  }

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setActivityError(null)
    fetchCustomerActivity(token)
      .then((result) => {
        if (cancelled) return
        setActivity(result.customers)
        setSelectedId((current) => current ?? result.customers[0]?.customer_id ?? null)
      })
      .catch((err) => !cancelled && handleError(err, setActivityError, 'Klarte ikke å hente kundeaktivitet.'))
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (!token || !selectedId) return
    let cancelled = false
    setInteractions(null)
    setInteractionsError(null)
    fetchInteractions(token, selectedId)
      .then((result) => !cancelled && setInteractions(result.interactions))
      .catch((err) => !cancelled && handleError(err, setInteractionsError, 'Klarte ikke å hente spørsmålene.'))
    return () => {
      cancelled = true
    }
  }, [token, selectedId])

  async function patch(id: string, change: { reviewed?: boolean; advisor_note?: string }): Promise<boolean> {
    if (!token) return false
    try {
      const updated = await updateInteraction(token, id, change)
      const before = interactions?.find((item) => item.id === id)
      setInteractions((current) => current?.map((item) => (item.id === id ? updated : item)) ?? null)
      if (before && (before.reviewed_at === null) !== (updated.reviewed_at === null)) {
        const delta = updated.reviewed_at === null ? 1 : -1
        setActivity(
          (current) =>
            current?.map((customer) =>
              customer.customer_id === updated.customer_id
                ? { ...customer, unreviewed_count: Math.max(0, customer.unreviewed_count + delta) }
                : customer,
            ) ?? null,
        )
      }
      return true
    } catch (err) {
      handleError(err, setInteractionsError, 'Klarte ikke å lagre endringen.')
      return false
    }
  }

  const selected = activity?.find((customer) => customer.customer_id === selectedId) ?? null

  return (
    <div className="page">
      <div className="page-heading page-heading--row">
        <div>
          <p className="eyebrow">Rådgiver</p>
          <h2>Rådgiveroversikt – hva kundene har spurt AI-en om</h2>
        </div>
        {token && (
          <button type="button" className="btn btn--secondary" onClick={logout}>
            Logg ut
          </button>
        )}
      </div>

      {!token && <TokenForm onSubmit={login} error={authError} />}

      {token && (
        <div className="admin-layout">
          <aside className="admin-customers" aria-label="Kunder">
            {activityError && <p className="error-state">{activityError}</p>}
            {!activity && !activityError && <p className="loading-state">Henter kunder …</p>}
            {activity && activity.length === 0 && <p className="empty-state">Ingen kunder har spurt AI-en om noe ennå.</p>}
            <ul>
              {activity?.map((customer) => (
                <li key={customer.customer_id}>
                  <button
                    type="button"
                    className={`admin-customer${customer.customer_id === selectedId ? ' is-active' : ''}`}
                    onClick={() => setSelectedId(customer.customer_id)}
                  >
                    <span className="admin-customer__top">
                      <span className="admin-customer__name">{customer.customer_name}</span>
                      {customer.unreviewed_count > 0 && (
                        <span className="badge" title="Ikke gjennomgått">
                          {customer.unreviewed_count} nye
                        </span>
                      )}
                    </span>
                    <span className="muted-small">
                      {customer.risk_profile} · {customer.question_count} spørsmål · sist{' '}
                      {formatDateNo(customer.last_asked_at)}
                    </span>
                    {(customer.flags.length > 0 || customer.topics.length > 0) && (
                      <span className="chip-row">
                        {customer.flags.map((flag) => (
                          <FlagChip key={flag.flag} flag={flag.flag} count={flag.count} />
                        ))}
                        {customer.topics.slice(0, 3).map((topic) => (
                          <span key={topic.topic} className="chip">
                            {topic.topic}
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="admin-timeline">
            {selected && (
              <header className="admin-timeline__header">
                <h3>{selected.customer_name}</h3>
                <p className="muted-small">
                  {selected.customer_id} · Risikoprofil: {selected.risk_profile}
                </p>
              </header>
            )}
            {interactionsError && <p className="error-state">{interactionsError}</p>}
            {selectedId && !interactions && !interactionsError && <p className="loading-state">Henter spørsmål …</p>}
            {interactions && interactions.length === 0 && <p className="empty-state">Ingen spørsmål fra denne kunden.</p>}
            {interactions && interactions.length > 0 && (
              <ol className="timeline">
                {interactions.map((interaction) => (
                  <InteractionCard key={interaction.id} interaction={interaction} onPatch={patch} />
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
