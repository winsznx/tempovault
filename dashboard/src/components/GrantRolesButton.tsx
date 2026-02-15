import { useState } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { Address, createPublicClient, createWalletClient, custom, http } from 'viem'
import { Button } from './ui'

const GOVERNANCE_ABI = [
  {
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'account', type: 'address' }
    ],
    name: 'grantRole',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'TREASURY_MANAGER_ROLE',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'STRATEGIST_ROLE',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

interface Props {
  governanceAddress: Address
  userAddress?: Address
}

export function GrantRolesButton({ governanceAddress, userAddress }: Props) {
  const { wallets } = useWallets()
  const [isGranting, setIsGranting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const grantRoles = async () => {
    if (!userAddress || !wallets[0]) return

    setIsGranting(true)
    setError(null)
    setSuccess(false)

    try {
      const publicClient = createPublicClient({
        chain: {
          id: 42431,
          name: 'Tempo Testnet',
          network: 'tempo-testnet',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: {
            default: { http: ['https://rpc.moderato.tempo.xyz'] },
            public: { http: ['https://rpc.moderato.tempo.xyz'] }
          }
        },
        transport: http('https://rpc.moderato.tempo.xyz')
      })

      const walletClient = createWalletClient({
        account: userAddress,
        chain: publicClient.chain,
        transport: custom((window as any).ethereum)
      })

      const [treasuryRole, strategistRole] = await Promise.all([
        publicClient.readContract({
          address: governanceAddress,
          abi: GOVERNANCE_ABI,
          functionName: 'TREASURY_MANAGER_ROLE'
        }),
        publicClient.readContract({
          address: governanceAddress,
          abi: GOVERNANCE_ABI,
          functionName: 'STRATEGIST_ROLE'
        })
      ])

      const hash1 = await walletClient.writeContract({
        address: governanceAddress,
        abi: GOVERNANCE_ABI,
        functionName: 'grantRole',
        args: [treasuryRole, userAddress]
      })

      await publicClient.waitForTransactionReceipt({ hash: hash1 })

      const hash2 = await walletClient.writeContract({
        address: governanceAddress,
        abi: GOVERNANCE_ABI,
        functionName: 'grantRole',
        args: [strategistRole, userAddress]
      })

      await publicClient.waitForTransactionReceipt({ hash: hash2 })

      setSuccess(true)
      setTimeout(() => window.location.reload(), 2000)
    } catch (err: any) {
      if (err.message?.includes('does not match the target chain')) {
        setError('Wrong network detected. Please switch to Tempo Testnet (Chain ID 42431) in your wallet and try again.')
      } else {
        setError(err.shortMessage || err.message || 'Failed to grant roles')
      }
    } finally {
      setIsGranting(false)
    }
  }

  if (success) {
    return (
      <div className="text-green-400 text-sm font-sans">
        ✓ Roles granted! Refreshing...
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={grantRoles}
        disabled={isGranting || !userAddress}
        variant="primary"
        size="sm"
      >
        {isGranting ? 'Granting Roles...' : 'Grant Myself Roles'}
      </Button>
      {error && (
        <div className="text-red-400 text-xs">{error}</div>
      )}
      <div className="text-xs text-text-muted">
        Requires ADMIN_ROLE to execute
      </div>
    </div>
  )
}
