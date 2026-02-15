import { useReadContract, useReadContracts } from 'wagmi'
import { Address, formatUnits } from 'viem'
import { Card, CardHeader, CardTitle, CardContent } from './ui'

interface Props {
  pairId: string
  riskControllerAddress: string
}

const DEX_ADDRESS = '0xDEc0000000000000000000000000000000000000' as Address
const DEX_PAIR_KEY = '0x3bfd5cdc8e0daf98f3d67a44ff65724362321f4b1054dee562599033633e8dfe' as `0x${string}` // Alpha/Path

const DEX_ABI = [
  {
    inputs: [{ name: 'pairKey', type: 'bytes32' }],
    name: 'books',
    outputs: [
      { name: 'base', type: 'address' },
      { name: 'quote', type: 'address' },
      { name: 'bestBidTick', type: 'int16' },
      { name: 'bestAskTick', type: 'int16' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'base', type: 'address' },
      { name: 'tick', type: 'int16' },
      { name: 'isBid', type: 'bool' }
    ],
    name: 'getTickLevel',
    outputs: [
      { name: 'head', type: 'uint128' },
      { name: 'tail', type: 'uint128' },
      { name: 'totalLiquidity', type: 'uint128' }
    ],
    stateMutability: 'view',
    type: 'function'
  }
] as const

const RISK_ABI = [
  {
    inputs: [],
    name: 'paused',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

export function RiskStatus({ riskControllerAddress }: Props) {
  // 1. Check Circuit Breaker Status
  const { data: isPaused } = useReadContract({
    address: riskControllerAddress as Address,
    abi: RISK_ABI,
    functionName: 'paused'
  })

  // 2. Get Orderbook State (Best Bid/Ask)
  const { data: bookData } = useReadContract({
    address: DEX_ADDRESS,
    abi: DEX_ABI,
    functionName: 'books',
    args: [DEX_PAIR_KEY]
  })

  const bestBidTick = bookData ? bookData[2] : 0
  const bestAskTick = bookData ? bookData[3] : 0

  // 3. Get Depth at Best Ticks
  const { data: depthData } = useReadContracts({
    contracts: [
      {
        address: DEX_ADDRESS,
        abi: DEX_ABI,
        functionName: 'getTickLevel',
        args: [bookData?.[0] || '0x0000000000000000000000000000000000000000', bestBidTick, true]
      },
      {
        address: DEX_ADDRESS,
        abi: DEX_ABI,
        functionName: 'getTickLevel',
        args: [bookData?.[0] || '0x0000000000000000000000000000000000000000', bestAskTick, false]
      }
    ]
  })

  const bidDepth = depthData?.[0]?.result?.[2] || 0n
  const askDepth = depthData?.[1]?.result?.[2] || 0n

  // Calculations
  const calculateDeviation = (tick: number) => {
    // Tick 0 = 1.00. Each tick is 0.001% (1bp = 10 ticks? No, usually 1 tick = 1 pip)
    // Assuming 1 tick = 0.0001 (1bp)
    const deviationBps = Math.abs(tick) // basic approx
    return (deviationBps / 100).toFixed(4) + '%'
  }

  const maxDeviationTick = Math.max(Math.abs(bestBidTick), Math.abs(bestAskTick))
  const deviation = calculateDeviation(maxDeviationTick)
  const isHealthy = maxDeviationTick < 200 // Max 2% deviation threshold example

  const formatDepth = (amount: bigint) => {
    const val = Number(formatUnits(amount, 6)) // USDC/Stable usually 6 decimals
    return val.toLocaleString(undefined, { maximumFractionDigits: 0 })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Risk Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-text-muted">Circuit Breaker:</span>
            <span
              className={`font-semibold px-3 py-1 rounded ${isPaused
                ? 'bg-red-500/20 text-red-400'
                : 'bg-green-500/20 text-green-400'
                }`}
            >
              {isPaused ? 'TRIGGERED' : 'ACTIVE'}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-text-muted">Peg Deviation:</span>
            <span
              className={`font-mono font-semibold ${!isHealthy
                ? 'text-yellow-400'
                : 'text-green-400'
                }`}
            >
              {deviation}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-text-muted">Bid Depth (Best):</span>
            <span className="font-mono font-semibold">{formatDepth(bidDepth)} USD</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-text-muted">Ask Depth (Best):</span>
            <span className="font-mono font-semibold">{formatDepth(askDepth)} USD</span>
          </div>

          <div className="pt-4 border-t border-border mt-4">
            <div className="flex justify-between items-center">
              <span className="text-text-muted">Tick Spread:</span>
              <span className="font-mono text-sm">
                Bid: {bestBidTick} / Ask: {bestAskTick}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

