// OSEBX from Yahoo Finance. Starts from the committed snapshot
// (data/benchmarks/yahoo.json) and tops it up with live data when Yahoo is
// reachable, so the app keeps working if Yahoo blocks or is down.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BenchmarkSource } from '../reports/types.js'

export const OSEBX_SYMBOL = 'OSEBX.OL'
export const OSEBX_NAME = 'Oslo Børs hovedindeks (OSEBX)'
const REFRESH_AFTER_MS = 60 * 60 * 1000

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const snapshot = JSON.parse(readFileSync(path.join(__dirname, '..', '..', '..', 'data', 'benchmarks', 'yahoo.json'), 'utf8')) as {
  fetched_at: string
  series: Record<string, { name: string; points: [string, number][] }>
}

let closes = new Map<string, number>(snapshot.series[OSEBX_SYMBOL].points)
let source: BenchmarkSource = {
  provider: 'Yahoo Finance',
  symbol: OSEBX_SYMBOL,
  name: OSEBX_NAME,
  mode: 'snapshot',
  fetched_at: snapshot.fetched_at,
  last_date: snapshot.series[OSEBX_SYMBOL].points.at(-1)![0],
}
let lastAttempt = 0
let inFlight: Promise<void> | null = null

async function refresh(): Promise<void> {
  lastAttempt = Date.now()
  const period1 = Math.floor(Date.parse(`${source.last_date}T00:00:00Z`) / 1000) - 14 * 86_400
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(OSEBX_SYMBOL)}?period1=${period1}&period2=${Math.floor(Date.now() / 1000)}&interval=1d`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (wealth-copilot-workshop)' }, signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const result = ((await res.json()) as { chart?: { result?: { timestamp?: number[]; indicators: { adjclose?: { adjclose: (number | null)[] }[]; quote: { close: (number | null)[] }[] } }[] } }).chart?.result?.[0]
    if (!result?.timestamp) throw new Error('no data')
    const values: (number | null)[] = result.indicators.adjclose?.[0]?.adjclose ?? result.indicators.quote[0].close
    const next = new Map(closes)
    result.timestamp.forEach((t: number, i: number) => {
      const v = values[i]
      if (v != null) next.set(new Date(t * 1000).toISOString().slice(0, 10), v)
    })
    closes = new Map([...next.entries()].sort((a, b) => a[0].localeCompare(b[0])))
    source = { ...source, mode: 'live', fetched_at: new Date().toISOString(), last_date: [...closes.keys()].at(-1)! }
  } catch (err) {
    console.warn(`Yahoo Finance unavailable (${err instanceof Error ? err.message : err}); using snapshot from ${snapshot.fetched_at}`)
  }
}

// Triggers a background refresh when the data is old; never blocks callers
// for longer than `waitMs`.
export async function ensureFresh(waitMs = 0): Promise<void> {
  if (process.env.VITEST || Date.now() - lastAttempt < REFRESH_AFTER_MS) return
  inFlight ??= refresh().finally(() => {
    inFlight = null
  })
  if (waitMs > 0) await Promise.race([inFlight, new Promise((r) => setTimeout(r, waitMs))])
}

export function osebxSource(): BenchmarkSource {
  return source
}

// OSEBX close on each of the given dates, carrying the last close over days
// Oslo Børs was closed.
export function osebxOn(dates: string[]): number[] {
  const sorted = [...closes.entries()]
  let j = 0
  let last = sorted[0][1]
  return dates.map((d) => {
    while (j < sorted.length && sorted[j][0] <= d) {
      last = sorted[j][1]
      j += 1
    }
    return last
  })
}
