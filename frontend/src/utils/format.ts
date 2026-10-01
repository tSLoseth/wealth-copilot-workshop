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
