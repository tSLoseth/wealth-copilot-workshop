export function formatCurrency(value: number, currency = 'NOK'): string {
  return `${Math.round(value).toLocaleString('en-US')} ${currency}`
}

export function formatPercentage(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}%`
}

export function formatDateNo(value: string | null | undefined, withTime = false): string {
  if (!value) return 'ukjent'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('nb-NO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

const MINUS = '−'

export function formatNum(value: number, decimals = 1): string {
  return value.toLocaleString('nb-NO', { maximumFractionDigits: decimals, minimumFractionDigits: 0 })
}

export function formatPct(value: number, decimals = 1): string {
  return `${value < 0 ? MINUS : ''}${formatNum(Math.abs(value), decimals)} %`
}

export function formatSignedPct(value: number, decimals = 1): string {
  return `${value < 0 ? MINUS : '+'}${formatNum(Math.abs(value), decimals)} %`
}

export function formatPp(value: number, decimals = 1): string {
  return `${value < 0 ? MINUS : '+'}${formatNum(Math.abs(value), decimals)} prosentpoeng`
}

export function formatKr(value: number): string {
  return `${value < 0 ? MINUS : ''}${Math.round(Math.abs(value)).toLocaleString('nb-NO')} kr`
}

export function formatShortDate(value: string, withYear = false): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('nb-NO', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  })
}
