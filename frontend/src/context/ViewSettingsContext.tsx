import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { RANGES, type RangeKey } from '../api/reportTypes'
import { rangeLabel } from '../utils/ranges'

export interface ViewSettings {
  range: RangeKey
  showBenchmark: boolean
}

interface ViewSettingsContextValue extends ViewSettings {
  setRange: (range: RangeKey) => void
  setShowBenchmark: (show: boolean) => void
}

export const VIEW_SETTINGS_KEY = 'wc.viewSettings'

export const DEFAULT_VIEW_SETTINGS: ViewSettings = { range: '1Y', showBenchmark: true }

export function loadViewSettings(): ViewSettings {
  try {
    const raw = localStorage.getItem(VIEW_SETTINGS_KEY)
    const parsed = (raw ? JSON.parse(raw) : {}) as Partial<ViewSettings> | null
    return {
      range: RANGES.some((r) => r.key === parsed?.range) ? (parsed!.range as RangeKey) : DEFAULT_VIEW_SETTINGS.range,
      showBenchmark: typeof parsed?.showBenchmark === 'boolean' ? parsed.showBenchmark : DEFAULT_VIEW_SETTINGS.showBenchmark,
    }
  } catch {
    return { ...DEFAULT_VIEW_SETTINGS }
  }
}

function saveViewSettings(settings: ViewSettings) {
  try {
    localStorage.setItem(VIEW_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Storage can be unavailable (private mode); the setting then only lasts for this visit.
  }
}

// The default lets components render outside the provider (e.g. in isolated tests).
const ViewSettingsContext = createContext<ViewSettingsContextValue>({
  ...DEFAULT_VIEW_SETTINGS,
  setRange: () => {},
  setShowBenchmark: () => {},
})

export function ViewSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ViewSettings>(loadViewSettings)

  useEffect(() => saveViewSettings(settings), [settings])

  const value = useMemo<ViewSettingsContextValue>(
    () => ({
      ...settings,
      setRange: (range) => setSettings((current) => ({ ...current, range })),
      setShowBenchmark: (showBenchmark) => setSettings((current) => ({ ...current, showBenchmark })),
    }),
    [settings],
  )

  return <ViewSettingsContext.Provider value={value}>{children}</ViewSettingsContext.Provider>
}

export function useViewSettings(): ViewSettingsContextValue {
  return useContext(ViewSettingsContext)
}

export { rangeLabel }
