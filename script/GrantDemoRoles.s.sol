// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/GovernanceRoles.sol";

/// @title GrantDemoRoles
/// @notice Quick script to grant demo roles to a wallet for showcasing
contract GrantDemoRoles is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address governance = vm.envAddress("GOVERNANCE_ROLES_ADDRESS");

        address demoWallet = vm.envAddress("DEMO_WALLET_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        GovernanceRoles gov = GovernanceRoles(governance);

        console.log("Granting demo roles to:", demoWallet);
        console.log("");

        gov.grantRole(gov.TREASURY_MANAGER_ROLE(), demoWallet);
        console.log("Granted TREASURY_MANAGER_ROLE");

        gov.grantRole(gov.STRATEGIST_ROLE(), demoWallet);
        console.log("Granted STRATEGIST_ROLE");

        console.log("");
        console.log("Demo wallet is ready! Connect with:", demoWallet);

        vm.stopBroadcast();
    }
}
