// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/GovernanceRoles.sol";
import "../src/RiskController.sol";
import "../src/TreasuryVault.sol";
import "../src/DexStrategy.sol";
import "../src/LendingModule.sol";
import "../src/ReportingAdapter.sol";

contract Deploy is Script {
    // Tempo DEX predeployed address (same on testnet and mainnet)
    address constant TEMPO_DEX_ADDRESS = 0xDEc0000000000000000000000000000000000000;

    // Tempo Chain IDs
    uint256 constant TEMPO_TESTNET_CHAIN_ID = 42431;
    uint256 constant TEMPO_MAINNET_CHAIN_ID = 4217;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address governanceAdmin = vm.envAddress("GOVERNANCE_ADMIN");
        address testUsdc = vm.envAddress("TEST_USDC_ADDRESS");
        address feeTreasury = vm.envAddress("FEE_TREASURY_ADDRESS");
        address collateralToken = vm.envAddress("COLLATERAL_TOKEN_ADDRESS");
        uint16 performanceFeeBps = uint16(vm.envUint("PERFORMANCE_FEE_BPS"));
        uint16 managementFeeBps = uint16(vm.envUint("MANAGEMENT_FEE_BPS"));

        // Verify deploying to Tempo Chain
        require(
            block.chainid == TEMPO_TESTNET_CHAIN_ID || block.chainid == TEMPO_MAINNET_CHAIN_ID,
            "Must deploy to Tempo Chain (testnet: 42431, mainnet: 4217)"
        );

        vm.startBroadcast(deployerPrivateKey);

        console.log("Deploying TempoVault to Tempo Chain (ID:", block.chainid, ")");
        console.log("Tempo DEX:", TEMPO_DEX_ADDRESS);

        GovernanceRoles governance = new GovernanceRoles(governanceAdmin);
        console.log("GovernanceRoles deployed at:", address(governance));

        RiskController.RiskParams memory defaultRiskParams = RiskController.RiskParams({
            maxExposurePerPairBps: 3000,    // 30% max per pair
            maxTickDeviation: 200,          // ±2% from reference
            maxImbalanceBps: 9000,          // 90% max imbalance (was 15000 - invalid)
            maxOrderSize: 50000e18,         // 50k max order
            minReserveBps: 2000,            // 20% min reserve
            oracleStalenessThreshold: 300,  // 5 min staleness
            maxSpreadSanityTicks: 100,      // 1% max spread
            minDepthThreshold: 100000e18    // 100k min depth
        });

        RiskController riskController = new RiskController(address(governance), defaultRiskParams);
        console.log("RiskController deployed at:", address(riskController));

        TreasuryVault vault = new TreasuryVault(
            1,
            governanceAdmin,
            address(governance),
            address(riskController)
        );
        console.log("TreasuryVault deployed at:", address(vault));

        vault.setApprovedToken(testUsdc, true);
        console.log("Approved USDC token");

        vault.setFeeConfig(feeTreasury, performanceFeeBps, managementFeeBps);
        console.log("Fee configuration set");

        DexStrategy strategy = new DexStrategy(
            address(governance),
            address(riskController),
            TEMPO_DEX_ADDRESS,
            address(vault)
        );
        console.log("DexStrategy deployed at:", address(strategy));
        console.log("Using Tempo DEX at:", TEMPO_DEX_ADDRESS);

        vault.setApprovedStrategy(address(strategy), true);
        console.log("Approved DexStrategy");

        LendingModule lending = new LendingModule(address(governance), collateralToken);
        console.log("LendingModule deployed at:", address(lending));

        lending.setApprovedVault(address(vault), true);
        console.log("Approved vault in LendingModule");

        lending.setTermRate(lending.TERM_30_DAYS(), 500);
        lending.setTermRate(lending.TERM_60_DAYS(), 750);
        lending.setTermRate(lending.TERM_90_DAYS(), 1000);
        console.log("Lending term rates configured");

        ReportingAdapter reporter = new ReportingAdapter();
        console.log("ReportingAdapter deployed at:", address(reporter));

        console.log("\n=== Deployment Summary ===");
        console.log("GovernanceRoles:", address(governance));
        console.log("RiskController:", address(riskController));
        console.log("TreasuryVault:", address(vault));
        console.log("DexStrategy:", address(strategy));
        console.log("LendingModule:", address(lending));
        console.log("ReportingAdapter:", address(reporter));

        vm.stopBroadcast();
    }
}
