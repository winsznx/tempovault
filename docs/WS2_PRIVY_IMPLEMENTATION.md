# WS2: Privy Authentication Integration - Implementation Guide

**Status**: In Progress
**Goal**: Production-grade authentication with Privy as primary method

---

## Implementation Steps

### Step 1: Install Dependencies ⏳

```bash
cd dashboard
npm install @privy-io/react-auth@latest @privy-io/wagmi@latest
```

**Dependencies**:
- `@privy-io/react-auth` - Core Privy SDK
- `@privy-io/wagmi` - Privy connector for wagmi

**Compatibility**: Works with existing wagmi@2.5.0, viem@2.7.0

### Step 2: Create Privy Provider

**File**: `dashboard/src/providers/PrivyProvider.tsx`

```typescript
import { PrivyProvider as BasePrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createConfig, http } from 'wagmi';
import { ReactNode } from 'react';

// Tempo Testnet configuration
const tempoTestnet = {
  id: 42431,
  name: 'Tempo Testnet',
  network: 'tempo-testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Tempo',
    symbol: 'TEMPO',
  },
  rpcUrls: {
    default: { http: ['https://rpc.moderato.tempo.xyz'] },
    public: { http: ['https://rpc.moderato.tempo.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Tempo Explorer', url: 'https://explore.tempo.xyz' },
  },
  testnet: true,
};

// Wagmi config
const wagmiConfig = createConfig({
  chains: [tempoTestnet],
  transports: {
    [tempoTestnet.id]: http('https://rpc.moderato.tempo.xyz'),
  },
});

// React Query client
const queryClient = new QueryClient();

interface PrivyProviderProps {
  children: ReactNode;
}

export function PrivyProvider({ children }: PrivyProviderProps) {
  return (
    <BasePrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'wallet', 'google', 'twitter'],
        appearance: {
          theme: 'dark',
          accentColor: '#0D9488', // Teal accent
          logo: undefined, // Add your logo URL here
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
        defaultChain: tempoTestnet,
        supportedChains: [tempoTestnet],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </BasePrivyProvider>
  );
}
```

### Step 3: Update main.tsx

**File**: `dashboard/src/main.tsx`

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { PrivyProvider } from './providers/PrivyProvider';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PrivyProvider>
      <App />
    </PrivyProvider>
  </React.StrictMode>
);
```

### Step 4: Update App.tsx

Remove old WagmiConfig, use Privy hooks:

```typescript
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useEffect } from 'react';

function App() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();

  // Get embedded wallet address
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
  const address = embeddedWallet?.address;

  if (!ready) {
    return <div>Loading...</div>;
  }

  if (!authenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <button onClick={login} className="px-6 py-3 bg-teal-600 text-white rounded-lg">
          Login
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Rest of app */}
    </div>
  );
}
```

### Step 5: Create AuthModal Component

**File**: `dashboard/src/components/AuthModal.tsx`

```typescript
import { usePrivy } from '@privy-io/react-auth';

export function AuthModal() {
  const { login, authenticated, user, logout } = usePrivy();

  if (authenticated) {
    return (
      <div className="flex items-center gap-4">
        <span className="text-sm">{user?.email || 'Connected'}</span>
        <button
          onClick={logout}
          className="px-4 py-2 bg-gray-800 rounded-lg text-sm"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={login}
      className="px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium"
    >
      Connect Wallet
    </button>
  );
}
```

### Step 6: Update .env with Privy Credentials

Ensure `.env` has:
```
VITE_PRIVY_APP_ID=cmln0qtl4010i0ckwxdf280w2
```

---

## Testing Checklist

### Email Login Flow
- [ ] Click "Connect Wallet" button
- [ ] Select "Email" login method
- [ ] Enter email address
- [ ] Check email for verification code
- [ ] Enter code, verify login succeeds
- [ ] Embedded wallet created automatically
- [ ] Wallet address displayed in UI

### Social Login Flow
- [ ] Click "Connect Wallet" button
- [ ] Select "Google" or "Twitter"
- [ ] Authorize with social provider
- [ ] Embedded wallet created
- [ ] Login successful

### WalletConnect Fallback
- [ ] Click "Use external wallet" option
- [ ] Connect MetaMask/WalletConnect
- [ ] Verify connection works
- [ ] No embedded wallet created (using external)

### Session Persistence
- [ ] Login with email
- [ ] Refresh page
- [ ] Verify still authenticated (no re-login)
- [ ] No auth state flicker

### Logout Flow
- [ ] Click disconnect
- [ ] Verify user logged out
- [ ] Verify UI returns to login state

---

## Known Issues & Solutions

### Issue 1: Privy SDK Version Mismatch
**Symptom**: Type errors with wagmi hooks
**Solution**: Use `@privy-io/wagmi` connector, not vanilla wagmi

### Issue 2: Embedded Wallet Not Created
**Symptom**: User logged in but no wallet address
**Solution**: Check `embeddedWallets.createOnLogin` config

### Issue 3: Chain Not Supported
**Symptom**: "Unsupported chain" error
**Solution**: Add Tempo Testnet to `supportedChains` array

---

## Next Steps After WS2 Complete

1. **Role Detection** (WS4.1)
   - Use wallet address to query GovernanceRoles contract
   - Display role badge in UI

2. **Write Operations** (WS3.4-WS3.6)
   - Deposit/Withdraw modals
   - Deploy Liquidity modal
   - Emergency controls

3. **Custom Theme** (WS3.1)
   - Institutional Ledger design
   - Replace Privy default theme

---

**Completion Criteria**:
- ✅ Privy dependencies installed
- ✅ PrivyProvider configured with Tempo Testnet
- ✅ Email login works, creates embedded wallet
- ✅ Social login (Google/Twitter) works
- ✅ WalletConnect fallback available
- ✅ Session persists across refresh
- ✅ No console errors
- ✅ Auth state properly managed

**Estimated Time**: 2-3 hours
