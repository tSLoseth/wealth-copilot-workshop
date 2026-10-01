// Fetches daily index history from Yahoo Finance and stores a snapshot in
// data/benchmarks/yahoo.json. The generator uses it as real market factors,
// and the API falls back to it when live Yahoo data is unavailable.
//
// Run with `npm run fetch-market`. The snapshot is committed so data
// generation and deploys never depend on Yahoo being reachable.
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const START = Date.UTC(2014, 0, 1) / 1000

export const SERIES = [
  { symbol: 'OSEBX.OL', name: 'Oslo Børs hovedindeks (OSEBX)' },
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^IXIC', name: 'Nasdaq Composite' },
]

async function fetchSeries(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${START}&period2=${Math.floor(Date.now() / 1000)}&interval=1d&events=history`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (wealth-copilot-workshop)' } })
  if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`)
  const result = (await res.json()).chart?.result?.[0]
  if (!result) throw new Error(`${symbol}: no data`)
  const closes = result.indicators.adjclose?.[0]?.adjclose ?? result.indicators.quote[0].close
  const points = []
  result.timestamp.forEach((t, i) => {
    if (closes[i] == null) return
    points.push([new Date(t * 1000).toISOString().slice(0, 10), Number(closes[i].toFixed(4))])
  })
  return { currency: result.meta.currency, points }
}

const snapshot = { provider: 'Yahoo Finance', fetched_at: new Date().toISOString(), series: {} }
for (const s of SERIES) {
  const data = await fetchSeries(s.symbol)
  snapshot.series[s.symbol] = { name: s.name, ...data }
  console.log(`${s.symbol}: ${data.points.length} days, ${data.points[0][0]} – ${data.points.at(-1)[0]}`)
}
await mkdir(path.join(__dirname, 'benchmarks'), { recursive: true })
await writeFile(path.join(__dirname, 'benchmarks', 'yahoo.json'), `${JSON.stringify(snapshot)}\n`, 'utf8')
console.log('Wrote benchmarks/yahoo.json')
