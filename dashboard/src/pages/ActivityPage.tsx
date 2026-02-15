import { useState, useEffect } from 'react'
import { usePublicClient } from 'wagmi'
import { formatUnits, Address, parseAbiItem } from 'viem'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui'

const VAULT_ADDRESS = (import.meta.env.VITE_TREASURY_VAULT_ADDRESS || '0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D') as Address

const TEMPO_TOKENS: Record<string, { symbol: string, decimals: number }> = {
    '0x20c0000000000000000000000000000000000000': { symbol: 'PathUSD', decimals: 6 },
    '0x20c0000000000000000000000000000000000001': { symbol: 'AlphaUSD', decimals: 6 },
    '0x20c0000000000000000000000000000000000002': { symbol: 'BetaUSD', decimals: 6 },
    '0x20c0000000000000000000000000000000000003': { symbol: 'ThetaUSD', decimals: 6 },
    // Default fallback
    'default': { symbol: 'Unknown', decimals: 18 }
}

type ActivityLog = {
    hash: string
    eventName: string
    tokenSymbol: string
    amount: string
    timestamp: number // approximated by block
    from: string
    to: string
    blockNumber: bigint
}

export function ActivityPage() {
    const publicClient = usePublicClient()
    const [logs, setLogs] = useState<ActivityLog[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!publicClient) return

        const fetchLogs = async () => {
            try {
                setLoading(true)
                const currentBlock = await publicClient.getBlockNumber()
                const fromBlock = currentBlock - 10000n > 0n ? currentBlock - 10000n : 0n // Fetch last 10k blocks for speed

                // Define Events
                const depositEvent = parseAbiItem('event Deposited(uint256 indexed vaultId, address indexed token, uint256 amount, address indexed depositor, uint256 newBalance)')
                const withdrawEvent = parseAbiItem('event Withdrawn(uint256 indexed vaultId, address indexed token, uint256 amount, address indexed recipient, uint256 newBalance)')
                const deployEvent = parseAbiItem('event CapitalDeployed(uint256 indexed vaultId, uint256 indexed deploymentId, address indexed strategy, address token, uint256 amount, bytes32 pairId)')

                const [deposits, withdrawals, deployments] = await Promise.all([
                    publicClient.getLogs({
                        address: VAULT_ADDRESS,
                        event: depositEvent,
                        fromBlock
                    }),
                    publicClient.getLogs({
                        address: VAULT_ADDRESS,
                        event: withdrawEvent,
                        fromBlock
                    }),
                    publicClient.getLogs({
                        address: VAULT_ADDRESS,
                        event: deployEvent,
                        fromBlock
                    })
                ])

                // Process Logs
                const processedLogs: ActivityLog[] = []

                // Helper to get token info
                const getToken = (addr: string) => TEMPO_TOKENS[addr.toLowerCase() as keyof typeof TEMPO_TOKENS] || TEMPO_TOKENS['default']

                deposits.forEach(log => {
                    const token = getToken(log.args.token!)
                    processedLogs.push({
                        hash: log.transactionHash,
                        eventName: 'Deposit',
                        tokenSymbol: token.symbol,
                        amount: formatUnits(log.args.amount!, token.decimals),
                        timestamp: 0,
                        from: log.args.depositor!,
                        to: VAULT_ADDRESS,
                        blockNumber: log.blockNumber
                    })
                })

                withdrawals.forEach(log => {
                    const token = getToken(log.args.token!)
                    processedLogs.push({
                        hash: log.transactionHash,
                        eventName: 'Withdraw',
                        tokenSymbol: token.symbol,
                        amount: formatUnits(log.args.amount!, token.decimals),
                        timestamp: 0,
                        from: VAULT_ADDRESS,
                        to: log.args.recipient!,
                        blockNumber: log.blockNumber
                    })
                })

                deployments.forEach(log => {
                    const token = getToken(log.args.token!) // CapitalDeployed uses 'token', non-indexed in event signature above? No, wait.
                    // CapitalDeployed definition: address token (not indexed)
                    // log.args.token should be available
                    processedLogs.push({
                        hash: log.transactionHash,
                        eventName: 'Capital Deployed',
                        tokenSymbol: token.symbol,
                        amount: formatUnits(log.args.amount!, token.decimals),
                        timestamp: 0,
                        from: VAULT_ADDRESS,
                        to: log.args.strategy!,
                        blockNumber: log.blockNumber
                    })
                })

                // Sort by block number (desc)
                processedLogs.sort((a, b) => Number(b.blockNumber - a.blockNumber))

                setLogs(processedLogs)
            } catch (err) {
                console.error("Failed to fetch logs", err)
            } finally {
                setLoading(false)
            }
        }

        fetchLogs()
        // Poll every 10s
        const interval = setInterval(fetchLogs, 10000)
        return () => clearInterval(interval)

    }, [publicClient])

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-4xl font-serif font-bold mb-2">Activity Log</h1>
                <p className="text-text-muted font-sans">Real-time on-chain events</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Recent Transactions</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading && logs.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
                            <p className="mt-4 text-sm text-text-muted">Loading blockchain events...</p>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="text-center py-12 text-text-muted">
                            No recent activity found on-chain.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border text-left">
                                        <th className="py-3 font-semibold font-sans pl-4">Event</th>
                                        <th className="py-3 font-semibold font-sans">Amount</th>
                                        <th className="py-3 font-semibold font-sans">From / To</th>
                                        <th className="py-3 font-semibold font-sans">Tx Hash</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map((log) => (
                                        <tr key={log.hash + log.eventName} className="border-b border-border hover:bg-surface transition-colors">
                                            <td className="py-3 pl-4">
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${log.eventName === 'Deposit' ? 'bg-green-100 text-green-700' :
                                                    log.eventName === 'Withdraw' ? 'bg-red-100 text-red-700' :
                                                        'bg-blue-100 text-blue-700'
                                                    }`}>
                                                    {log.eventName}
                                                </span>
                                            </td>
                                            <td className="py-3 font-mono">
                                                {log.amount} {log.tokenSymbol}
                                            </td>
                                            <td className="py-3 text-xs font-mono text-text-muted">
                                                <div>From: {log.from.slice(0, 8)}...</div>
                                                <div>To: {log.to.slice(0, 8)}...</div>
                                            </td>
                                            <td className="py-3">
                                                <a
                                                    href={`https://explore.tempo.xyz/tx/${log.hash}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-accent hover:underline font-mono text-xs"
                                                >
                                                    {log.hash.slice(0, 10)}...
                                                </a>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
