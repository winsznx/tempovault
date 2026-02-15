// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/TreasuryVault.sol";

contract DeployVault is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address governanceAddress = 0x7D5b74F2dd093c32594Ab547F57E9ecf3Dd04565;
        address riskControllerAddress = 0xa5bec93b07b70e91074A24fB79C5EA8aF639a639;
        address governanceAdmin = vm.envAddress("GOVERNANCE_ADMIN");
        address testUsdc = vm.envAddress("TEST_USDC_ADDRESS");
        address feeTreasury = vm.envAddress("FEE_TREASURY_ADDRESS");
        uint16 performanceFeeBps = uint16(vm.envUint("PERFORMANCE_FEE_BPS"));
        uint16 managementFeeBps = uint16(vm.envUint("MANAGEMENT_FEE_BPS"));

        vm.startBroadcast(deployerPrivateKey);

        TreasuryVault vault = new TreasuryVault(
            1,
            governanceAdmin,
            governanceAddress,
            riskControllerAddress
        );
        console.log("TreasuryVault:", address(vault));

        vault.setApprovedToken(testUsdc, true);
        vault.setFeeConfig(feeTreasury, performanceFeeBps, managementFeeBps);
        console.log("Vault configured");

        vm.stopBroadcast();
    }
}
