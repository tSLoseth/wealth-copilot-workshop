import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useCustomerContext } from '../context/CustomerContext'
import { formatKr } from '../utils/format'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

interface CostsResponse {
  total_value: number
  yearly_cost_kr: number
  weighted_fee_pct: number
  rows: { ticker: string; name: string; type: string; value: number; fee_pct: number; yearly_kr: number }[]
  projection: { years: number; without_costs: number; with_costs: number; cost_kr: number }[]
  assumptions: string[]
}

const pct = (v: number) => `${v.toLocaleString('nb-NO', { maximumFractionDigits: 2 })} %`

export default function Costs() {
  const { selectedCustomerId } = useCustomerContext()
  const [data, setData] = useState<CostsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedCustomerId) return
    setData(null)
    fetch(`${API_URL}/customers/${selectedCustomerId}/costs`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Status ${r.status}`))))
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Kunne ikke hente kostnadene'))
  }, [selectedCustomerId])

  if (error) return <p className="error-state">{error}</p>
  if (!data) return <p className="loading-state">Henter kostnader …</p>
  const twenty = data.projection.find((p) => p.years === 20)

  return (
    <div className="page">
      <div className="page-heading">
        <p className="eyebrow">Kostnader</p>
        <h2>Hva betaler du for investeringene dine?</h2>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <p className="stat-card__label">Årlige kostnader</p>
          <p className="stat-card__value">{formatKr(data.yearly_cost_kr)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Gjennomsnittlig kostnad</p>
          <p className="stat-card__value">{pct(data.weighted_fee_pct)}</p>
          <p className="stat-card__sublabel">av verdien per år</p>
        </div>
        {twenty && (
          <div className="stat-card">
            <p className="stat-card__label">Kostnadene over 20 år</p>
            <p className="stat-card__value">{formatKr(twenty.cost_kr)}</p>
            <p className="stat-card__sublabel">inkludert tapt avkastning</p>
          </div>
        )}
      </div>

      <section className="panel">
        <h3>Kostnad per investering</h3>
        <table className="data-table">
          <thead>
            <tr><th>Investering</th><th>Type</th><th>Verdi</th><th>Årlig kostnad</th><th>Per år i kr</th></tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.ticker}>
                <td>{r.name}</td><td>{r.type}</td><td>{formatKr(r.value)}</td><td>{pct(r.fee_pct)}</td><td>{formatKr(r.yearly_kr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h3>Slik vokser kostnadene over tid</h3>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={data.projection.map((p) => ({ ...p, label: `${p.years} år` }))}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} width={60} />
              <Tooltip formatter={(v: number) => formatKr(v)} />
              <Legend />
              <Bar dataKey="without_costs" name="Uten kostnader" fill="#9aa5c4" />
              <Bar dataKey="with_costs" name="Med kostnader" fill="#0000a0" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ul className="muted-small">
          {data.assumptions.map((a) => <li key={a}>{a}</li>)}
        </ul>
      </section>
    </div>
  )
}
