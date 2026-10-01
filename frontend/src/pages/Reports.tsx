import { useEffect, useState } from 'react'
import { useCustomerContext } from '../context/CustomerContext'
import { rangeLabel, useViewSettings } from '../context/ViewSettingsContext'
import { ApiError, askReportAi, fetchMetrics, fetchReport, fetchReports, resolveReport } from '../api/client'
import type { AiReportResponse, MetricDefinition, ReportSummary, ResolvedReport } from '../api/reportTypes'
import ReportView from '../components/ReportView'
import { RangeSelector } from '../components/ViewControls'
import { formatDateNo } from '../utils/format'
import { addSavedReport, loadSavedReports, removeSavedReport, type SavedReport } from '../utils/savedReports'

const EXAMPLE_PROMPTS = [
  'Hvor mye teknologi eier jeg egentlig, også inne i fondene?',
  'Hva skjer med porteføljen min hvis teknologiaksjer faller 40 %?',
  'Passer porteføljen min fortsatt en moderat risikoprofil?',
  'Bør jeg selge teknologifondet mitt?',
]

const PROGRESS_MESSAGES = [
  'Henter tall fra porteføljen din …',
  'Ser inn i fondene du eier …',
  'Regner ut risiko og scenarioer …',
  'Setter sammen rapporten …',
]

const TOOL_LABELS: Record<string, string> = {
  list_metrics: 'Så gjennom hvilke beregninger som finnes',
  get_metric: 'Hentet en beregning',
  get_fund_holdings: 'Så inn i et fond',
  submit_report: 'Leverte rapporten til kontroll',
}

type View =
  | { kind: 'list' }
  | { kind: 'metrics' }
  | { kind: 'ai' }
  | { kind: 'standard'; summary: ReportSummary }
  | { kind: 'saved'; saved: SavedReport }

type Tab = 'standard' | 'saved'

// basis = the range/benchmark setting the report numbers were computed for.
interface AiResult {
  response: AiReportResponse
  basis: string
}

// Re-mounted (via key) when another report is opened, so a range change keeps the current report on screen while it refreshes.
function LoadedReport({ customerId, view, onBack }: { customerId: string; view: Extract<View, { kind: 'standard' | 'saved' }>; onBack: () => void }) {
  const { range } = useViewSettings()
  const [report, setReport] = useState<ResolvedReport | null>(null)
  const [refreshing, setRefreshing] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setRefreshing(true)
    setError(null)
    const params = { range, benchmark: true }
    const request =
      view.kind === 'standard' ? fetchReport(customerId, view.summary.id, params) : resolveReport(customerId, view.saved.spec, params)
    request
      .then((result) => !cancelled && setReport(result))
      .catch(() => !cancelled && setError('Klarte ikke å hente rapporten. Prøv igjen litt senere.'))
      .finally(() => !cancelled && setRefreshing(false))
    return () => {
      cancelled = true
    }
  }, [customerId, view, range])

  const title = view.kind === 'standard' ? view.summary.title : view.saved.title

  return (
    <div>
      <button type="button" className="link-button" onClick={onBack}>
        ← Tilbake til rapportene
      </button>
      {error && <p className="error-state">{error}</p>}
      {!report && !error && <p className="loading-state">Henter «{title}» med ferske tall …</p>}
      {report && refreshing && (
        <p className="updating" role="status">
          Oppdaterer tallene for {rangeLabel(range)} …
        </p>
      )}
      {report && (
        <div className={refreshing ? 'is-stale' : undefined}>
          <ReportView report={report} controls={<RangeSelector />} />
        </div>
      )}
    </div>
  )
}

function ReportList({
  tab,
  setTab,
  reports,
  reportsError,
  saved,
  onOpen,
  onRemove,
  onAskAi,
}: {
  tab: Tab
  setTab: (tab: Tab) => void
  reports: ReportSummary[] | null
  reportsError: string | null
  saved: SavedReport[]
  onOpen: (view: View) => void
  onRemove: (saved: SavedReport) => void
  onAskAi: () => void
}) {
  return (
    <div>
      <div className="page-heading">
        <p className="eyebrow">Rapporter</p>
        <h2>Alle rapporter</h2>
      </div>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'standard'} className={tab === 'standard' ? 'is-active' : ''} onClick={() => setTab('standard')}>
          Standardrapporter ({reports?.length ?? 0})
        </button>
        <button type="button" role="tab" aria-selected={tab === 'saved'} className={tab === 'saved' ? 'is-active' : ''} onClick={() => setTab('saved')}>
          Dine rapporter ({saved.length})
        </button>
      </div>

      {tab === 'standard' && (
        <>
          {reportsError && <p className="error-state">{reportsError}</p>}
          {!reports && !reportsError && <p className="loading-state">Henter rapporter …</p>}
          {reports && (
            <ul className="report-list">
              {reports.map((summary) => (
                <li key={summary.id}>
                  <button type="button" className="report-list__item" onClick={() => onOpen({ kind: 'standard', summary })}>
                    <span className="report-list__icon" aria-hidden="true">▤</span>
                    <span className="report-list__text">
                      <span className="report-list__title">{summary.title}</span>
                      <span className="report-list__description">{summary.description}</span>
                    </span>
                    <span className="report-list__chevron" aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === 'saved' &&
        (saved.length === 0 ? (
          <div className="empty-card">
            <p>Du har ingen egne rapporter ennå.</p>
            <p className="muted-small">Still et spørsmål til AI-en, og lagre rapporten du får. Tallene regnes ut på nytt hver gang du åpner den.</p>
            <button type="button" className="btn btn--primary" onClick={onAskAi}>
              Spør AI
            </button>
          </div>
        ) : (
          <ul className="report-list">
            {saved.map((entry) => (
              <li key={entry.saved_at} className="report-list__row">
                <button type="button" className="report-list__item" onClick={() => onOpen({ kind: 'saved', saved: entry })}>
                  <span className="report-list__icon report-list__icon--ai" aria-hidden="true">✦</span>
                  <span className="report-list__text">
                    <span className="report-list__title">{entry.title}</span>
                    <span className="report-list__description">Lagret {formatDateNo(entry.saved_at, true)}</span>
                  </span>
                  <span className="report-list__chevron" aria-hidden="true">›</span>
                </button>
                <button type="button" className="link-button link-button--danger" onClick={() => onRemove(entry)} aria-label={`Fjern ${entry.title}`}>
                  Fjern
                </button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}

function MetricCatalog({ metrics, error }: { metrics: MetricDefinition[] | null; error: string | null }) {
  return (
    <div>
      <div className="page-heading">
        <p className="eyebrow">Metrikker</p>
        <h2>Dette kan vi regne ut for deg</h2>
        <p className="page-heading__lead">
          Alle tall i rapportene, også de AI-en lager, kommer fra disse beregningene. AI-en kan ikke finne på egne tall.
        </p>
      </div>
      {error && <p className="error-state">{error}</p>}
      {!metrics && !error && <p className="loading-state">Henter metrikker …</p>}
      <div className="metric-grid">
        {metrics?.map((metric) => (
          <article key={metric.id} className="metric-card">
            <h4>{metric.title}</h4>
            <p>{metric.question}</p>
            <code className="metric-card__id">{metric.id}</code>
            {metric.params.length > 0 && (
              <>
                <h5>Valg</h5>
                <ul className="plain-list">
                  {metric.params.map((param) => (
                    <li key={param.name}>
                      <code>{param.name}</code> – {param.description}
                      {param.values && param.values.length > 0 && <span className="muted-small"> ({param.values.join(', ')})</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {metric.facts.length > 0 && (
              <>
                <h5>Tilgjengelige fakta</h5>
                <div className="chip-row">
                  {metric.facts.map((fact) => (
                    <span key={fact} className="chip chip--mono">
                      {fact}
                    </span>
                  ))}
                </div>
              </>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}

function AiTrace({ response }: { response: AiReportResponse }) {
  const metricsUsed = [
    ...new Map(
      (response.report?.blocks ?? []).flatMap((block) => (block.metric ? [[block.metric.id, block.metric.title] as const] : [])),
    ).entries(),
  ]
  if (response.trace.length === 0 && metricsUsed.length === 0) return null

  return (
    <details className="ai-trace">
      <summary>Slik ble rapporten laget</summary>
      <p className="muted-small">
        AI-en kan bare bruke tall fra bankens egne beregninger. Her ser du hvilke steg den tok og hvilke beregninger rapporten bygger på.
      </p>
      {response.trace.length > 0 && (
        <ol className="ai-trace__steps">
          {response.trace.map((step, index) => (
            <li key={index}>
              <span className="ai-trace__tool">
                {TOOL_LABELS[step.tool] ?? step.tool} <code>{step.tool}</code>
              </span>
              <span>{step.summary}</span>
            </li>
          ))}
        </ol>
      )}
      {metricsUsed.length > 0 && (
        <>
          <h5>Beregninger brukt</h5>
          <div className="chip-row">
            {metricsUsed.map(([id, title]) => (
              <span key={id} className="chip" title={id}>
                {title}
              </span>
            ))}
          </div>
        </>
      )}
    </details>
  )
}

function AiPanel({
  customerId,
  result,
  setResult,
  onSaved,
}: {
  customerId: string
  result: AiResult | null
  setResult: (result: AiResult | null) => void
  onSaved: (saved: SavedReport[]) => void
}) {
  const { range } = useViewSettings()
  const viewKey = range
  const response = result?.response ?? null
  const [refreshing, setRefreshing] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [asked, setAsked] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  useEffect(() => {
    if (!sending) return
    setProgress(0)
    const timer = window.setInterval(() => setProgress((step) => Math.min(step + 1, PROGRESS_MESSAGES.length - 1)), 7000)
    return () => window.clearInterval(timer)
  }, [sending])

  // Re-resolves the AI's spec for a new period instead of asking the AI again.
  useEffect(() => {
    if (!result?.response.spec || !result.response.report || result.basis === viewKey || sending) return
    let cancelled = false
    const { response: current } = result
    setRefreshing(true)
    resolveReport(customerId, current.spec!, { range, benchmark: true })
      .then((report) => !cancelled && setResult({ response: { ...current, report: { ...report, source: current.report!.source } }, basis: viewKey }))
      .catch(() => !cancelled && setError('Klarte ikke å oppdatere tallene for den nye perioden. Prøv igjen litt senere.'))
      .finally(() => !cancelled && setRefreshing(false))
    return () => {
      cancelled = true
    }
  }, [viewKey, result, sending, customerId, range, setResult])

  async function ask(text: string) {
    const question = text.trim()
    if (!question || sending) return
    setSending(true)
    setError(null)
    setResult(null)
    setSavedId(null)
    setAsked(question)
    try {
      setResult({ response: await askReportAi(customerId, question, range), basis: viewKey })
      setPrompt('')
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? 'Du har stilt mange spørsmål på kort tid. Vent noen minutter og prøv igjen.'
          : 'Noe gikk galt da vi skulle lage rapporten. Prøv igjen litt senere.',
      )
    } finally {
      setSending(false)
    }
  }

  function save() {
    if (!response?.spec || !response.report) return
    onSaved(addSavedReport(customerId, response.spec, response.report.title))
    setSavedId(response.interaction_id)
  }

  const isSaved = response !== null && savedId === response.interaction_id

  return (
    <div>
      <div className="page-heading">
        <p className="eyebrow">Spør AI</p>
        <h2>Lag din egen rapport</h2>
        <p className="page-heading__lead">
          Spør med egne ord. AI-en setter sammen en rapport med tall fra porteføljen din og viser hvor tallene kommer fra. Den gir ikke
          kjøps- eller salgsråd.
        </p>
      </div>

      <form
        className="ai-ask"
        onSubmit={(event) => {
          event.preventDefault()
          ask(prompt)
        }}
      >
        <label htmlFor="ai-prompt" className="visually-hidden">
          Spørsmålet ditt
        </label>
        <textarea
          id="ai-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) ask(prompt)
          }}
          placeholder="For eksempel: Hvor kommer risikoen i porteføljen min fra?"
          rows={3}
          maxLength={1000}
          disabled={sending}
        />
        <div className="ai-ask__footer">
          <p className="privacy-notice">
            Spørsmålene dine og svarene lagres og kan ses av rådgiveren din, slik at hen kan følge deg opp.
          </p>
          <button type="submit" className="btn btn--primary" disabled={sending || !prompt.trim()}>
            {sending ? 'Lager rapport …' : 'Send'}
          </button>
        </div>
      </form>

      <div className="chip-row chip-row--examples">
        {EXAMPLE_PROMPTS.map((example) => (
          <button key={example} type="button" className="chip chip--button" disabled={sending} onClick={() => ask(example)}>
            {example}
          </button>
        ))}
      </div>

      {sending && (
        <div className="ai-progress" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <div>
            <p className="ai-progress__message">{PROGRESS_MESSAGES[progress]}</p>
            <p className="muted-small">Dette kan ta opptil et halvt minutt.</p>
          </div>
        </div>
      )}

      {error && <p className="callout callout--error">{error}</p>}

      {response && !sending && (
        <div className="ai-result">
          {asked && <p className="ai-result__question">Du spurte: «{asked}»</p>}
          {response.customer_notice && <div className="callout callout--notice">{response.customer_notice}</div>}
          {response.status === 'fallback' && (
            <p className="muted-small">AI-en kunne ikke lage en egen rapport nå, så vi viser standardrapporten som passer best til spørsmålet ditt.</p>
          )}
          {response.status === 'error' && !response.customer_notice && (
            <p className="callout callout--error">Noe gikk galt da vi skulle lage rapporten. Prøv igjen litt senere.</p>
          )}
          {response.status !== 'refused' && response.report && (
            <div className={refreshing ? 'is-stale' : undefined}>
              {refreshing && (
                <p className="updating" role="status">
                  Oppdaterer tallene for {rangeLabel(range)} …
                </p>
              )}
              <ReportView
                report={response.report}
                controls={response.spec ? <RangeSelector /> : undefined}
                actions={
                  response.spec && (
                    <button type="button" className="btn btn--secondary" onClick={save} disabled={isSaved}>
                      {isSaved ? 'Lagret i Dine rapporter' : 'Lagre i Dine rapporter'}
                    </button>
                  )
                }
              />
              <AiTrace response={response} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ReportsWorkspace({ customerId }: { customerId: string }) {
  const [view, setView] = useState<View>({ kind: 'list' })
  const [tab, setTab] = useState<Tab>('standard')
  const [reports, setReports] = useState<ReportSummary[] | null>(null)
  const [reportsError, setReportsError] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<MetricDefinition[] | null>(null)
  const [metricsError, setMetricsError] = useState<string | null>(null)
  const [saved, setSaved] = useState<SavedReport[]>(() => loadSavedReports(customerId))
  const [aiResult, setAiResult] = useState<AiResult | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchReports(customerId)
      .then((result) => !cancelled && setReports(result.reports))
      .catch(() => !cancelled && setReportsError('Klarte ikke å hente rapportene. Prøv igjen litt senere.'))
    fetchMetrics()
      .then((result) => !cancelled && setMetrics(result.metrics))
      .catch(() => !cancelled && setMetricsError('Klarte ikke å hente metrikkene.'))
    return () => {
      cancelled = true
    }
  }, [customerId])

  const inAllReports = view.kind === 'list' || view.kind === 'standard' || view.kind === 'saved'

  function showList(nextTab?: Tab) {
    if (nextTab) setTab(nextTab)
    setView({ kind: 'list' })
  }

  return (
    <div className="reports-layout">
      <aside className="reports-sidebar" aria-label="Rapportmeny">
        <button type="button" className={`reports-sidebar__ai${view.kind === 'ai' ? ' is-active' : ''}`} onClick={() => setView({ kind: 'ai' })}>
          <span aria-hidden="true">✦</span> Spør AI
        </button>
        <nav className="reports-sidebar__nav">
          <button type="button" className={inAllReports ? 'is-active' : ''} onClick={() => showList()}>
            Alle rapporter
          </button>
          <button type="button" className={`reports-sidebar__sub${inAllReports && tab === 'standard' ? ' is-current' : ''}`} onClick={() => showList('standard')}>
            Standardrapporter <span className="count">{reports?.length ?? 0}</span>
          </button>
          <button type="button" className={`reports-sidebar__sub${inAllReports && tab === 'saved' ? ' is-current' : ''}`} onClick={() => showList('saved')}>
            Dine rapporter <span className="count">{saved.length}</span>
          </button>
          <button type="button" className={view.kind === 'metrics' ? 'is-active' : ''} onClick={() => setView({ kind: 'metrics' })}>
            Metrikker <span className="count">{metrics?.length ?? 0}</span>
          </button>
        </nav>
      </aside>

      <div className="reports-main">
        {view.kind === 'list' && (
          <ReportList
            tab={tab}
            setTab={setTab}
            reports={reports}
            reportsError={reportsError}
            saved={saved}
            onOpen={setView}
            onRemove={(entry) => setSaved(removeSavedReport(customerId, entry.saved_at))}
            onAskAi={() => setView({ kind: 'ai' })}
          />
        )}
        {(view.kind === 'standard' || view.kind === 'saved') && (
          <LoadedReport
            key={view.kind === 'standard' ? `standard-${view.summary.id}` : `saved-${view.saved.saved_at}`}
            customerId={customerId}
            view={view}
            onBack={() => showList()}
          />
        )}
        {view.kind === 'metrics' && <MetricCatalog metrics={metrics} error={metricsError} />}
        {view.kind === 'ai' && <AiPanel customerId={customerId} result={aiResult} setResult={setAiResult} onSaved={setSaved} />}
      </div>
    </div>
  )
}

export default function Reports() {
  const { selectedCustomerId, loading, error } = useCustomerContext()

  if (loading) return <p className="loading-state">Henter kunder …</p>
  if (error) return <p className="error-state">{error}</p>
  if (!selectedCustomerId) return <p className="empty-state">Velg en kunde for å se rapporter.</p>

  return <ReportsWorkspace key={selectedCustomerId} customerId={selectedCustomerId} />
}
