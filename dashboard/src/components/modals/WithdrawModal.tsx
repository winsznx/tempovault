import { useState, useEffect } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { parseUnits, formatUnits, Address } from 'viem'
import { Modal, Button } from '../ui'

// ERC20 ABI for reading balance and decimals
const ERC20_ABI = [
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

// TreasuryVault ABI for withdraw
const TREASURY_VAULT_ABI = [
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'recipient', type: 'address' }
    ],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
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

interface WithdrawModalProps {
  isOpen: boolean
  onClose: () => void
  vaultAddress: Address
  tokenAddress: Address
  userAddress?: Address
  onSuccess?: () => void
}

export function WithdrawModal({
  isOpen,
  onClose,
  vaultAddress,
  tokenAddress,
  userAddress,
  onSuccess
}: WithdrawModalProps) {
  const [amount, setAmount] = useState('')
  const [step, setStep] = useState<'input' | 'confirm' | 'withdrawing' | 'success' | 'error'>('input')
  const [error, setError] = useState<string | null>(null)

  // Read token info
  const { data: decimals } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'decimals',
    query: { enabled: !!tokenAddress }
  })

  const { data: symbol } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'symbol',
    query: { enabled: !!tokenAddress }
  })

  // Read vault balances
  const { data: totalBalance } = useReadContract({
    address: vaultAddress,
    abi: TREASURY_VAULT_ABI,
    functionName: 'tokenBalances',
    args: [tokenAddress],
    query: { enabled: !!tokenAddress }
  })

  const { data: deployed } = useReadContract({
    address: vaultAddress,
    abi: TREASURY_VAULT_ABI,
    functionName: 'deployedCapital',
    args: [tokenAddress],
    query: { enabled: !!tokenAddress }
  })

  // Withdraw transaction
  const {
    writeContract: withdraw,
    data: withdrawHash,
    isPending: isWithdrawPending
  } = useWriteContract()

  const { isLoading: isWithdrawConfirming, isSuccess: isWithdrawSuccess } = useWaitForTransactionReceipt({
    hash: withdrawHash
  })

  // Handle withdraw success
  useEffect(() => {
    if (isWithdrawSuccess) {
      setStep('success')
      onSuccess?.()
    }
  }, [isWithdrawSuccess, onSuccess])

  const handleSubmit = () => {
    if (!amount || !decimals || !userAddress) return

    try {
      setError(null)
      const amountWei = parseUnits(amount, decimals)

      // Validate amount against available balance
      // Check undefined explicitly because 0n is falsy
      const availableBalance = (totalBalance !== undefined && deployed !== undefined)
        ? totalBalance - deployed
        : 0n

      if (amountWei > availableBalance) {
        setError('Insufficient available balance (some capital may be deployed)')
        setStep('error')
        return
      }

      setStep('withdrawing')
      withdraw({
        address: vaultAddress,
        abi: TREASURY_VAULT_ABI,
        functionName: 'withdraw',
        args: [tokenAddress, amountWei, userAddress]
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed')
      setStep('error')
    }
  }

  const handleClose = () => {
    setAmount('')
    setStep('input')
    setError(null)
    onClose()
  }

  const availableBalance = totalBalance !== undefined && deployed !== undefined && decimals
    ? formatUnits(totalBalance - deployed, decimals)
    : '0'

  const explorerUrl = import.meta.env.VITE_EXPLORER_URL

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Withdraw from Vault" size="md">
      {step === 'input' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-sans font-medium mb-2">
              Amount ({symbol || 'TOKEN'})
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="w-full px-4 py-3 bg-surface border border-border rounded-md font-mono text-lg text-text focus:outline-none focus:ring-2 focus:ring-accent"
              step="any"
              min="0"
            />
            <div className="mt-2 text-sm text-text-muted font-sans flex justify-between">
              <span>Available: {availableBalance} {symbol}</span>
              <button
                onClick={() => setAmount(availableBalance)}
                className="text-accent hover:underline"
              >
                Max
              </button>
            </div>
          </div>

          {deployed !== undefined && decimals !== undefined && Number(formatUnits(deployed, decimals)) > 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800 font-sans">
                Note: {formatUnits(deployed, decimals)} {symbol} is currently deployed in strategies
              </p>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-700 font-sans">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={handleClose} variant="ghost" className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              variant="primary"
              className="flex-1"
              disabled={!amount || Number(amount) <= 0 || Number(amount) > Number(availableBalance)}
            >
              Withdraw
            </Button>
          </div>
        </div>
      )}

      {step === 'withdrawing' && (
        <div className="space-y-4">
          <div className="text-center py-6">
            <div className="mb-4">
              {isWithdrawPending || isWithdrawConfirming ? (
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-accent" />
              ) : (
                <svg className="inline-block w-12 h-12 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <h3 className="text-lg font-serif font-bold mb-2">
              {isWithdrawPending ? 'Confirm in Wallet' : isWithdrawConfirming ? 'Withdrawing...' : 'Withdraw'}
            </h3>
            <p className="text-text-muted font-sans">
              {isWithdrawPending
                ? 'Please confirm the withdrawal transaction in your wallet'
                : isWithdrawConfirming
                  ? `Withdrawing ${amount} ${symbol} from vault...`
                  : `Withdraw ${amount} ${symbol}`}
            </p>
            {withdrawHash && (
              <a
                href={`${explorerUrl}/tx/${withdrawHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-4 text-sm text-accent hover:underline font-mono"
              >
                View on Explorer ↗
              </a>
            )}
          </div>
        </div>
      )}

      {step === 'success' && (
        <div className="space-y-4">
          <div className="text-center py-6">
            <div className="mb-4">
              <svg className="inline-block w-16 h-16 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-serif font-bold mb-2">Withdrawal Successful!</h3>
            <p className="text-text-muted font-sans mb-4">
              You withdrew {amount} {symbol} from the vault
            </p>
            {withdrawHash && (
              <a
                href={`${explorerUrl}/tx/${withdrawHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-sm text-accent hover:underline font-mono"
              >
                View Transaction ↗
              </a>
            )}
          </div>

          <Button onClick={handleClose} variant="primary" className="w-full">
            Done
          </Button>
        </div>
      )}

      {step === 'error' && (
        <div className="space-y-4">
          <div className="text-center py-6">
            <div className="mb-4">
              <svg className="inline-block w-16 h-16 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h3 className="text-xl font-serif font-bold mb-2">Withdrawal Failed</h3>
            <p className="text-text-muted font-sans">{error || 'Unknown error occurred'}</p>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleClose} variant="ghost" className="flex-1">
              Cancel
            </Button>
            <Button onClick={() => setStep('input')} variant="primary" className="flex-1">
              Try Again
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
