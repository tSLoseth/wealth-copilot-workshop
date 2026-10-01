import { NavLink, Outlet } from 'react-router-dom'
import { useCustomerContext } from '../context/CustomerContext'
import { PROFILE_NB } from '../utils/labels'
import DrillDownPanel from './DrillDownPanel'

function horizonNb(horizon: string): string {
  return horizon.replace(/(\d)\s*-\s*(\d)/, '$1–$2').replace(/\byears?\b/i, 'år')
}

function CustomerSelector() {
  const { customers, selectedCustomerId, setSelectedCustomerId, selectedCustomer, loading } = useCustomerContext()

  if (loading) return <div className="customer-selector customer-selector--loading">Henter kunder …</div>

  return (
    <div className="customer-selector">
      <label htmlFor="customer-select">Kunde</label>
      <select
        id="customer-select"
        value={selectedCustomerId ?? ''}
        onChange={(event) => setSelectedCustomerId(event.target.value)}
      >
        {customers.map((customer) => (
          <option key={customer.customer_id} value={customer.customer_id}>
            {customer.first_name} {customer.last_name} ({customer.customer_id})
          </option>
        ))}
      </select>
      {selectedCustomer && (
        <div className="customer-selector__meta">
          <span>Risikoprofil: {PROFILE_NB[selectedCustomer.risk_profile] ?? selectedCustomer.risk_profile}</span>
          <span>Horisont: {horizonNb(selectedCustomer.investment_horizon)}</span>
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__logo">◆</span>
          <div>
            <h1>Wealth Copilot</h1>
            <p>Fiktiv demobank &middot; kun syntetiske data</p>
          </div>
        </div>
        <nav className="app-nav">
          <NavLink to="/" end>Oversikt</NavLink>
          <NavLink to="/portfolio">Portefølje</NavLink>
          <NavLink to="/risiko">Risiko</NavLink>
          <NavLink to="/insights">Innsikter</NavLink>
          <NavLink to="/copilot">Wealth Copilot</NavLink>
          <NavLink to="/rapporter">Rapporter</NavLink>
          <NavLink to="/admin">Rådgiver</NavLink>
        </nav>
        <CustomerSelector />
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">
        <p>Workshopdemo · Alle kunder, kontoer, transaksjoner og beholdninger er 100 % fiktive, syntetiske data.</p>
      </footer>
      <DrillDownPanel />
    </div>
  )
}
