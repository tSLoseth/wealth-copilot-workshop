import type { AllocationSlice } from '../api/types'
import type { DrillDimension, DrillTarget, ExposurePathRow, ExposureRow, PositionRow } from '../api/reportTypes'
import { formatPct } from './format'
import { labelFor } from './labels'

export type GroupDimension = Exclude<DrillDimension, 'instrument'>

export const GROUP_DIMENSIONS: GroupDimension[] = ['asset_type', 'sector', 'geography']

type Classified = Pick<ExposureRow, 'asset_type' | 'sector' | 'geography' | 'asset_type_label' | 'sector_label' | 'geography_label'>

export function rawOf(row: Classified, dimension: GroupDimension): string {
  return row[dimension]
}

export function labelOf(row: Classified, dimension: GroupDimension): string {
  return row[`${dimension}_label`] || labelFor(dimension, row[dimension])
}

export function sameTarget(a: DrillTarget | undefined, b: DrillTarget | undefined): boolean {
  return !!a && !!b && a.dimension === b.dimension && a.value === b.value
}

export function filterExposures(rows: ExposureRow[], target: DrillTarget): ExposureRow[] {
  if (target.dimension === 'instrument') return rows.filter((row) => row.ticker === target.value)
  const dimension = target.dimension
  return rows.filter((row) => rawOf(row, dimension) === target.value)
}

export function filterPositions(rows: PositionRow[], target: DrillTarget): PositionRow[] {
  if (target.dimension === 'instrument') return rows.filter((row) => row.ticker === target.value)
  const dimension = target.dimension
  return rows.filter((row) => rawOf(row, dimension) === target.value)
}

export interface GroupSummary {
  weight_pct: number
  value: number
  risk_pct: number
  // Value-weighted over rows that have a return; null when none do.
  return_pct: number | null
  count: number
}

export function summarize(rows: Pick<ExposureRow, 'weight_pct' | 'value' | 'risk_contribution_pct' | 'return_pct'>[]): GroupSummary {
  let weighted = 0
  let withReturn = 0
  for (const row of rows) {
    if (row.return_pct === null || row.return_pct === undefined) continue
    weighted += row.value * row.return_pct
    withReturn += row.value
  }
  return {
    weight_pct: rows.reduce((sum, row) => sum + row.weight_pct, 0),
    value: rows.reduce((sum, row) => sum + row.value, 0),
    risk_pct: rows.reduce((sum, row) => sum + row.risk_contribution_pct, 0),
    return_pct: withReturn > 0 ? weighted / withReturn : null,
    count: rows.length,
  }
}

export interface GroupSlice {
  key: string
  label: string
  value: number
  weight_pct: number
  risk_pct: number
}

export function groupBy(rows: (Classified & Pick<ExposureRow, 'value' | 'weight_pct' | 'risk_contribution_pct'>)[], dimension: GroupDimension): GroupSlice[] {
  const groups = new Map<string, GroupSlice>()
  for (const row of rows) {
    const key = rawOf(row, dimension)
    const group = groups.get(key) ?? { key, label: labelOf(row, dimension), value: 0, weight_pct: 0, risk_pct: 0 }
    group.value += row.value
    group.weight_pct += row.weight_pct
    group.risk_pct += row.risk_contribution_pct
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => b.value - a.value)
}

export function slicesFromAllocation(slices: AllocationSlice[], dimension: GroupDimension): GroupSlice[] {
  return slices.map((slice) => ({
    key: slice.label,
    label: labelFor(dimension, slice.label),
    value: slice.value,
    weight_pct: slice.percentage,
    risk_pct: 0,
  }))
}

export function formatPaths(paths: ExposurePathRow[]): string {
  return [...paths]
    .sort((a, b) => b.value - a.value)
    .map((path) => `${path.via === 'direct' ? 'Direkte' : path.via_name} ${formatPct(path.weight_pct)}`)
    .join(' · ')
}
