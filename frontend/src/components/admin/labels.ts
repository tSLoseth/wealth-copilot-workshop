import { RANGES, type AiInteraction } from '../../api/reportTypes'

export const HIGHLIGHTED_FLAGS = new Set(['ønsker_råd', 'bekymring'])

export const STATUS_LABELS: Record<AiInteraction['status'], string> = {
  ok: 'Rapport laget',
  refused: 'Avvist',
  fallback: 'Standardrapport brukt',
  error: 'Feil',
}

const SOURCE_LABELS: Record<string, string> = {
  standard: 'Standardrapport',
  saved: 'Lagret rapport',
  ai: 'AI-rapport',
}

export function flagLabel(flag: string): string {
  return flag.replace(/_/g, ' ')
}

export function sourceLabel(source: string | null): string | null {
  if (!source) return null
  return SOURCE_LABELS[source] ?? source
}

export function rangeLabel(range: string | null): string | null {
  if (!range) return null
  return RANGES.find((item) => item.key === range)?.label ?? range
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}
