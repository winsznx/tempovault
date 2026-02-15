import { useEffect, useState } from 'react'

interface PnLData {
  vault_id: number
  token: string
  total_deposited: string
  total_withdrawn: string
  total_deployed: string
  total_losses: string
  total_performance_fees: string
  total_management_fees: string
  net_pnl: string
}

interface Props {
  vaultId: number
}

export function PnLChart({ vaultId }: Props) {
  const [pnlData, setPnlData] = useState<PnLData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchPnL()
    const interval = setInterval(fetchPnL, 15000)
    return () => clearInterval(interval)
  }, [vaultId])

  const fetchPnL = async () => {
    try {
      const response = await fetch(`/api/vault/${vaultId}/pnl?token=0x...`)
      if (!response.ok) {
        setError(`API error: ${response.status}`)
        setLoading(false)
        return
      }
      const data = await response.json()
      setPnlData(data)
      setError(null)
      setLoading(false)
    } catch (err) {
      console.error('Error fetching P&L:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch')
      setLoading(false)
    }
  }

  const formatValue = (value: string) => {
    return (Number(value) / 1e18).toFixed(2)
  }

  if (loading) {
    return (
      <div className="card">
        <h2 className="text-xl font-bold mb-4">P&L Summary</h2>
        <div className="text-text-muted">Loading...</div>
      </div>
    )
  }

  if (error || !pnlData) {
    return (
      <div className="card">
        <h2 className="text-xl font-bold mb-4">P&L Summary</h2>
        <div className="text-red-400">{error || 'No data available'}</div>
      </div>
    )
  }

  const netPnL = Number(pnlData.net_pnl) / 1e18
  const isProfitable = netPnL >= 0

  return (
    <div className="card">
      <h2 className="text-xl font-bold mb-4">P&L Summary</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div>
          <div className="text-text-muted text-sm">Total Deposited</div>
          <div className="text-lg font-semibold">{formatValue(pnlData.total_deposited)} USD</div>
        </div>
        <div>
          <div className="text-text-muted text-sm">Total Withdrawn</div>
          <div className="text-lg font-semibold">{formatValue(pnlData.total_withdrawn)} USD</div>
        </div>
        <div>
          <div className="text-text-muted text-sm">Total Losses</div>
          <div className="text-lg font-semibold text-red-400">{formatValue(pnlData.total_losses)} USD</div>
        </div>
        <div>
          <div className="text-text-muted text-sm">Net P&L</div>
          <div className={`text-lg font-semibold ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
            {isProfitable ? '+' : ''}{netPnL.toFixed(2)} USD
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-text-muted text-sm">Performance Fees</div>
          <div className="text-lg font-semibold text-yellow-400">{formatValue(pnlData.total_performance_fees)} USD</div>
        </div>
        <div>
          <div className="text-text-muted text-sm">Management Fees</div>
          <div className="text-lg font-semibold text-yellow-400">{formatValue(pnlData.total_management_fees)} USD</div>
        </div>
      </div>
    </div>
  )
}
