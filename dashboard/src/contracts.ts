// Deployed contract addresses on Tempo Testnet
export const CONTRACTS = {
  GOVERNANCE_ROLES: '0x7D5b74F2dd093c32594Ab547F57E9ecf3Dd04565',
  RISK_CONTROLLER: '0xa5bec93b07b70e91074A24fB79C5EA8aF639a639',
  TREASURY_VAULT: '0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D',
  DEX_STRATEGY: '0x2f0b1a0c816377f569533385a30d2afe2cb4899e',
  LENDING_MODULE: '0xff9fe135d812ef03dd1164f71dd87734b30cf134',
  REPORTING_ADAPTER: '0x50b79e5e258c905fcc7e7a37a6c4cb1e0e064258',
  TEMPO_DEX: '0xDEc0000000000000000000000000000000000000',
} as const;

export const NETWORK = {
  chainId: 42431,
  name: 'Tempo Testnet',
  rpcUrl: 'https://rpc.moderato.tempo.xyz',
  explorer: 'https://explore.tempo.xyz',
} as const;

export const TEST_TOKENS = {
  USDC: '0xb012a28296A61842ED8d68f82618c9eBF0795cED',
} as const;
