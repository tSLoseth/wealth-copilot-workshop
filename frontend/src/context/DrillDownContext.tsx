import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { DrillTarget } from '../api/reportTypes'
import { sameTarget } from '../utils/drill'
import { useCustomerContext } from './CustomerContext'

export interface DrillDownContextValue {
  stack: DrillTarget[]
  openDrill: (target: DrillTarget) => void
  goTo: (index: number) => void
  back: () => void
  close: () => void
}

export const DrillDownContext = createContext<DrillDownContextValue>({
  stack: [],
  openDrill: () => {},
  goTo: () => {},
  back: () => {},
  close: () => {},
})

export function DrillDownProvider({ children }: { children: ReactNode }) {
  const { selectedCustomerId } = useCustomerContext()
  const [stack, setStack] = useState<DrillTarget[]>([])

  useEffect(() => setStack([]), [selectedCustomerId])

  const openDrill = useCallback((target: DrillTarget) => {
    setStack((current) => {
      const existing = current.findIndex((entry) => sameTarget(entry, target))
      return existing >= 0 ? current.slice(0, existing + 1) : [...current, target]
    })
  }, [])

  const goTo = useCallback((index: number) => setStack((current) => current.slice(0, index + 1)), [])
  const back = useCallback(() => setStack((current) => current.slice(0, -1)), [])
  const close = useCallback(() => setStack([]), [])

  const value = useMemo<DrillDownContextValue>(
    () => ({ stack, openDrill, goTo, back, close }),
    [stack, openDrill, goTo, back, close],
  )

  return <DrillDownContext.Provider value={value}>{children}</DrillDownContext.Provider>
}

export function useDrillDown(): DrillDownContextValue {
  return useContext(DrillDownContext)
}
