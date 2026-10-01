import type { ReportSpec } from '../api/reportTypes'

export interface SavedReport {
  spec: ReportSpec
  title: string
  saved_at: string
}

function storageKey(customerId: string): string {
  return `wc.savedReports.${customerId}`
}

function isSavedReport(value: unknown): value is SavedReport {
  const entry = value as SavedReport | null
  return !!entry && typeof entry.title === 'string' && typeof entry.saved_at === 'string' && !!entry.spec
}

export function loadSavedReports(customerId: string): SavedReport[] {
  try {
    const raw = localStorage.getItem(storageKey(customerId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(isSavedReport) : []
  } catch {
    return []
  }
}

function writeSavedReports(customerId: string, reports: SavedReport[]): SavedReport[] {
  try {
    localStorage.setItem(storageKey(customerId), JSON.stringify(reports))
  } catch {
    // Storage can be unavailable (private mode, quota); the list still updates in memory.
  }
  return reports
}

export function addSavedReport(customerId: string, spec: ReportSpec, title: string): SavedReport[] {
  const entry: SavedReport = { spec, title, saved_at: new Date().toISOString() }
  return writeSavedReports(customerId, [entry, ...loadSavedReports(customerId)])
}

export function removeSavedReport(customerId: string, savedAt: string): SavedReport[] {
  return writeSavedReports(
    customerId,
    loadSavedReports(customerId).filter((report) => report.saved_at !== savedAt),
  )
}
