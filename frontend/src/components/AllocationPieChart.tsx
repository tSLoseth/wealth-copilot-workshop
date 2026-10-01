import { useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { AllocationSlice } from '../api/types'
import { useDrillDown } from '../context/DrillDownContext'
import { useExposures } from '../hooks/useApiData'
import { groupBy, slicesFromAllocation, type GroupDimension, type GroupSlice } from '../utils/drill'
import { formatKr, formatPct } from '../utils/format'
import Switch from './Switch'

const COLORS = ['#0000a0', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#4b5563', '#65a30d', '#0e7490', '#9333ea', '#b45309']

interface AllocationPieChartProps {
  title: string
  dimension: GroupDimension
  // Allocation by the holdings' own labels (a fund counts as one "Diversified"/"Global" slice).
  holdings: AllocationSlice[]
  customerId: string
}

export default function AllocationPieChart({ title, dimension, holdings, customerId }: AllocationPieChartProps) {
  const [lookThrough, setLookThrough] = useState(true)
  const { stack, openDrill } = useDrillDown()
  const exposures = useExposures(lookThrough ? customerId : null)

  const lookThroughFailed = lookThrough && !exposures.data && !!exposures.error
  const slices: GroupSlice[] =
    lookThrough && exposures.data ? groupBy(exposures.data.exposures, dimension) : slicesFromAllocation(holdings, dimension)
  const waiting = lookThrough && !exposures.data && !exposures.error

  const isSelected = (slice: GroupSlice) => stack.some((target) => target.dimension === dimension && target.value === slice.key)
  const anySelected = slices.some(isSelected)
  const open = (slice: GroupSlice) => openDrill({ dimension, value: slice.key, label: slice.label })

  return (
    <div className="chart-card allocation">
      <header className="allocation__header">
        <h3>{title}</h3>
        <Switch compact checked={lookThrough} onChange={setLookThrough} label="Se gjennom fondene" description="Vis hva fondene dine faktisk eier" />
      </header>
      <p className="muted-small allocation__mode">
        {lookThrough ? 'Viser det fondene dine eier, fordelt på hver del.' : 'Viser beholdningene slik du eier dem. Et fond telles som én del.'}
      </p>
      {lookThroughFailed && <p className="muted-small">Vi fikk ikke sett inn i fondene akkurat nå, så vi viser beholdningene slik du eier dem.</p>}

      {waiting ? (
        <p className="loading-state">Ser inn i fondene …</p>
      ) : slices.length === 0 ? (
        <p className="empty-state">Ingen beholdninger å vise.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="label"
                innerRadius={50}
                outerRadius={85}
                paddingAngle={2}
                cursor="pointer"
                isAnimationActive={false}
                onClick={(_: unknown, index: number) => open(slices[index])}
              >
                {slices.map((slice, index) => (
                  <Cell
                    key={slice.key}
                    fill={COLORS[index % COLORS.length]}
                    fillOpacity={anySelected && !isSelected(slice) ? 0.25 : 1}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(_value: number, _name, item) => [`${formatPct((item.payload as GroupSlice).weight_pct)} · ${formatKr((item.payload as GroupSlice).value)}`, (item.payload as GroupSlice).label]} />
            </PieChart>
          </ResponsiveContainer>
          <ul className="allocation__legend">
            {slices.map((slice, index) => (
              <li key={slice.key}>
                <button
                  type="button"
                  aria-pressed={isSelected(slice)}
                  aria-label={`Se detaljer for ${slice.label}, ${formatPct(slice.weight_pct)} av porteføljen`}
                  onClick={() => open(slice)}
                >
                  <span className="swatch" style={{ background: COLORS[index % COLORS.length] }} aria-hidden="true" />
                  <span className="allocation__label">{slice.label}</span>
                  <span className="allocation__pct">{formatPct(slice.weight_pct)}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="click-hint">Klikk for detaljer</p>
        </>
      )}
    </div>
  )
}
