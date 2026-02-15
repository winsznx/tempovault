// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/DexStrategy.sol";
import "../src/LendingModule.sol";
import "../src/ReportingAdapter.sol";
import "../src/TreasuryVault.sol";

contract DeployFinal is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address governanceAddress = 0x7D5b74F2dd093c32594Ab547F57E9ecf3Dd04565;
        address riskControllerAddress = 0xa5bec93b07b70e91074A24fB79C5EA8aF639a639;
        address vaultAddress = 0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D;
        address tempoDex = 0xDEc0000000000000000000000000000000000000;
        address collateralToken = vm.envAddress("COLLATERAL_TOKEN_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy DexStrategy
        DexStrategy strategy = new DexStrategy(
            governanceAddress,
            riskControllerAddress,
            tempoDex,
            vaultAddress
        );
        console.log("DexStrategy:", address(strategy));

        // Approve strategy on vault
        TreasuryVault(vaultAddress).setApprovedStrategy(address(strategy), true);
        console.log("Approved strategy");

        // Deploy LendingModule
        LendingModule lending = new LendingModule(governanceAddress, collateralToken);
        console.log("LendingModule:", address(lending));

        lending.setApprovedVault(vaultAddress, true);
        lending.setTermRate(lending.TERM_30_DAYS(), 500);
        lending.setTermRate(lending.TERM_60_DAYS(), 750);
        lending.setTermRate(lending.TERM_90_DAYS(), 1000);
        console.log("Lending configured");

        // Deploy ReportingAdapter
        ReportingAdapter reporter = new ReportingAdapter();
        console.log("ReportingAdapter:", address(reporter));

        console.log("\n=== DEPLOYMENT COMPLETE ===");
        console.log("GovernanceRoles:  ", governanceAddress);
        console.log("RiskController:   ", riskControllerAddress);
        console.log("TreasuryVault:    ", vaultAddress);
        console.log("DexStrategy:      ", address(strategy));
        console.log("LendingModule:    ", address(lending));
        console.log("ReportingAdapter: ", address(reporter));

        vm.stopBroadcast();
    }
}
