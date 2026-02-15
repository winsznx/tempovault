// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ReportingAdapter
/// @notice Event-only contract for compliance and audit reporting
contract ReportingAdapter {

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------

    event TreasuryAction(
        uint256 indexed vaultId,
        string actionType,
        address indexed token,
        uint256 amount,
        address indexed actor,
        uint256 timestamp
    );

    event RiskEvent(
        bytes32 indexed pairId,
        string eventType,
        int24 pegDeviation,
        uint256 orderbookDepth,
        bool circuitBroken,
        uint256 timestamp
    );

    event YieldEvent(
        uint256 indexed vaultId,
        bytes32 indexed pairId,
        uint256 spreadCaptured,
        uint256 volume,
        uint256 timestamp
    );

    event ComplianceSnapshot(
        uint256 indexed vaultId,
        uint256 totalDeposited,
        uint256 totalWithdrawn,
        uint256 deployedCapital,
        uint256 realizedLosses,
        uint256 performanceFees,
        uint256 managementFees,
        uint256 timestamp
    );

    // ---------------------------------------------------------------
    // Emission Functions
    // ---------------------------------------------------------------

    function emitTreasuryAction(
        uint256 vaultId,
        string calldata actionType,
        address token,
        uint256 amount,
        address actor
    ) external {
        emit TreasuryAction(vaultId, actionType, token, amount, actor, block.timestamp);
    }

    function emitRiskEvent(
        bytes32 pairId,
        string calldata eventType,
        int24 pegDeviation,
        uint256 orderbookDepth,
        bool circuitBroken
    ) external {
        emit RiskEvent(pairId, eventType, pegDeviation, orderbookDepth, circuitBroken, block.timestamp);
    }

    function emitYieldEvent(
        uint256 vaultId,
        bytes32 pairId,
        uint256 spreadCaptured,
        uint256 volume
    ) external {
        emit YieldEvent(vaultId, pairId, spreadCaptured, volume, block.timestamp);
    }

    function emitComplianceSnapshot(
        uint256 vaultId,
        uint256 totalDeposited,
        uint256 totalWithdrawn,
        uint256 deployedCapital,
        uint256 realizedLosses,
        uint256 performanceFees,
        uint256 managementFees
    ) external {
        emit ComplianceSnapshot(
            vaultId,
            totalDeposited,
            totalWithdrawn,
            deployedCapital,
            realizedLosses,
            performanceFees,
            managementFees,
            block.timestamp
        );
    }
}
