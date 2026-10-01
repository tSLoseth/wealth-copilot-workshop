import { describe, expect, it } from 'vitest'
import type { ExposureRow } from '../api/reportTypes'
import { filterExposures, formatPaths, groupBy, slicesFromAllocation, summarize } from '../utils/drill'
import { isRangeAvailable } from '../utils/ranges'

function exposure(overrides: Partial<ExposureRow>): ExposureRow {
  return {
    ticker: 'X',
    name: 'X',
    asset_type: 'Equity',
    sector: 'Technology',
    geography: 'United States',
    asset_type_label: 'Aksjer',
    sector_label: 'Teknologi',
    geography_label: 'USA',
    value: 100,
    weight_pct: 10,
    risk_contribution_pct: 20,
    return_pct: 10,
    paths: [],
    ...overrides,
  }
}

const rows: ExposureRow[] = [
  exposure({
    ticker: 'USTK',
    name: 'US TechCore',
    value: 300,
    weight_pct: 30,
    risk_contribution_pct: 45,
    return_pct: 20,
    paths: [
      { via: 'TECHF', via_name: 'Global Technology Fund', value: 50, weight_pct: 5 },
      { via: 'direct', via_name: 'Direkte', value: 250, weight_pct: 25 },
    ],
  }),
  exposure({ ticker: 'NOTK', name: 'Nordic Tech', geography: 'Norway', geography_label: 'Norge', value: 100, weight_pct: 10, risk_contribution_pct: 10, return_pct: -10 }),
  exposure({ ticker: 'NEW', name: 'Ny aksje', value: 100, weight_pct: 10, risk_contribution_pct: 5, return_pct: null }),
  exposure({ ticker: 'BOND', name: 'Obligasjon', asset_type: 'Bond', sector: 'Corporate Bonds', sector_label: 'Selskapsobligasjoner', geography: 'Norway', geography_label: 'Norge', value: 500, weight_pct: 50, risk_contribution_pct: 40, return_pct: 2 }),
]

describe('drill-down filtering', () => {
  it('filters look-through exposures by the raw value of a dimension', () => {
    const tech = filterExposures(rows, { dimension: 'sector', value: 'Technology', label: 'Teknologi' })
    expect(tech.map((row) => row.ticker)).toEqual(['USTK', 'NOTK', 'NEW'])
    expect(filterExposures(rows, { dimension: 'geography', value: 'Norway', label: 'Norge' })).toHaveLength(2)
    expect(filterExposures(rows, { dimension: 'instrument', value: 'BOND', label: 'Obligasjon' })[0].name).toBe('Obligasjon')
  })

  it('sums shares and value-weights the return, skipping rows without a return', () => {
    const summary = summarize(filterExposures(rows, { dimension: 'sector', value: 'Technology', label: 'Teknologi' }))
    expect(summary.weight_pct).toBe(50)
    expect(summary.value).toBe(500)
    expect(summary.risk_pct).toBe(60)
    expect(summary.return_pct).toBeCloseTo((300 * 20 + 100 * -10) / 400)
    expect(summarize([exposure({ return_pct: null })]).return_pct).toBeNull()
  })

  it('groups by another dimension with Norwegian labels, largest first', () => {
    const groups = groupBy(rows, 'geography')
    expect(groups.map((group) => [group.key, group.label, group.value])).toEqual([
      ['Norway', 'Norge', 600],
      ['United States', 'USA', 400],
    ])
  })

  it('maps holdings-level allocation labels to Norwegian', () => {
    const slices = slicesFromAllocation([{ label: 'Diversified', value: 10, percentage: 28 }], 'sector')
    expect(slices[0]).toMatchObject({ key: 'Diversified', label: 'Bredt diversifisert', weight_pct: 28 })
  })

  it('describes ownership paths, largest first', () => {
    expect(formatPaths(rows[0].paths)).toBe('Direkte 25 % · Global Technology Fund 5 %')
  })
})

describe('isRangeAvailable', () => {
  it('allows ranges covered by the history, with a few days of slack', () => {
    expect(isRangeAvailable('5Y', '2014-01-02', '2026-10-01')).toBe(true)
    expect(isRangeAvailable('1Y', '2025-10-03', '2026-10-01')).toBe(true)
    expect(isRangeAvailable('YTD', '2026-01-02', '2026-10-01')).toBe(true)
  })

  it('blocks ranges that start before the history does', () => {
    expect(isRangeAvailable('3Y', '2025-06-01', '2026-10-01')).toBe(false)
    expect(isRangeAvailable('1Y', '2026-01-02', '2026-10-01')).toBe(false)
  })

  it('always allows "Alt" and unknown history', () => {
    expect(isRangeAvailable('ALL', '2026-09-01', '2026-10-01')).toBe(true)
    expect(isRangeAvailable('5Y', null, null)).toBe(true)
  })
})
