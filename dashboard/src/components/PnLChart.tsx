import { useReadContracts } from 'wagmi'
import { Address, formatUnits } from 'viem'
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card' // Update import path if needed, assuming existing structure

interface Props {
  vaultId: number
}

const VAULT_ADDRESS = (import.meta.env.VITE_TREASURY_VAULT_ADDRESS || '') as Address
const STRATEGY_ADDRESS = (import.meta.env.VITE_DEX_STRATEGY_ADDRESS || '') as Address
const ALPHA_TOKEN = '0x20c0000000000000000000000000000000000001' as Address
const PATH_USD = '0x20C0000000000000000000000000000000000000' as Address
const DEX_ADDRESS = '0xDEc0000000000000000000000000000000000000' as Address

const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

const DEX_ABI = [
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

export function PnLChart({ }: Props) {
  // Fetch Balances
  const { data: balances, isLoading } = useReadContracts({
    contracts: [
      // 1. Vault Balances (Idle)
      { address: ALPHA_TOKEN, abi: ERC20_ABI, functionName: 'balanceOf', args: [VAULT_ADDRESS] },
      { address: PATH_USD, abi: ERC20_ABI, functionName: 'balanceOf', args: [VAULT_ADDRESS] },
      // 2. Strategy Balances (Undeployed)
      { address: ALPHA_TOKEN, abi: ERC20_ABI, functionName: 'balanceOf', args: [STRATEGY_ADDRESS] },
      { address: PATH_USD, abi: ERC20_ABI, functionName: 'balanceOf', args: [STRATEGY_ADDRESS] },
      // 3. Strategy DEX Balances (Deployed/Escrowed)
      { address: DEX_ADDRESS, abi: DEX_ABI, functionName: 'balanceOf', args: [STRATEGY_ADDRESS, ALPHA_TOKEN] },
      { address: DEX_ADDRESS, abi: DEX_ABI, functionName: 'balanceOf', args: [STRATEGY_ADDRESS, PATH_USD] },
    ]
  })

  // Parse Data
  const vaultAlpha = balances?.[0]?.result ?? 0n
  const vaultPath = balances?.[1]?.result ?? 0n
  const stratAlpha = balances?.[2]?.result ?? 0n
  const stratPath = balances?.[3]?.result ?? 0n
  const dexAlpha = balances?.[4]?.result ?? 0n
  const dexPath = balances?.[5]?.result ?? 0n

  const totalAlpha = vaultAlpha + stratAlpha + BigInt(dexAlpha)
  const totalPath = vaultPath + stratPath + BigInt(dexPath)

  // Assume $0.999 for Alpha, $1.00 for PathUSD
  const totalValueUSD =
    Number(formatUnits(totalAlpha, 6)) * 0.999 +
    Number(formatUnits(totalPath, 6))

  const formatVal = (val: bigint) => Number(formatUnits(val, 6)).toLocaleString(undefined, { maximumFractionDigits: 0 })

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Treasury Composition</CardTitle></CardHeader>
        <CardContent>Loading...</CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>Treasury Composition</span>
          <span className="text-2xl font-mono text-green-400">
            ${totalValueUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Vault (Idle) */}
          <div className="p-4 bg-surface rounded-lg border border-border/50">
            <h3 className="text-text-muted text-sm font-semibold mb-3">Vault (Idle)</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>AlphaUSD</span>
                <span className="font-mono">{formatVal(vaultAlpha)}</span>
              </div>
              <div className="flex justify-between">
                <span>PathUSD</span>
                <span className="font-mono">{formatVal(vaultPath)}</span>
              </div>
            </div>
          </div>

          {/* Strategy (Deployed) */}
          <div className="p-4 bg-surface rounded-lg border border-border/50">
            <h3 className="text-text-muted text-sm font-semibold mb-3">Strategy (Wallet)</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>AlphaUSD</span>
                <span className="font-mono">{formatVal(stratAlpha)}</span>
              </div>
              <div className="flex justify-between">
                <span>PathUSD</span>
                <span className="font-mono">{formatVal(stratPath)}</span>
              </div>
            </div>
          </div>

          {/* DEX (Escrowed) */}
          <div className="p-4 bg-surface rounded-lg border border-border/50">
            <h3 className="text-text-muted text-sm font-semibold mb-3">DEX (Active Orders)</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>AlphaUSD</span>
                <span className="font-mono">{formatVal(BigInt(dexAlpha))}</span>
              </div>
              <div className="flex justify-between">
                <span>PathUSD</span>
                <span className="font-mono">{formatVal(BigInt(dexPath))}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-border">
          <div className="flex justify-between text-sm text-text-muted">
            <span>Total AlphaUSD Exposure: <span className="text-text font-mono">{formatVal(totalAlpha)}</span></span>
            <span>Total PathUSD Exposure: <span className="text-text font-mono">{formatVal(totalPath)}</span></span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

