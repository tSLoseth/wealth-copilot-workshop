import { ApiError } from './client'
import type { CustomerEvent } from './reportTypes'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export async function fetchAdminEvents(token: string, customerId: string): Promise<{ events: CustomerEvent[] }> {
  const path = `/admin/events?customerId=${encodeURIComponent(customerId)}`
  const response = await fetch(`${API_URL}${path}`, { headers: { 'x-admin-token': token } })
  if (!response.ok) {
    throw new ApiError(`Request to ${path} failed with status ${response.status}`, response.status)
  }
  return (await response.json()) as { events: CustomerEvent[] }
}
