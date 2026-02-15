import { useEffect, useState } from 'react'
import { Button, Card, CardHeader, CardTitle, CardContent, Badge, AddressChip } from './ui'
import { ThemeToggle } from './ThemeToggle'

interface LandingPageProps {
  onGetStarted: () => void
}

interface Stats {
  tvl: string
  deployedCapital: string
  activeOrders: number
  lastOracleUpdate: string
  oracleHealth: 'healthy' | 'stale' | 'dead'
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  const explorerUrl = import.meta.env.VITE_EXPLORER_URL
  const contracts = {
    governance: import.meta.env.VITE_GOVERNANCE_ROLES_ADDRESS,
    vault: import.meta.env.VITE_TREASURY_VAULT_ADDRESS,
    strategy: import.meta.env.VITE_DEX_STRATEGY_ADDRESS,
    riskController: import.meta.env.VITE_RISK_CONTROLLER_ADDRESS
  }

  // Fetch live stats from API
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/stats`)
        if (response.ok) {
          const data = await response.json()
          setStats(data)
        }
      } catch (err) {
        console.error('Failed to fetch stats:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
    const interval = setInterval(fetchStats, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen">
      {/* Theme Toggle */}
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 lg:py-32">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-serif font-bold mb-6 leading-tight">
              TempoVault
            </h1>
            <p className="text-xl sm:text-2xl md:text-3xl text-text-muted font-serif mb-4">
              Institutional Treasury Management
            </p>
            <p className="text-base sm:text-lg md:text-xl text-text-muted font-sans mb-12 max-w-2xl mx-auto leading-relaxed">
              A production-grade treasury vault with autonomous market making strategies,
              institutional risk controls, and real-time oracle integration—built on Tempo.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button onClick={onGetStarted} variant="primary" size="lg" className="w-full sm:w-auto">
                Open Dashboard
              </Button>
              <a
                href={`${explorerUrl}/address/${contracts.vault}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto"
              >
                <Button variant="ghost" size="lg" className="w-full">
                  View Contracts ↗
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Live Stats Section */}
      <section className="py-12 sm:py-16 bg-surface border-y border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-center mb-8 sm:mb-12">
            Live Protocol Stats
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <Card className="text-center">
              <CardContent className="py-6">
                <p className="text-sm font-sans text-text-muted mb-2">Total Value Locked</p>
                <p className="text-2xl sm:text-3xl font-serif font-bold">
                  {loading ? '...' : stats?.tvl || '$0'}
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardContent className="py-6">
                <p className="text-sm font-sans text-text-muted mb-2">Deployed Capital</p>
                <p className="text-2xl sm:text-3xl font-serif font-bold">
                  {loading ? '...' : stats?.deployedCapital || '$0'}
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardContent className="py-6">
                <p className="text-sm font-sans text-text-muted mb-2">Active Orders</p>
                <p className="text-2xl sm:text-3xl font-serif font-bold">
                  {loading ? '...' : stats?.activeOrders || 0}
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardContent className="py-6">
                <p className="text-sm font-sans text-text-muted mb-2">Oracle Status</p>
                <div className="flex items-center justify-center gap-2 mt-2">
                  {loading ? (
                    <span className="text-2xl sm:text-3xl font-serif">...</span>
                  ) : (
                    <Badge
                      variant={
                        stats?.oracleHealth === 'healthy'
                          ? 'success'
                          : stats?.oracleHealth === 'stale'
                          ? 'warning'
                          : 'error'
                      }
                    >
                      {stats?.oracleHealth || 'Unknown'}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 sm:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-serif font-bold text-center mb-4">
            How It Works
          </h2>
          <p className="text-center text-text-muted font-sans mb-12 sm:mb-16 max-w-2xl mx-auto">
            A streamlined, institutional-grade approach to treasury management
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
            <Card className="text-center">
              <CardContent className="py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full border-2 border-border flex items-center justify-center">
                  <span className="text-3xl font-serif font-bold">1</span>
                </div>
                <h3 className="text-xl font-serif font-bold mb-3">Deposit Assets</h3>
                <p className="text-sm text-text-muted font-sans leading-relaxed">
                  Connect your wallet and deposit TIP-20 stablecoins into the treasury vault.
                  Requires TREASURY_MANAGER role.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardContent className="py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full border-2 border-border flex items-center justify-center">
                  <span className="text-3xl font-serif font-bold">2</span>
                </div>
                <h3 className="text-xl font-serif font-bold mb-3">Deploy Strategies</h3>
                <p className="text-sm text-text-muted font-sans leading-relaxed">
                  Strategists configure and deploy market making strategies using Tempo's
                  tick-based DEX with automated flip orders.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardContent className="py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full border-2 border-border flex items-center justify-center">
                  <span className="text-3xl font-serif font-bold">3</span>
                </div>
                <h3 className="text-xl font-serif font-bold mb-3">Monitor & Control</h3>
                <p className="text-sm text-text-muted font-sans leading-relaxed">
                  Real-time risk monitoring with oracle price feeds, exposure limits, and
                  circuit breakers for institutional safety.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardContent className="py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full border-2 border-border flex items-center justify-center">
                  <span className="text-3xl font-serif font-bold">4</span>
                </div>
                <h3 className="text-xl font-serif font-bold mb-3">Earn & Withdraw</h3>
                <p className="text-sm text-text-muted font-sans leading-relaxed">
                  Capture spread and trading fees. Withdraw undeployed capital anytime,
                  or emergency unwind all positions if needed.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Strategies Section */}
      <section className="py-16 sm:py-24 bg-surface">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-serif font-bold text-center mb-4">
            Strategy Modules
          </h2>
          <p className="text-center text-text-muted font-sans mb-12 sm:mb-16 max-w-2xl mx-auto">
            Production-ready strategies designed for institutional risk tolerance
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <span className="text-2xl">📊</span>
                  Market Making (DEX)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-text-muted font-sans leading-relaxed">
                  Automated liquidity provision using Tempo's tick-based DEX with symmetric
                  flip orders around reference prices.
                </p>
                <ul className="space-y-2 text-sm font-sans">
                  <li className="flex items-start gap-2">
                    <span className="text-accent mt-1">✓</span>
                    <span>Tick-based pricing system (±2% range)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent mt-1">✓</span>
                    <span>Automated bid/ask spread capture</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent mt-1">✓</span>
                    <span>Oracle-driven reference tick adjustment</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent mt-1">✓</span>
                    <span>Internal DEX balance management</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <span className="text-2xl">🏦</span>
                  Lending Module
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-text-muted font-sans leading-relaxed">
                  Earn yield on undeployed treasury capital through approved lending protocols
                  with strict risk parameters.
                </p>
                <ul className="space-y-2 text-sm font-sans">
                  <li className="flex items-start gap-2">
                    <span className="text-accent mt-1">✓</span>
                    <span>Whitelisted protocol integration</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent mt-1">✓</span>
                    <span>Automated yield optimization</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent mt-1">✓</span>
                    <span>Collateral health monitoring</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent mt-1">✓</span>
                    <span>Emergency withdrawal capabilities</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Risk Controls Section */}
      <section className="py-16 sm:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-serif font-bold text-center mb-4">
            Institutional Risk Controls
          </h2>
          <p className="text-center text-text-muted font-sans mb-12 sm:mb-16 max-w-2xl mx-auto">
            Multi-layered safety mechanisms for institutional treasury management
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 max-w-5xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Circuit Breaker</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-text-muted font-sans leading-relaxed mb-3">
                  Automatic strategy pause triggered when market conditions exceed predefined
                  volatility or slippage thresholds.
                </p>
                <Badge variant="success">Active</Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Exposure Limits</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-text-muted font-sans leading-relaxed mb-3">
                  Per-pair and global capital allocation caps enforced by RiskController,
                  preventing over-concentration.
                </p>
                <Badge variant="success">Enforced</Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Oracle Freshness</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-text-muted font-sans leading-relaxed mb-3">
                  Continuous price feed monitoring with staleness detection. Strategies halt
                  if oracle data exceeds acceptable age.
                </p>
                <Badge variant={stats?.oracleHealth === 'healthy' ? 'success' : 'warning'}>
                  {stats?.oracleHealth || 'Monitoring'}
                </Badge>
              </CardContent>
            </Card>
          </div>

          <div className="mt-12 text-center">
            <Card className="inline-block max-w-2xl">
              <CardContent className="py-6">
                <h3 className="font-serif font-bold text-xl mb-3">Emergency Controls</h3>
                <p className="text-sm text-text-muted font-sans leading-relaxed">
                  EMERGENCY_ROLE holders can instantly unwind all positions, cancel active orders,
                  and withdraw funds to treasury in critical situations.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer Section */}
      <footer className="py-12 sm:py-16 bg-surface border-t border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="font-serif font-bold text-lg mb-4">Deployed Contracts</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-text-muted font-sans mb-1">Governance Roles</p>
                  <AddressChip address={contracts.governance} explorerUrl={explorerUrl} />
                </div>
                <div>
                  <p className="text-text-muted font-sans mb-1">Treasury Vault</p>
                  <AddressChip address={contracts.vault} explorerUrl={explorerUrl} />
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-serif font-bold text-lg mb-4">Strategy Modules</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-text-muted font-sans mb-1">DEX Strategy</p>
                  <AddressChip address={contracts.strategy} explorerUrl={explorerUrl} />
                </div>
                <div>
                  <p className="text-text-muted font-sans mb-1">Risk Controller</p>
                  <AddressChip address={contracts.riskController} explorerUrl={explorerUrl} />
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-serif font-bold text-lg mb-4">Network</h3>
              <div className="space-y-2 text-sm font-sans">
                <p className="text-text-muted">Tempo Testnet (Moderato)</p>
                <p className="text-text-muted">Chain ID: 42431</p>
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline block"
                >
                  Block Explorer ↗
                </a>
              </div>
            </div>

            <div>
              <h3 className="font-serif font-bold text-lg mb-4">Resources</h3>
              <div className="space-y-2 text-sm font-sans">
                <a
                  href={`${import.meta.env.VITE_API_URL}/docs`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline block"
                >
                  API Documentation ↗
                </a>
                <a
                  href="https://docs.tempo.xyz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline block"
                >
                  Tempo Protocol Docs ↗
                </a>
                <a
                  href="https://github.com/winsznx/tempo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline block"
                >
                  GitHub ↗
                </a>
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-8 text-center">
            <p className="text-sm text-text-muted font-sans">
              TempoVault - Institutional Treasury Management on Tempo
            </p>
            <p className="text-xs text-text-muted font-sans mt-2">
              Built with production-grade security. Smart contracts are unaudited. Use at your own risk.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
