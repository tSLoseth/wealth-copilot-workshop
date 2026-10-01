# Plan 1: Data og risikomotor – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Realistiske syntetiske markedsdata med korrelasjon, handelslogg og persona Jonas, pluss en deterministisk risikomotor med fire nye endepunkter (`analysis`, `stress`, `drift`, `what-if`).

**Architecture:** Datageneratoren får en faktormodell (marked, teknologi, rente) over ~3 år handelsdager og en handelslogg som beholdningene bygges fra. API-et får en ny modul `api/src/services/risk/` med rene funksjoner (matematikk, modellbygging, stress, drift, mål, datakvalitet, hva-om) som settes sammen i `analysis.ts` og eksponeres via `api/src/routes/risk.ts`.

**Tech Stack:** Node 18+ (ESM), Express 4, TypeScript 5, Vitest 2, supertest.

**Spec:** `docs/superpowers/specs/2026-10-01-risikorontgen-design.md` (seksjon 1 og 2)

## Global Constraints

- All data er syntetisk; generatoren skal være seedet og reproduserbar (`npm run generate-data` to ganger gir identiske filer).
- Datadato: `2026-09-04`. Historikk: handelsdager (man–fre) fra `2023-09-04`.
- Jonas: `CUST-00101`, 36 år, `Moderate`, `10-20 years`, mål `bolig` (600 000 kr, 2031) og `langsiktig` (null, 2046).
- Ny ticker `NRDAI` «Nordic AI ASA», Technology, Norway, ~30 handelsdager historikk.
- Risikoklasse (SRRI-intervaller for årlig vol): `<0,5 % → 1`, `<2 % → 2`, `<5 % → 3`, `<10 % → 4`, `<15 % → 5`, `<25 % → 6`, ellers `7`.
- Profilbånd: Conservative 2–3, Moderate 3–4, Balanced 4–5, Growth 5–5, Aggressive 6–7.
- Oppslagsvindu kovarians: 252 handelsdager; minimum 60 observasjoner, ellers proxy + `estimated: true`.
- «Dårlig år, 1 av 20» = 1,645 × σ × verdi (forventet avkastning 0).
- Gammelt `GET /customers/:id/risk` skal ikke endres.
- Kommentarer sparsomt; kun på kompleks kode (CLAUDE.md).
- Alle commits avsluttes med `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Kunde uten investeringer → alle risikoendepunkter svarer 200 med `risk_class: null` / tomme lister, ikke 500 (test i Task 7 og 9).
- Instrument med for kort historikk (NRDAI) eller helt uten markedsdata → estimert via proxy, aldri NaN i responsen (test i Task 4).
- Hva-om med beløp større enn gruppens verdi, `from === to`, ukjent gruppe eller negativt beløp → kappes eller 400, aldri negative beholdninger (test i Task 8).
- Utdatert datadato → `stale: true` (test i Task 7).
- Kunde med flere rader i samme ticker → aggregeres, ikke dobbelttelt i kovarians (test i Task 4).

---

## File Structure

```
data/instruments.mjs              + NEW_LISTINGS (NRDAI)
data/generate.mjs                 faktormodell, 3 år handelsdager, trades.json, Jonas
data/trades.json                  NY (generert)
data/inspect-jonas.mjs            NY: skriver nøkkeltall for Jonas (kalibrering)
api/src/types.ts                  + Goal, Trade, Customer.goals?
api/src/data.ts                   + trades, getTradesFor, getTradingDates, getDataDate, getPriceOn
api/src/services/risk/math.ts            kovarians, porteføljevol, risikobidrag
api/src/services/risk/riskClass.ts       klasse, profilbånd, normal svingning
api/src/services/risk/model.ts           grupper, proxy, buildRiskModel
api/src/services/risk/stress.ts          scenarioer, runStress
api/src/services/risk/drift.ts           computeDrift (ren) + driftForCustomer
api/src/services/risk/goals.ts           assessGoals
api/src/services/risk/dataQuality.ts     assessDataQuality
api/src/services/risk/analysis.ts        analyzeInputs, analyzeCustomer
api/src/services/risk/whatIf.ts          applyMoves, parseMoves, whatIfForCustomer
api/src/routes/risk.ts                   router
api/src/routes/customers.ts              monterer risk-router
api/src/openapi.yaml                     nye paths + schemas
api/tests/data.test.ts                   NY
api/tests/risk-math.test.ts              NY
api/tests/risk-model.test.ts             NY
api/tests/risk-stress.test.ts            NY
api/tests/risk-drift.test.ts             NY
api/tests/risk-analysis.test.ts          NY
api/tests/risk-whatif.test.ts            NY
api/tests/risk-routes.test.ts            NY
```

---

### Task 1: Datagenerator med faktormodell, handelslogg og Jonas

**Files:**
- Modify: `data/instruments.mjs` (legg til `NEW_LISTINGS` nederst)
- Modify: `data/generate.mjs` (erstatt seksjonene «Market data» og «Investments», legg til Jonas og trades)
- Create: `data/inspect-jonas.mjs`
- Modify: `api/src/types.ts`, `api/src/data.ts`
- Modify: `package.json` (script `inspect-jonas`)
- Test: `api/tests/data.test.ts`

**Interfaces:**
- Produces (types.ts):
  ```ts
  export interface Goal { id: string; name: string; target_amount: number | null; target_year: number }
  export interface Trade { trade_id: string; customer_id: string; account_id: string; ticker: string; date: string; side: 'buy'; quantity: number; price: number }
  // Customer får: goals?: Goal[]
  ```
- Produces (data.ts):
  ```ts
  export const trades: Trade[]
  export function getTradesFor(customerId: string): Trade[]          // sortert på dato
  export function getTradingDates(): string[]                          // unike datoer i market_data, sortert
  export function getDataDate(): string                                // siste handelsdag
  export function getPriceOn(ticker: string, date: string): number | null  // siste pris på eller før date
  ```

- [ ] **Step 1: Skriv feilende datatest**

`api/tests/data.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { customers, getDataDate, getInvestmentsFor, getMarketDataFor, getPriceOn, getTradesFor, getTradingDates } from '../src/data.js'

const JONAS = 'CUST-00101'

describe('syntetiske data', () => {
  it('har datadato 2026-09-04 og bare handelsdager', () => {
    expect(getDataDate()).toBe('2026-09-04')
    const dates = getTradingDates()
    expect(dates[0]).toBe('2023-09-04')
    expect(dates.length).toBeGreaterThan(780)
    expect(dates.every((d) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()))).toBe(true)
  })

  it('har Jonas med profil og mål', () => {
    const jonas = customers.find((c) => c.customer_id === JONAS)
    expect(jonas).toMatchObject({ first_name: 'Jonas', last_name: 'Lie', age: 36, risk_profile: 'Moderate' })
    expect(jonas?.goals?.map((g) => g.id)).toEqual(['bolig', 'langsiktig'])
  })

  it('NRDAI har rundt 30 handelsdager historikk', () => {
    const history = getMarketDataFor('NRDAI')
    expect(history.length).toBeGreaterThanOrEqual(28)
    expect(history.length).toBeLessThanOrEqual(31)
  })

  it('beholdninger stemmer med handelsloggen for alle kunder', () => {
    for (const customer of customers) {
      const trades = getTradesFor(customer.customer_id)
      for (const inv of getInvestmentsFor(customer.customer_id)) {
        const lots = trades.filter((t) => t.ticker === inv.ticker && t.account_id === inv.account_id)
        const qty = lots.reduce((s, t) => s + t.quantity, 0)
        expect(qty).toBeCloseTo(inv.quantity, 6)
        const avg = lots.reduce((s, t) => s + t.quantity * t.price, 0) / qty
        expect(inv.purchase_price).toBeCloseTo(avg, 1)
        expect(inv.current_price).toBe(getPriceOn(inv.ticker, getDataDate()))
      }
    }
  })

  it('kjøp skjer til markedsprisen på handelsdagen', () => {
    for (const trade of getTradesFor(JONAS)) {
      expect(trade.price).toBe(getPriceOn(trade.ticker, trade.date))
    }
  })

  it('teknologi og globalt fond er positivt korrelert', () => {
    const tail = (t: string) => getMarketDataFor(t).slice(-252).map((p) => p.daily_return)
    const a = tail('USTK'), b = tail('TECHF')
    const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length
    const ma = mean(a), mb = mean(b)
    const cov = a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0)
    const corr = cov / Math.sqrt(a.reduce((s, v) => s + (v - ma) ** 2, 0) * b.reduce((s, v) => s + (v - mb) ** 2, 0))
    expect(corr).toBeGreaterThan(0.5)
  })
})
```

- [ ] **Step 2: Kjør test, forvent feil**

Run: `npm run test --workspace api -- data.test.ts`
Expected: FAIL (`getTradesFor` / `getDataDate` finnes ikke).

- [ ] **Step 3: Legg til `NEW_LISTINGS` i `data/instruments.mjs`**

Legg til nederst:
```js
// Newly listed instruments with short price history. Excluded from the random
// holdings pool so only the scripted persona owns them.
export const NEW_LISTINGS = [
  { ticker: 'NRDAI', name: 'Nordic AI ASA', sector: 'Technology', geography: 'Norway', basePrice: 48, assetType: 'Equity', listedTradingDays: 30 },
]
```

- [ ] **Step 4: Skriv om generatoren**

I `data/generate.mjs`:

1. Endre import: `import { ALL_INSTRUMENTS, NEW_LISTINGS } from './instruments.mjs'`. Fjern `MARKET_DATA_DAYS`.
2. Erstatt hele blokken `// --- Market data ---` (fra `const today = ...` til og med `latestPriceByTicker.set(...)`-løkken) med:

```js
// --- Market data -----------------------------------------------------------
// Daily returns follow a simple factor model so instruments co-move:
//   r = beta_m * Market + beta_t * Tech + beta_r * Rates + idio * noise
// Factor drifts are scripted: a tech rally from ~day 120 and a sharp
// correction over the last 20 trading days before the data date.
const DATA_DATE = new Date('2026-09-04T00:00:00Z')
const HISTORY_START = new Date('2023-09-04T00:00:00Z')
const CORRECTION_DAYS = 20
const today = DATA_DATE

function tradingDays(start, end) {
  const days = []
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const weekday = d.getUTCDay()
    if (weekday !== 0 && weekday !== 6) days.push(d.toISOString().slice(0, 10))
  }
  return days
}
const DATES = tradingDays(HISTORY_START, DATA_DATE)
const N = DATES.length

const marketRng = mulberry32(4242)
function gaussian(random) {
  let u = 0
  while (u === 0) u = random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random())
}

const FACTOR_VOL = { m: 0.009, t: 0.011, r: 0.0018 }
function factorDrift(index) {
  const inCorrection = index >= N - CORRECTION_DAYS
  return {
    m: inCorrection ? -0.0025 : 0.00035,
    t: inCorrection ? -0.0045 : index >= 120 ? 0.001 : 0,
    r: index < 250 ? -0.0002 : 0.0001,
  }
}
const factors = DATES.map((_, index) => {
  const drift = factorDrift(index)
  return {
    m: drift.m + FACTOR_VOL.m * gaussian(marketRng),
    t: drift.t + FACTOR_VOL.t * gaussian(marketRng),
    r: drift.r + FACTOR_VOL.r * gaussian(marketRng),
  }
})

const SECTOR_MARKET_BETA = {
  Energy: 0.8, 'Consumer Staples': 0.6, Industrials: 1.0, Healthcare: 0.7,
  Financials: 1.1, Materials: 1.0, Utilities: 0.6, 'Consumer Discretionary': 1.1,
}
const EXPOSURE_OVERRIDES = {
  TECHF: { m: 1.0, t: 1.0, r: 0, idio: 0.003 },
  GLBEQ: { m: 1.0, t: 0.25, r: 0, idio: 0.0025 },
  NRDEQ: { m: 1.0, t: 0.1, r: 0, idio: 0.003 },
  EMGEQ: { m: 1.2, t: 0.1, r: 0, idio: 0.004 },
  GRNEF: { m: 0.9, t: 0, r: 0, idio: 0.006 },
  MFBAL: { m: 0.55, t: 0.1, r: 1.5, idio: 0.002 },
  MFCON: { m: 0.25, t: 0, r: 2.5, idio: 0.0015 },
  MFPEN: { m: 0.8, t: 0.1, r: 0, idio: 0.0025 },
  GOVNO: { m: 0, t: 0, r: 3.0, idio: 0.0008 },
  GOVEU: { m: 0, t: 0, r: 2.5, idio: 0.0008 },
  CORPB: { m: 0.1, t: 0, r: 1.8, idio: 0.0008 },
  NRDAI: { m: 1.3, t: 1.6, r: 0, idio: 0.022 },
}
function exposure(instrument) {
  if (EXPOSURE_OVERRIDES[instrument.ticker]) return EXPOSURE_OVERRIDES[instrument.ticker]
  if (instrument.assetType === 'Cash') return { m: 0, t: 0, r: 0, idio: 0 }
  if (instrument.sector === 'Technology') return { m: 1.1, t: 1.3, r: 0, idio: 0.014 }
  return { m: SECTOR_MARKET_BETA[instrument.sector] ?? 1.0, t: 0, r: 0, idio: 0.012 }
}

const MARKET_INSTRUMENTS = [...ALL_INSTRUMENTS, ...NEW_LISTINGS]
const marketData = []
const priceByTicker = new Map()
for (const instrument of MARKET_INSTRUMENTS) {
  const exp = exposure(instrument)
  const firstIndex = instrument.listedTradingDays ? N - instrument.listedTradingDays : 0
  const prices = new Array(N).fill(null)
  let price = instrument.basePrice
  for (let index = firstIndex; index < N; index += 1) {
    const f = factors[index]
    const noise = gaussian(marketRng)
    const dailyReturn = index === firstIndex ? 0 : exp.m * f.m + exp.t * f.t + exp.r * f.r + exp.idio * noise
    price = Math.max(0.5, price * (1 + dailyReturn))
    const rounded = Number(price.toFixed(2))
    prices[index] = rounded
    marketData.push({
      ticker: instrument.ticker,
      date: DATES[index],
      price: rounded,
      daily_return: Number((dailyReturn * 100).toFixed(4)),
      sector: instrument.sector,
      geography: instrument.geography,
    })
  }
  priceByTicker.set(instrument.ticker, prices)
}
const latestPrice = (ticker) => priceByTicker.get(ticker)[N - 1]
const priceAtIndex = (ticker, index) => priceByTicker.get(ticker)[index]
function indexOnOrAfter(date) {
  const index = DATES.findIndex((d) => d >= date)
  if (index === -1) throw new Error(`No trading day on or after ${date}`)
  return index
}
```

3. Rett etter kunde-løkken og før `// --- Accounts ---` legges ingenting til. Rett **etter** konto-løkken (`for (const customer of customers) { ... accountsByCustomer.set(...) }`) legg til Jonas:

```js
// --- Persona: Jonas (task B) ---------------------------------------------
const JONAS_ID = 'CUST-00101'
customers.push({
  customer_id: JONAS_ID,
  first_name: 'Jonas',
  last_name: 'Lie',
  age: 36,
  country: 'Norway',
  risk_profile: 'Moderate',
  investment_horizon: '10-20 years',
  annual_income: 780000,
  customer_since: '2019-04-02',
  goals: [
    { id: 'bolig', name: 'Egenkapital til større bolig', target_amount: 600000, target_year: 2031 },
    { id: 'langsiktig', name: 'Langsiktig sparing', target_amount: null, target_year: 2046 },
  ],
})
{
  const list = [
    addAccount(JONAS_ID, 'Current Account', 'NOK', 45000),
    addAccount(JONAS_ID, 'Savings', 'NOK', 120000),
    addAccount(JONAS_ID, 'Investment Account', 'NOK', 0),
  ]
  accountsByCustomer.set(JONAS_ID, { list, hasInvestmentAccount: true, hasPension: false })
}
```

4. Erstatt hele blokken `// --- Investments ---` (til og med løkken som lager `investments`) med:

```js
// --- Trades & investments -------------------------------------------------
// Every holding is built from 1-4 buy lots at historical market prices, so
// purchase_price is a true average cost and drift can be reconstructed.
const tradeRng = mulberry32(777)
const tradeInt = (min, max) => Math.floor(tradeRng() * (max - min + 1)) + min
const trades = []
let tradeCounter = 1
function addTrade(customerId, accountId, ticker, index, quantity) {
  trades.push({
    trade_id: `TRD-${String(tradeCounter).padStart(7, '0')}`,
    customer_id: customerId,
    account_id: accountId,
    ticker,
    date: DATES[index],
    side: 'buy',
    quantity,
    price: priceAtIndex(ticker, index),
  })
  tradeCounter += 1
}

function splitQuantity(total, lots) {
  const parts = []
  let remaining = total
  for (let left = lots; left > 1; left -= 1) {
    const max = remaining - (left - 1)
    const part = Math.min(max, Math.max(1, Math.round((remaining / left) * (0.5 + tradeRng()))))
    parts.push(part)
    remaining -= part
  }
  parts.push(remaining)
  return parts
}

const investments = []
let investmentCounter = 1
function addInvestment(customerId, accountId, instrument) {
  const lots = trades.filter((t) => t.customer_id === customerId && t.account_id === accountId && t.ticker === instrument.ticker)
  const quantity = Number(lots.reduce((s, t) => s + t.quantity, 0).toFixed(4))
  const cost = lots.reduce((s, t) => s + t.quantity * t.price, 0)
  investments.push({
    investment_id: `INV-${String(investmentCounter).padStart(6, '0')}`,
    customer_id: customerId,
    account_id: accountId,
    asset_type: instrument.assetType,
    ticker: instrument.ticker,
    name: instrument.name,
    quantity,
    purchase_price: Number((cost / quantity).toFixed(2)),
    current_price: latestPrice(instrument.ticker),
    currency: 'NOK',
    sector: instrument.sector,
    geography: instrument.geography,
  })
  investmentCounter += 1
}

for (const customer of customers) {
  if (customer.customer_id === JONAS_ID) continue
  const info = accountsByCustomer.get(customer.customer_id)
  if (!info.hasInvestmentAccount && !info.hasPension) continue

  const investmentAccounts = info.list.filter(
    (account) => account.account_type === 'Investment Account' || account.account_type === 'Pension',
  )
  const holdingCount = int(3, 10)
  const chosen = new Set()
  while (chosen.size < holdingCount) {
    chosen.add(pick(ALL_INSTRUMENTS).ticker)
  }
  let holdingIndex = 0
  for (const ticker of chosen) {
    const instrument = ALL_INSTRUMENTS.find((i) => i.ticker === ticker)
    const accountId = investmentAccounts[holdingIndex % investmentAccounts.length].account_id
    const quantity = instrument.assetType === 'Cash' ? int(5000, 150000) : int(2, 400)
    if (instrument.assetType === 'Cash') {
      addTrade(customer.customer_id, accountId, ticker, tradeInt(0, N - 1), quantity)
    } else {
      const lots = Math.min(quantity, tradeInt(1, 4))
      const indices = Array.from({ length: lots }, () => tradeInt(0, N - 1)).sort((a, b) => a - b)
      splitQuantity(quantity, lots).forEach((part, i) => addTrade(customer.customer_id, accountId, ticker, indices[i], part))
    }
    addInvestment(customer.customer_id, accountId, instrument)
    holdingIndex += 1
  }
}

// Jonas: started balanced in 2023, then gradually added technology.
const JONAS_PLAN = [
  { date: '2023-09-15', ticker: 'MFBAL', amount: 150000 },
  { date: '2023-09-15', ticker: 'GLBEQ', amount: 100000 },
  { date: '2023-09-15', ticker: 'CORPB', amount: 180000 },
  { date: '2023-09-15', ticker: 'CASHNOK', amount: 40000 },
  { date: '2024-03-12', ticker: 'USTK', amount: 40000 },
  { date: '2024-06-10', ticker: 'TECHF', amount: 35000 },
  { date: '2024-11-20', ticker: 'OSLC', amount: 30000 },
  { date: '2025-02-14', ticker: 'USTK', amount: 35000 },
  { date: '2025-05-08', ticker: 'TECHF', amount: 40000 },
  { date: '2025-09-22', ticker: 'USTK', amount: 25000 },
  { date: '2026-08-10', ticker: 'NRDAI', amount: 25000 },
]
for (let month = new Date(Date.UTC(2023, 9, 15)); month <= new Date(Date.UTC(2026, 7, 15)); month.setUTCMonth(month.getUTCMonth() + 1)) {
  JONAS_PLAN.push({ date: month.toISOString().slice(0, 10), ticker: 'GLBEQ', amount: 5000 })
}
{
  const accountId = accountsByCustomer.get(JONAS_ID).list.find((a) => a.account_type === 'Investment Account').account_id
  const plan = [...JONAS_PLAN].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  for (const step of plan) {
    const index = indexOnOrAfter(step.date)
    const price = priceAtIndex(step.ticker, index)
    const quantity = step.ticker === 'CASHNOK' ? step.amount : Math.max(1, Math.round(step.amount / price))
    addTrade(JONAS_ID, accountId, step.ticker, index, quantity)
  }
  for (const ticker of new Set(plan.map((s) => s.ticker))) {
    addInvestment(JONAS_ID, accountId, MARKET_INSTRUMENTS.find((i) => i.ticker === ticker))
  }
}
trades.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.trade_id < b.trade_id ? -1 : 1))
```

5. I `// --- Write output ---` legg til `await writeJson('trades.json', trades)` etter `investments.json`.

- [ ] **Step 5: Utvid typer og datalaster**

`api/src/types.ts` – legg til og utvid:
```ts
export interface Goal {
  id: string
  name: string
  target_amount: number | null
  target_year: number
}

export interface Trade {
  trade_id: string
  customer_id: string
  account_id: string
  ticker: string
  date: string
  side: 'buy'
  quantity: number
  price: number
}
```
og i `Customer`: `goals?: Goal[]`.

`api/src/data.ts` – importer `Trade`, last `trades.json`, og legg til nederst:
```ts
export const trades: Trade[] = loadJson<Trade[]>('trades.json')

const tradesByCustomer = new Map<string, Trade[]>()
for (const trade of trades) {
  const list = tradesByCustomer.get(trade.customer_id) ?? []
  list.push(trade)
  tradesByCustomer.set(trade.customer_id, list)
}
const tradingDates = [...new Set(marketData.map((p) => p.date))].sort()

export function getTradesFor(customerId: string): Trade[] {
  return tradesByCustomer.get(customerId) ?? []
}
export function getTradingDates(): string[] {
  return tradingDates
}
export function getDataDate(): string {
  return tradingDates[tradingDates.length - 1]
}
export function getPriceOn(ticker: string, date: string): number | null {
  const history = getMarketDataFor(ticker)
  let price: number | null = null
  for (const point of history) {
    if (point.date > date) break
    price = point.price
  }
  return price
}
```

- [ ] **Step 6: Lag kalibreringsskript**

`data/inspect-jonas.mjs` (kjøres etter generering; skriver vekter og vol for Jonas med samme formler som API-et):
```js
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const load = (f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8'))
const investments = load('investments.json').filter((i) => i.customer_id === 'CUST-00101')
const market = load('market_data.json')
const byTicker = new Map()
for (const p of market) (byTicker.get(p.ticker) ?? byTicker.set(p.ticker, []).get(p.ticker)).push(p)

const total = investments.reduce((s, i) => s + i.quantity * i.current_price, 0)
const dates = [...new Set(market.map((p) => p.date))].sort().slice(-252)
const series = investments.map((i) => {
  const m = new Map((byTicker.get(i.ticker) ?? []).map((p) => [p.date, p.daily_return / 100]))
  const proxy = new Map((byTicker.get('TECHF') ?? []).map((p) => [p.date, p.daily_return / 100]))
  const own = dates.map((d) => m.get(d))
  const obs = own.filter((v) => v !== undefined).length
  return obs >= 60 || i.asset_type === 'Cash' ? own.map((v) => v ?? 0) : dates.map((d) => proxy.get(d) ?? 0)
})
const mean = (x) => x.reduce((s, v) => s + v, 0) / x.length
const cov = (a, b) => { const ma = mean(a), mb = mean(b); return a.reduce((s, v, k) => s + (v - ma) * (b[k] - mb), 0) / (a.length - 1) * 252 }
const w = investments.map((i) => (i.quantity * i.current_price) / total)
let variance = 0
const sigmaW = series.map((a) => series.reduce((s, b, j) => s + cov(a, b) * w[j], 0))
w.forEach((wi, i) => { variance += wi * sigmaW[i] })
const vol = Math.sqrt(variance)
console.log(`Total: ${Math.round(total)} NOK, annual vol: ${(vol * 100).toFixed(1)} %`)
investments.forEach((inv, i) => {
  console.log(`${inv.ticker.padEnd(8)} money ${(w[i] * 100).toFixed(1).padStart(5)} %  risk ${((w[i] * sigmaW[i]) / variance * 100).toFixed(1).padStart(5)} %  sector ${inv.sector}`)
})
```
I `package.json` (rot) under `scripts`: `"inspect-jonas": "node data/inspect-jonas.mjs"`.

- [ ] **Step 7: Generer og kalibrer**

Run: `npm run generate-data; npm run inspect-jonas`

Mål (alle må holde):
- årlig vol 10,0–14,9 % (klasse 5)
- Technology-pengeandel (USTK+TECHF+OSLC+NRDAI) 30–50 %
- Technology-risikoandel ≥ 1,4 × pengeandelen

Hvis vol ≥ 15 %: skaler ned tek-beløpene i `JONAS_PLAN` (USTK/TECHF/OSLC) med 20 % og kjør igjen. Hvis vol < 10 %: skaler dem opp med 20 %. Gjenta til målene holder. Skriv endelige tall i commit-meldingen.

- [ ] **Step 8: Kjør datatest og hele testsuiten**

Run: `npm run test --workspace api`
Expected: PASS for `data.test.ts` og alle eksisterende tester i `api.test.ts`.

Kjør også `npm run generate-data` to ganger og `git diff --stat data/` mellom dem → ingen endring (reproduserbar).

- [ ] **Step 9: Commit**

```bash
git add data/ api/src/types.ts api/src/data.ts api/tests/data.test.ts package.json
git commit -m "Faktormodell, handelslogg og persona Jonas i syntetiske data"
```

---

### Task 2: Risikomatematikk og risikoklasse

**Files:**
- Create: `api/src/services/risk/math.ts`, `api/src/services/risk/riskClass.ts`
- Test: `api/tests/risk-math.test.ts`

**Interfaces:**
- Produces (math.ts):
  ```ts
  export const TRADING_DAYS_PER_YEAR = 252
  export function mean(values: number[]): number
  export function stdDev(values: number[]): number                       // sample (n-1)
  export function covarianceMatrix(series: number[][]): number[][]       // sample, same unit as input
  export function portfolioVolatility(weights: number[], cov: number[][]): number
  export function riskContributionShares(weights: number[], cov: number[][]): number[]  // sum = 1 (or all 0)
  ```
- Produces (riskClass.ts):
  ```ts
  export type RiskClass = 1 | 2 | 3 | 4 | 5 | 6 | 7
  export type ProfileFit = 'innenfor' | 'over' | 'under' | 'ukjent'
  export interface ProfileBand { min: RiskClass; max: RiskClass; label: string }
  export const PROFILE_BANDS: Record<string, ProfileBand>
  export function riskClassFromVol(annualVol: number): RiskClass
  export function profileFit(profile: string, riskClass: RiskClass): ProfileFit
  export interface NormalSwing { typical_year_nok: number; bad_year_nok: number; bad_year_pct: number }
  export function normalSwing(totalValue: number, annualVol: number): NormalSwing
  ```

- [ ] **Step 1: Skriv feilende tester**

`api/tests/risk-math.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { covarianceMatrix, mean, portfolioVolatility, riskContributionShares, stdDev } from '../src/services/risk/math.js'
import { normalSwing, profileFit, riskClassFromVol } from '../src/services/risk/riskClass.js'

describe('math', () => {
  it('mean og stdDev', () => {
    expect(mean([1, 2, 3])).toBe(2)
    expect(stdDev([1, 2, 3])).toBeCloseTo(1, 10)
    expect(stdDev([5])).toBe(0)
  })

  it('kovariansmatrise er symmetrisk med varians på diagonalen', () => {
    const cov = covarianceMatrix([[1, 2, 3], [2, 4, 6], [3, 2, 1]])
    expect(cov[0][0]).toBeCloseTo(1, 10)
    expect(cov[0][1]).toBeCloseTo(2, 10)
    expect(cov[1][0]).toBeCloseTo(2, 10)
    expect(cov[0][2]).toBeCloseTo(-1, 10)
  })

  it('ukorrelerte like aktiva halverer variansen', () => {
    const cov = [[0.04, 0], [0, 0.04]]
    expect(portfolioVolatility([0.5, 0.5], cov)).toBeCloseTo(0.2 / Math.SQRT2, 10)
    expect(riskContributionShares([0.5, 0.5], cov)).toEqual([0.5, 0.5])
  })

  it('perfekt korrelerte aktiva gir ingen diversifisering', () => {
    const cov = [[0.04, 0.04], [0.04, 0.04]]
    expect(portfolioVolatility([0.5, 0.5], cov)).toBeCloseTo(0.2, 10)
  })

  it('risikobidrag følger varians, ikke vekt', () => {
    const shares = riskContributionShares([0.5, 0.5], [[0.04, 0], [0, 0.01]])
    expect(shares[0]).toBeCloseTo(0.8, 10)
    expect(shares[1]).toBeCloseTo(0.2, 10)
  })

  it('bidrag summerer til 1 for en generell matrise', () => {
    const cov = [[0.09, 0.02, 0.01], [0.02, 0.04, 0.005], [0.01, 0.005, 0.01]]
    const shares = riskContributionShares([0.2, 0.3, 0.5], cov)
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
  })

  it('null vekter gir null bidrag', () => {
    expect(riskContributionShares([0, 0], [[0.04, 0], [0, 0.01]])).toEqual([0, 0])
    expect(portfolioVolatility([], [])).toBe(0)
  })
})

describe('riskClass', () => {
  it('følger SRRI-grensene', () => {
    expect(riskClassFromVol(0)).toBe(1)
    expect(riskClassFromVol(0.004)).toBe(1)
    expect(riskClassFromVol(0.005)).toBe(2)
    expect(riskClassFromVol(0.0499)).toBe(3)
    expect(riskClassFromVol(0.05)).toBe(4)
    expect(riskClassFromVol(0.12)).toBe(5)
    expect(riskClassFromVol(0.15)).toBe(6)
    expect(riskClassFromVol(0.25)).toBe(7)
  })

  it('sammenligner med profilbånd', () => {
    expect(profileFit('Moderate', 5)).toBe('over')
    expect(profileFit('Moderate', 4)).toBe('innenfor')
    expect(profileFit('Moderate', 2)).toBe('under')
    expect(profileFit('Ukjent', 4)).toBe('ukjent')
  })

  it('normal svingning i kroner', () => {
    expect(normalSwing(1_000_000, 0.12)).toEqual({ typical_year_nok: 120000, bad_year_nok: 197400, bad_year_pct: 19.7 })
    expect(normalSwing(0, 0)).toEqual({ typical_year_nok: 0, bad_year_nok: 0, bad_year_pct: 0 })
  })
})
```

- [ ] **Step 2: Kjør, forvent feil**

Run: `npm run test --workspace api -- risk-math`
Expected: FAIL (moduler finnes ikke).

- [ ] **Step 3: Implementer `math.ts`**

```ts
export const TRADING_DAYS_PER_YEAR = 252

export function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1))
}

function covariance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 2) return 0
  const ma = mean(a.slice(0, n))
  const mb = mean(b.slice(0, n))
  let sum = 0
  for (let i = 0; i < n; i += 1) sum += (a[i] - ma) * (b[i] - mb)
  return sum / (n - 1)
}

export function covarianceMatrix(series: number[][]): number[][] {
  return series.map((a) => series.map((b) => covariance(a, b)))
}

function marginal(weights: number[], cov: number[][]): number[] {
  return weights.map((_, i) => cov[i].reduce((sum, c, j) => sum + c * weights[j], 0))
}

export function portfolioVolatility(weights: number[], cov: number[][]): number {
  const variance = marginal(weights, cov).reduce((sum, m, i) => sum + weights[i] * m, 0)
  return Math.sqrt(Math.max(0, variance))
}

// Euler decomposition: w_i * (Σw)_i / σ² – shares sum to exactly 1.
export function riskContributionShares(weights: number[], cov: number[][]): number[] {
  const m = marginal(weights, cov)
  const variance = m.reduce((sum, v, i) => sum + weights[i] * v, 0)
  if (variance <= 0) return weights.map(() => 0)
  return weights.map((w, i) => (w * m[i]) / variance)
}
```

- [ ] **Step 4: Implementer `riskClass.ts`**

```ts
export type RiskClass = 1 | 2 | 3 | 4 | 5 | 6 | 7
export type ProfileFit = 'innenfor' | 'over' | 'under' | 'ukjent'

export interface ProfileBand {
  min: RiskClass
  max: RiskClass
  label: string
}

export const PROFILE_BANDS: Record<string, ProfileBand> = {
  Conservative: { min: 2, max: 3, label: 'Forsiktig' },
  Moderate: { min: 3, max: 4, label: 'Moderat' },
  Balanced: { min: 4, max: 5, label: 'Balansert' },
  Growth: { min: 5, max: 5, label: 'Vekst' },
  Aggressive: { min: 6, max: 7, label: 'Offensiv' },
}

const SRRI_UPPER_BOUNDS = [0.005, 0.02, 0.05, 0.1, 0.15, 0.25]

export function riskClassFromVol(annualVol: number): RiskClass {
  const index = SRRI_UPPER_BOUNDS.findIndex((bound) => annualVol < bound)
  return (index === -1 ? 7 : index + 1) as RiskClass
}

export function profileFit(profile: string, riskClass: RiskClass): ProfileFit {
  const band = PROFILE_BANDS[profile]
  if (!band) return 'ukjent'
  if (riskClass > band.max) return 'over'
  if (riskClass < band.min) return 'under'
  return 'innenfor'
}

export interface NormalSwing {
  typical_year_nok: number
  bad_year_nok: number
  bad_year_pct: number
}

const ONE_IN_TWENTY_Z = 1.645

export function normalSwing(totalValue: number, annualVol: number): NormalSwing {
  return {
    typical_year_nok: Math.round(totalValue * annualVol),
    bad_year_nok: Math.round(totalValue * annualVol * ONE_IN_TWENTY_Z),
    bad_year_pct: Number((annualVol * ONE_IN_TWENTY_Z * 100).toFixed(1)),
  }
}
```

- [ ] **Step 5: Kjør, forvent grønt**

Run: `npm run test --workspace api -- risk-math`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/services/risk/math.ts api/src/services/risk/riskClass.ts api/tests/risk-math.test.ts
git commit -m "Risikomatematikk: kovarians, Euler-bidrag og risikoklasse"
```

---

### Task 3: Risikomodell (grupper, proxy, kovarians fra markedsdata)

**Files:**
- Create: `api/src/services/risk/model.ts`
- Test: `api/tests/risk-model.test.ts`

**Interfaces:**
- Consumes: `covarianceMatrix`, `portfolioVolatility`, `stdDev`, `TRADING_DAYS_PER_YEAR` (Task 2); `getMarketDataFor`, `getTradingDates` (Task 1).
- Produces:
  ```ts
  export type Group = 'tek' | 'aksjer_global' | 'aksjer_norden' | 'blandet' | 'renter' | 'kontanter'
  export const GROUPS: Group[]
  export const GROUP_LABELS: Record<Group, string>
  export const LOOKBACK_DAYS = 252
  export const MIN_OBSERVATIONS = 60
  export interface InstrumentMeta { ticker: string; name: string; asset_type: string; sector: string; geography: string }
  export interface ModelInput extends InstrumentMeta { value: number }
  export interface ModelPosition extends ModelInput { group: Group; weight: number; annual_vol: number; observations: number; estimated: boolean; proxy_ticker: string | null }
  export interface RiskModel { positions: ModelPosition[]; cov: number[][]; total_value: number; annual_vol: number; window: { from: string; to: string; days: number } }
  export function isNordic(geography: string): boolean
  export function groupOf(meta: InstrumentMeta): Group
  export function proxyTickerFor(meta: InstrumentMeta): string | null
  export function inputsFromInvestments(investments: Investment[]): ModelInput[]
  export function buildRiskModel(inputs: ModelInput[]): RiskModel
  ```

- [ ] **Step 1: Skriv feilende tester**

`api/tests/risk-model.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { getInvestmentsFor } from '../src/data.js'
import { buildRiskModel, groupOf, inputsFromInvestments } from '../src/services/risk/model.js'

const meta = (ticker: string, asset_type: string, sector: string, geography: string) => ({ ticker, name: ticker, asset_type, sector, geography })

describe('groupOf', () => {
  it('klassifiserer instrumenter', () => {
    expect(groupOf(meta('OSLC', 'Equity', 'Technology', 'Norway'))).toBe('tek')
    expect(groupOf(meta('TECHF', 'ETF', 'Technology', 'Global'))).toBe('tek')
    expect(groupOf(meta('NRDEQ', 'ETF', 'Diversified', 'Nordics'))).toBe('aksjer_norden')
    expect(groupOf(meta('GLBEQ', 'ETF', 'Diversified', 'Global'))).toBe('aksjer_global')
    expect(groupOf(meta('MFBAL', 'Mutual Fund', 'Diversified', 'Global'))).toBe('blandet')
    expect(groupOf(meta('GOVNO', 'Bond', 'Government Bonds', 'Norway'))).toBe('renter')
    expect(groupOf(meta('CASHNOK', 'Cash', 'Cash', 'Norway'))).toBe('kontanter')
  })
})

describe('buildRiskModel', () => {
  it('gir rimelige volatiliteter og vekter for Jonas', () => {
    const model = buildRiskModel(inputsFromInvestments(getInvestmentsFor('CUST-00101')))
    const vol = (t: string) => model.positions.find((p) => p.ticker === t)!.annual_vol
    expect(vol('USTK')).toBeGreaterThan(vol('GLBEQ'))
    expect(vol('GLBEQ')).toBeGreaterThan(vol('CORPB'))
    expect(vol('CASHNOK')).toBe(0)
    expect(model.positions.reduce((s, p) => s + p.weight, 0)).toBeCloseTo(1, 10)
    expect(model.window.days).toBe(252)
    expect(Number.isFinite(model.annual_vol)).toBe(true)
  })

  it('estimerer NRDAI via proxy', () => {
    const model = buildRiskModel(inputsFromInvestments(getInvestmentsFor('CUST-00101')))
    const nrdai = model.positions.find((p) => p.ticker === 'NRDAI')!
    expect(nrdai.estimated).toBe(true)
    expect(nrdai.proxy_ticker).toBe('TECHF')
    expect(nrdai.observations).toBeLessThan(60)
    expect(nrdai.annual_vol).toBeGreaterThan(0)
  })

  it('estimerer ukjent ticker uten data uten NaN', () => {
    const model = buildRiskModel([{ ...meta('XXXX', 'Equity', 'Technology', 'Norway'), value: 1000 }])
    expect(model.positions[0].estimated).toBe(true)
    expect(model.positions[0].observations).toBe(0)
    expect(Number.isFinite(model.annual_vol)).toBe(true)
  })

  it('aggregerer like tickere', () => {
    const one = { ...meta('GLBEQ', 'ETF', 'Diversified', 'Global'), value: 500 }
    const model = buildRiskModel([one, { ...one }])
    expect(model.positions).toHaveLength(1)
    expect(model.positions[0].value).toBe(1000)
  })

  it('tom portefølje', () => {
    const model = buildRiskModel([])
    expect(model).toMatchObject({ positions: [], total_value: 0, annual_vol: 0 })
  })
})
```

- [ ] **Step 2: Kjør, forvent feil**

Run: `npm run test --workspace api -- risk-model`
Expected: FAIL.

- [ ] **Step 3: Implementer `model.ts`**

```ts
import { getMarketDataFor, getTradingDates } from '../../data.js'
import type { Investment } from '../../types.js'
import { covarianceMatrix, portfolioVolatility, stdDev, TRADING_DAYS_PER_YEAR } from './math.js'

export type Group = 'tek' | 'aksjer_global' | 'aksjer_norden' | 'blandet' | 'renter' | 'kontanter'
export const GROUPS: Group[] = ['tek', 'aksjer_global', 'aksjer_norden', 'blandet', 'renter', 'kontanter']
export const GROUP_LABELS: Record<Group, string> = {
  tek: 'Teknologi',
  aksjer_global: 'Globale aksjer',
  aksjer_norden: 'Nordiske aksjer',
  blandet: 'Kombinasjonsfond',
  renter: 'Renter',
  kontanter: 'Kontanter',
}

export const LOOKBACK_DAYS = 252
export const MIN_OBSERVATIONS = 60
const MIN_OBSERVATIONS_FOR_SCALING = 10

export interface InstrumentMeta {
  ticker: string
  name: string
  asset_type: string
  sector: string
  geography: string
}
export interface ModelInput extends InstrumentMeta {
  value: number
}
export interface ModelPosition extends ModelInput {
  group: Group
  weight: number
  annual_vol: number
  observations: number
  estimated: boolean
  proxy_ticker: string | null
}
export interface RiskModel {
  positions: ModelPosition[]
  cov: number[][]
  total_value: number
  annual_vol: number
  window: { from: string; to: string; days: number }
}

const NORDIC = new Set(['Norway', 'Sweden', 'Denmark', 'Finland', 'Nordics'])
export function isNordic(geography: string): boolean {
  return NORDIC.has(geography)
}

export function groupOf(meta: InstrumentMeta): Group {
  if (meta.asset_type === 'Cash') return 'kontanter'
  if (meta.sector === 'Technology') return 'tek'
  if (meta.asset_type === 'Bond') return 'renter'
  if (meta.asset_type === 'Mutual Fund') return 'blandet'
  return isNordic(meta.geography) ? 'aksjer_norden' : 'aksjer_global'
}

export function proxyTickerFor(meta: InstrumentMeta): string | null {
  switch (groupOf(meta)) {
    case 'tek': return 'TECHF'
    case 'aksjer_norden': return 'NRDEQ'
    case 'aksjer_global': return 'GLBEQ'
    case 'blandet': return 'MFBAL'
    case 'renter': return 'CORPB'
    default: return null
  }
}

export function inputsFromInvestments(investments: Investment[]): ModelInput[] {
  return investments.map((i) => ({
    ticker: i.ticker,
    name: i.name,
    asset_type: i.asset_type,
    sector: i.sector,
    geography: i.geography,
    value: i.quantity * i.current_price,
  }))
}

function aggregate(inputs: ModelInput[]): ModelInput[] {
  const byTicker = new Map<string, ModelInput>()
  for (const input of inputs) {
    const existing = byTicker.get(input.ticker)
    if (existing) existing.value += input.value
    else byTicker.set(input.ticker, { ...input })
  }
  return [...byTicker.values()].filter((p) => p.value > 0)
}

function returnsOn(ticker: string, dates: string[]): (number | null)[] {
  const byDate = new Map(getMarketDataFor(ticker).map((p) => [p.date, p.daily_return / 100]))
  return dates.map((d) => byDate.get(d) ?? null)
}

// Short or missing histories borrow the proxy's co-movement, rescaled to the
// instrument's own observed volatility when there is enough of it.
function seriesFor(meta: InstrumentMeta, dates: string[]) {
  if (meta.asset_type === 'Cash') {
    return { series: dates.map(() => 0), observations: dates.length, estimated: false, proxy: null }
  }
  const own = returnsOn(meta.ticker, dates)
  const observations = own.filter((v) => v !== null).length
  if (observations >= MIN_OBSERVATIONS) {
    return { series: own.map((v) => v ?? 0), observations, estimated: false, proxy: null }
  }
  const proxy = proxyTickerFor(meta)
  const proxySeries = proxy ? returnsOn(proxy, dates).map((v) => v ?? 0) : dates.map(() => 0)
  let scale = 1
  if (observations >= MIN_OBSERVATIONS_FOR_SCALING) {
    const ownObserved = own.filter((v): v is number => v !== null)
    const proxyObserved = proxySeries.filter((_, i) => own[i] !== null)
    const proxyVol = stdDev(proxyObserved)
    if (proxyVol > 0) scale = stdDev(ownObserved) / proxyVol
  }
  return { series: proxySeries.map((v) => v * scale), observations, estimated: true, proxy }
}

export function buildRiskModel(inputs: ModelInput[]): RiskModel {
  const dates = getTradingDates().slice(-LOOKBACK_DAYS)
  const window = { from: dates[0] ?? '', to: dates[dates.length - 1] ?? '', days: dates.length }
  const positions = aggregate(inputs)
  const total = positions.reduce((s, p) => s + p.value, 0)
  if (positions.length === 0 || total <= 0) {
    return { positions: [], cov: [], total_value: 0, annual_vol: 0, window }
  }
  const resolved = positions.map((p) => seriesFor(p, dates))
  const cov = covarianceMatrix(resolved.map((r) => r.series)).map((row) => row.map((c) => c * TRADING_DAYS_PER_YEAR))
  const weights = positions.map((p) => p.value / total)
  return {
    positions: positions.map((p, i) => ({
      ...p,
      group: groupOf(p),
      weight: weights[i],
      annual_vol: Math.sqrt(Math.max(0, cov[i][i])),
      observations: resolved[i].observations,
      estimated: resolved[i].estimated,
      proxy_ticker: resolved[i].proxy,
    })),
    cov,
    total_value: total,
    annual_vol: portfolioVolatility(weights, cov),
    window,
  }
}
```

- [ ] **Step 4: Kjør, forvent grønt**

Run: `npm run test --workspace api -- risk-model`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/services/risk/model.ts api/tests/risk-model.test.ts
git commit -m "Risikomodell med grupper, proxy for kort historikk og kovarians"
```

---

### Task 4: Stresstester

**Files:**
- Create: `api/src/services/risk/stress.ts`
- Test: `api/tests/risk-stress.test.ts`

**Interfaces:**
- Consumes: `InstrumentMeta`, `isNordic` (Task 3).
- Produces:
  ```ts
  export type StressBucket = 'tek' | 'aksjer_global' | 'aksjer_norden' | 'fremvoksende' | 'blandet' | 'stat' | 'kreditt' | 'kontanter'
  export const BUCKET_LABELS: Record<StressBucket, string>
  export interface Scenario { id: string; name: string; inspired_by: string; narrative: string; shocks: Record<StressBucket, number>; fall_months: number; recovery_months: number }
  export const SCENARIOS: Scenario[]   // ids: 'dotcom', 'finanskrise', 'pandemi', 'rentesjokk'
  export interface StressPosition { value: number; bucket: StressBucket }
  export interface StressPathPoint { month: number; value: number; reference: number }
  export interface StressResult { id; name; inspired_by; narrative; loss_nok: number; loss_pct: number; reference_loss_nok: number; reference_loss_pct: number; fall_months; recovery_months; path: StressPathPoint[]; by_bucket: { bucket: StressBucket; label: string; loss_nok: number }[] }
  export function stressBucket(meta: InstrumentMeta): StressBucket
  export function runStress(positions: StressPosition[]): StressResult[]
  ```

- [ ] **Step 1: Skriv feilende tester**

`api/tests/risk-stress.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { runStress, SCENARIOS, stressBucket } from '../src/services/risk/stress.js'

const m = (asset_type: string, sector: string, geography: string) => ({ ticker: 'X', name: 'X', asset_type, sector, geography })

describe('stress', () => {
  it('bøtter', () => {
    expect(stressBucket(m('Equity', 'Technology', 'United States'))).toBe('tek')
    expect(stressBucket(m('Bond', 'Government Bonds', 'Norway'))).toBe('stat')
    expect(stressBucket(m('Bond', 'Corporate Bonds', 'Nordics'))).toBe('kreditt')
    expect(stressBucket(m('ETF', 'Diversified', 'Emerging Markets'))).toBe('fremvoksende')
    expect(stressBucket(m('Mutual Fund', 'Diversified', 'Global'))).toBe('blandet')
    expect(stressBucket(m('Cash', 'Cash', 'Norway'))).toBe('kontanter')
  })

  it('har fire scenarioer', () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(['dotcom', 'finanskrise', 'pandemi', 'rentesjokk'])
  })

  it('regner tap og referanse for rentesjokk', () => {
    const result = runStress([{ value: 100000, bucket: 'tek' }]).find((r) => r.id === 'rentesjokk')!
    expect(result.loss_nok).toBe(-35000)
    expect(result.loss_pct).toBe(-35)
    expect(result.reference_loss_pct).toBe(-14)
    expect(result.reference_loss_nok).toBe(-14000)
  })

  it('banen starter og slutter på dagens verdi med bunn etter fallet', () => {
    const result = runStress([{ value: 100000, bucket: 'tek' }]).find((r) => r.id === 'rentesjokk')!
    expect(result.path[0]).toEqual({ month: 0, value: 100000, reference: 100000 })
    expect(result.path[result.fall_months].value).toBe(65000)
    expect(result.path[result.path.length - 1].value).toBe(100000)
    expect(result.path).toHaveLength(result.fall_months + result.recovery_months + 1)
  })

  it('tom portefølje gir null tap', () => {
    for (const r of runStress([])) {
      expect(r.loss_nok).toBe(0)
      expect(r.loss_pct).toBe(0)
    }
  })
})
```

- [ ] **Step 2: Kjør, forvent feil**

Run: `npm run test --workspace api -- risk-stress`
Expected: FAIL.

- [ ] **Step 3: Implementer `stress.ts`**

```ts
import { isNordic, type InstrumentMeta } from './model.js'

export type StressBucket = 'tek' | 'aksjer_global' | 'aksjer_norden' | 'fremvoksende' | 'blandet' | 'stat' | 'kreditt' | 'kontanter'

export const BUCKET_LABELS: Record<StressBucket, string> = {
  tek: 'Teknologi',
  aksjer_global: 'Globale aksjer',
  aksjer_norden: 'Nordiske aksjer',
  fremvoksende: 'Fremvoksende markeder',
  blandet: 'Kombinasjonsfond',
  stat: 'Statsobligasjoner',
  kreditt: 'Kredittobligasjoner',
  kontanter: 'Kontanter',
}

export interface Scenario {
  id: string
  name: string
  inspired_by: string
  narrative: string
  shocks: Record<StressBucket, number>
  fall_months: number
  recovery_months: number
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'dotcom',
    name: 'Teknologiboblen sprekker',
    inspired_by: '2000–2002',
    narrative: 'Teknologiaksjer faller kraftig over lang tid, mens trygge renter stiger i verdi.',
    shocks: { tek: -0.7, aksjer_global: -0.4, aksjer_norden: -0.4, fremvoksende: -0.45, blandet: -0.18, stat: 0.1, kreditt: 0.03, kontanter: 0 },
    fall_months: 30,
    recovery_months: 56,
  },
  {
    id: 'finanskrise',
    name: 'Finanskrise',
    inspired_by: '2008',
    narrative: 'Bred krise i finanssystemet. Nesten alt som er knyttet til aksjer faller samtidig.',
    shocks: { tek: -0.45, aksjer_global: -0.45, aksjer_norden: -0.55, fremvoksende: -0.55, blandet: -0.25, stat: 0.08, kreditt: -0.1, kontanter: 0 },
    fall_months: 17,
    recovery_months: 48,
  },
  {
    id: 'pandemi',
    name: 'Pandemisjokk',
    inspired_by: '2020',
    narrative: 'Et brått og dypt fall over noen uker, fulgt av en rask gjenhenting.',
    shocks: { tek: -0.28, aksjer_global: -0.32, aksjer_norden: -0.3, fremvoksende: -0.32, blandet: -0.15, stat: 0.03, kreditt: -0.08, kontanter: 0 },
    fall_months: 1,
    recovery_months: 6,
  },
  {
    id: 'rentesjokk',
    name: 'Rente- og teknologifall',
    inspired_by: '2022',
    narrative: 'Rentene stiger raskt. Teknologi faller mest, og obligasjoner gir ikke den vanlige beskyttelsen.',
    shocks: { tek: -0.35, aksjer_global: -0.18, aksjer_norden: -0.12, fremvoksende: -0.22, blandet: -0.15, stat: -0.12, kreditt: -0.14, kontanter: 0 },
    fall_months: 10,
    recovery_months: 24,
  },
]

export const REFERENCE_MODERATE: { bucket: StressBucket; weight: number }[] = [
  { bucket: 'aksjer_global', weight: 0.3 },
  { bucket: 'aksjer_norden', weight: 0.1 },
  { bucket: 'kreditt', weight: 0.4 },
  { bucket: 'stat', weight: 0.15 },
  { bucket: 'kontanter', weight: 0.05 },
]

export interface StressPosition { value: number; bucket: StressBucket }
export interface StressPathPoint { month: number; value: number; reference: number }
export interface StressResult {
  id: string
  name: string
  inspired_by: string
  narrative: string
  loss_nok: number
  loss_pct: number
  reference_loss_nok: number
  reference_loss_pct: number
  fall_months: number
  recovery_months: number
  path: StressPathPoint[]
  by_bucket: { bucket: StressBucket; label: string; loss_nok: number }[]
}

export function stressBucket(meta: InstrumentMeta): StressBucket {
  if (meta.asset_type === 'Cash') return 'kontanter'
  if (meta.sector === 'Technology') return 'tek'
  if (meta.asset_type === 'Bond') return meta.sector === 'Government Bonds' ? 'stat' : 'kreditt'
  if (meta.asset_type === 'Mutual Fund') return 'blandet'
  if (meta.geography === 'Emerging Markets') return 'fremvoksende'
  return isNordic(meta.geography) ? 'aksjer_norden' : 'aksjer_global'
}

// Stylised V/U-shaped path: linear fall to the trough, linear recovery.
function shape(month: number, scenario: Scenario): number {
  if (month <= scenario.fall_months) return month / scenario.fall_months
  return 1 - (month - scenario.fall_months) / scenario.recovery_months
}

const round1 = (n: number) => Number(n.toFixed(1))

export function runStress(positions: StressPosition[]): StressResult[] {
  const total = positions.reduce((s, p) => s + p.value, 0)
  return SCENARIOS.map((scenario) => {
    const byBucket = new Map<StressBucket, number>()
    for (const p of positions) byBucket.set(p.bucket, (byBucket.get(p.bucket) ?? 0) + p.value * scenario.shocks[p.bucket])
    const loss = [...byBucket.values()].reduce((s, v) => s + v, 0)
    const referencePct = REFERENCE_MODERATE.reduce((s, r) => s + r.weight * scenario.shocks[r.bucket], 0)
    const referenceLoss = total * referencePct
    const months = scenario.fall_months + scenario.recovery_months
    return {
      id: scenario.id,
      name: scenario.name,
      inspired_by: scenario.inspired_by,
      narrative: scenario.narrative,
      loss_nok: Math.round(loss),
      loss_pct: total > 0 ? round1((loss / total) * 100) : 0,
      reference_loss_nok: Math.round(referenceLoss),
      reference_loss_pct: round1(referencePct * 100),
      fall_months: scenario.fall_months,
      recovery_months: scenario.recovery_months,
      path: Array.from({ length: months + 1 }, (_, month) => ({
        month,
        value: Math.round(total + loss * shape(month, scenario)),
        reference: Math.round(total + referenceLoss * shape(month, scenario)),
      })),
      by_bucket: [...byBucket.entries()]
        .map(([bucket, value]) => ({ bucket, label: BUCKET_LABELS[bucket], loss_nok: Math.round(value) }))
        .sort((a, b) => a.loss_nok - b.loss_nok),
    }
  })
}
```

Merk: `reference_loss_pct` for tom portefølje er scenarioets referanse (ikke 0) – testen sjekker bare `loss_*`.

- [ ] **Step 4: Kjør, forvent grønt**

Run: `npm run test --workspace api -- risk-stress`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/services/risk/stress.ts api/tests/risk-stress.test.ts
git commit -m "Stiliserte stresstester med referanseportefølje og gjenopprettingsbane"
```

---

### Task 5: Drift fra handelslogg

**Files:**
- Create: `api/src/services/risk/drift.ts`
- Test: `api/tests/risk-drift.test.ts`

**Interfaces:**
- Consumes: `Group`, `GROUPS`, `groupOf`, `InstrumentMeta`, `buildRiskModel`, `inputsFromInvestments` (Task 3); `portfolioVolatility` (Task 2); `riskClassFromVol`, `PROFILE_BANDS`, `RiskClass`, `ProfileBand` (Task 2); `getTradesFor`, `getTradingDates`, `getPriceOn`, `getInvestmentsFor`, `getCustomer` (Task 1).
- Produces:
  ```ts
  export interface DriftPoint { date: string; total_value: number; group_pct: Record<Group, number>; annual_vol_pct: number; risk_class: RiskClass }
  export interface TechDrift { from_date: string; from_pct: number; to_pct: number; price_effect_pp: number; purchase_effect_pp: number }
  export interface DriftResult { points: DriftPoint[]; profile_band: ProfileBand | null; first_above_band_date: string | null; tech: TechDrift | null; assumptions: string[] }
  export interface DriftInput {
    trades: { ticker: string; date: string; quantity: number }[]
    dates: string[]
    priceAt: (ticker: string, date: string) => number | null
    meta: Record<string, InstrumentMeta>
    volatilityOf: (weights: Map<string, number>) => number
    profile: string
    step?: number   // default 5 handelsdager
  }
  export function computeDrift(input: DriftInput): DriftResult
  export function driftForCustomer(customerId: string): DriftResult
  ```

- [ ] **Step 1: Skriv feilende tester**

`api/tests/risk-drift.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { computeDrift, driftForCustomer } from '../src/services/risk/drift.js'

const dates = Array.from({ length: 11 }, (_, i) => `2024-01-${String(i + 1).padStart(2, '0')}`)
const meta = {
  A: { ticker: 'A', name: 'A', asset_type: 'Equity', sector: 'Technology', geography: 'Norway' },
  B: { ticker: 'B', name: 'B', asset_type: 'Bond', sector: 'Corporate Bonds', geography: 'Norway' },
}

describe('computeDrift', () => {
  it('dekomponerer teknologiandelen i kurs- og kjøpseffekt', () => {
    const result = computeDrift({
      trades: [
        { ticker: 'B', date: dates[0], quantity: 100 },
        { ticker: 'A', date: dates[5], quantity: 10 },
      ],
      dates,
      priceAt: (ticker, date) => (ticker === 'A' && date >= dates[10] ? 2 : 1),
      meta,
      volatilityOf: () => 0.08,
      profile: 'Moderate',
      step: 5,
    })
    expect(result.points.map((p) => p.date)).toEqual([dates[0], dates[5], dates[10]])
    expect(result.tech).toMatchObject({ from_pct: 0, to_pct: 16.7, purchase_effect_pp: 9.1, price_effect_pp: 7.6 })
    expect(result.points[2].group_pct.tek).toBe(16.7)
    expect(result.points[0].risk_class).toBe(4)
    expect(result.first_above_band_date).toBeNull()
  })

  it('finner første dato over profilbåndet', () => {
    const result = computeDrift({
      trades: [{ ticker: 'A', date: dates[0], quantity: 1 }],
      dates,
      priceAt: () => 1,
      meta,
      volatilityOf: (w) => (w.get('A') ?? 0) * 0.3,
      profile: 'Moderate',
      step: 5,
    })
    expect(result.first_above_band_date).toBe(dates[0])
  })

  it('tom handelslogg', () => {
    const result = computeDrift({ trades: [], dates, priceAt: () => 1, meta, volatilityOf: () => 0, profile: 'Moderate' })
    expect(result).toMatchObject({ points: [], tech: null, first_above_band_date: null })
  })
})

describe('driftForCustomer (Jonas)', () => {
  it('viser at Jonas har driftet over profilen', () => {
    const drift = driftForCustomer('CUST-00101')
    expect(drift.points.length).toBeGreaterThan(100)
    expect(drift.points[0].risk_class).toBeLessThanOrEqual(4)
    expect(drift.points[drift.points.length - 1].risk_class).toBe(5)
    expect(drift.first_above_band_date! >= '2024-03-01').toBe(true)
    expect(drift.tech!.purchase_effect_pp).toBeGreaterThan(0)
    expect(drift.tech!.price_effect_pp).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Kjør, forvent feil**

Run: `npm run test --workspace api -- risk-drift`
Expected: FAIL.

- [ ] **Step 3: Implementer `drift.ts`**

```ts
import { getCustomer, getInvestmentsFor, getPriceOn, getTradesFor, getTradingDates } from '../../data.js'
import { portfolioVolatility } from './math.js'
import { buildRiskModel, GROUPS, groupOf, inputsFromInvestments, type Group, type InstrumentMeta } from './model.js'
import { PROFILE_BANDS, riskClassFromVol, type ProfileBand, type RiskClass } from './riskClass.js'

export interface DriftPoint {
  date: string
  total_value: number
  group_pct: Record<Group, number>
  annual_vol_pct: number
  risk_class: RiskClass
}
export interface TechDrift {
  from_date: string
  from_pct: number
  to_pct: number
  price_effect_pp: number
  purchase_effect_pp: number
}
export interface DriftResult {
  points: DriftPoint[]
  profile_band: ProfileBand | null
  first_above_band_date: string | null
  tech: TechDrift | null
  assumptions: string[]
}
export interface DriftInput {
  trades: { ticker: string; date: string; quantity: number }[]
  dates: string[]
  priceAt: (ticker: string, date: string) => number | null
  meta: Record<string, InstrumentMeta>
  volatilityOf: (weights: Map<string, number>) => number
  profile: string
  step?: number
}

const ASSUMPTIONS = [
  'Beholdningene er rekonstruert fra kjøpene dine og markedsprisene hver uke.',
  'Risikoklassen bakover i tid bruker dagens svingningsmønster på datidens fordeling.',
  'Demoen inneholder bare kjøp. Salg og uttak ville trukket i motsatt retning.',
]

type Quantities = Map<string, number>
const round1 = (n: number) => Number(n.toFixed(1))

function quantitiesAt(trades: DriftInput['trades'], date: string): Quantities {
  const q: Quantities = new Map()
  for (const t of trades) if (t.date <= date) q.set(t.ticker, (q.get(t.ticker) ?? 0) + t.quantity)
  return q
}

function values(q: Quantities, date: string, priceAt: DriftInput['priceAt']): Map<string, number> {
  const v = new Map<string, number>()
  for (const [ticker, qty] of q) v.set(ticker, qty * (priceAt(ticker, date) ?? 0))
  return v
}

function techShare(v: Map<string, number>, meta: DriftInput['meta']): number {
  const total = [...v.values()].reduce((s, x) => s + x, 0)
  if (total <= 0) return 0
  let tech = 0
  for (const [ticker, value] of v) if (meta[ticker] && groupOf(meta[ticker]) === 'tek') tech += value
  return tech / total
}

function snapshotDates(dates: string[], firstTrade: string, step: number): string[] {
  const start = dates.findIndex((d) => d >= firstTrade)
  if (start === -1) return []
  const picked: string[] = []
  for (let i = start; i < dates.length; i += step) picked.push(dates[i])
  if (picked[picked.length - 1] !== dates[dates.length - 1]) picked.push(dates[dates.length - 1])
  return picked
}

// Tech-weight change is split week by week: holding last week's quantities
// at this week's prices isolates the price effect; the rest is purchases.
// The two sums telescope exactly to the total change.
export function computeDrift(input: DriftInput): DriftResult {
  const band = PROFILE_BANDS[input.profile] ?? null
  if (input.trades.length === 0) {
    return { points: [], profile_band: band, first_above_band_date: null, tech: null, assumptions: ASSUMPTIONS }
  }
  const sorted = [...input.trades].sort((a, b) => (a.date < b.date ? -1 : 1))
  const snapshots = snapshotDates(input.dates, sorted[0].date, input.step ?? 5)

  const points: DriftPoint[] = []
  let priceEffect = 0
  let purchaseEffect = 0
  let previous: Quantities | null = null
  let previousDate = ''
  for (const date of snapshots) {
    const q = quantitiesAt(sorted, date)
    const v = values(q, date, input.priceAt)
    const total = [...v.values()].reduce((s, x) => s + x, 0)
    const groupPct = Object.fromEntries(GROUPS.map((g) => [g, 0])) as Record<Group, number>
    const weights = new Map<string, number>()
    for (const [ticker, value] of v) {
      const share = total > 0 ? value / total : 0
      weights.set(ticker, share)
      if (input.meta[ticker]) groupPct[groupOf(input.meta[ticker])] += share * 100
    }
    for (const g of GROUPS) groupPct[g] = round1(groupPct[g])
    const vol = input.volatilityOf(weights)
    points.push({ date, total_value: Math.round(total), group_pct: groupPct, annual_vol_pct: round1(vol * 100), risk_class: riskClassFromVol(vol) })

    if (previous) {
      const oldAtNew = techShare(values(previous, date, input.priceAt), input.meta)
      priceEffect += oldAtNew - techShare(values(previous, previousDate, input.priceAt), input.meta)
      purchaseEffect += techShare(v, input.meta) - oldAtNew
    }
    previous = q
    previousDate = date
  }

  const first = snapshots[0]
  const fromPct = techShare(values(quantitiesAt(sorted, first), first, input.priceAt), input.meta) * 100
  const above = band ? points.find((p) => p.risk_class > band.max) : undefined
  return {
    points,
    profile_band: band,
    first_above_band_date: above?.date ?? null,
    tech: {
      from_date: first,
      from_pct: round1(fromPct),
      to_pct: round1(fromPct + (priceEffect + purchaseEffect) * 100),
      price_effect_pp: round1(priceEffect * 100),
      purchase_effect_pp: round1(purchaseEffect * 100),
    },
    assumptions: ASSUMPTIONS,
  }
}

export function driftForCustomer(customerId: string): DriftResult {
  const investments = getInvestmentsFor(customerId)
  const model = buildRiskModel(inputsFromInvestments(investments))
  const meta = Object.fromEntries(investments.map((i) => [i.ticker, i]))
  return computeDrift({
    trades: getTradesFor(customerId),
    dates: getTradingDates(),
    priceAt: getPriceOn,
    meta,
    volatilityOf: (weights) => {
      const w = model.positions.map((p) => weights.get(p.ticker) ?? 0)
      return portfolioVolatility(w, model.cov)
    },
    profile: getCustomer(customerId)?.risk_profile ?? '',
  })
}
```

- [ ] **Step 4: Kjør, forvent grønt**

Run: `npm run test --workspace api -- risk-drift`
Expected: PASS. Hvis Jonas-testen feiler på `risk_class` start ≤ 4 eller slutt = 5, gå tilbake til Task 1 Step 7 og kalibrer (ikke endre testen).

- [ ] **Step 5: Commit**

```bash
git add api/src/services/risk/drift.ts api/tests/risk-drift.test.ts
git commit -m "Drift-analyse fra handelslogg med kurs- og kjøpseffekt"
```

---

### Task 6: Mål, datakvalitet og samlet analyse

**Files:**
- Create: `api/src/services/risk/goals.ts`, `api/src/services/risk/dataQuality.ts`, `api/src/services/risk/analysis.ts`
- Test: `api/tests/risk-analysis.test.ts`

**Interfaces:**
- Consumes: alt fra Task 2–4; `getCustomer`, `getInvestmentsFor`, `getDataDate`, `getMarketDataFor` (Task 1).
- Produces (goals.ts):
  ```ts
  export type GoalStatus = 'kort_horisont_hoy_risiko' | 'ok' | 'lang_horisont'
  export interface GoalAssessment { id: string; name: string; target_amount: number | null; target_year: number; years_left: number; status: GoalStatus; bad_year_nok: number; worst_scenario: { id: string; name: string; loss_nok: number; recovery_months: number } | null }
  export function assessGoals(goals: Goal[] | undefined, ctx: { data_year: number; risk_class: RiskClass | null; bad_year_nok: number; stress: StressResult[] }): GoalAssessment[]
  ```
- Produces (dataQuality.ts):
  ```ts
  export const STALE_AFTER_TRADING_DAYS = 3
  export interface DataQuality { data_date: string; as_of: string; trading_days_old: number; stale: boolean; estimated: { ticker: string; name: string; observations: number; proxy_ticker: string | null }[]; missing_prices: string[] }
  export function getAsOfDate(): string      // process.env.DEMO_AS_OF ?? '2026-09-07'
  export function tradingDaysBetween(from: string, to: string): number   // ukedager etter from, t.o.m. to
  export function assessDataQuality(model: RiskModel, opts?: { dataDate?: string; asOf?: string }): DataQuality
  ```
- Produces (analysis.ts):
  ```ts
  export interface HoldingRisk { ticker: string; name: string; group: Group; group_label: string; value: number; money_pct: number; risk_pct: number; annual_vol_pct: number; estimated: boolean }
  export interface GroupRisk { group: Group; label: string; value: number; money_pct: number; risk_pct: number }
  export interface RiskAnalysis {
    customer_id: string
    total_value: number
    annual_vol_pct: number
    risk_class: RiskClass | null
    profile: { code: string; label: string; band: ProfileBand | null; fit: ProfileFit }
    normal_swing: NormalSwing
    holdings: HoldingRisk[]          // sortert på risk_pct synkende
    groups: GroupRisk[]              // sortert på risk_pct synkende, bare grupper med verdi
    goals: GoalAssessment[]
    data_quality: DataQuality
    window: RiskModel['window']
    assumptions: string[]
    disclaimer: string
  }
  export const DISCLAIMER: string
  export function analyzeInputs(customerId: string, profile: string, inputs: ModelInput[], goals?: Goal[]): RiskAnalysis
  export function analyzeCustomer(customerId: string): RiskAnalysis | null
  ```

- [ ] **Step 1: Skriv feilende tester**

`api/tests/risk-analysis.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { customers, getInvestmentsFor } from '../src/data.js'
import { analyzeCustomer } from '../src/services/risk/analysis.js'
import { assessDataQuality, tradingDaysBetween } from '../src/services/risk/dataQuality.js'
import { assessGoals } from '../src/services/risk/goals.js'
import { buildRiskModel } from '../src/services/risk/model.js'

describe('analyzeCustomer – Jonas', () => {
  const a = analyzeCustomer('CUST-00101')!

  it('er klasse 5 og over Moderat-båndet', () => {
    expect(a.risk_class).toBe(5)
    expect(a.profile).toMatchObject({ code: 'Moderate', label: 'Moderat', fit: 'over', band: { min: 3, max: 4 } })
  })

  it('teknologi er største risikokilde og større enn pengeandelen', () => {
    expect(a.groups[0].group).toBe('tek')
    expect(a.groups[0].risk_pct).toBeGreaterThan(a.groups[0].money_pct)
  })

  it('andeler summerer til 100', () => {
    expect(a.holdings.reduce((s, h) => s + h.risk_pct, 0)).toBeCloseTo(100, 0)
    expect(a.holdings.reduce((s, h) => s + h.money_pct, 0)).toBeCloseTo(100, 0)
  })

  it('flagger NRDAI som estimert og har mål', () => {
    expect(a.data_quality.estimated.map((e) => e.ticker)).toContain('NRDAI')
    expect(a.goals.find((g) => g.id === 'bolig')).toMatchObject({ years_left: 5, status: 'kort_horisont_hoy_risiko' })
    expect(a.normal_swing.bad_year_nok).toBeGreaterThan(a.normal_swing.typical_year_nok)
  })
})

describe('kanttilfeller', () => {
  it('ukjent kunde gir null', () => {
    expect(analyzeCustomer('CUST-99999')).toBeNull()
  })

  it('kunde uten investeringer', () => {
    const empty = customers.find((c) => getInvestmentsFor(c.customer_id).length === 0)!
    const a = analyzeCustomer(empty.customer_id)!
    expect(a).toMatchObject({ total_value: 0, risk_class: null, holdings: [], groups: [] })
    expect(a.profile.fit).toBe('ukjent')
  })

  it('utdatert datadato', () => {
    const model = buildRiskModel([])
    expect(assessDataQuality(model, { dataDate: '2026-09-04', asOf: '2026-09-07' })).toMatchObject({ trading_days_old: 1, stale: false })
    expect(assessDataQuality(model, { dataDate: '2026-09-04', asOf: '2026-09-15' }).stale).toBe(true)
    expect(tradingDaysBetween('2026-09-04', '2026-09-04')).toBe(0)
  })

  it('mål uten data', () => {
    expect(assessGoals(undefined, { data_year: 2026, risk_class: 5, bad_year_nok: 1, stress: [] })).toEqual([])
  })
})
```

- [ ] **Step 2: Kjør, forvent feil**

Run: `npm run test --workspace api -- risk-analysis`
Expected: FAIL.

- [ ] **Step 3: Implementer `goals.ts`**

```ts
import type { Goal } from '../../types.js'
import type { RiskClass } from './riskClass.js'
import type { StressResult } from './stress.js'

export type GoalStatus = 'kort_horisont_hoy_risiko' | 'ok' | 'lang_horisont'

export interface GoalAssessment {
  id: string
  name: string
  target_amount: number | null
  target_year: number
  years_left: number
  status: GoalStatus
  bad_year_nok: number
  worst_scenario: { id: string; name: string; loss_nok: number; recovery_months: number } | null
}

const SHORT_HORIZON_YEARS = 5
const LONG_HORIZON_YEARS = 10
const HIGH_RISK_CLASS = 5

export function assessGoals(
  goals: Goal[] | undefined,
  ctx: { data_year: number; risk_class: RiskClass | null; bad_year_nok: number; stress: StressResult[] },
): GoalAssessment[] {
  if (!goals?.length) return []
  const worst = [...ctx.stress].sort((a, b) => a.loss_nok - b.loss_nok)[0]
  return goals.map((goal) => {
    const yearsLeft = goal.target_year - ctx.data_year
    let status: GoalStatus = 'ok'
    if (yearsLeft <= SHORT_HORIZON_YEARS && (ctx.risk_class ?? 0) >= HIGH_RISK_CLASS) status = 'kort_horisont_hoy_risiko'
    else if (yearsLeft > LONG_HORIZON_YEARS) status = 'lang_horisont'
    return {
      id: goal.id,
      name: goal.name,
      target_amount: goal.target_amount,
      target_year: goal.target_year,
      years_left: yearsLeft,
      status,
      bad_year_nok: ctx.bad_year_nok,
      worst_scenario: worst
        ? { id: worst.id, name: worst.name, loss_nok: worst.loss_nok, recovery_months: worst.recovery_months }
        : null,
    }
  })
}
```

- [ ] **Step 4: Implementer `dataQuality.ts`**

```ts
import { getDataDate, getMarketDataFor } from '../../data.js'
import type { RiskModel } from './model.js'

export const STALE_AFTER_TRADING_DAYS = 3

export interface DataQuality {
  data_date: string
  as_of: string
  trading_days_old: number
  stale: boolean
  estimated: { ticker: string; name: string; observations: number; proxy_ticker: string | null }[]
  missing_prices: string[]
}

export function getAsOfDate(): string {
  return process.env.DEMO_AS_OF ?? '2026-09-07'
}

export function tradingDaysBetween(from: string, to: string): number {
  let count = 0
  const d = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const weekday = d.getUTCDay()
    if (weekday !== 0 && weekday !== 6) count += 1
  }
  return count
}

export function assessDataQuality(model: RiskModel, opts: { dataDate?: string; asOf?: string } = {}): DataQuality {
  const dataDate = opts.dataDate ?? getDataDate()
  const asOf = opts.asOf ?? getAsOfDate()
  const old = tradingDaysBetween(dataDate, asOf)
  return {
    data_date: dataDate,
    as_of: asOf,
    trading_days_old: old,
    stale: old > STALE_AFTER_TRADING_DAYS,
    estimated: model.positions
      .filter((p) => p.estimated)
      .map((p) => ({ ticker: p.ticker, name: p.name, observations: p.observations, proxy_ticker: p.proxy_ticker })),
    missing_prices: model.positions
      .filter((p) => p.asset_type !== 'Cash' && getMarketDataFor(p.ticker).length === 0)
      .map((p) => p.ticker),
  }
}
```

- [ ] **Step 5: Implementer `analysis.ts`**

```ts
import { getCustomer, getInvestmentsFor } from '../../data.js'
import type { Goal } from '../../types.js'
import { riskContributionShares } from './math.js'
import { assessDataQuality, type DataQuality } from './dataQuality.js'
import { assessGoals, type GoalAssessment } from './goals.js'
import { buildRiskModel, GROUP_LABELS, inputsFromInvestments, type Group, type ModelInput, type RiskModel } from './model.js'
import { normalSwing, PROFILE_BANDS, profileFit, riskClassFromVol, type NormalSwing, type ProfileBand, type ProfileFit, type RiskClass } from './riskClass.js'
import { runStress, stressBucket } from './stress.js'

export interface HoldingRisk {
  ticker: string
  name: string
  group: Group
  group_label: string
  value: number
  money_pct: number
  risk_pct: number
  annual_vol_pct: number
  estimated: boolean
}
export interface GroupRisk {
  group: Group
  label: string
  value: number
  money_pct: number
  risk_pct: number
}
export interface RiskAnalysis {
  customer_id: string
  total_value: number
  annual_vol_pct: number
  risk_class: RiskClass | null
  profile: { code: string; label: string; band: ProfileBand | null; fit: ProfileFit }
  normal_swing: NormalSwing
  holdings: HoldingRisk[]
  groups: GroupRisk[]
  goals: GoalAssessment[]
  data_quality: DataQuality
  window: RiskModel['window']
  assumptions: string[]
  disclaimer: string
}

export const DISCLAIMER =
  'Pedagogisk demomodell basert på syntetiske data. Ikke en egnethetsvurdering eller investeringsråd.'

const ASSUMPTIONS = [
  'Svingningene er beregnet fra de siste 252 handelsdagene (ca. ett år).',
  'Risikoklassen følger samme volatilitetsintervaller som risikoskalaen på fondsark (1–7).',
  '«Dårlig år» betyr et utfall som statistisk skjer omtrent 1 av 20 år, gitt at svingningene er som før.',
  'Instrumenter med kort historikk er estimert med et lignende instrument som erstatning.',
]

const round1 = (n: number) => Number(n.toFixed(1))

export function analyzeInputs(customerId: string, profile: string, inputs: ModelInput[], goals?: Goal[]): RiskAnalysis {
  const model = buildRiskModel(inputs)
  const weights = model.positions.map((p) => p.weight)
  const shares = riskContributionShares(weights, model.cov)
  const riskClass = model.total_value > 0 ? riskClassFromVol(model.annual_vol) : null
  const swing = normalSwing(model.total_value, model.annual_vol)

  const holdings: HoldingRisk[] = model.positions
    .map((p, i) => ({
      ticker: p.ticker,
      name: p.name,
      group: p.group,
      group_label: GROUP_LABELS[p.group],
      value: Math.round(p.value),
      money_pct: round1(p.weight * 100),
      risk_pct: round1(shares[i] * 100),
      annual_vol_pct: round1(p.annual_vol * 100),
      estimated: p.estimated,
    }))
    .sort((a, b) => b.risk_pct - a.risk_pct)

  const byGroup = new Map<Group, { value: number; money: number; risk: number }>()
  model.positions.forEach((p, i) => {
    const g = byGroup.get(p.group) ?? { value: 0, money: 0, risk: 0 }
    g.value += p.value
    g.money += p.weight
    g.risk += shares[i]
    byGroup.set(p.group, g)
  })
  const groups: GroupRisk[] = [...byGroup.entries()]
    .map(([group, g]) => ({ group, label: GROUP_LABELS[group], value: Math.round(g.value), money_pct: round1(g.money * 100), risk_pct: round1(g.risk * 100) }))
    .sort((a, b) => b.risk_pct - a.risk_pct)

  const stress = runStress(model.positions.map((p) => ({ value: p.value, bucket: stressBucket(p) })))
  const dataQuality = assessDataQuality(model)
  const band = PROFILE_BANDS[profile] ?? null

  return {
    customer_id: customerId,
    total_value: Math.round(model.total_value),
    annual_vol_pct: round1(model.annual_vol * 100),
    risk_class: riskClass,
    profile: { code: profile, label: band?.label ?? profile, band, fit: riskClass ? profileFit(profile, riskClass) : 'ukjent' },
    normal_swing: swing,
    holdings,
    groups,
    goals: assessGoals(goals, {
      data_year: Number(dataQuality.data_date.slice(0, 4)),
      risk_class: riskClass,
      bad_year_nok: swing.bad_year_nok,
      stress,
    }),
    data_quality: dataQuality,
    window: model.window,
    assumptions: ASSUMPTIONS,
    disclaimer: DISCLAIMER,
  }
}

export function analyzeCustomer(customerId: string): RiskAnalysis | null {
  const customer = getCustomer(customerId)
  if (!customer) return null
  return analyzeInputs(customerId, customer.risk_profile, inputsFromInvestments(getInvestmentsFor(customerId)), customer.goals)
}
```

- [ ] **Step 6: Kjør, forvent grønt**

Run: `npm run test --workspace api -- risk-analysis`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/src/services/risk/goals.ts api/src/services/risk/dataQuality.ts api/src/services/risk/analysis.ts api/tests/risk-analysis.test.ts
git commit -m "Samlet risikoanalyse med mål og datakvalitet"
```

---

### Task 7: Hva-om

**Files:**
- Create: `api/src/services/risk/whatIf.ts`
- Test: `api/tests/risk-whatif.test.ts`

**Interfaces:**
- Consumes: `analyzeInputs`, `RiskAnalysis` (Task 6); `runStress`, `stressBucket` (Task 4); `Group`, `GROUPS`, `groupOf`, `ModelInput`, `inputsFromInvestments` (Task 3); `getCustomer`, `getInvestmentsFor` (Task 1).
- Produces:
  ```ts
  export interface Move { from: Group; to: Group; amount_nok: number }
  export interface WhatIfSnapshot { total_value: number; annual_vol_pct: number; risk_class: RiskClass | null; fit: ProfileFit; normal_swing: NormalSwing; groups: GroupRisk[]; stress: { id: string; name: string; loss_nok: number; loss_pct: number }[] }
  export interface WhatIfResult { before: WhatIfSnapshot; after: WhatIfSnapshot; moves_applied: Move[]; disclaimer: string }
  export const REPRESENTATIVE: Record<Group, InstrumentMeta>
  export function parseMoves(body: unknown): Move[] | { error: string }
  export function applyMoves(inputs: ModelInput[], moves: Move[]): { inputs: ModelInput[]; applied: Move[] }
  export function whatIfForCustomer(customerId: string, moves: Move[]): WhatIfResult | null
  ```

- [ ] **Step 1: Skriv feilende tester**

`api/tests/risk-whatif.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { applyMoves, parseMoves, whatIfForCustomer } from '../src/services/risk/whatIf.js'

const tech = { ticker: 'USTK', name: 'US TechCore', asset_type: 'Equity', sector: 'Technology', geography: 'United States', value: 1000 }

describe('parseMoves', () => {
  it('godtar gyldige flyttinger', () => {
    expect(parseMoves({ moves: [{ from: 'tek', to: 'renter', amount_nok: 500 }] })).toEqual([{ from: 'tek', to: 'renter', amount_nok: 500 }])
  })
  it('avviser ugyldige', () => {
    expect(parseMoves({ moves: [{ from: 'krypto', to: 'renter', amount_nok: 500 }] })).toHaveProperty('error')
    expect(parseMoves({ moves: [{ from: 'tek', to: 'renter', amount_nok: -1 }] })).toHaveProperty('error')
    expect(parseMoves({})).toHaveProperty('error')
    expect(parseMoves({ moves: Array(11).fill({ from: 'tek', to: 'renter', amount_nok: 1 }) })).toHaveProperty('error')
  })
})

describe('applyMoves', () => {
  it('flytter beløp og bevarer total', () => {
    const { inputs } = applyMoves([tech], [{ from: 'tek', to: 'renter', amount_nok: 400 }])
    expect(inputs.find((i) => i.ticker === 'USTK')!.value).toBeCloseTo(600, 6)
    expect(inputs.find((i) => i.ticker === 'CORPB')!.value).toBeCloseTo(400, 6)
  })
  it('kapper beløp til gruppens verdi og ignorerer from === to', () => {
    const { inputs, applied } = applyMoves([tech], [
      { from: 'tek', to: 'tek', amount_nok: 100 },
      { from: 'tek', to: 'kontanter', amount_nok: 5000 },
    ])
    expect(applied).toEqual([{ from: 'tek', to: 'kontanter', amount_nok: 1000 }])
    expect(inputs.find((i) => i.ticker === 'USTK')?.value ?? 0).toBeCloseTo(0, 6)
    expect(inputs.every((i) => i.value >= 0)).toBe(true)
  })
})

describe('whatIfForCustomer', () => {
  it('å flytte teknologi til renter senker Jonas sin risiko', () => {
    const result = whatIfForCustomer('CUST-00101', [{ from: 'tek', to: 'renter', amount_nok: 300000 }])!
    expect(result.after.annual_vol_pct).toBeLessThan(result.before.annual_vol_pct)
    expect(result.after.total_value).toBe(result.before.total_value)
    expect(result.after.stress).toHaveLength(4)
  })
  it('ukjent kunde gir null', () => {
    expect(whatIfForCustomer('CUST-99999', [])).toBeNull()
  })
})
```

- [ ] **Step 2: Kjør, forvent feil**

Run: `npm run test --workspace api -- risk-whatif`
Expected: FAIL.

- [ ] **Step 3: Implementer `whatIf.ts`**

```ts
import { getCustomer, getInvestmentsFor } from '../../data.js'
import { analyzeInputs, DISCLAIMER, type GroupRisk, type RiskAnalysis } from './analysis.js'
import { GROUPS, groupOf, inputsFromInvestments, type Group, type InstrumentMeta, type ModelInput } from './model.js'
import type { NormalSwing, ProfileFit, RiskClass } from './riskClass.js'
import { runStress, stressBucket } from './stress.js'

export interface Move { from: Group; to: Group; amount_nok: number }
export interface WhatIfSnapshot {
  total_value: number
  annual_vol_pct: number
  risk_class: RiskClass | null
  fit: ProfileFit
  normal_swing: NormalSwing
  groups: GroupRisk[]
  stress: { id: string; name: string; loss_nok: number; loss_pct: number }[]
}
export interface WhatIfResult { before: WhatIfSnapshot; after: WhatIfSnapshot; moves_applied: Move[]; disclaimer: string }

const MAX_MOVES = 10

export const REPRESENTATIVE: Record<Group, InstrumentMeta> = {
  tek: { ticker: 'TECHF', name: 'Global Technology Fund (Fictional)', asset_type: 'ETF', sector: 'Technology', geography: 'Global' },
  aksjer_global: { ticker: 'GLBEQ', name: 'Global Equity Index Fund (Fictional)', asset_type: 'ETF', sector: 'Diversified', geography: 'Global' },
  aksjer_norden: { ticker: 'NRDEQ', name: 'Nordic Equity Index Fund (Fictional)', asset_type: 'ETF', sector: 'Diversified', geography: 'Nordics' },
  blandet: { ticker: 'MFBAL', name: 'Balanced Growth Mutual Fund (Fictional)', asset_type: 'Mutual Fund', sector: 'Diversified', geography: 'Global' },
  renter: { ticker: 'CORPB', name: 'Nordic Corporate Bond Fund (Fictional)', asset_type: 'Bond', sector: 'Corporate Bonds', geography: 'Nordics' },
  kontanter: { ticker: 'CASHNOK', name: 'Cash (NOK)', asset_type: 'Cash', sector: 'Cash', geography: 'Norway' },
}

const isGroup = (value: unknown): value is Group => typeof value === 'string' && (GROUPS as string[]).includes(value)

export function parseMoves(body: unknown): Move[] | { error: string } {
  const moves = (body as { moves?: unknown })?.moves
  if (!Array.isArray(moves)) return { error: 'Body må inneholde "moves" som en liste' }
  if (moves.length > MAX_MOVES) return { error: `Maks ${MAX_MOVES} flyttinger` }
  const parsed: Move[] = []
  for (const m of moves) {
    const { from, to, amount_nok } = (m ?? {}) as Record<string, unknown>
    if (!isGroup(from) || !isGroup(to)) return { error: `Ukjent gruppe. Gyldige: ${GROUPS.join(', ')}` }
    if (typeof amount_nok !== 'number' || !Number.isFinite(amount_nok) || amount_nok <= 0) {
      return { error: 'amount_nok må være et positivt tall' }
    }
    parsed.push({ from, to, amount_nok })
  }
  return parsed
}

export function applyMoves(inputs: ModelInput[], moves: Move[]): { inputs: ModelInput[]; applied: Move[] } {
  const result = inputs.map((i) => ({ ...i }))
  const applied: Move[] = []
  for (const move of moves) {
    if (move.from === move.to) continue
    const sources = result.filter((i) => groupOf(i) === move.from && i.value > 0)
    const available = sources.reduce((s, i) => s + i.value, 0)
    const amount = Math.min(move.amount_nok, available)
    if (amount <= 0) continue
    for (const source of sources) source.value -= amount * (source.value / available)
    const rep = REPRESENTATIVE[move.to]
    const target = result.find((i) => i.ticker === rep.ticker)
    if (target) target.value += amount
    else result.push({ ...rep, value: amount })
    applied.push({ from: move.from, to: move.to, amount_nok: Math.round(amount) })
  }
  return { inputs: result.filter((i) => i.value > 1e-6), applied }
}

function snapshot(analysis: RiskAnalysis, inputs: ModelInput[]): WhatIfSnapshot {
  return {
    total_value: analysis.total_value,
    annual_vol_pct: analysis.annual_vol_pct,
    risk_class: analysis.risk_class,
    fit: analysis.profile.fit,
    normal_swing: analysis.normal_swing,
    groups: analysis.groups,
    stress: runStress(inputs.map((i) => ({ value: i.value, bucket: stressBucket(i) }))).map((s) => ({
      id: s.id, name: s.name, loss_nok: s.loss_nok, loss_pct: s.loss_pct,
    })),
  }
}

export function whatIfForCustomer(customerId: string, moves: Move[]): WhatIfResult | null {
  const customer = getCustomer(customerId)
  if (!customer) return null
  const before = inputsFromInvestments(getInvestmentsFor(customerId))
  const { inputs: after, applied } = applyMoves(before, moves)
  return {
    before: snapshot(analyzeInputs(customerId, customer.risk_profile, before), before),
    after: snapshot(analyzeInputs(customerId, customer.risk_profile, after), after),
    moves_applied: applied,
    disclaimer: `${DISCLAIMER} Hva-om viser en illustrasjon, ikke en anbefaling.`,
  }
}
```

- [ ] **Step 4: Kjør, forvent grønt**

Run: `npm run test --workspace api -- risk-whatif`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/services/risk/whatIf.ts api/tests/risk-whatif.test.ts
git commit -m "Hva-om-beregning med representative instrumenter"
```

---

### Task 8: Endepunkter og OpenAPI

**Files:**
- Create: `api/src/routes/risk.ts`
- Modify: `api/src/routes/customers.ts` (import + `customersRouter.use(...)` etter `/:customerId/risk`-ruten)
- Modify: `api/src/openapi.yaml` (nye paths etter `/customers/{customerId}/risk`, nye schemas under `components.schemas`)
- Test: `api/tests/risk-routes.test.ts`

**Interfaces:**
- Consumes: `analyzeCustomer` (Task 6), `runStress`, `stressBucket` (Task 4), `buildRiskModel`, `inputsFromInvestments` (Task 3), `driftForCustomer` (Task 5), `parseMoves`, `whatIfForCustomer` (Task 7).
- Produces HTTP:
  - `GET /customers/:id/risk/analysis` → `RiskAnalysis`
  - `GET /customers/:id/risk/stress` → `{ customer_id, total_value, scenarios: StressResult[], reference_description: string, disclaimer }`
  - `GET /customers/:id/risk/drift` → `{ customer_id, ...DriftResult }`
  - `POST /customers/:id/risk/what-if` body `{ moves }` → `WhatIfResult`; 400 `{ error }` ved ugyldig body
  - Alle: 404 `{ error: 'Customer not found' }` for ukjent kunde

- [ ] **Step 1: Skriv feilende tester**

`api/tests/risk-routes.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { customers, getInvestmentsFor } from '../src/data.js'

const app = createApp()
const JONAS = 'CUST-00101'
const empty = customers.find((c) => getInvestmentsFor(c.customer_id).length === 0)!.customer_id

describe('risk routes', () => {
  it('analysis for Jonas', async () => {
    const res = await request(app).get(`/customers/${JONAS}/risk/analysis`)
    expect(res.status).toBe(200)
    expect(res.body.risk_class).toBe(5)
    expect(res.body.disclaimer).toMatch(/Ikke en egnethetsvurdering/)
  })

  it('stress for Jonas er verre enn referansen i rentesjokk', async () => {
    const res = await request(app).get(`/customers/${JONAS}/risk/stress`)
    expect(res.status).toBe(200)
    const s = res.body.scenarios.find((x: { id: string }) => x.id === 'rentesjokk')
    expect(s.loss_pct).toBeLessThan(s.reference_loss_pct)
  })

  it('drift for Jonas', async () => {
    const res = await request(app).get(`/customers/${JONAS}/risk/drift`)
    expect(res.status).toBe(200)
    expect(res.body.first_above_band_date).toBeTruthy()
  })

  it('what-if', async () => {
    const ok = await request(app).post(`/customers/${JONAS}/risk/what-if`).send({ moves: [{ from: 'tek', to: 'renter', amount_nok: 100000 }] })
    expect(ok.status).toBe(200)
    expect(ok.body.moves_applied).toHaveLength(1)
    const bad = await request(app).post(`/customers/${JONAS}/risk/what-if`).send({ moves: [{ from: 'x', to: 'renter', amount_nok: 1 }] })
    expect(bad.status).toBe(400)
  })

  it('404 for ukjent kunde', async () => {
    for (const path of ['analysis', 'stress', 'drift']) {
      expect((await request(app).get(`/customers/CUST-99999/risk/${path}`)).status).toBe(404)
    }
    expect((await request(app).post('/customers/CUST-99999/risk/what-if').send({ moves: [] })).status).toBe(404)
  })

  it('kunde uten investeringer gir 200 overalt', async () => {
    for (const path of ['analysis', 'stress', 'drift']) {
      expect((await request(app).get(`/customers/${empty}/risk/${path}`)).status).toBe(200)
    }
  })

  it('gammelt /risk er uendret', async () => {
    const res = await request(app).get(`/customers/${JONAS}/risk`)
    expect(res.body).toHaveProperty('risk_score')
  })

  it('OpenAPI dokumenterer nye stier', async () => {
    const res = await request(app).get('/openapi.json')
    expect(Object.keys(res.body.paths)).toEqual(expect.arrayContaining([
      '/customers/{customerId}/risk/analysis',
      '/customers/{customerId}/risk/stress',
      '/customers/{customerId}/risk/drift',
      '/customers/{customerId}/risk/what-if',
    ]))
  })
})
```

- [ ] **Step 2: Kjør, forvent feil**

Run: `npm run test --workspace api -- risk-routes`
Expected: FAIL (404 på nye stier).

- [ ] **Step 3: Implementer `routes/risk.ts`**

```ts
import { Router } from 'express'
import { getCustomer, getInvestmentsFor } from '../data.js'
import { analyzeCustomer, DISCLAIMER } from '../services/risk/analysis.js'
import { driftForCustomer } from '../services/risk/drift.js'
import { buildRiskModel, inputsFromInvestments } from '../services/risk/model.js'
import { runStress, stressBucket } from '../services/risk/stress.js'
import { parseMoves, whatIfForCustomer } from '../services/risk/whatIf.js'

export const riskRouter = Router({ mergeParams: true })

const notFound = { error: 'Customer not found' }

riskRouter.get('/analysis', (req, res) => {
  const analysis = analyzeCustomer(req.params.customerId)
  if (!analysis) return res.status(404).json(notFound)
  res.json(analysis)
})

riskRouter.get('/stress', (req, res) => {
  const customerId = req.params.customerId
  if (!getCustomer(customerId)) return res.status(404).json(notFound)
  const model = buildRiskModel(inputsFromInvestments(getInvestmentsFor(customerId)))
  res.json({
    customer_id: customerId,
    total_value: Math.round(model.total_value),
    scenarios: runStress(model.positions.map((p) => ({ value: p.value, bucket: stressBucket(p) }))),
    reference_description: 'Typisk moderat portefølje: 30 % globale aksjer, 10 % nordiske aksjer, 40 % kreditt, 15 % stat, 5 % kontanter.',
    disclaimer: `${DISCLAIMER} Scenarioene er stiliserte og inspirert av historiske kriser, ikke historiske tall.`,
  })
})

riskRouter.get('/drift', (req, res) => {
  const customerId = req.params.customerId
  if (!getCustomer(customerId)) return res.status(404).json(notFound)
  res.json({ customer_id: customerId, ...driftForCustomer(customerId) })
})

riskRouter.post('/what-if', (req, res) => {
  const customerId = req.params.customerId
  if (!getCustomer(customerId)) return res.status(404).json(notFound)
  const moves = parseMoves(req.body)
  if ('error' in moves) return res.status(400).json(moves)
  res.json(whatIfForCustomer(customerId, moves))
})
```

I `api/src/routes/customers.ts`: legg til `import { riskRouter } from './risk.js'` og rett etter `/:customerId/risk`-ruten:
```ts
// Risikorøntgen: analysis, stress, drift and what-if (see services/risk/).
customersRouter.use('/:customerId/risk', riskRouter)
```

- [ ] **Step 4: Utvid OpenAPI**

I `api/src/openapi.yaml`, rett før `  /customers/{customerId}/insights:` legg til:
```yaml
  /customers/{customerId}/risk/analysis:
    parameters:
      - $ref: "#/components/parameters/CustomerId"
    get:
      tags: [Risk]
      summary: Risikorøntgen – hvor risikoen kommer fra
      description: >
        Risikoklasse (1–7), andel av pengene vs. andel av risikoen per
        investering og gruppe, normal svingning i kroner, mål og datakvalitet.
        Pedagogisk demomodell – ikke investeringsråd.
      responses:
        "200":
          description: Risikoanalyse
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/RiskAnalysis"
        "404":
          $ref: "#/components/responses/NotFound"

  /customers/{customerId}/risk/stress:
    parameters:
      - $ref: "#/components/parameters/CustomerId"
    get:
      tags: [Risk]
      summary: Stiliserte stresstester i kroner
      responses:
        "200":
          description: Fire scenarioer med tap, referanseportefølje og gjenopprettingsbane
          content:
            application/json:
              schema:
                type: object
                properties:
                  customer_id: { type: string }
                  total_value: { type: number }
                  scenarios:
                    type: array
                    items:
                      $ref: "#/components/schemas/StressResult"
                  reference_description: { type: string }
                  disclaimer: { type: string }
        "404":
          $ref: "#/components/responses/NotFound"

  /customers/{customerId}/risk/drift:
    parameters:
      - $ref: "#/components/parameters/CustomerId"
    get:
      tags: [Risk]
      summary: Hvordan porteføljen har driftet over tid
      responses:
        "200":
          description: Ukentlige punkter, første dato over profilbåndet og teknologidrift
          content:
            application/json:
              schema:
                type: object
                properties:
                  customer_id: { type: string }
                  points:
                    type: array
                    items:
                      type: object
                      properties:
                        date: { type: string }
                        total_value: { type: number }
                        group_pct: { type: object, additionalProperties: { type: number } }
                        annual_vol_pct: { type: number }
                        risk_class: { type: integer }
                  profile_band:
                    $ref: "#/components/schemas/ProfileBand"
                  first_above_band_date: { type: string, nullable: true }
                  tech:
                    type: object
                    nullable: true
                    properties:
                      from_date: { type: string }
                      from_pct: { type: number }
                      to_pct: { type: number }
                      price_effect_pp: { type: number }
                      purchase_effect_pp: { type: number }
                  assumptions: { type: array, items: { type: string } }
        "404":
          $ref: "#/components/responses/NotFound"

  /customers/{customerId}/risk/what-if:
    parameters:
      - $ref: "#/components/parameters/CustomerId"
    post:
      tags: [Risk]
      summary: Hva om – illustrer flyttinger mellom grupper
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [moves]
              properties:
                moves:
                  type: array
                  maxItems: 10
                  items:
                    type: object
                    required: [from, to, amount_nok]
                    properties:
                      from: { $ref: "#/components/schemas/RiskGroup" }
                      to: { $ref: "#/components/schemas/RiskGroup" }
                      amount_nok: { type: number, minimum: 0, exclusiveMinimum: true }
      responses:
        "200":
          description: Før og etter
          content:
            application/json:
              schema:
                type: object
                properties:
                  before: { type: object }
                  after: { type: object }
                  moves_applied: { type: array, items: { type: object } }
                  disclaimer: { type: string }
        "400":
          description: Ugyldig body
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Error"
        "404":
          $ref: "#/components/responses/NotFound"

```
Under `components.schemas` (etter `RiskSummary`) legg til:
```yaml
    RiskGroup:
      type: string
      enum: [tek, aksjer_global, aksjer_norden, blandet, renter, kontanter]
    ProfileBand:
      type: object
      nullable: true
      properties:
        min: { type: integer }
        max: { type: integer }
        label: { type: string }
    RiskAnalysis:
      type: object
      properties:
        customer_id: { type: string }
        total_value: { type: number }
        annual_vol_pct: { type: number }
        risk_class: { type: integer, nullable: true, minimum: 1, maximum: 7 }
        profile:
          type: object
          properties:
            code: { type: string }
            label: { type: string }
            band: { $ref: "#/components/schemas/ProfileBand" }
            fit: { type: string, enum: [innenfor, over, under, ukjent] }
        normal_swing:
          type: object
          properties:
            typical_year_nok: { type: number }
            bad_year_nok: { type: number }
            bad_year_pct: { type: number }
        holdings:
          type: array
          items:
            type: object
            properties:
              ticker: { type: string }
              name: { type: string }
              group: { $ref: "#/components/schemas/RiskGroup" }
              group_label: { type: string }
              value: { type: number }
              money_pct: { type: number }
              risk_pct: { type: number }
              annual_vol_pct: { type: number }
              estimated: { type: boolean }
        groups:
          type: array
          items:
            type: object
            properties:
              group: { $ref: "#/components/schemas/RiskGroup" }
              label: { type: string }
              value: { type: number }
              money_pct: { type: number }
              risk_pct: { type: number }
        goals: { type: array, items: { type: object } }
        data_quality:
          type: object
          properties:
            data_date: { type: string }
            as_of: { type: string }
            trading_days_old: { type: integer }
            stale: { type: boolean }
            estimated: { type: array, items: { type: object } }
            missing_prices: { type: array, items: { type: string } }
        window: { type: object }
        assumptions: { type: array, items: { type: string } }
        disclaimer: { type: string }
    StressResult:
      type: object
      properties:
        id: { type: string }
        name: { type: string }
        inspired_by: { type: string }
        narrative: { type: string }
        loss_nok: { type: number }
        loss_pct: { type: number }
        reference_loss_nok: { type: number }
        reference_loss_pct: { type: number }
        fall_months: { type: integer }
        recovery_months: { type: integer }
        path:
          type: array
          items:
            type: object
            properties:
              month: { type: integer }
              value: { type: number }
              reference: { type: number }
        by_bucket: { type: array, items: { type: object } }
```
Hvis `tags`-listen øverst i filen finnes, legg til `- name: Risk` med `description: Risikorøntgen for oppgave B`.

- [ ] **Step 5: Kjør hele API-suiten og typesjekk**

Run: `npm run test --workspace api; npm run lint --workspace api`
Expected: alle tester PASS, ingen typefeil.

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/risk.ts api/src/routes/customers.ts api/src/openapi.yaml api/tests/risk-routes.test.ts
git commit -m "Endepunkter for risikoanalyse, stress, drift og hva-om"
```
