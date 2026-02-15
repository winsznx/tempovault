import { useState, useEffect } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { parseUnits, formatUnits, Address } from 'viem'
import { Modal, Button } from '../ui'

// ERC20 ABI for approve
const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
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
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

// TreasuryVault ABI for deposit
const TREASURY_VAULT_ABI = [
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'deposit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const

interface DepositModalProps {
  isOpen: boolean
  onClose: () => void
  vaultAddress: Address
  tokenAddress: Address
  userAddress?: Address
  onSuccess?: () => void
}

export function DepositModal({
  isOpen,
  onClose,
  vaultAddress,
  tokenAddress,
  userAddress,
  onSuccess
}: DepositModalProps) {
  const [amount, setAmount] = useState('')
  const [step, setStep] = useState<'input' | 'approve' | 'deposit' | 'success' | 'error'>('input')
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

  const { data: balance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress }
  })

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: userAddress ? [userAddress, vaultAddress] : undefined,
    query: { enabled: !!userAddress }
  })

  // Approve transaction
  const {
    writeContract: approve,
    data: approveHash,
    isPending: isApprovePending
  } = useWriteContract()

  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash
  })

  // Deposit transaction
  const {
    writeContract: deposit,
    data: depositHash,
    isPending: isDepositPending
  } = useWriteContract()

  const { isLoading: isDepositConfirming, isSuccess: isDepositSuccess } = useWaitForTransactionReceipt({
    hash: depositHash
  })

  // Handle approve success
  useEffect(() => {
    if (isApproveSuccess) {
      refetchAllowance()
      setStep('input')
    }
  }, [isApproveSuccess, refetchAllowance])

  // Handle deposit success
  useEffect(() => {
    if (isDepositSuccess) {
      setStep('success')
      onSuccess?.()
    }
  }, [isDepositSuccess, onSuccess])

  const handleSubmit = async () => {
    if (!amount || !decimals) return

    try {
      setError(null)
      const amountWei = parseUnits(amount, decimals)

      // Check if we need approval
      const needsApproval = !allowance || allowance < amountWei

      if (needsApproval) {
        setStep('approve')
        approve({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [vaultAddress, amountWei]
        })
      } else {
        setStep('deposit')
        deposit({
          address: vaultAddress,
          abi: TREASURY_VAULT_ABI,
          functionName: 'deposit',
          args: [tokenAddress, amountWei]
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed')
      setStep('error')
    }
  }

  const handleContinueDeposit = () => {
    if (!amount || !decimals) return

    try {
      const amountWei = parseUnits(amount, decimals)
      setStep('deposit')
      deposit({
        address: vaultAddress,
        abi: TREASURY_VAULT_ABI,
        functionName: 'deposit',
        args: [tokenAddress, amountWei]
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

  const maxAmount = balance && decimals ? formatUnits(balance, decimals) : '0'
  const explorerUrl = import.meta.env.VITE_EXPLORER_URL

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Deposit to Vault" size="md">
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
              <span>Balance: {maxAmount} {symbol}</span>
              <button
                onClick={() => setAmount(maxAmount)}
                className="text-accent hover:underline"
              >
                Max
              </button>
            </div>
          </div>

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
              disabled={!amount || Number(amount) <= 0 || Number(amount) > Number(maxAmount)}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 'approve' && (
        <div className="space-y-4">
          <div className="text-center py-6">
            <div className="mb-4">
              {isApprovePending || isApproveConfirming ? (
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-accent" />
              ) : (
                <svg className="inline-block w-12 h-12 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <h3 className="text-lg font-serif font-bold mb-2">
              {isApprovePending ? 'Confirm in Wallet' : isApproveConfirming ? 'Approving...' : 'Approval Needed'}
            </h3>
            <p className="text-text-muted font-sans">
              {isApprovePending
                ? 'Please confirm the approval transaction in your wallet'
                : isApproveConfirming
                  ? 'Waiting for approval confirmation...'
                  : `Approve TempoVault to spend your ${symbol}`}
            </p>
            {approveHash && (
              <a
                href={`${explorerUrl}/tx/${approveHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-4 text-sm text-accent hover:underline font-mono"
              >
                View on Explorer ↗
              </a>
            )}
          </div>

          {isApproveSuccess && (
            <Button onClick={handleContinueDeposit} variant="primary" className="w-full">
              Continue to Deposit
            </Button>
          )}
        </div>
      )}

      {step === 'deposit' && (
        <div className="space-y-4">
          <div className="text-center py-6">
            <div className="mb-4">
              {isDepositPending || isDepositConfirming ? (
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-accent" />
              ) : (
                <svg className="inline-block w-12 h-12 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <h3 className="text-lg font-serif font-bold mb-2">
              {isDepositPending ? 'Confirm in Wallet' : isDepositConfirming ? 'Depositing...' : 'Deposit'}
            </h3>
            <p className="text-text-muted font-sans">
              {isDepositPending
                ? 'Please confirm the deposit transaction in your wallet'
                : isDepositConfirming
                  ? `Depositing ${amount} ${symbol} to vault...`
                  : `Deposit ${amount} ${symbol}`}
            </p>
            {depositHash && (
              <a
                href={`${explorerUrl}/tx/${depositHash}`}
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
            <h3 className="text-xl font-serif font-bold mb-2">Deposit Successful!</h3>
            <p className="text-text-muted font-sans mb-4">
              You deposited {amount} {symbol} to the vault
            </p>
            {depositHash && (
              <a
                href={`${explorerUrl}/tx/${depositHash}`}
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
            <h3 className="text-xl font-serif font-bold mb-2">Transaction Failed</h3>
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
