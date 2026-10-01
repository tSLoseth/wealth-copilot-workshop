// Stores every AI question and answer so the advisor can follow up.
// Uses Neon Postgres when DATABASE_URL is set, otherwise an in-memory list
// (local development, tests). Logging must never break the customer's request.
import { randomUUID } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import { getCustomer } from '../data.js'
import type { AiInteraction, CustomerActivity, CustomerEvent, CustomerEventType } from '../reports/types.js'

export type NewInteraction = Omit<AiInteraction, 'id' | 'created_at' | 'customer_name' | 'reviewed_at' | 'advisor_note'>

const memory: AiInteraction[] = []

type Rows = Record<string, unknown>[]
let client: ReturnType<typeof neon<false, false>> | null | undefined
// Read lazily so the .env file loaded in index.ts is respected.
function db() {
  if (client === undefined) client = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null
  return client
}

let ready: Promise<void> | null = null
function ensureTable(): Promise<void> {
  const sql = db()
  if (!sql) return Promise.resolve()
  ready ??= sql`
    CREATE TABLE IF NOT EXISTS ai_interactions (
      id uuid PRIMARY KEY,
      customer_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      prompt text NOT NULL,
      status text NOT NULL,
      report_title text,
      summary text,
      customer_notice text,
      spec jsonb,
      metrics_used text[] NOT NULL DEFAULT '{}',
      topics text[] NOT NULL DEFAULT '{}',
      flags text[] NOT NULL DEFAULT '{}',
      tool_trace jsonb NOT NULL DEFAULT '[]',
      model text,
      latency_ms integer NOT NULL DEFAULT 0,
      reviewed_at timestamptz,
      advisor_note text
    )`.then(() => sql`CREATE INDEX IF NOT EXISTS ai_interactions_customer_idx ON ai_interactions (customer_id, created_at DESC)`).then(() => undefined)
  return ready
}

export const storageMode = () => (db() ? 'neon' : 'memory')

function customerName(customerId: string) {
  const c = getCustomer(customerId)
  return c ? `${c.first_name} ${c.last_name}` : customerId
}

function fromRow(row: Record<string, unknown>): AiInteraction {
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null)
  return {
    id: String(row.id),
    customer_id: String(row.customer_id),
    customer_name: customerName(String(row.customer_id)),
    created_at: iso(row.created_at)!,
    prompt: String(row.prompt),
    status: row.status as AiInteraction['status'],
    report_title: (row.report_title as string) ?? null,
    summary: (row.summary as string) ?? null,
    customer_notice: (row.customer_notice as string) ?? null,
    spec: (row.spec as AiInteraction['spec']) ?? null,
    metrics_used: (row.metrics_used as string[]) ?? [],
    topics: (row.topics as string[]) ?? [],
    flags: (row.flags as string[]) ?? [],
    tool_trace: (row.tool_trace as AiInteraction['tool_trace']) ?? [],
    model: (row.model as string) ?? null,
    latency_ms: Number(row.latency_ms ?? 0),
    reviewed_at: iso(row.reviewed_at),
    advisor_note: (row.advisor_note as string) ?? null,
  }
}

export async function logInteraction(entry: NewInteraction): Promise<string> {
  const id = randomUUID()
  const record: AiInteraction = { ...entry, id, created_at: new Date().toISOString(), customer_name: customerName(entry.customer_id), reviewed_at: null, advisor_note: null }
  const sql = db()
  if (!sql) {
    memory.unshift(record)
    return id
  }
  try {
    await ensureTable()
    await sql`
      INSERT INTO ai_interactions (id, customer_id, prompt, status, report_title, summary, customer_notice, spec, metrics_used, topics, flags, tool_trace, model, latency_ms)
      VALUES (${id}, ${entry.customer_id}, ${entry.prompt}, ${entry.status}, ${entry.report_title}, ${entry.summary}, ${entry.customer_notice},
              ${entry.spec ? JSON.stringify(entry.spec) : null}::jsonb, ${entry.metrics_used}, ${entry.topics}, ${entry.flags},
              ${JSON.stringify(entry.tool_trace)}::jsonb, ${entry.model}, ${entry.latency_ms})`
  } catch (err) {
    console.warn('Could not write interaction to Neon, keeping it in memory:', err instanceof Error ? err.message : err)
    memory.unshift(record)
  }
  return id
}

export async function listInteractions(customerId?: string): Promise<AiInteraction[]> {
  const fromMemory = memory.filter((i) => !customerId || i.customer_id === customerId)
  const sql = db()
  if (!sql) return fromMemory
  await ensureTable()
  const rows: Rows = customerId
    ? await sql`SELECT * FROM ai_interactions WHERE customer_id = ${customerId} ORDER BY created_at DESC LIMIT 200`
    : await sql`SELECT * FROM ai_interactions ORDER BY created_at DESC LIMIT 500`
  return [...fromMemory, ...rows.map(fromRow)].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function updateInteraction(id: string, patch: { reviewed?: boolean; advisor_note?: string }): Promise<AiInteraction | null> {
  const local = memory.find((i) => i.id === id)
  if (local) {
    if (patch.reviewed !== undefined) local.reviewed_at = patch.reviewed ? new Date().toISOString() : null
    if (patch.advisor_note !== undefined) local.advisor_note = patch.advisor_note
    return local
  }
  const sql = db()
  if (!sql) return null
  await ensureTable()
  const reviewedAt = patch.reviewed === undefined ? undefined : patch.reviewed ? new Date().toISOString() : null
  const rows: Rows = await sql`
    UPDATE ai_interactions SET
      reviewed_at = CASE WHEN ${reviewedAt === undefined} THEN reviewed_at ELSE ${reviewedAt ?? null}::timestamptz END,
      advisor_note = COALESCE(${patch.advisor_note ?? null}, advisor_note)
    WHERE id = ${id}
    RETURNING *`
  return rows[0] ? fromRow(rows[0]) : null
}

export async function customerActivity(): Promise<CustomerActivity[]> {
  const [all, events] = await Promise.all([listInteractions(), listEvents()])
  const ids = new Set([...all.map((i) => i.customer_id), ...events.map((e) => e.customer_id)])
  const count = (values: string[]) => {
    const counts = new Map<string, number>()
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }
  return [...ids]
    .map((customerId) => {
      const list = all.filter((i) => i.customer_id === customerId)
      const own = events.filter((e) => e.customer_id === customerId)
      const lastAsked = list[0]?.created_at ?? null
      const lastActive = [lastAsked, own[0]?.created_at].filter((d): d is string => !!d).sort().at(-1)!
      return {
        customer_id: customerId,
        customer_name: customerName(customerId),
        risk_profile: getCustomer(customerId)?.risk_profile ?? 'Ukjent',
        question_count: list.length,
        unreviewed_count: list.filter((i) => !i.reviewed_at).length,
        last_asked_at: lastAsked ?? lastActive,
        last_active_at: lastActive,
        report_view_count: own.filter((e) => e.event_type === 'report_view').length,
        copilot_question_count: own.filter((e) => e.event_type === 'copilot_chat').length,
        top_reports: count(own.filter((e) => e.event_type === 'report_view').map((e) => e.report_title ?? e.report_id ?? 'Ukjent')).slice(0, 5).map(([title, n]) => ({ title, count: n })),
        topics: count(list.flatMap((i) => i.topics)).map(([topic, n]) => ({ topic, count: n })),
        flags: count(list.flatMap((i) => i.flags)).map(([flag, n]) => ({ flag, count: n })),
      }
    })
    .sort((a, b) => b.last_active_at.localeCompare(a.last_active_at))
}

// --- Customer events: report views and Wealth Copilot chat questions --------

export type NewCustomerEvent = Omit<CustomerEvent, 'id' | 'created_at'>

const memoryEvents: CustomerEvent[] = []
const recentViews = new Map<string, number>()
const VIEW_DEDUPE_MS = 60_000

let eventsReady: Promise<void> | null = null
function ensureEventsTable(): Promise<void> {
  const sql = db()
  if (!sql) return Promise.resolve()
  eventsReady ??= sql`
    CREATE TABLE IF NOT EXISTS customer_events (
      id uuid PRIMARY KEY,
      customer_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      event_type text NOT NULL,
      report_id text,
      report_title text,
      report_source text,
      range text,
      prompt text,
      answer text,
      intent text
    )`.then(() => sql`CREATE INDEX IF NOT EXISTS customer_events_customer_idx ON customer_events (customer_id, created_at DESC)`).then(() => undefined)
  return eventsReady
}

function eventFromRow(row: Record<string, unknown>): CustomerEvent {
  return {
    id: String(row.id),
    customer_id: String(row.customer_id),
    created_at: new Date(row.created_at as string).toISOString(),
    event_type: row.event_type as CustomerEventType,
    report_id: (row.report_id as string) ?? null,
    report_title: (row.report_title as string) ?? null,
    report_source: (row.report_source as string) ?? null,
    range: (row.range as string) ?? null,
    prompt: (row.prompt as string) ?? null,
    answer: (row.answer as string) ?? null,
    intent: (row.intent as string) ?? null,
  }
}

// Fire-and-forget: never delays or breaks the customer's request.
export function logEvent(entry: NewCustomerEvent): void {
  if (entry.event_type === 'report_view') {
    // Switching the time range re-renders a report; count that as one view.
    const key = `${entry.customer_id}|${entry.report_id}`
    const last = recentViews.get(key)
    if (last && Date.now() - last < VIEW_DEDUPE_MS) return
    recentViews.set(key, Date.now())
  }
  const record: CustomerEvent = { ...entry, id: randomUUID(), created_at: new Date().toISOString() }
  const sql = db()
  if (!sql) {
    memoryEvents.unshift(record)
    return
  }
  ensureEventsTable()
    .then(() => sql`
      INSERT INTO customer_events (id, customer_id, event_type, report_id, report_title, report_source, range, prompt, answer, intent)
      VALUES (${record.id}, ${record.customer_id}, ${record.event_type}, ${record.report_id}, ${record.report_title}, ${record.report_source},
              ${record.range}, ${record.prompt}, ${record.answer}, ${record.intent})`)
    .catch((err) => {
      console.warn('Could not write event to Neon, keeping it in memory:', err instanceof Error ? err.message : err)
      memoryEvents.unshift(record)
    })
}

export async function listEvents(customerId?: string): Promise<CustomerEvent[]> {
  const fromMemory = memoryEvents.filter((e) => !customerId || e.customer_id === customerId)
  const sql = db()
  if (!sql) return fromMemory
  await ensureEventsTable()
  const rows: Rows = customerId
    ? await sql`SELECT * FROM customer_events WHERE customer_id = ${customerId} ORDER BY created_at DESC LIMIT 300`
    : await sql`SELECT * FROM customer_events ORDER BY created_at DESC LIMIT 1000`
  return [...fromMemory, ...rows.map(eventFromRow)].sort((a, b) => b.created_at.localeCompare(a.created_at))
}
