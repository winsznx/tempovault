import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import { LandingPage } from './components/LandingPage'
import { Layout } from './components/Layout'
import { DashboardOverview } from './pages/DashboardOverview'
import { TreasuryPage } from './pages/TreasuryPage'
import { StrategyPage } from './pages/StrategyPage'
import { RiskPage } from './pages/RiskPage'
import { ActivityPage } from './pages/ActivityPage'

function App() {
  const { ready, authenticated, login } = usePrivy()

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg font-sans">Loading...</div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Landing page */}
        <Route
          path="/"
          element={
            authenticated ? (
              <Navigate to="/app" replace />
            ) : (
              <LandingPage onGetStarted={login} />
            )
          }
        />

        {/* Authenticated routes */}
        <Route
          path="/app/*"
          element={
            authenticated ? (
              <Layout>
                <Routes>
                  <Route index element={<DashboardOverview />} />
                  <Route path="treasury" element={<TreasuryPage />} />
                  <Route path="strategy" element={<StrategyPage />} />
                  <Route path="risk" element={<RiskPage />} />
                  <Route path="activity" element={<ActivityPage />} />
                </Routes>
              </Layout>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
