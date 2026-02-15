import { useState } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { Address } from 'viem'
import { Card, CardHeader, CardTitle, CardContent, Button } from '../components/ui'
import { DeployLiquidityModal, EmergencyUnwindButton } from '../components/modals'
import { ActiveOrders } from '../components/ActiveOrders'
import { useUserRole } from '../hooks/useUserRole'

const STRATEGY_ADDRESS = (import.meta.env.VITE_DEX_STRATEGY_ADDRESS || '') as Address
const DEFAULT_PAIR_ID = '0x190cba1f91e8cfcbaeaf2ecbeb74e46a30f7896786e0b8de91dc03edea0ecaec' as `0x${string}`

export function StrategyPage() {
    const { wallets } = useWallets()
    const address = wallets[0]?.address as Address | undefined

    const [isDeployModalOpen, setIsDeployModalOpen] = useState(false)

    const { isStrategist } = useUserRole(address)

    const handleTransactionSuccess = () => {
        console.log('Transaction successful, data will refresh automatically')
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-4xl font-serif font-bold mb-2">Strategy Management</h1>
                <p className="text-text-muted font-sans">Deploy and manage liquidity strategies</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Deploy Liquidity</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-3">
                        <Button onClick={() => setIsDeployModalOpen(true)} variant="primary">
                            Deploy to DEX
                        </Button>
                        <EmergencyUnwindButton
                            strategyAddress={STRATEGY_ADDRESS}
                            pairId={DEFAULT_PAIR_ID}
                            userAddress={address}
                            onSuccess={handleTransactionSuccess}
                        />
                    </div>
                    <div className="mt-4 p-4 rounded-lg bg-surface-hover">
                        <p className="text-sm text-text-muted font-sans">
                            {isStrategist ? (
                                <span className="text-green-400">✓ You have STRATEGIST role</span>
                            ) : (
                                <span className="text-yellow-400">⚠ You need STRATEGIST role to deploy liquidity</span>
                            )}
                        </p>
                        <p className="text-xs text-text-muted font-sans mt-2">
                            Deploy liquidity to Tempo DEX using flip orders for automated market making.
                        </p>
                    </div>
                </CardContent>
            </Card>

            <ActiveOrders
                strategyAddress={STRATEGY_ADDRESS}
                pairId={DEFAULT_PAIR_ID}
            />

            <DeployLiquidityModal
                isOpen={isDeployModalOpen}
                onClose={() => setIsDeployModalOpen(false)}
                strategyAddress={STRATEGY_ADDRESS}
                pairId={DEFAULT_PAIR_ID}
                onSuccess={handleTransactionSuccess}
            />
        </div>
    )
}
