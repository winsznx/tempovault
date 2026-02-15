import { useReadContracts, useReadContract } from 'wagmi'
import { Address, formatUnits } from 'viem'
import { Card, CardHeader, CardTitle, CardContent, Badge } from './ui'

interface Props {
  strategyAddress: string
  pairId: string
}

const STRATEGY_ABI = [
  {
    inputs: [{ name: 'pairId', type: 'bytes32' }],
    name: 'getActiveOrders',
    outputs: [{ name: '', type: 'uint128[]' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

const DEX_ADDRESS = '0xDEc0000000000000000000000000000000000000' as Address
const ALPHA_TOKEN = '0x20c0000000000000000000000000000000000001' as Address

const DEX_ABI = [
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
  },
  {
    inputs: [{ name: 'base', type: 'address' }],
    name: 'pairKey',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'pure',
    type: 'function'
  },
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
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' }
    ],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint128' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

const DEX_PAIR_KEY = '0x3bfd5cdc8e0daf98f3d67a44ff65724362321f4b1054dee562599033633e8dfe' as `0x${string}`

export function ActiveOrders({ strategyAddress, pairId }: Props) {
  const { data: orderIds, isLoading: ordersLoading, error: ordersError } = useReadContract({
    address: strategyAddress as Address,
    abi: STRATEGY_ABI,
    functionName: 'getActiveOrders',
    args: [pairId as `0x${string}`]
  })

  const { data: bookData } = useReadContract({
    address: DEX_ADDRESS,
    abi: DEX_ABI,
    functionName: 'books',
    args: [DEX_PAIR_KEY]
  })

  const { data: dexBalances } = useReadContracts({
    contracts: [
      {
        address: DEX_ADDRESS,
        abi: DEX_ABI,
        functionName: 'balanceOf',
        args: [strategyAddress as Address, ALPHA_TOKEN]
      },
      {
        address: DEX_ADDRESS,
        abi: DEX_ABI,
        functionName: 'balanceOf',
        args: [strategyAddress as Address, '0x20C0000000000000000000000000000000000000' as Address]
      }
    ]
  })

  const formatTick = (tick: number) => {
    const price = 1 + (tick / 100000)
    return price.toFixed(5)
  }

  const tickToPercentage = (tick: number) => {
    return ((tick / 100000) * 100).toFixed(3) + '%'
  }

  const orderCount = orderIds?.length ?? 0
  const bestBid = bookData ? Number(bookData[2]) : null
  const bestAsk = bookData ? Number(bookData[3]) : null

  const dexAlpha = dexBalances?.[0]?.result ?? 0n
  const dexPathUSD = dexBalances?.[1]?.result ?? 0n

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Active Orders</span>
          {orderCount > 0 && (
            <Badge variant="success">{orderCount} Active</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {ordersLoading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
            <p className="mt-4 text-sm text-text-muted font-sans">Loading orders...</p>
          </div>
        ) : ordersError ? (
          <div className="text-center py-8">
            <p className="text-sm text-red-600 font-sans">Failed to load orders</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-surface rounded-lg border border-border">
              <div>
                <p className="text-xs text-text-muted font-sans mb-1">DEX AlphaUSD (Escrowed)</p>
                <p className="font-mono text-lg">{formatUnits(dexAlpha, 6)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted font-sans mb-1">DEX PathUSD (Escrowed)</p>
                <p className="font-mono text-lg">{formatUnits(dexPathUSD, 6)}</p>
              </div>
              {bestBid !== null && (
                <div>
                  <p className="text-xs text-text-muted font-sans mb-1">Best Bid Tick</p>
                  <p className="font-mono">
                    {bestBid} <span className="text-text-muted text-xs">({formatTick(bestBid)})</span>
                  </p>
                </div>
              )}
              {bestAsk !== null && (
                <div>
                  <p className="text-xs text-text-muted font-sans mb-1">Best Ask Tick</p>
                  <p className="font-mono">
                    {bestAsk} <span className="text-text-muted text-xs">({formatTick(bestAsk)})</span>
                  </p>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-border">
                    <th className="pb-3 font-sans font-semibold">Order ID</th>
                    <th className="pb-3 font-sans font-semibold">Side</th>
                    <th className="pb-3 font-sans font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orderCount === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-text-muted text-center font-sans">
                        No active orders. Deploy liquidity to place orders.
                      </td>
                    </tr>
                  ) : (
                    orderIds?.map((orderId, index) => (
                      <tr key={orderId.toString()} className="border-b border-border hover:bg-surface transition-colors">
                        <td className="py-3 font-mono text-xs">{orderId.toString()}</td>
                        <td className="py-3">
                          <Badge variant={index === 0 ? 'success' : 'error'}>
                            {index === 0 ? 'BID' : 'ASK'}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <Badge variant="info">RESTING</Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
