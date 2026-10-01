// Grounded AI report builder. Claude explores the customer's numbers through
// tools, then submits a ReportSpec. It can never write a number itself: text
// must reference catalog facts through placeholders, and the server rejects
// any submission that doesn't validate, so Claude has to fix it.
import Anthropic from '@anthropic-ai/sdk'
import { getCustomer, getFundHoldings } from '../data.js'
import { MetricError, STRESS_SCENARIOS, computeMetric, listMetrics, type MetricContext } from '../metrics/catalog.js'
import { PROFILE_NB } from '../metrics/format.js'
import { resolveReport, sanitizeScenarios, validateSpec } from './resolve.js'
import { getStandardReport } from './standard.js'
import { FLAGS, TOPICS, type AiReportResponse, type AiTraceStep, type ReportBlockSpec, type ReportSpec, type StressScenario } from './types.js'

export const AI_MODEL = 'claude-opus-5-5'
const MAX_TURNS = 8
const SECTORS = ['Technology', 'Financials', 'Healthcare', 'Energy', 'Industrials', 'Consumer Discretionary', 'Consumer Staples', 'Materials', 'Utilities', 'Government Bonds', 'Corporate Bonds']
const ASSET_TYPES = ['Equity', 'Bond', 'Cash']

export interface AiResult extends Omit<AiReportResponse, 'interaction_id'> {
  model: string | null
  metrics_used: string[]
}

const SYSTEM_PROMPT = `Du er rapportbyggeren i Wealth Copilot, en pedagogisk demo i en nordisk bank. Kunden stiller et spørsmål om sin egen portefølje, og du lager en kort rapport som svarer på det. Leseren er ikke ekspert: skriv norsk bokmål i klarspråk, korte setninger, forklar fagord første gang.

Slik jobber du:
1. Bruk get_metric (og get_fund_holdings ved behov) for å se kundens tall før du bestemmer hva rapporten skal vise.
2. Lever rapporten med submit_report. Rapporten har 3–7 blokker. Start med blokken som svarer mest direkte på spørsmålet, og ta med minst én tekstblokk som forklarer hva tallene betyr for kunden.
3. Får du feilmeldinger tilbake fra submit_report, retter du dem og sender på nytt.

Grounding – dette er absolutt:
- Du skriver aldri tall selv, heller ikke årstall, prosenter eller beløp. Alle tall i tittel, intro, caption og tekst skal komme fra plassholdere: {{metric_id.fact}} eller {{metric_id(param=verdi).fact}}, med metrikker og facts fra katalogen nedenfor. Skriv for eksempel «{{tech_exposure.total_pct}} av pengene», aldri «64 % av pengene».
- Beskriv bare det metrikkene faktisk viser. Si heller at noe ikke finnes i dataene enn å gjette.

Når kunden ber om et hypotetisk fall eller scenario («hva om teknologi faller 40 %?»), definerer du det i custom_scenarios med sector_shocks og/eller asset_type_shocks i prosent (negative tall er fall). Bruk så stress_test med scenario=<din id>. Gyldige sektorer: ${SECTORS.join(', ')}. Gyldige aktivatyper: ${ASSET_TYPES.join(', ')}. Bruk get_metric med custom_scenarios for å se resultatet først.

Grenser:
- Du gir aldri råd om å kjøpe, selge eller bytte investeringer, og du sier ikke hva kunden «bør» gjøre. Spør kunden om det, lager du likevel en nyttig rapport som viser konsekvensene (for eksempel what_if_shift som illustrasjon, eller stress_test). Skriv i customer_notice at dette ikke er et råd, og at rådgiveren kan hjelpe med beslutningen. Sett flagget ønsker_råd.
- Spør kunden om noe dataene ikke dekker (andre banker, skatt, framtidig avkastning, ekte selskaper, nyheter), forklarer du kort i customer_notice hva som mangler, lager den nærmeste nyttige rapporten hvis det finnes en, og setter flagget mangler_data.
- Gir kunden uttrykk for uro eller bekymring, setter du flagget bekymring. Skriv rolig og saklig, uten å bagatellisere.
- Har spørsmålet ingenting med kundens økonomi å gjøre, bruker du decline.
- topics velger du fra: ${TOPICS.join(', ')}. flags velger du fra: ${FLAGS.join(', ')} (tom liste hvis ingen passer).

Blokktyper: kpi (ett hovedtall), bar (fordeling som søyler, krever metrikk med fordeling), table (fordeling som tabell), scenario (bare stress_test), status (bare profile_fit eller equity_share), text (forklarende tekst med plassholdere).

Metrikkatalog (id: spørsmål | parametere | facts):
${listMetrics()
  .map((m) => `- ${m.id}: ${m.question} | ${m.params.map((p) => `${p.name}${p.values ? ` (${p.values.join('/')})` : ''}`).join(', ') || 'ingen'} | ${m.facts.join(', ')}`)
  .join('\n')}

Innebygde scenarioer for stress_test: ${STRESS_SCENARIOS.map((s) => `${s.id} (${s.name})`).join(', ')}.`

const paramsSchema = { type: 'object', additionalProperties: { type: ['string', 'number'] } }
const scenarioSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Kort id med små bokstaver og bindestrek.' },
      name: { type: 'string', description: 'Kort navn på norsk, uten tall.' },
      sector_shocks: { type: 'object', additionalProperties: { type: 'number' } },
      asset_type_shocks: { type: 'object', additionalProperties: { type: 'number' } },
    },
    required: ['id', 'name'],
  },
}

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'get_metric',
    description: 'Beregner én metrikk fra katalogen for kunden og returnerer verdien, facts og fordelingen. Bruk dette for å se tallene før du skriver rapporten.',
    input_schema: {
      type: 'object',
      properties: {
        metric: { type: 'string', description: 'Metrikk-id fra katalogen.' },
        params: { ...paramsSchema, description: 'Parametere, f.eks. {"scenario": "tech-correction"}.' },
        custom_scenarios: { ...scenarioSchema, description: 'Egne scenarioer som stress_test kan bruke.' },
      },
      required: ['metric'],
    },
  },
  {
    name: 'get_fund_holdings',
    description: 'Viser hva et fond eier (gjennomsyn), med vekter og datoen beholdningen er rapportert per.',
    input_schema: { type: 'object', properties: { ticker: { type: 'string' } }, required: ['ticker'] },
  },
  {
    name: 'submit_report',
    description: 'Leverer den ferdige rapporten. Serveren validerer den og fyller inn tallene. Ved feil får du en liste over hva som må rettes.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        intro: { type: 'string', description: 'To til tre setninger som svarer direkte på spørsmålet, med plassholdere for tall.' },
        blocks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['kpi', 'bar', 'table', 'scenario', 'status', 'text'] },
              metric: { type: 'string' },
              params: paramsSchema,
              caption: { type: 'string' },
              text: { type: 'string' },
            },
            required: ['type'],
          },
        },
        custom_scenarios: scenarioSchema,
        topics: { type: 'array', items: { type: 'string', enum: [...TOPICS] } },
        flags: { type: 'array', items: { type: 'string', enum: [...FLAGS] } },
        customer_notice: { type: 'string', description: 'Valgfri kort beskjed til kunden, f.eks. at dette ikke er et råd eller at data mangler.' },
      },
      required: ['title', 'intro', 'blocks', 'topics', 'flags'],
    },
  },
  {
    name: 'decline',
    description: 'Brukes bare når spørsmålet ikke handler om kundens økonomi eller portefølje.',
    input_schema: {
      type: 'object',
      properties: {
        customer_notice: { type: 'string', description: 'Vennlig forklaring til kunden på norsk.' },
        topics: { type: 'array', items: { type: 'string', enum: [...TOPICS] } },
        flags: { type: 'array', items: { type: 'string', enum: [...FLAGS] } },
      },
      required: ['customer_notice'],
    },
  },
]

const ADVICE_PATTERN = /\b(bør|burde|skal) jeg\b.*\b(selge|kjøpe|bytte|flytte|investere)|\banbefal/i

function pickList(values: unknown, allowed: readonly string[]): string[] {
  return Array.isArray(values) ? [...new Set(values.filter((v): v is string => typeof v === 'string' && allowed.includes(v)))] : []
}

function condensed(result: ReturnType<typeof computeMetric>) {
  return {
    display: result.display,
    status: result.status,
    facts: result.facts,
    breakdown: result.breakdown?.slice(0, 8).map((b) => ({ label: b.label, value: b.display, secondary: b.secondary_display, ...b.meta })),
    data_quality: result.data_quality.map((d) => d.message),
  }
}

function paramText(params: unknown) {
  return params && typeof params === 'object' && Object.keys(params).length ? `(${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(', ')})` : ''
}

// Without an API key, or when the model fails, map the question to the
// closest standard report so the customer still gets a grounded answer.
export function fallbackReport(customerId: string, prompt: string, reason: string): AiResult {
  const p = prompt.toLowerCase()
  const wantsAdvice = ADVICE_PATTERN.test(prompt)
  const reportId = wantsAdvice
    ? 'markedsfall'
    : /fond|teknolog|eier|overlapp|land|geograf/.test(p)
    ? 'hva-eier-du'
    : /fall|krakk|faller|stress|tap|scenario/.test(p)
      ? 'markedsfall'
      : /data|kilde|gammel|oppdatert/.test(p)
        ? 'datagrunnlag'
        : 'risikokilder'
  const spec = getStandardReport(reportId)!
  const flags = wantsAdvice ? ['ønsker_råd'] : []
  return {
    status: 'fallback',
    customer_notice: flags.length
      ? 'Vi kan ikke gi råd om kjøp eller salg, men rapporten under viser hvordan risikoen henger sammen. Rådgiveren din kan hjelpe deg med beslutningen.'
      : undefined,
    report: resolveReport(spec, customerId, 'standard'),
    spec,
    trace: [{ tool: 'fallback', input: { reason }, summary: `AI-tjenesten var ikke tilgjengelig (${reason}). Viser nærmeste standardrapport: ${spec.title}` }],
    topics: [],
    flags,
    model: null,
    metrics_used: [...new Set(spec.blocks.flatMap((b) => (b.metric ? [b.metric] : [])))],
  }
}

export async function generateAiReport(customerId: string, prompt: string, now = new Date()): Promise<AiResult> {
  if (!process.env.ANTHROPIC_API_KEY) return fallbackReport(customerId, prompt, 'mangler API-nøkkel')
  const customer = getCustomer(customerId)!
  const client = new Anthropic({ timeout: 60_000, maxRetries: 1 })
  const trace: AiTraceStep[] = []
  const metricsUsed = new Set<string>()
  let customScenarios: StressScenario[] = []

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: 'user',
      content: `Kunde: ${customer.first_name}, ${customer.age} år, risikoprofil ${PROFILE_NB[customer.risk_profile] ?? customer.risk_profile}, tidshorisont ${customer.investment_horizon.replace('years', 'år')}.\n\nSpørsmål fra kunden:\n${prompt}`,
    },
  ]

  try {
    for (let turn = 0; turn < MAX_TURNS; turn += 1) {
      const response = await client.beta.messages.create({
        model: AI_MODEL,
        max_tokens: 16000,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        messages,
        output_config: { effort: (process.env.AI_EFFORT as 'low' | 'medium' | 'high') || 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      })

      if (response.stop_reason === 'refusal') {
        return { status: 'refused', customer_notice: 'Vi kunne ikke lage en rapport for dette spørsmålet. Prøv å formulere det annerledes, eller kontakt rådgiveren din.', trace, topics: [], flags: [], model: response.model, metrics_used: [...metricsUsed] }
      }
      messages.push({ role: 'assistant', content: response.content })
      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
      if (toolUses.length === 0) {
        messages.push({ role: 'user', content: 'Lever svaret med submit_report (eller decline hvis spørsmålet ikke handler om kundens økonomi).' })
        continue
      }

      const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
      for (const call of toolUses) {
        const input = (call.input ?? {}) as Record<string, unknown>
        const ok = (content: unknown) => results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(content) })
        const fail = (message: string) => results.push({ type: 'tool_result', tool_use_id: call.id, content: message, is_error: true })

        if (call.name === 'get_metric') {
          const scenarios = sanitizeScenarios(input.custom_scenarios)
          if (scenarios.length) customScenarios = [...customScenarios.filter((s) => !scenarios.some((n) => n.id === s.id)), ...scenarios]
          const ctx: MetricContext = { customerId, customScenarios, now }
          const params = (input.params && typeof input.params === 'object' ? input.params : {}) as Record<string, string | number>
          try {
            const result = computeMetric(ctx, String(input.metric), params)
            metricsUsed.add(result.id)
            trace.push({ tool: 'get_metric', input, summary: `${result.title}${paramText(params)} → ${result.display}` })
            ok(condensed(result))
          } catch (err) {
            trace.push({ tool: 'get_metric', input, summary: `Feil: ${err instanceof Error ? err.message : 'ukjent'}` })
            fail(err instanceof MetricError ? err.message : 'Kunne ikke beregne metrikken.')
          }
        } else if (call.name === 'get_fund_holdings') {
          const holdings = getFundHoldings(String(input.ticker))
          trace.push({ tool: 'get_fund_holdings', input, summary: holdings.length ? `Gjennomsyn av ${input.ticker}: ${holdings.length} underliggende posisjoner` : `${input.ticker} er ikke et fond` })
          if (holdings.length) ok({ as_of_date: holdings[0].as_of_date, holdings: holdings.map((h) => ({ name: h.name, sector: h.sector, geography: h.geography, weight_pct: h.weight_pct })) })
          else fail(`${input.ticker} er ikke et fond med kjent beholdning.`)
        } else if (call.name === 'decline') {
          trace.push({ tool: 'decline', input, summary: 'Spørsmålet er utenfor det Wealth Copilot kan svare på.' })
          return {
            status: 'refused',
            customer_notice: String(input.customer_notice ?? 'Dette kan Wealth Copilot dessverre ikke svare på.'),
            trace,
            topics: pickList(input.topics, TOPICS),
            flags: [...new Set([...pickList(input.flags, FLAGS), 'utenfor_tema'])],
            model: response.model,
            metrics_used: [...metricsUsed],
          }
        } else if (call.name === 'submit_report') {
          const scenarios = sanitizeScenarios(input.custom_scenarios)
          const spec: ReportSpec = {
            id: `ai-${Date.now().toString(36)}`,
            title: String(input.title ?? ''),
            intro: String(input.intro ?? ''),
            blocks: (Array.isArray(input.blocks) ? input.blocks : []) as ReportBlockSpec[],
            custom_scenarios: scenarios.length ? scenarios : customScenarios.length ? customScenarios : undefined,
          }
          const errors = validateSpec(spec, { customerId, customScenarios: spec.custom_scenarios ?? [], now })
          if (errors.length) {
            trace.push({ tool: 'submit_report', input: { title: spec.title }, summary: `Avvist av validering (${errors.length} feil) – AI-en retter` })
            fail(`Rapporten ble ikke godkjent. Rett dette og send på nytt:\n- ${errors.join('\n- ')}`)
            continue
          }
          trace.push({ tool: 'submit_report', input: { title: spec.title }, summary: 'Rapporten er validert: alle tall kommer fra metrikkatalogen' })
          const flags = pickList(input.flags, FLAGS)
          if (ADVICE_PATTERN.test(prompt) && !flags.includes('ønsker_råd')) flags.push('ønsker_råd')
          for (const b of spec.blocks) if (b.metric) metricsUsed.add(b.metric)
          return {
            status: 'ok',
            customer_notice: typeof input.customer_notice === 'string' && input.customer_notice.trim() ? input.customer_notice.trim() : undefined,
            report: resolveReport(spec, customerId, 'ai', now),
            spec,
            trace,
            topics: pickList(input.topics, TOPICS),
            flags,
            model: response.model,
            metrics_used: [...metricsUsed],
          }
        } else {
          fail(`Ukjent verktøy ${call.name}.`)
        }
      }
      messages.push({ role: 'user', content: results })
    }
    const unfinished = fallbackReport(customerId, prompt, 'AI-en ble ikke ferdig')
    return { ...unfinished, trace: [...trace, ...unfinished.trace] }
  } catch (err) {
    console.error('AI report failed:', err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : err)
    const reason = err instanceof Anthropic.RateLimitError ? 'for mange forespørsler' : err instanceof Anthropic.APIError ? `API-feil ${err.status}` : 'teknisk feil'
    const fallback = fallbackReport(customerId, prompt, reason)
    return { ...fallback, trace: [...trace, ...fallback.trace] }
  }
}
