// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";

/// @title GovernanceRoles
/// @notice Protocol-wide role registry for TempoVault
/// @dev All permissioned contracts reference this contract for auth checks
contract GovernanceRoles is AccessControlEnumerable {

    // ---------------------------------------------------------------
    // Role Definitions
    // ---------------------------------------------------------------

    /// @notice Can add/remove other roles, upgrade protocol parameters
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

    /// @notice Can deposit, withdraw, allocate capital to strategies
    bytes32 public constant TREASURY_MANAGER_ROLE = keccak256("TREASURY_MANAGER");

    /// @notice Can update risk parameters, trigger circuit breakers
    bytes32 public constant RISK_OFFICER_ROLE = keccak256("RISK_OFFICER");

    /// @notice Can invoke emergency pause across all modules
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY");

    /// @notice Can submit oracle data updates
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE");

    /// @notice Can configure and execute DEX strategies
    bytes32 public constant STRATEGIST_ROLE = keccak256("STRATEGIST");

    // ---------------------------------------------------------------
    // Custom Errors
    // ---------------------------------------------------------------

    error Unauthorized(address caller, bytes32 requiredRole);

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------

    event RoleGrantedByAdmin(bytes32 indexed role, address indexed account, address indexed admin);
    event RoleRevokedByAdmin(bytes32 indexed role, address indexed account, address indexed admin);

    // ---------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------

    /// @param initialAdmin Address that receives DEFAULT_ADMIN_ROLE
    constructor(address initialAdmin) {
        if (initialAdmin == address(0)) revert Unauthorized(address(0), ADMIN_ROLE);
        _grantRole(ADMIN_ROLE, initialAdmin);
        _grantRole(EMERGENCY_ROLE, initialAdmin);
    }

    // ---------------------------------------------------------------
    // External Authorization Check
    // ---------------------------------------------------------------

    /// @notice Revert if caller lacks the required role
    /// @param role The role to check
    /// @param account The address to verify
    function checkRole(bytes32 role, address account) external view {
        if (!hasRole(role, account)) {
            revert Unauthorized(account, role);
        }
    }

    // ---------------------------------------------------------------
    // Role Admin Configuration
    // ---------------------------------------------------------------

    /// @notice Set which role can administer another role
    /// @dev Only callable by DEFAULT_ADMIN_ROLE
    function setRoleAdmin(bytes32 role, bytes32 adminRole) external onlyRole(ADMIN_ROLE) {
        _setRoleAdmin(role, adminRole);
    }
}
