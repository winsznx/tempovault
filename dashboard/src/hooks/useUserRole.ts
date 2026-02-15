import { useReadContract } from 'wagmi'
import { Address } from 'viem'

const GOVERNANCE_ROLES_ADDRESS = import.meta.env.VITE_GOVERNANCE_ROLES_ADDRESS as Address

// Role hashes from GovernanceRoles contract
const ADMIN_ROLE = '0x76b1a12ac8d9ed64de3c0f66c2a19b21c0a3f9a1afec3f75bcd45f7b0794a1de'
const STRATEGIST_ROLE = '0xb17d0a42cc710456bf9c3efb785dcd0cb93a0ac358113307b5c64b285b516b5c'
const EMERGENCY_ROLE = '0x76b1a12ac8d9ed64de3c0f66c2a19b21c0a3f9a1afec3f75bcd45f7b0794a1de' // Using ADMIN_ROLE value from contract
const TREASURY_MANAGER_ROLE = '0xfb33b7fa49278e0b9e45aa996caa7eae999f04705ef455a86b73159c5d256fa0'

const GOVERNANCE_ROLES_ABI = [
  {
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'account', type: 'address' }
    ],
    name: 'hasRole',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

interface UserRoleResult {
  isAdmin: boolean
  isStrategist: boolean
  isEmergency: boolean
  isTreasuryManager: boolean
  loading: boolean
  error: Error | null
}

export function useUserRole(address?: Address): UserRoleResult {
  const { data: isAdmin, isLoading: loadingAdmin, error: errorAdmin } = useReadContract({
    address: GOVERNANCE_ROLES_ADDRESS,
    abi: GOVERNANCE_ROLES_ABI,
    functionName: 'hasRole',
    args: address ? [ADMIN_ROLE, address] : undefined,
    query: {
      enabled: !!address
    }
  })

  const { data: isStrategist, isLoading: loadingStrategist, error: errorStrategist } = useReadContract({
    address: GOVERNANCE_ROLES_ADDRESS,
    abi: GOVERNANCE_ROLES_ABI,
    functionName: 'hasRole',
    args: address ? [STRATEGIST_ROLE, address] : undefined,
    query: {
      enabled: !!address
    }
  })

  const { data: isEmergency, isLoading: loadingEmergency, error: errorEmergency } = useReadContract({
    address: GOVERNANCE_ROLES_ADDRESS,
    abi: GOVERNANCE_ROLES_ABI,
    functionName: 'hasRole',
    args: address ? [EMERGENCY_ROLE, address] : undefined,
    query: {
      enabled: !!address
    }
  })

  const { data: isTreasuryManager, isLoading: loadingTreasury, error: errorTreasury } = useReadContract({
    address: GOVERNANCE_ROLES_ADDRESS,
    abi: GOVERNANCE_ROLES_ABI,
    functionName: 'hasRole',
    args: address ? [TREASURY_MANAGER_ROLE, address] : undefined,
    query: {
      enabled: !!address
    }
  })

  const loading = loadingAdmin || loadingStrategist || loadingEmergency || loadingTreasury
  const error = errorAdmin || errorStrategist || errorEmergency || errorTreasury

  return {
    isAdmin: isAdmin ?? false,
    isStrategist: isStrategist ?? false,
    isEmergency: isEmergency ?? false,
    isTreasuryManager: isTreasuryManager ?? false,
    loading,
    error: error ?? null
  }
}
