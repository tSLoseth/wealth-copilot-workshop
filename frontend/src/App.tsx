import { HashRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Portfolio from './pages/Portfolio'
import Insights from './pages/Insights'
import Copilot from './pages/Copilot'
import Reports from './pages/Reports'
import Admin from './pages/Admin'
import { CustomerProvider } from './context/CustomerContext'

// HashRouter is used (rather than BrowserRouter) so client-side routes work
// out of the box on GitHub Pages static hosting without needing a custom
// 404-redirect workaround.
export default function App() {
  return (
    <CustomerProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="portfolio" element={<Portfolio />} />
            <Route path="insights" element={<Insights />} />
            <Route path="copilot" element={<Copilot />} />
            <Route path="rapporter" element={<Reports />} />
            <Route path="admin" element={<Admin />} />
          </Route>
        </Routes>
      </HashRouter>
    </CustomerProvider>
  )
}
