import { useState } from 'react'
import { Address } from 'viem'
import { Button, Modal } from '../ui'

interface Props {
  strategyAddress: Address
  pairId: string
  userAddress?: Address
  onSuccess?: () => void
}

export function EmergencyUnwindButton({ strategyAddress, pairId, userAddress, onSuccess }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [isUnwinding, setIsUnwinding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleUnwind = async () => {
    if (!userAddress) return

    setIsUnwinding(true)
    setError(null)

    try {
      // TODO: Implement emergency unwind contract call
      console.log('Emergency unwind', { strategyAddress, pairId, userAddress })

      // Simulate for now
      await new Promise(resolve => setTimeout(resolve, 2000))

      setIsOpen(false)
      onSuccess?.()
    } catch (err: any) {
      setError(err.message || 'Failed to unwind')
    } finally {
      setIsUnwinding(false)
    }
  }

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        variant="destructive"
        size="sm"
        disabled={!userAddress}
      >
        ⚠ Emergency Unwind
      </Button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Emergency Unwind">
        <div className="space-y-4">
          <div className="bg-red-500 bg-opacity-10 border border-red-500 rounded-md p-4">
            <p className="text-red-400 font-semibold mb-2">⚠️ WARNING</p>
            <p className="text-sm text-text-muted">
              This will immediately cancel all active orders and withdraw all deployed capital back to the vault.
              This action cannot be undone.
            </p>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-muted">Strategy:</span>
              <span className="font-mono text-xs">{strategyAddress.slice(0, 10)}...</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Pair ID:</span>
              <span className="font-mono text-xs">{pairId.slice(0, 10)}...</span>
            </div>
          </div>

          {error && (
            <div className="bg-red-500 bg-opacity-10 border border-red-500 rounded-md p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <Button
              onClick={() => setIsOpen(false)}
              variant="ghost"
              disabled={isUnwinding}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUnwind}
              variant="destructive"
              disabled={isUnwinding}
            >
              {isUnwinding ? 'Unwinding...' : 'Confirm Emergency Unwind'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
