import { NavLink, Outlet } from 'react-router-dom'
import { useCustomerContext } from '../context/CustomerContext'

function CustomerSelector() {
  const { customers, selectedCustomerId, setSelectedCustomerId, selectedCustomer, loading } = useCustomerContext()

  if (loading) return <div className="customer-selector customer-selector--loading">Loading customers...</div>

  return (
    <div className="customer-selector">
      <label htmlFor="customer-select">Customer</label>
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
          <span>Risk profile: {selectedCustomer.risk_profile}</span>
          <span>Horizon: {selectedCustomer.investment_horizon}</span>
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
            <p>Fictional demo bank &middot; synthetic data only</p>
          </div>
        </div>
        <nav className="app-nav">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/portfolio">Portfolio</NavLink>
          <NavLink to="/insights">Insights</NavLink>
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
        <p>Workshop demo · All customers, accounts, transactions and holdings are 100% fictional synthetic data.</p>
      </footer>
    </div>
  )
}
