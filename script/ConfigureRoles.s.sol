// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/GovernanceRoles.sol";

contract ConfigureRoles is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address governanceAddress = vm.envAddress("GOVERNANCE_ADDRESS");
        address treasuryManager = vm.envAddress("TREASURY_MANAGER_ADDRESS");
        address riskOfficer = vm.envAddress("RISK_OFFICER_ADDRESS");
        address strategist = vm.envAddress("STRATEGIST_ADDRESS");
        address oracle = vm.envAddress("ORACLE_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        GovernanceRoles governance = GovernanceRoles(governanceAddress);

        console.log("Configuring roles...");

        governance.grantRole(governance.TREASURY_MANAGER_ROLE(), treasuryManager);
        console.log("Granted TREASURY_MANAGER_ROLE to:", treasuryManager);

        governance.grantRole(governance.RISK_OFFICER_ROLE(), riskOfficer);
        console.log("Granted RISK_OFFICER_ROLE to:", riskOfficer);

        governance.grantRole(governance.STRATEGIST_ROLE(), strategist);
        console.log("Granted STRATEGIST_ROLE to:", strategist);

        governance.grantRole(governance.ORACLE_ROLE(), oracle);
        console.log("Granted ORACLE_ROLE to:", oracle);

        require(governance.hasRole(governance.TREASURY_MANAGER_ROLE(), treasuryManager), "TM role not set");
        require(governance.hasRole(governance.RISK_OFFICER_ROLE(), riskOfficer), "RO role not set");
        require(governance.hasRole(governance.STRATEGIST_ROLE(), strategist), "Strategist role not set");
        require(governance.hasRole(governance.ORACLE_ROLE(), oracle), "Oracle role not set");

        console.log("All roles verified successfully");

        vm.stopBroadcast();
    }
}
