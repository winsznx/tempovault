import { useState } from 'react'

interface AddressChipProps {
  address: string
  explorerUrl?: string
  className?: string
}

export function AddressChip({ address, explorerUrl, className = '' }: AddressChipProps) {
  const [copied, setCopied] = useState(false)

  const truncate = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const openExplorer = () => {
    if (explorerUrl) {
      window.open(`${explorerUrl}/address/${address}`, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div className={`address-chip ${className}`}>
      <span className="font-mono text-sm">{truncate(address)}</span>

      <button
        onClick={copyToClipboard}
        className="hover:text-accent transition-colors"
        title="Copy address"
      >
        {copied ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>

      {explorerUrl && (
        <button
          onClick={openExplorer}
          className="hover:text-accent transition-colors"
          title="View in explorer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      )}
    </div>
  )
}
