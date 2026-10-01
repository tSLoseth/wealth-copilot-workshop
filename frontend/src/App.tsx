import { HashRouter, Route, Routes, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Portfolio from './pages/Portfolio'
import Risk from './pages/Risk'
import Copilot from './pages/Copilot'
import Reports from './pages/Reports'
import Admin from './pages/Admin'
import { CustomerProvider } from './context/CustomerContext'
import { DrillDownProvider } from './context/DrillDownContext'
import { ViewSettingsProvider } from './context/ViewSettingsContext'

// HashRouter is used (rather than BrowserRouter) so client-side routes work
// out of the box on GitHub Pages static hosting without needing a custom
// 404-redirect workaround.
export default function App() {
  return (
    <CustomerProvider>
      <ViewSettingsProvider>
        <DrillDownProvider>
          <HashRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="portfolio" element={<Portfolio />} />
                <Route path="risiko" element={<Risk />} />
                <Route path="insights" element={<Navigate to="/risiko" replace />} />
                <Route path="copilot" element={<Copilot />} />
                <Route path="rapporter" element={<Reports />} />
                <Route path="admin" element={<Admin />} />
              </Route>
            </Routes>
          </HashRouter>
        </DrillDownProvider>
      </ViewSettingsProvider>
    </CustomerProvider>
  )
}
