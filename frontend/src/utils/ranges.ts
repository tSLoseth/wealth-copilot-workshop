import { RANGES, type RangeKey } from '../api/reportTypes'
import { formatDateNo } from './format'

// "I år" is easily misread as "1 år", so the frontend overrides the shared label.
const LABEL_OVERRIDES: Partial<Record<RangeKey, string>> = { YTD: 'Hittil i år' }

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = RANGES.map((r) => ({ key: r.key, label: LABEL_OVERRIDES[r.key] ?? r.label }))

export function rangeLabel(range: RangeKey): string {
  return RANGE_OPTIONS.find((r) => r.key === range)?.label ?? range
}

const MONTHS: Partial<Record<RangeKey, number>> = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12, '3Y': 36, '5Y': 60 }

// A range still counts as covered when history starts within this many days after its start
// (weekends and holidays mean the first trading day rarely matches the calendar date).
const TOLERANCE_DAYS = 7

function toUtc(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`)
}

export function rangeStart(range: RangeKey, endDate: string): Date | null {
  const end = toUtc(endDate)
  if (range === 'ALL') return null
  if (range === 'YTD') return new Date(Date.UTC(end.getUTCFullYear(), 0, 1))
  const start = new Date(end)
  start.setUTCMonth(start.getUTCMonth() - (MONTHS[range] ?? 0))
  return start
}

export function isRangeAvailable(range: RangeKey, firstDate: string | null | undefined, endDate: string | null | undefined): boolean {
  if (!firstDate || !endDate) return true
  const start = rangeStart(range, endDate)
  if (!start) return true
  return toUtc(firstDate).getTime() - start.getTime() <= TOLERANCE_DAYS * 86_400_000
}

export function unavailableReason(firstDate: string): string {
  return `Ikke nok historikk – dataene starter ${formatDateNo(firstDate)}`
}
