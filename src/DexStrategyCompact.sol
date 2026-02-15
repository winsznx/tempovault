// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./GovernanceRoles.sol";
import "./RiskController.sol";
import "./TreasuryVault.sol";
import "./interfaces/ITempoOrderbook.sol";
import "./libraries/DexStrategyLib.sol";

/// @title DexStrategy (Optimized for Tempo deployment)
/// @notice Automated market making on Tempo DEX - bytecode optimized version
contract DexStrategyCompact is ReentrancyGuard {
    using DexStrategyLib for *;

    GovernanceRoles public immutable governance;
    RiskController public immutable riskController;
    ITempoOrderbook public immutable dex;
    TreasuryVault public vault;

    mapping(bytes32 => StrategyConfig) public pairConfigs;
    mapping(bytes32 => uint128[]) public activeOrderIds;
    mapping(uint128 => OrderRecord) public orderRecords;

    struct StrategyConfig {
        address tokenA;
        address tokenB;
        int16 baseTickWidth;
        uint256 orderSizePerTick;
        uint16 numBidLevels;
        uint16 numAskLevels;
        bool useFlipOrders;
        bool active;
    }

    struct OrderRecord {
        bytes32 pairId;
        int16 tick;
        uint256 amount;
        bool isBid;
        bool isFlip;
        uint256 placedAt;
    }

    error StrategyNotActive(bytes32 pairId);
    error Unauthorized();

    event LiquidityDeployed(bytes32 indexed pairId, uint128[] orderIds);
    event EmergencyUnwind(bytes32 indexed pairId, uint128 baseRecovered, uint128 quoteRecovered);

    constructor(
        address _governance,
        address _riskController,
        address _dex,
        address _vault
    ) {
        governance = GovernanceRoles(_governance);
        riskController = RiskController(_riskController);
        dex = ITempoOrderbook(_dex);
        vault = TreasuryVault(_vault);
    }

    modifier onlyRole(bytes32 role) {
        governance.checkRole(role, msg.sender);
        _;
    }

    function configureStrategy(bytes32 pairId, StrategyConfig calldata config)
        external
        onlyRole(governance.STRATEGIST_ROLE())
    {
        pairConfigs[pairId] = config;
        IERC20(config.tokenA).approve(address(dex), type(uint256).max);
        IERC20(config.tokenB).approve(address(dex), type(uint256).max);
    }

    function deployLiquidity(
        bytes32 pairId,
        uint128 baseAmount,
        uint128 quoteAmount,
        int16 centerTick
    )
        external
        nonReentrant
        onlyRole(governance.STRATEGIST_ROLE())
        returns (uint128[] memory orderIds)
    {
        StrategyConfig storage config = pairConfigs[pairId];
        if (!config.active) revert StrategyNotActive(pairId);

        IERC20(config.tokenA).approve(address(dex), type(uint256).max);
        IERC20(config.tokenB).approve(address(dex), type(uint256).max);

        DexStrategyLib.DeployLiquidityParams memory params = DexStrategyLib.DeployLiquidityParams({
            dex: dex,
            riskController: riskController,
            base: config.tokenA,
            quote: config.tokenB,
            pairId: pairId,
            baseAmount: baseAmount,
            quoteAmount: quoteAmount,
            centerTick: centerTick,
            tickWidth: config.baseTickWidth,
            useFlipOrders: config.useFlipOrders
        });

        orderIds = DexStrategyLib.deployLiquidity(params);
        activeOrderIds[pairId] = orderIds;

        emit LiquidityDeployed(pairId, orderIds);
        return orderIds;
    }

    function emergencyUnwind(bytes32 pairId)
        external
        nonReentrant
        onlyRole(governance.EMERGENCY_ROLE())
        returns (uint128 baseRecovered, uint128 quoteRecovered)
    {
        StrategyConfig storage config = pairConfigs[pairId];

        DexStrategyLib.EmergencyUnwindParams memory params = DexStrategyLib.EmergencyUnwindParams({
            dex: dex,
            pairId: pairId,
            orderIds: activeOrderIds[pairId],
            base: config.tokenA,
            quote: config.tokenB,
            vault: address(vault)
        });

        (baseRecovered, quoteRecovered) = DexStrategyLib.emergencyUnwind(params);
        delete activeOrderIds[pairId];

        emit EmergencyUnwind(pairId, baseRecovered, quoteRecovered);
        return (baseRecovered, quoteRecovered);
    }

    function getDexBalance(address token) public view returns (uint128) {
        return dex.balanceOf(address(this), token);
    }

    function getActiveOrders(bytes32 pairId) external view returns (uint128[] memory) {
        return activeOrderIds[pairId];
    }

    /// @notice Accept deployment from vault - required by IDexStrategy interface
    function acceptDeployment(uint256, bytes32) external view {
        if (msg.sender != address(vault)) revert Unauthorized();
        // No logic needed for compact strategy, just validation
    }
}
