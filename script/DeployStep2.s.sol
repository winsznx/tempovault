// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/TreasuryVault.sol";
import "../src/DexStrategy.sol";

contract DeployStep2 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address governanceAddress = 0x7D5b74F2dd093c32594Ab547F57E9ecf3Dd04565; // From Step 1
        address riskControllerAddress = 0xa5bec93b07b70e91074A24fB79C5EA8aF639a639; // From Step 1
        address governanceAdmin = vm.envAddress("GOVERNANCE_ADMIN");
        address testUsdc = vm.envAddress("TEST_USDC_ADDRESS");
        address feeTreasury = vm.envAddress("FEE_TREASURY_ADDRESS");
        uint16 performanceFeeBps = uint16(vm.envUint("PERFORMANCE_FEE_BPS"));
        uint16 managementFeeBps = uint16(vm.envUint("MANAGEMENT_FEE_BPS"));
        address tempoDex = 0xDEc0000000000000000000000000000000000000;

        vm.startBroadcast(deployerPrivateKey);

        // Deploy TreasuryVault
        TreasuryVault vault = new TreasuryVault(
            1,
            governanceAdmin,
            governanceAddress,
            riskControllerAddress
        );
        console.log("TreasuryVault:", address(vault));

        // Configure vault
        vault.setApprovedToken(testUsdc, true);
        console.log("Approved USDC");

        vault.setFeeConfig(feeTreasury, performanceFeeBps, managementFeeBps);
        console.log("Fee config set");

        // Deploy DexStrategy
        DexStrategy strategy = new DexStrategy(
            governanceAddress,
            riskControllerAddress,
            tempoDex,
            address(vault)
        );
        console.log("DexStrategy:", address(strategy));

        vault.setApprovedStrategy(address(strategy), true);
        console.log("Approved strategy");

        vm.stopBroadcast();
    }
}
