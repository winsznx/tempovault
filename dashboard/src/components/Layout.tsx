import { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { Address } from 'viem'
import { LayoutDashboard, Wallet, Target, AlertTriangle, Activity } from 'lucide-react'
import { Button, AddressChip, Badge } from './ui'
import { ThemeToggle } from './ThemeToggle'
import { useUserRole } from '../hooks/useUserRole'

interface LayoutProps {
    children: ReactNode
}

export function Layout({ children }: LayoutProps) {
    const { logout, user } = usePrivy()
    const { wallets } = useWallets()
    const location = useLocation()
    const navigate = useNavigate()

    const connectedWallet = wallets[0]
    const address = connectedWallet?.address as Address | undefined

    const { isStrategist, isTreasuryManager, isEmergency, isAdmin } = useUserRole(address)

    const getRoleBadge = () => {
        if (isAdmin) return <Badge variant="success">Admin</Badge>
        if (isEmergency) return <Badge variant="error">Emergency</Badge>
        if (isStrategist) return <Badge variant="info">Strategist</Badge>
        if (isTreasuryManager) return <Badge variant="info">Treasury Manager</Badge>
        return <Badge variant="info">Viewer</Badge>
    }

    const navItems = [
        { path: '/app', label: 'Overview', icon: LayoutDashboard },
        { path: '/app/treasury', label: 'Treasury', icon: Wallet },
        { path: '/app/strategy', label: 'Strategy', icon: Target, requiresRole: isStrategist },
        { path: '/app/risk', label: 'Risk', icon: AlertTriangle },
        { path: '/app/activity', label: 'Activity', icon: Activity },
    ]

    return (
        <div className="min-h-screen flex flex-col">
            {/* Top Navigation */}
            <nav className="border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
                <div className="container mx-auto">
                    <div className="flex justify-between items-center h-20 px-4">
                        <div className="flex items-center gap-6">
                            <button
                                onClick={() => navigate('/app')}
                                className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                            >
                                <img
                                    src="/logo.png"
                                    alt="TempoVault"
                                    className="w-10 h-10 object-contain rounded-lg"
                                />
                                <div className="text-left">
                                    <h1 className="text-2xl font-serif font-bold leading-none">TempoVault</h1>
                                    <p className="text-xs text-text-muted font-sans tracking-wide mt-0.5">Institutional Treasury</p>
                                </div>
                            </button>
                        </div>
                        <div className="flex items-center gap-4">
                            {getRoleBadge()}
                            {user?.email?.address && (
                                <span className="text-sm text-text-muted font-sans hidden md:inline">{user.email.address}</span>
                            )}
                            {address && (
                                <AddressChip
                                    address={address}
                                    explorerUrl={import.meta.env.VITE_EXPLORER_URL}
                                />
                            )}
                            <ThemeToggle />
                            <Button onClick={logout} variant="ghost" size="sm">
                                Disconnect
                            </Button>
                        </div>
                    </div>
                </div>
            </nav>

            <div className="flex flex-1">
                {/* Left Sidebar */}
                <aside className="w-64 border-r hidden lg:block" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
                    <nav className="p-4 space-y-2">
                        {navItems.map((item) => {
                            if (item.requiresRole === false) return null

                            const isActive = location.pathname === item.path
                            return (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors font-sans ${isActive
                                        ? 'bg-accent text-white'
                                        : 'hover:bg-surface-hover'
                                        }`}
                                >
                                    <item.icon className="w-5 h-5" />
                                    <span>{item.label}</span>
                                </Link>
                            )
                        })}
                    </nav>
                </aside>

                {/* Mobile Navigation */}
                <div className="lg:hidden fixed bottom-0 left-0 right-0 border-t z-50" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
                    <nav className="flex justify-around p-2">
                        {navItems.slice(0, 4).map((item) => {
                            if (item.requiresRole === false) return null

                            const isActive = location.pathname === item.path
                            return (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors ${isActive
                                        ? 'text-accent'
                                        : 'text-text-muted'
                                        }`}
                                >
                                    <item.icon className="w-5 h-5" />
                                    <span className="text-xs font-sans">{item.label}</span>
                                </Link>
                            )
                        })}
                    </nav>
                </div>

                {/* Main Content */}
                <main className="flex-1 overflow-auto">
                    <div className="container mx-auto py-8 px-4 pb-24 lg:pb-8">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    )
}
