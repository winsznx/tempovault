import { Address } from 'viem'
import { VaultBalance } from '../components/VaultBalance'
import { ActiveOrders } from '../components/ActiveOrders'
import { PnLChart } from '../components/PnLChart'
import { RiskStatus } from '../components/RiskStatus'

const VAULT_ADDRESS = (import.meta.env.VITE_TREASURY_VAULT_ADDRESS || '') as Address
const STRATEGY_ADDRESS = (import.meta.env.VITE_DEX_STRATEGY_ADDRESS || '') as Address
const RISK_CONTROLLER_ADDRESS = (import.meta.env.VITE_RISK_CONTROLLER_ADDRESS || '') as Address
const DEFAULT_PAIR_ID = '0x190cba1f91e8cfcbaeaf2ecbeb74e46a30f7896786e0b8de91dc03edea0ecaec' as `0x${string}`

export function DashboardOverview() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-4xl font-serif font-bold mb-2">Dashboard Overview</h1>
                <p className="text-text-muted font-sans">Monitor your vault performance and risk metrics</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <VaultBalance
                    vaultId={1}
                    vaultAddress={VAULT_ADDRESS}
                />
                <RiskStatus
                    pairId={DEFAULT_PAIR_ID}
                    riskControllerAddress={RISK_CONTROLLER_ADDRESS}
                />
            </div>

            <div className="grid grid-cols-1 gap-6">
                <PnLChart vaultId={1} />
            </div>

            <div className="grid grid-cols-1 gap-6">
                <ActiveOrders
                    strategyAddress={STRATEGY_ADDRESS}
                    pairId={DEFAULT_PAIR_ID}
                />
            </div>
        </div>
    )
}
