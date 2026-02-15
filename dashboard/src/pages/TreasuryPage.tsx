import { useState } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { Address } from 'viem'
import { Card, CardHeader, CardTitle, CardContent, Button } from '../components/ui'
import { DepositModal, WithdrawModal } from '../components/modals'
import { VaultBalance } from '../components/VaultBalance'
import { useUserRole } from '../hooks/useUserRole'
import { GrantRolesButton } from '../components/GrantRolesButton'

const GOVERNANCE_ADDRESS = (import.meta.env.VITE_GOVERNANCE_ROLES_ADDRESS || '') as Address
const VAULT_ADDRESS = (import.meta.env.VITE_TREASURY_VAULT_ADDRESS || '') as Address

// Official Tempo Testnet Tokens from https://tokenlist.tempo.xyz/list/42431
const TEMPO_TOKENS = [
    { symbol: 'PathUSD', address: '0x20c0000000000000000000000000000000000000' as Address, decimals: 6 },
    { symbol: 'AlphaUSD', address: '0x20c0000000000000000000000000000000000001' as Address, decimals: 6 },
    { symbol: 'BetaUSD', address: '0x20c0000000000000000000000000000000000002' as Address, decimals: 6 },
    { symbol: 'ThetaUSD', address: '0x20c0000000000000000000000000000000000003' as Address, decimals: 6 },
]

export function TreasuryPage() {
    const { wallets } = useWallets()
    const address = wallets[0]?.address as Address | undefined

    const [isDepositModalOpen, setIsDepositModalOpen] = useState(false)
    const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false)
    const [selectedToken, setSelectedToken] = useState<Address>('' as Address)
    const [customTokenAddress, setCustomTokenAddress] = useState('')

    const { isTreasuryManager } = useUserRole(address)

    const handleTransactionSuccess = () => {
        console.log('Transaction successful, data will refresh automatically')
    }

    const handleOpenDepositModal = () => {
        if (!selectedToken && !customTokenAddress) {
            alert('Please enter a token address first')
            return
        }
        setIsDepositModalOpen(true)
    }

    const handleOpenWithdrawModal = () => {
        if (!selectedToken && !customTokenAddress) {
            alert('Please enter a token address first')
            return
        }
        setIsWithdrawModalOpen(true)
    }

    const tokenAddress = (customTokenAddress || selectedToken) as Address

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-4xl font-serif font-bold mb-2">Treasury Operations</h1>
                <p className="text-text-muted font-sans">Manage deposits and withdrawals</p>
            </div>

            <VaultBalance
                vaultId={1}
                vaultAddress={VAULT_ADDRESS}
            />

            <Card>
                <CardHeader>
                    <CardTitle>Select Token</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-sans font-medium mb-3">
                                Quick Select (Tempo Testnet Tokens)
                            </label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {TEMPO_TOKENS.map((token) => (
                                    <button
                                        key={token.address}
                                        onClick={() => {
                                            setSelectedToken(token.address)
                                            setCustomTokenAddress('')
                                        }}
                                        className={`px-4 py-3 rounded-md border-2 transition-all font-sans font-medium text-sm ${selectedToken === token.address
                                                ? 'border-accent bg-accent/10 text-accent'
                                                : 'border-border hover:border-accent/50 text-text'
                                            }`}
                                    >
                                        {token.symbol}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-border"></div>
                            </div>
                            <div className="relative flex justify-center text-xs">
                                <span className="bg-surface px-2 text-text-muted font-sans">OR</span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-sans font-medium mb-2">
                                Custom Token Address
                            </label>
                            <input
                                type="text"
                                value={customTokenAddress}
                                onChange={(e) => {
                                    setCustomTokenAddress(e.target.value)
                                    setSelectedToken('' as Address)
                                }}
                                placeholder="0x... (paste custom token address)"
                                className="w-full px-4 py-3 bg-surface border border-border rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                            />
                        </div>

                        {(selectedToken || customTokenAddress) && (
                            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                                <p className="text-sm text-green-700 dark:text-green-300 font-sans">
                                    ✓ Token selected: {selectedToken ? TEMPO_TOKENS.find(t => t.address === selectedToken)?.symbol : 'Custom'}
                                </p>
                                <p className="text-xs text-green-600 dark:text-green-400 font-mono mt-1">
                                    {selectedToken || customTokenAddress}
                                </p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Actions</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-3">
                        <Button onClick={handleOpenDepositModal} variant="primary">
                            Deposit Funds
                        </Button>
                        <Button onClick={handleOpenWithdrawModal} variant="secondary">
                            Withdraw Funds
                        </Button>
                    </div>
                    <div className="mt-4 p-4 rounded-lg bg-surface-hover">
                        <p className="text-sm text-text-muted font-sans mb-2">
                            {isTreasuryManager ? (
                                <span className="text-green-400">✓ You have TREASURY_MANAGER role</span>
                            ) : (
                                <span className="text-yellow-400">⚠ You need TREASURY_MANAGER role to execute transactions</span>
                            )}
                        </p>
                        <p className="text-xs text-text-muted font-sans mb-3">
                            Buttons are visible in read-only mode. Transactions will show permission requirements if you don't have the necessary roles.
                        </p>
                        {!isTreasuryManager && (
                            <GrantRolesButton
                                governanceAddress={GOVERNANCE_ADDRESS}
                                userAddress={address}
                            />
                        )}
                    </div>
                </CardContent>
            </Card>

            {tokenAddress && (
                <>
                    <DepositModal
                        isOpen={isDepositModalOpen}
                        onClose={() => setIsDepositModalOpen(false)}
                        vaultAddress={VAULT_ADDRESS}
                        tokenAddress={tokenAddress}
                        userAddress={address}
                        onSuccess={handleTransactionSuccess}
                    />
                    <WithdrawModal
                        isOpen={isWithdrawModalOpen}
                        onClose={() => setIsWithdrawModalOpen(false)}
                        vaultAddress={VAULT_ADDRESS}
                        tokenAddress={tokenAddress}
                        userAddress={address}
                        onSuccess={handleTransactionSuccess}
                    />
                </>
            )}
        </div>
    )
}
