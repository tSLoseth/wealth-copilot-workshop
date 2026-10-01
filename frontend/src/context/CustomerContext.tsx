import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchCustomers } from '../api/client'
import type { Customer } from '../api/types'

interface CustomerContextValue {
  customers: Customer[]
  selectedCustomerId: string | null
  setSelectedCustomerId: (id: string) => void
  selectedCustomer: Customer | null
  loading: boolean
  error: string | null
}

const CustomerContext = createContext<CustomerContextValue | undefined>(undefined)

// A small, fixed set of "featured" customers shown first in the selector so
// workshop participants land on a realistic, varied set of situations
// (rather than the raw alphabetical/generation order of all 500 records).
// CUST-00101 (Jonas Lie) is the persona for the Rapporter case and is selected by default.
const FEATURED_CUSTOMER_IDS = ['CUST-00101', 'CUST-00001', 'CUST-00002', 'CUST-00003', 'CUST-00004', 'CUST-00005']

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchCustomers()
      .then((result) => {
        if (cancelled) return
        const ordered = [
          ...FEATURED_CUSTOMER_IDS.map((id) => result.customers.find((c) => c.customer_id === id)).filter(Boolean),
          ...result.customers.filter((c) => !FEATURED_CUSTOMER_IDS.includes(c.customer_id)),
        ] as Customer[]
        setCustomers(ordered)
        setSelectedCustomerId(ordered[0]?.customer_id ?? null)
      })
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.customer_id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  )

  const value: CustomerContextValue = {
    customers,
    selectedCustomerId,
    setSelectedCustomerId,
    selectedCustomer,
    loading,
    error,
  }

  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>
}

export function useCustomerContext(): CustomerContextValue {
  const context = useContext(CustomerContext)
  if (!context) throw new Error('useCustomerContext must be used within a CustomerProvider')
  return context
}
