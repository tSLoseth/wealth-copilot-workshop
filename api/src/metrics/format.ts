// Norwegian display formatting and labels for the English enum values in the data.
export const SECTOR_NB: Record<string, string> = {
  Technology: 'Teknologi',
  Diversified: 'Bredt diversifisert',
  Healthcare: 'Helse',
  Cash: 'Kontanter',
  Energy: 'Energi',
  Financials: 'Finans',
  'Government Bonds': 'Statsobligasjoner',
  Industrials: 'Industri',
  'Consumer Discretionary': 'Forbruksvarer',
  Utilities: 'Kraft og forsyning',
  'Consumer Staples': 'Dagligvarer',
  'Corporate Bonds': 'Selskapsobligasjoner',
  Materials: 'Materialer',
}

export const ASSET_TYPE_NB: Record<string, string> = {
  Equity: 'Aksjer',
  ETF: 'Børshandlede fond',
  'Mutual Fund': 'Verdipapirfond',
  Bond: 'Obligasjoner',
  Cash: 'Kontanter',
}

export const GEOGRAPHY_NB: Record<string, string> = {
  Norway: 'Norge',
  Sweden: 'Sverige',
  Denmark: 'Danmark',
  Finland: 'Finland',
  Nordics: 'Norden',
  Europe: 'Europa',
  'United States': 'USA',
  'Asia Pacific': 'Asia og stillehavsregionen',
  'Emerging Markets': 'Fremvoksende markeder',
  Global: 'Globalt',
}

export const PROFILE_NB: Record<string, string> = {
  Conservative: 'Forsiktig',
  Moderate: 'Moderat',
  Balanced: 'Balansert',
  Growth: 'Vekst',
  Aggressive: 'Offensiv',
}

export const sectorNb = (s: string) => SECTOR_NB[s] ?? s
export const assetTypeNb = (s: string) => ASSET_TYPE_NB[s] ?? s
export const geographyNb = (s: string) => GEOGRAPHY_NB[s] ?? s

export const round = (value: number, decimals = 1) => Number(value.toFixed(decimals))

export const num = (value: number, decimals = 1) =>
  value.toLocaleString('nb-NO', { maximumFractionDigits: decimals, minimumFractionDigits: 0 })

export const pct = (value: number, decimals = 1) => `${num(value, decimals)} %`

export const kr = (value: number) => `${Math.round(value).toLocaleString('nb-NO')} kr`

export const signedKr = (value: number) => `${value < 0 ? '−' : '+'}${kr(Math.abs(value))}`

export function dateNb(iso: string | null): string {
  if (!iso) return 'ukjent'
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function daysBetween(fromIso: string, to: Date): number {
  return Math.floor((to.getTime() - new Date(`${fromIso}T00:00:00Z`).getTime()) / 86_400_000)
}
