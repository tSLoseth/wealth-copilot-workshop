import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { MetricResult, ResolvedReport } from '../api/reportTypes'
import ReportView from '../components/ReportView'

// recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function metric(overrides: Partial<MetricResult>): MetricResult {
  return {
    id: 'annual_volatility',
    title: 'Svingninger',
    question: 'Hvor mye svinger porteføljen?',
    value: 14,
    display: '±14 %',
    unit: '%',
    facts: {},
    provenance: { sources: ['market_data.json'], period: 'siste år', rows_used: 252 },
    assumptions: ['Historikken sier noe om fremtiden.'],
    data_quality: [{ severity: 'warning', message: 'Kursene er gamle.' }],
    ...overrides,
  }
}

const report: ResolvedReport = {
  id: 'risk',
  title: 'Hvor kommer risikoen fra?',
  intro: 'Kort forklaring.',
  source: 'standard',
  blocks: [
    { type: 'kpi', caption: 'Forventet svingning', metric: metric({ status: 'above' }) },
    {
      type: 'bar',
      metric: metric({
        id: 'risk_by_holding',
        title: 'Risiko per beholdning',
        value_label: 'Andel av verdien',
        secondary_label: 'Andel av svingningene',
        breakdown: [{ label: 'Teknologifond', value: 24, display: '24 %', secondary: 38, secondary_display: '38 %', meta: { ticker: 'TECHF' } }],
      }),
    },
    {
      type: 'table',
      metric: metric({ id: 'overlap', title: 'Overlapp', breakdown: [{ label: 'US TechCore', value: 9, display: '9 %', meta: { eies_via: 'Direkte 5 %' } }] }),
    },
    {
      type: 'scenario',
      metric: metric({
        id: 'stress_test',
        title: 'Stresstest',
        display: '−120 000 kr',
        facts: { scenario_name: 'Teknologifall', scenario_description: 'Teknologi faller 40 %.' },
        breakdown: [{ label: 'Teknologifond', value: -60000, display: '−60 000 kr' }],
      }),
    },
    { type: 'status', caption: 'Over det som er vanlig.', metric: metric({ id: 'profile_fit', title: 'Passer profilen', status: 'above' }) },
    { type: 'text', text: 'Linje én.\nLinje to.' },
  ],
  data_basis: {
    sources: ['market_data.json'],
    price_history_start: '2025-10-01',
    price_history_end: '2026-09-30',
    fund_holdings_as_of: '2026-08-30',
    notes: [{ severity: 'notice', message: 'Fondsinnholdet er fra forrige måned.' }],
  },
  assumptions: ['Ingen handler i perioden.'],
  disclaimer: 'Dette er ikke investeringsråd.',
  generated_at: '2026-10-01T12:00:00Z',
}

describe('ReportView', () => {
  afterEach(cleanup)

  it('renders every block type and the data basis', () => {
    render(<ReportView report={report} />)
    expect(screen.getByText('Hvor kommer risikoen fra?')).toBeTruthy()
    expect(screen.getAllByText('Over profilen').length).toBeGreaterThan(0)
    expect(screen.getByText('Overlapp')).toBeTruthy()
    expect(screen.getByText('Eies via')).toBeTruthy()
    expect(screen.getByText('Teknologifall')).toBeTruthy()
    expect(screen.getByText('Største tap')).toBeTruthy()
    expect(screen.getByText('TECHF')).toBeTruthy()
    expect(screen.getByText('Datagrunnlag')).toBeTruthy()
    expect(screen.getByText('Dette er ikke investeringsråd.')).toBeTruthy()
  })

  it('reveals provenance behind "Hvorfor ser jeg dette?"', () => {
    render(<ReportView report={report} />)
    fireEvent.click(screen.getAllByText('Hvorfor ser jeg dette?')[0])
    expect(screen.getByText('Hvor mye svinger porteføljen?')).toBeTruthy()
    expect(screen.getByText('252')).toBeTruthy()
  })
})
