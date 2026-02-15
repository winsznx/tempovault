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

                        <footer className="mt-12 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-text-muted">
                            <div className="font-sans">
                                © 2026 TempoVault. All rights reserved.
                            </div>
                            <div className="flex items-center gap-6">
                                <a
                                    href="https://github.com/winsznx/tempovault"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="hover:text-text transition-colors flex items-center gap-2"
                                >
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                                    </svg>
                                    <span>GitHub</span>
                                </a>
                                <a
                                    href="https://x.com/tempovault_"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="hover:text-text transition-colors flex items-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                    </svg>
                                    <span>X</span>
                                </a>
                            </div>
                        </footer>
                    </div>
                </main>
            </div>
        </div>
    )
}
