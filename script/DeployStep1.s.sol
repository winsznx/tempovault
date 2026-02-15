// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/GovernanceRoles.sol";
import "../src/RiskController.sol";

contract DeployStep1 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address governanceAdmin = vm.envAddress("GOVERNANCE_ADMIN");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy GovernanceRoles
        GovernanceRoles governance = new GovernanceRoles(governanceAdmin);
        console.log("GovernanceRoles:", address(governance));

        // Deploy RiskController
        RiskController.RiskParams memory defaultRiskParams = RiskController.RiskParams({
            maxExposurePerPairBps: 3000,
            maxTickDeviation: 200,
            maxImbalanceBps: 9000,
            maxOrderSize: 50000e18,
            minReserveBps: 2000,
            oracleStalenessThreshold: 300,
            maxSpreadSanityTicks: 100,
            minDepthThreshold: 100000e18
        });

        RiskController riskController = new RiskController(address(governance), defaultRiskParams);
        console.log("RiskController:", address(riskController));

        vm.stopBroadcast();
    }
}
