import { useCustomerContext } from '../context/CustomerContext'
import { useViewSettings } from '../context/ViewSettingsContext'
import { useCustomerHistory } from '../hooks/useApiData'
import { RANGE_OPTIONS, isRangeAvailable, unavailableReason } from '../utils/ranges'
import Switch from './Switch'

export function RangeSelector() {
  const { range, setRange } = useViewSettings()
  const { selectedCustomerId } = useCustomerContext()
  const full = useCustomerHistory(selectedCustomerId, { range: 'ALL', benchmark: false })
  const firstDate = full.data?.portfolio.points[0]?.date ?? full.data?.start ?? null
  const endDate = full.data?.end ?? null

  return (
    <div className="segmented segmented--compact" role="group" aria-label="Tidsperiode">
      {RANGE_OPTIONS.map((option) => {
        const available = isRangeAvailable(option.key, firstDate, endDate)
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={range === option.key}
            className={range === option.key ? 'is-active' : undefined}
            disabled={!available}
            title={!available && firstDate ? unavailableReason(firstDate) : undefined}
            onClick={() => setRange(option.key)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export default function ViewControls({ benchmarkToggle = true }: { benchmarkToggle?: boolean }) {
  const { showBenchmark, setShowBenchmark } = useViewSettings()

  return (
    <div className="view-controls">
      <RangeSelector />
      {benchmarkToggle && (
        <Switch
          compact
          checked={showBenchmark}
          onChange={setShowBenchmark}
          label="Sammenlign med OSEBX"
          description="Vis Oslo Børs hovedindeks ved siden av tallene dine"
        />
      )}
    </div>
  )
}
