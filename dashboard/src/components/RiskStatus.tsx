import { useEffect, useState } from 'react'

interface RiskData {
  pair_id: string
  circuit_broken: boolean
  latest_peg_deviation: number | null
  latest_depth_bid: string | null
  latest_depth_ask: string | null
  oracle_freshness: number | null
}

interface Props {
  pairId: string
  riskControllerAddress: string
}

export function RiskStatus({ pairId, riskControllerAddress }: Props) {
  const [riskData, setRiskData] = useState<RiskData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchRiskStatus()
    const interval = setInterval(fetchRiskStatus, 5000)
    return () => clearInterval(interval)
  }, [pairId, riskControllerAddress])

  const fetchRiskStatus = async () => {
    try {
      const response = await fetch(
        `/api/risk/${pairId}/status?risk_controller_address=${riskControllerAddress}`
      )
      if (!response.ok) {
        setError(`API error: ${response.status}`)
        setLoading(false)
        return
      }
      const data = await response.json()
      setRiskData(data)
      setError(null)
      setLoading(false)
    } catch (err) {
      console.error('Error fetching risk status:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch')
      setLoading(false)
    }
  }

  const formatDepth = (depth: string | null) => {
    if (!depth) return 'N/A'
    return (Number(depth) / 1e18).toFixed(0)
  }

  const formatDeviation = (deviation: number | null) => {
    if (deviation === null) return 'N/A'
    return (deviation / 10000).toFixed(4) + '%'
  }

  if (loading) {
    return (
      <div className="card">
        <h2 className="text-xl font-bold mb-4">Risk Status</h2>
        <div className="text-text-muted">Loading...</div>
      </div>
    )
  }

  if (error || !riskData) {
    return (
      <div className="card">
        <h2 className="text-xl font-bold mb-4">Risk Status</h2>
        <div className="text-red-400">{error || 'No data available'}</div>
      </div>
    )
  }

  return (
    <div className="card">
      <h2 className="text-xl font-bold mb-4">Risk Status</h2>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-text-muted">Circuit Breaker:</span>
          <span
            className={`font-semibold px-3 py-1 rounded ${riskData.circuit_broken
                ? 'bg-red-500/20 text-red-400'
                : 'bg-green-500/20 text-green-400'
              }`}
          >
            {riskData.circuit_broken ? 'TRIGGERED' : 'ACTIVE'}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-text-muted">Peg Deviation:</span>
          <span
            className={`font-semibold ${riskData.latest_peg_deviation && Math.abs(riskData.latest_peg_deviation) > 100
                ? 'text-yellow-400'
                : 'text-green-400'
              }`}
          >
            {formatDeviation(riskData.latest_peg_deviation)}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-text-muted">Bid Depth:</span>
          <span className="font-semibold">{formatDepth(riskData.latest_depth_bid)} USD</span>
        </div>

        <div className="flex justify-between">
          <span className="text-text-muted">Ask Depth:</span>
          <span className="font-semibold">{formatDepth(riskData.latest_depth_ask)} USD</span>
        </div>

        {riskData.latest_depth_bid && riskData.latest_depth_ask && (
          <div className="flex justify-between">
            <span className="text-text-muted">Total Depth:</span>
            <span className="font-semibold text-blue-400">
              {(
                (Number(riskData.latest_depth_bid) + Number(riskData.latest_depth_ask)) /
                1e18
              ).toFixed(0)}{' '}
              USD
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
