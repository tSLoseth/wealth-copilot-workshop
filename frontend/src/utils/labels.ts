import type { DrillDimension } from '../api/reportTypes'

// Mirrors api/src/metrics/format.ts so raw English values in the data can be shown in Norwegian.
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

export const RISK_CATEGORY_NB: Record<string, string> = {
  Low: 'Lav',
  Medium: 'Middels',
  High: 'Høy',
}

export const PROFILE_NB: Record<string, string> = {
  Conservative: 'Forsiktig',
  Moderate: 'Moderat',
  Balanced: 'Balansert',
  Growth: 'Vekst',
  Aggressive: 'Offensiv',
}

export const DIMENSION_NB: Record<DrillDimension, string> = {
  sector: 'Sektor',
  geography: 'Region',
  asset_type: 'Aktivatype',
  instrument: 'Verdipapir',
}

const MAPS: Partial<Record<DrillDimension, Record<string, string>>> = {
  sector: SECTOR_NB,
  geography: GEOGRAPHY_NB,
  asset_type: ASSET_TYPE_NB,
}

export function labelFor(dimension: DrillDimension, raw: string): string {
  return MAPS[dimension]?.[raw] ?? raw
}
