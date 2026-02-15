// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/DexStrategy.sol";

contract DeployDexOnly is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address governanceAddress = 0x7D5b74F2dd093c32594Ab547F57E9ecf3Dd04565;
        address riskControllerAddress = 0xa5bec93b07b70e91074A24fB79C5EA8aF639a639;
        address vaultAddress = 0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D;
        address tempoDex = 0xDEc0000000000000000000000000000000000000;

        vm.startBroadcast(deployerPrivateKey);

        DexStrategy strategy = new DexStrategy(
            governanceAddress,
            riskControllerAddress,
            tempoDex,
            vaultAddress
        );
        console.log("DexStrategy:", address(strategy));

        vm.stopBroadcast();
    }
}
