/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_WS_URL: string
  readonly VITE_CHAIN_ID: string
  readonly VITE_RPC_URL: string
  readonly VITE_EXPLORER_URL: string
  readonly VITE_PRIVY_APP_ID: string
  readonly VITE_GOVERNANCE_ROLES_ADDRESS: string
  readonly VITE_TREASURY_VAULT_ADDRESS: string
  readonly VITE_DEX_STRATEGY_ADDRESS: string
  readonly VITE_RISK_CONTROLLER_ADDRESS: string
  readonly VITE_DEFAULT_TOKEN_ADDRESS: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
