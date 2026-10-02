import { useEffect, useState } from 'react'
import { fetchAdminEvents } from '../api/adminClient'
import { ApiError, fetchCustomerActivity, fetchInteractions, updateInteraction } from '../api/client'
import type { AiInteraction, CustomerActivity, CustomerEvent } from '../api/reportTypes'
import CustomerSummary from '../components/admin/CustomerSummary'
import EventCard from '../components/admin/EventCard'
import FlagChip from '../components/admin/FlagChip'
import InteractionCard, { type InteractionPatch } from '../components/admin/InteractionCard'
import AdvisorCustomerPanel from '../components/admin/AdvisorCustomerPanel'
import { formatDateNo } from '../utils/format'

const TOKEN_KEY = 'wc.adminToken'

type Filter = 'all' | 'ai' | 'reports' | 'chat'

const FILTERS: { key: Filter; label: string; empty: string }[] = [
  { key: 'all', label: 'Alt', empty: 'Ingen aktivitet fra denne kunden ennå.' },
  { key: 'ai', label: 'AI-rapporter', empty: 'Kunden har ikke spurt AI-en om noen rapporter.' },
  { key: 'reports', label: 'Rapportvisninger', empty: 'Kunden har ikke åpnet noen rapporter.' },
  { key: 'chat', label: 'Chat', empty: 'Kunden har ikke stilt spørsmål i Wealth Copilot-chatten.' },
]

type TimelineEntry =
  | { kind: 'ai'; at: string; interaction: AiInteraction }
  | { kind: 'event'; at: string; event: CustomerEvent }

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

function buildTimeline(interactions: AiInteraction[], events: CustomerEvent[], filter: Filter): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  if (filter === 'all' || filter === 'ai') {
    for (const interaction of interactions) entries.push({ kind: 'ai', at: interaction.created_at, interaction })
  }
  for (const event of events) {
    const include =
      filter === 'all' ||
      (filter === 'reports' && event.event_type === 'report_view') ||
      (filter === 'chat' && event.event_type === 'copilot_chat')
    if (include) entries.push({ kind: 'event', at: event.created_at, event })
  }
  return entries.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

function filterCount(filter: Filter, interactions: AiInteraction[], events: CustomerEvent[]): number {
  if (filter === 'ai') return interactions.length
  if (filter === 'reports') return events.filter((event) => event.event_type === 'report_view').length
  if (filter === 'chat') return events.filter((event) => event.event_type === 'copilot_chat').length
  return interactions.length + events.length
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

function CustomerButton({
  customer,
  active,
  onSelect,
}: {
  customer: CustomerActivity
  active: boolean
  onSelect: () => void
}) {
  const topReports = customer.top_reports ?? []
  return (
    <button type="button" className={`admin-customer${active ? ' is-active' : ''}`} onClick={onSelect}>
      <span className="admin-customer__top">
        <span className="admin-customer__name">{customer.customer_name}</span>
        {customer.unreviewed_count > 0 && (
          <span className="badge" title="Ikke gjennomgått">
            {customer.unreviewed_count} nye
          </span>
        )}
      </span>
      <span className="muted-small">
        {customer.risk_profile} · sist aktiv {formatDateNo(customer.last_active_at ?? customer.last_asked_at)}
      </span>
      <span className="admin-customer__stats">
        <span>
          <strong>{customer.question_count}</strong> AI-spørsmål
        </span>
        <span>
          <strong>{customer.report_view_count ?? 0}</strong> rapportvisninger
        </span>
        <span>
          <strong>{customer.copilot_question_count ?? 0}</strong> chat-spørsmål
        </span>
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
      {topReports.length > 0 && (
        <span className="chip-row admin-customer__reports">
          {topReports.slice(0, 3).map((report) => (
            <span key={report.title} className="chip chip--muted chip--report">
              {report.title}
              {report.count > 1 && ` ×${report.count}`}
            </span>
          ))}
        </span>
      )}
    </button>
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
  const [events, setEvents] = useState<CustomerEvent[] | null>(null)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

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
    setEvents(null)
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
    setEvents(null)
    setEventsError(null)
    fetchInteractions(token, selectedId)
      .then((result) => !cancelled && setInteractions(result.interactions))
      .catch((err) => !cancelled && handleError(err, setInteractionsError, 'Klarte ikke å hente AI-spørsmålene.'))
    fetchAdminEvents(token, selectedId)
      .then((result) => !cancelled && setEvents(result.events))
      .catch((err) => !cancelled && handleError(err, setEventsError, 'Klarte ikke å hente rapportvisninger og chat.'))
    return () => {
      cancelled = true
    }
  }, [token, selectedId])

  async function patch(id: string, change: InteractionPatch): Promise<boolean> {
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
  const interactionsDone = interactions !== null || interactionsError !== null
  const eventsDone = events !== null || eventsError !== null
  const loaded = interactionsDone && eventsDone
  const loadedInteractions = interactions ?? []
  const loadedEvents = events ?? []
  const timeline = loaded ? buildTimeline(loadedInteractions, loadedEvents, filter) : []
  const activeFilter = FILTERS.find((item) => item.key === filter) ?? FILTERS[0]

  return (
    <div className="page">
      <div className="page-heading page-heading--row">
        <div>
          <p className="eyebrow">Rådgiver</p>
          <h2>Rådgiveroversikt – hva kundene har sett på og spurt om</h2>
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
            {activity && activity.length === 0 && (
              <p className="empty-state">Ingen kunder har åpnet rapporter eller spurt om noe ennå.</p>
            )}
            <ul>
              {activity?.map((customer) => (
                <li key={customer.customer_id}>
                  <CustomerButton
                    customer={customer}
                    active={customer.customer_id === selectedId}
                    onSelect={() => setSelectedId(customer.customer_id)}
                  />
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
            {selectedId && <AdvisorCustomerPanel customerId={selectedId} />}
            {selectedId && !loaded && <p className="loading-state">Henter aktivitet …</p>}
            {interactionsError && <p className="error-state">{interactionsError}</p>}
            {eventsError && <p className="error-state">{eventsError}</p>}

            {selectedId && loaded && (
              <>
                <CustomerSummary
                  customerName={selected?.customer_name ?? selectedId}
                  interactions={loadedInteractions}
                  events={loadedEvents}
                />

                <div className="admin-filter" role="group" aria-label="Filtrer aktivitet">
                  {FILTERS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={`chip chip--button${filter === item.key ? ' chip--active' : ''}`}
                      aria-pressed={filter === item.key}
                      onClick={() => setFilter(item.key)}
                    >
                      {item.label}
                      <span className="admin-filter__count">{filterCount(item.key, loadedInteractions, loadedEvents)}</span>
                    </button>
                  ))}
                </div>

                {timeline.length === 0 ? (
                  <p className="empty-state">{activeFilter.empty}</p>
                ) : (
                  <ol className="timeline">
                    {timeline.map((entry) =>
                      entry.kind === 'ai' ? (
                        <InteractionCard key={`ai-${entry.interaction.id}`} interaction={entry.interaction} onPatch={patch} />
                      ) : (
                        <EventCard key={`ev-${entry.event.id}`} event={entry.event} />
                      ),
                    )}
                  </ol>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
