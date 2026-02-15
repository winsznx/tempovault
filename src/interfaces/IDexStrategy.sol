// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDexStrategy {
    /// @notice Accept a deployment from TreasuryVault, linking capital to a specific pair
    /// @param deploymentId The vault's deployment identifier
    /// @param pairId The pair this capital is authorized to trade
    function acceptDeployment(uint256 deploymentId, bytes32 pairId) external;
}
