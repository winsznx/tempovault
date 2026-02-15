// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/DexStrategyCompact.sol";

contract DeployStrategyScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("ADMIN_PRIVATE_KEY");
        address governance = vm.envAddress("GOVERNANCE_ROLES_ADDRESS");
        address risk = vm.envAddress("RISK_CONTROLLER_ADDRESS");
        address dex = vm.envAddress("TEMPO_DEX_ADDRESS");
        address vault = vm.envAddress("TREASURY_VAULT_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        DexStrategyCompact strategy = new DexStrategyCompact(
            governance,
            risk,
            dex,
            vault
        );

        console.log("Strategy Deployed to:", address(strategy));

        vm.stopBroadcast();
    }
}
