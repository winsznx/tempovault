import { useState, useEffect } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, useReadContracts } from 'wagmi'
import { Address, formatUnits, parseUnits } from 'viem'
import { Modal, Button } from '../ui'

// ABI Definitions
const DEX_STRATEGY_COMPACT_ABI = [
  {
    inputs: [
      { name: 'pairId', type: 'bytes32' },
      { name: 'baseAmount', type: 'uint128' },
      { name: 'quoteAmount', type: 'uint128' },
      { name: 'centerTick', type: 'int16' }
    ],
    name: 'deployLiquidity',
    outputs: [{ name: 'orderIds', type: 'uint128[]' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'getDexBalance',
    outputs: [{ name: '', type: 'uint128' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

const TREASURY_VAULT_ABI = [
  {
    inputs: [
      { name: 'strategy', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'pairId', type: 'bytes32' }
    ],
    name: 'deployToStrategy',
    outputs: [{ name: 'deploymentId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'tokenBalances',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

// Configuration
const VAULT_ADDRESS = (import.meta.env.VITE_TREASURY_VAULT_ADDRESS || '0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D') as Address
// AlphaUSD (Base)
const BASE_TOKEN = '0x20c0000000000000000000000000000000000001' as Address
// PathUSD (Quote for AlphaUSD on Tempo DEX)
const QUOTE_TOKEN = '0x20C0000000000000000000000000000000000000' as Address

interface DeployLiquidityModalProps {
  isOpen: boolean
  onClose: () => void
  strategyAddress: Address
  pairId: string
  onSuccess?: () => void
}

export function DeployLiquidityModal({
  isOpen,
  onClose,
  strategyAddress,
  pairId,
  onSuccess
}: DeployLiquidityModalProps) {
  const [step, setStep] = useState<'input' | 'funding' | 'deploying' | 'success' | 'error'>('input')
  const [baseAmount, setBaseAmount] = useState('')
  const [quoteAmount, setQuoteAmount] = useState('')
  const [centerTick, setCenterTick] = useState('0')
  const [error, setError] = useState<string | null>(null)

  // Track funding status
  const [fundingToken, setFundingToken] = useState<'base' | 'quote' | null>(null)

  // Contract Writes
  const { writeContract: write, data: txHash, isPending: isWritePending } = useWriteContract()

  // Wait for transaction
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash
  })

  // Read Strategy & Vault Balances
  const { data: balances, refetch: refetchBalances } = useReadContracts({
    contracts: [
      // Strategy Balances
      {
        address: BASE_TOKEN,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [strategyAddress]
      },
      {
        address: QUOTE_TOKEN,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [strategyAddress]
      },
      // Vault Balances
      {
        address: VAULT_ADDRESS,
        abi: TREASURY_VAULT_ABI,
        functionName: 'tokenBalances',
        args: [BASE_TOKEN]
      },
      {
        address: VAULT_ADDRESS,
        abi: TREASURY_VAULT_ABI,
        functionName: 'tokenBalances',
        args: [QUOTE_TOKEN]
      }
    ]
  })

  // Handle transaction confirmation
  useEffect(() => {
    if (isConfirmed) {
      if (step === 'funding') {
        // Funding complete, refresh balances to verify
        refetchBalances()
        setFundingToken(null)
        setStep('input')
      } else if (step === 'deploying') {
        setStep('success')
        onSuccess?.()
      }
    }
  }, [isConfirmed, step, refetchBalances])

  const checkBalances = () => {
    const strategyBase = balances?.[0]?.result || 0n
    const strategyQuote = balances?.[1]?.result || 0n
    const vaultBase = balances?.[2]?.result || 0n
    const vaultQuote = balances?.[3]?.result || 0n

    // Let's assume standard 18 for now, logic holds. If tokens are 6 decimals, parseUnits(..., 6)
    // Actually TreasuryPage said decimals: 6 for Tempo Tokens.

    const inputBaseWei = baseAmount ? parseUnits(baseAmount, 6) : 0n
    const inputQuoteWei = quoteAmount ? parseUnits(quoteAmount, 6) : 0n

    const missingBase = inputBaseWei > strategyBase ? inputBaseWei - strategyBase : 0n
    const missingQuote = inputQuoteWei > strategyQuote ? inputQuoteWei - strategyQuote : 0n

    return {
      missingBase,
      missingQuote,
      strategyBase,
      strategyQuote,
      vaultBase,
      vaultQuote
    }
  }

  const handleFund = (tokenType: 'base' | 'quote', amount: bigint) => {
    setFundingToken(tokenType)
    setStep('funding')
    setError(null)

    const tokenAddress = tokenType === 'base' ? BASE_TOKEN : QUOTE_TOKEN

    write({
      address: VAULT_ADDRESS,
      abi: TREASURY_VAULT_ABI,
      functionName: 'deployToStrategy',
      args: [strategyAddress, tokenAddress, amount, pairId as `0x${string}`]
    })
  }

  const handleDeploy = () => {
    if (!baseAmount && !quoteAmount) return

    try {
      setError(null)
      const inputBaseWei = baseAmount ? parseUnits(baseAmount, 6) : 0n
      const inputQuoteWei = quoteAmount ? parseUnits(quoteAmount, 6) : 0n
      const tickValue = parseInt(centerTick)

      setStep('deploying')
      write({
        address: strategyAddress,
        abi: DEX_STRATEGY_COMPACT_ABI,
        functionName: 'deployLiquidity',
        args: [pairId as `0x${string}`, inputBaseWei, inputQuoteWei, tickValue]
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed')
      setStep('error')
    }
  }

  const handleCreatePlan = () => {
    const { missingBase, missingQuote, vaultBase, vaultQuote } = checkBalances()

    if (missingBase > 0n) {
      if (vaultBase < missingBase) {
        setError(`Insufficient AlphaUSD in Vault. Have ${formatUnits(vaultBase, 6)}, need ${formatUnits(missingBase, 6)}. Deposit in Treasury first.`)
        return
      }
      handleFund('base', missingBase)
      return
    }

    if (missingQuote > 0n) {
      if (vaultQuote < missingQuote) {
        setError(`Insufficient PathUSD in Vault. Have ${formatUnits(vaultQuote, 6)}, need ${formatUnits(missingQuote, 6)}. Deposit in Treasury first.`)
        return
      }
      handleFund('quote', missingQuote)
      return
    }

    // If balances efficient, deploy
    handleDeploy()
  }

  const handleClose = () => {
    setBaseAmount('')
    setQuoteAmount('')
    setStep('input')
    setError(null)
    onClose()
  }

  // UI logic for funding
  const { missingBase, missingQuote, vaultBase, vaultQuote } = checkBalances()
  const isFundingNeeded = missingBase > 0n || missingQuote > 0n

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Deploy Liquidity Strategy" size="lg">
      {step === 'input' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-md">
            <h4 className="font-bold text-blue-800 text-sm mb-1">Strategy Configuration</h4>
            <div className="grid grid-cols-2 gap-4 text-xs font-mono text-blue-700">
              <div>Pair: AlphaUSD / PathUSD</div>
              <div>Strategy Address: {strategyAddress.slice(0, 10)}...</div>
              <div>Vault AlphaUSD: {formatUnits(vaultBase, 6)}</div>
              <div>Vault PathUSD: {formatUnits(vaultQuote, 6)}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-sans font-medium mb-2">
                Base Amount (AlphaUSD)
              </label>
              <input
                type="number"
                value={baseAmount}
                onChange={(e) => setBaseAmount(e.target.value)}
                placeholder="0.0"
                className="w-full px-4 py-3 bg-surface border border-border rounded-md font-mono text-lg text-text focus:outline-none focus:ring-2 focus:ring-accent"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm font-sans font-medium mb-2">
                Quote Amount (PathUSD)
              </label>
              <input
                type="number"
                value={quoteAmount}
                onChange={(e) => setQuoteAmount(e.target.value)}
                placeholder="0.0"
                className="w-full px-4 py-3 bg-surface border border-border rounded-md font-mono text-lg text-text focus:outline-none focus:ring-2 focus:ring-accent"
                min="0"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-sans font-medium mb-2">
              Center Tick (Price Level)
            </label>
            <input
              type="number"
              value={centerTick}
              onChange={(e) => setCenterTick(e.target.value)}
              placeholder="0"
              className="w-full px-4 py-3 bg-surface border border-border rounded-md font-mono text-lg text-text focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <p className="text-xs text-text-muted mt-1">Tick determines the price range for liquidity.</p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-700 font-sans">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button onClick={handleClose} variant="ghost" className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleCreatePlan}
              variant="primary"
              className="flex-1"
              disabled={(!baseAmount && !quoteAmount) || isWritePending}
            >
              {isFundingNeeded
                ? (missingBase > 0n ? 'Step 1: Allocate AlphaUSD from Vault' : 'Step 1: Allocate PathUSD from Vault')
                : 'Deploy to DEX'}
            </Button>
          </div>
        </div>
      )}

      {(step === 'funding' || step === 'deploying') && (
        <div className="text-center py-8 space-y-4">
          <div className="animate-spin w-10 h-10 border-4 border-accent border-t-transparent rounded-full mx-auto" />
          <h3 className="text-lg font-bold">
            {isWritePending ? 'Confirm in Wallet...' : (step === 'funding' ? `Allocating from Vault (${fundingToken === 'base' ? 'AlphaUSD' : 'PathUSD'})...` : 'Deploying Liquidity to DEX...')}
          </h3>
          <p className="text-text-muted">
            {isWritePending ? 'Please sign the transaction to authorize the Vault transfer' : (isConfirming ? 'Waiting for confirmation...' : 'Processing...')}
          </p>
          {txHash && (
            <a href={`https://explore.tempo.xyz/tx/${txHash}`} target="_blank" className="text-accent hover:underline block">
              View on Explorer
            </a>
          )}
        </div>
      )}

      {step === 'success' && (
        <div className="text-center py-8 space-y-4">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto text-2xl">
            ✓
          </div>
          <h3 className="text-lg font-bold">Liquidity Deployed Successfully</h3>
          <p className="text-text-muted">
            Your orders have been placed on the Tempo DEX.
          </p>
          <Button onClick={handleClose} variant="primary" className="w-full">
            Close
          </Button>
        </div>
      )}

      {step === 'error' && (
        <div className="text-center py-8 space-y-4">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-2xl">
            ✕
          </div>
          <h3 className="text-lg font-bold">Transaction Failed</h3>
          <p className="text-text-muted text-sm px-4">
            {error || 'An unknown error occurred'}
          </p>
          <Button onClick={() => setStep('input')} variant="secondary" className="w-full">
            Try Again
          </Button>
        </div>
      )}
    </Modal>
  )
}
