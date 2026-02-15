// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/LendingModule.sol";

contract DeployLending is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address governanceAddress = 0x7D5b74F2dd093c32594Ab547F57E9ecf3Dd04565;
        address vaultAddress = 0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D;
        address collateralToken = vm.envAddress("COLLATERAL_TOKEN_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        LendingModule lending = new LendingModule(governanceAddress, collateralToken);
        console.log("LendingModule:", address(lending));

        lending.setApprovedVault(vaultAddress, true);
        lending.setTermRate(lending.TERM_30_DAYS(), 500);
        lending.setTermRate(lending.TERM_60_DAYS(), 750);
        lending.setTermRate(lending.TERM_90_DAYS(), 1000);
        console.log("Configured");

        vm.stopBroadcast();
    }
}
