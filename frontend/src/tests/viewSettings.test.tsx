import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VIEW_SETTINGS_KEY, ViewSettingsProvider, loadViewSettings, useViewSettings } from '../context/ViewSettingsContext'

function Probe() {
  const { range, setRange, showBenchmark, setShowBenchmark } = useViewSettings()
  return (
    <div>
      <span data-testid="state">{`${range}|${showBenchmark}`}</span>
      <button type="button" onClick={() => setRange('3Y')}>3 år</button>
      <button type="button" onClick={() => setShowBenchmark(false)}>Skjul</button>
    </div>
  )
}

describe('ViewSettings', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('defaults to 1 year with OSEBX shown', () => {
    expect(loadViewSettings()).toEqual({ range: '1Y', showBenchmark: true })
  })

  it('persists changes and restores them on the next visit', () => {
    render(
      <ViewSettingsProvider>
        <Probe />
      </ViewSettingsProvider>,
    )
    act(() => screen.getByText('3 år').click())
    act(() => screen.getByText('Skjul').click())
    expect(screen.getByTestId('state').textContent).toBe('3Y|false')
    expect(JSON.parse(localStorage.getItem(VIEW_SETTINGS_KEY)!)).toEqual({ range: '3Y', showBenchmark: false })

    cleanup()
    render(
      <ViewSettingsProvider>
        <Probe />
      </ViewSettingsProvider>,
    )
    expect(screen.getByTestId('state').textContent).toBe('3Y|false')
  })

  it('ignores corrupt or unknown stored values', () => {
    localStorage.setItem(VIEW_SETTINGS_KEY, '{not json')
    expect(loadViewSettings()).toEqual({ range: '1Y', showBenchmark: true })
    localStorage.setItem(VIEW_SETTINGS_KEY, JSON.stringify({ range: '10Y', showBenchmark: 'ja' }))
    expect(loadViewSettings()).toEqual({ range: '1Y', showBenchmark: true })
  })
})
