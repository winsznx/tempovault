import { Address } from 'viem'
import { RiskStatus } from '../components/RiskStatus'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui'

const RISK_CONTROLLER_ADDRESS = (import.meta.env.VITE_RISK_CONTROLLER_ADDRESS || '') as Address
const DEFAULT_PAIR_ID = '0x190cba1f91e8cfcbaeaf2ecbeb74e46a30f7896786e0b8de91dc03edea0ecaec' as `0x${string}`

export function RiskPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-4xl font-serif font-bold mb-2">Risk Monitoring</h1>
                <p className="text-text-muted font-sans">Monitor risk metrics and circuit breakers</p>
            </div>

            <RiskStatus
                pairId={DEFAULT_PAIR_ID}
                riskControllerAddress={RISK_CONTROLLER_ADDRESS}
            />

            <Card>
                <CardHeader>
                    <CardTitle>Risk Controls</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div>
                            <h3 className="font-sans font-semibold mb-2">Circuit Breaker</h3>
                            <p className="text-sm text-text-muted font-sans">
                                Automatically halts trading when risk thresholds are exceeded. Protects capital from adverse market conditions.
                            </p>
                        </div>
                        <div>
                            <h3 className="font-sans font-semibold mb-2">Oracle Monitoring</h3>
                            <p className="text-sm text-text-muted font-sans">
                                Continuous price feed monitoring ensures accurate risk assessment and prevents stale data execution.
                            </p>
                        </div>
                        <div>
                            <h3 className="font-sans font-semibold mb-2">Exposure Limits</h3>
                            <p className="text-sm text-text-muted font-sans">
                                Maximum capital allocation per trading pair prevents over-concentration and limits downside risk.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
