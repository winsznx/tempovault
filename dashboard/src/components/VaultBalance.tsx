import { useReadContracts } from 'wagmi'
import { formatUnits, Address } from 'viem'
import { Card, CardContent, CardHeader, CardTitle } from './ui'

// Official Tempo Testnet Tokens
const TEMPO_TOKENS = [
  { symbol: 'PathUSD', address: '0x20c0000000000000000000000000000000000000' as Address, decimals: 6 },
  { symbol: 'AlphaUSD', address: '0x20c0000000000000000000000000000000000001' as Address, decimals: 6 },
  { symbol: 'BetaUSD', address: '0x20c0000000000000000000000000000000000002' as Address, decimals: 6 },
  { symbol: 'ThetaUSD', address: '0x20c0000000000000000000000000000000000003' as Address, decimals: 6 },
]

const TREASURY_VAULT_ABI = [
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'tokenBalances',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'deployedCapital',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

interface Props {
  vaultId: number
  vaultAddress: Address
}

export function VaultBalance({ vaultAddress }: Props) {
  // 1. Prepare contract calls for all tokens
  const balanceCalls = TEMPO_TOKENS.flatMap(token => [
    {
      address: vaultAddress,
      abi: TREASURY_VAULT_ABI,
      functionName: 'tokenBalances',
      args: [token.address]
    },
    {
      address: vaultAddress,
      abi: TREASURY_VAULT_ABI,
      functionName: 'deployedCapital',
      args: [token.address]
    }
  ])

  // 2. Fetch all data in one hook
  const { data, isLoading } = useReadContracts({
    contracts: balanceCalls,
    query: {
      refetchInterval: 5000 // Auto-refresh every 5s
    }
  })

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Vault Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-text-muted animate-pulse">Loading balances...</div>
        </CardContent>
      </Card>
    )
  }

  // 3. Process results
  const balances = TEMPO_TOKENS.map((token, index) => {
    const balanceResult = data?.[index * 2]
    const deployedResult = data?.[index * 2 + 1]

    const totalBalance = balanceResult?.status === 'success' ? balanceResult.result as bigint : 0n
    const deployedCapital = deployedResult?.status === 'success' ? deployedResult.result as bigint : 0n

    // Only show tokens with a balance
    if (totalBalance === 0n && deployedCapital === 0n) return null

    const available = totalBalance - deployedCapital

    return {
      token,
      total: formatUnits(totalBalance, token.decimals),
      deployed: formatUnits(deployedCapital, token.decimals),
      available: formatUnits(available, token.decimals)
    }
  }).filter(Boolean) // Remove nulls

  if (balances.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Vault Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-text-muted">No balances found</div>
          <div className="text-xs text-text-muted mt-2">Deposit tokens to see them here</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vault Balance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {balances.map((b) => (
          <div key={b!.token.symbol} className="space-y-2 border-b border-border pb-4 last:border-0 last:pb-0">
            <h3 className="font-serif font-bold text-lg">{b!.token.symbol}</h3>

            <div className="flex justify-between items-center">
              <span className="text-text-muted text-sm">Total Assets</span>
              <span className="font-mono font-semibold">{b!.total}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-text-muted text-sm">Deployed in Strategy</span>
              <span className="font-mono text-blue-500">{b!.deployed}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-text-muted text-sm">Available to Withdraw</span>
              <span className="font-mono text-green-500">{b!.available}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
