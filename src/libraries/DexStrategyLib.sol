// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/ITempoOrderbook.sol";
import "../RiskController.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Library to reduce DexStrategy deployment bytecode size
library DexStrategyLib {
    // Errors
    error TickOutOfBounds(int16 tick);
    error TickNotMultipleOfSpacing(int16 tick);
    error AmountExceedsUint128(uint256 amount);
    error InsufficientBalance(address token, uint128 required, uint128 available);

    // Constants
    int16 constant TEMPO_MIN_TICK = -2000;
    int16 constant TEMPO_MAX_TICK = 2000;
    int16 constant TEMPO_TICK_SPACING = 10;
    uint128 constant MAX_UINT128 = type(uint128).max;

    struct DeployLiquidityParams {
        ITempoOrderbook dex;
        RiskController riskController;
        address base;
        address quote;
        bytes32 pairId;
        uint128 baseAmount;
        uint128 quoteAmount;
        int16 centerTick;
        int16 tickWidth;
        bool useFlipOrders;
    }

    struct EmergencyUnwindParams {
        ITempoOrderbook dex;
        bytes32 pairId;
        uint128[] orderIds;
        address base;
        address quote;
        address vault;
    }

    function validateTick(int16 tick) internal pure {
        if (tick < TEMPO_MIN_TICK || tick > TEMPO_MAX_TICK) {
            revert TickOutOfBounds(tick);
        }
        if (tick % TEMPO_TICK_SPACING != 0) {
            revert TickNotMultipleOfSpacing(tick);
        }
    }

    function toUint128(uint256 amount) internal pure returns (uint128) {
        if (amount > MAX_UINT128) revert AmountExceedsUint128(amount);
        return uint128(amount);
    }

    function ensureDexBalance(
        ITempoOrderbook dex,
        address token,
        uint128 amount
    ) internal {
        uint128 currentBalance = dex.balanceOf(address(this), token);
        if (currentBalance < amount) {
            IERC20(token).approve(address(dex), type(uint256).max);
        }
    }

    function withdrawFromDex(
        ITempoOrderbook dex,
        address token,
        uint128 amount
    ) internal {
        require(amount > 0, "Zero amount");
        uint128 balance = dex.balanceOf(address(this), token);
        if (balance < amount) {
            revert InsufficientBalance(token, amount, balance);
        }
        dex.withdraw(token, amount);
    }

    function deployLiquidity(
        DeployLiquidityParams memory params
    ) external returns (uint128[] memory orderIds) {
        validateTick(params.centerTick);
        validateTick(params.tickWidth);

        // Ensure DEX has enough balance
        ensureDexBalance(params.dex, params.base, params.baseAmount);
        ensureDexBalance(params.dex, params.quote, params.quoteAmount);

        // Calculate tick range
        int16 bidTick = params.centerTick - params.tickWidth;
        int16 askTick = params.centerTick + params.tickWidth;

        validateTick(bidTick);
        validateTick(askTick);

        orderIds = new uint128[](2);

        // Calculate Bid Amount in Base Units
        uint32 scale = params.dex.PRICE_SCALE();
        // For bidTick, convert Quote Amount to Base Amount
        uint32 bidPrice = params.dex.tickToPrice(bidTick);
        // Base = (Quote * Scale) / Price
        // Example: 1000 Quote / Price 2.0 = 500 Base
        uint128 bidSize = uint128((uint256(params.quoteAmount) * scale) / bidPrice);

        if (params.useFlipOrders) {
            // Place flip orders
            orderIds[0] = params.dex.placeFlip(
                params.base, // Always Base Token
                bidSize, // Base Units
                true,  // isBid
                bidTick,
                askTick
            );
            orderIds[1] = params.dex.placeFlip(
                params.base, // Always Base Token
                params.baseAmount, // Base Units
                false, // isAsk
                askTick,
                bidTick
            );
        } else {
            // Place regular orders
            orderIds[0] = params.dex.place(
                params.base, // Always Base Token
                bidSize, // Base Units
                true,  // isBid
                bidTick
            );
            orderIds[1] = params.dex.place(
                params.base, // Always Base Token
                params.baseAmount, // Base Units
                false, // isAsk
                askTick
            );
        }

        return orderIds;
    }

    function emergencyUnwind(
        EmergencyUnwindParams memory params
    ) external returns (uint128 baseRecovered, uint128 quoteRecovered) {
        // Cancel all orders
        for (uint i = 0; i < params.orderIds.length; i++) {
            if (params.orderIds[i] != 0) {
                params.dex.cancel(params.orderIds[i]);
            }
        }

        // Withdraw all balances
        baseRecovered = params.dex.balanceOf(address(this), params.base);
        if (baseRecovered > 0) {
            withdrawFromDex(params.dex, params.base, baseRecovered);
            IERC20(params.base).transfer(params.vault, baseRecovered);
        }

        quoteRecovered = params.dex.balanceOf(address(this), params.quote);
        if (quoteRecovered > 0) {
            withdrawFromDex(params.dex, params.quote, quoteRecovered);
            IERC20(params.quote).transfer(params.vault, quoteRecovered);
        }

        return (baseRecovered, quoteRecovered);
    }
}
