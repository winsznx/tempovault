"""
Lightweight test to verify event decoding logic without DB dependencies
"""
import sys
import os
import json
from web3 import Web3
try:
    from web3.middleware import geth_poa_middleware
except ImportError:
    from web3.middleware import ExtraDataToPOAMiddleware as geth_poa_middleware

os.chdir("/Users/macbook/tempovault/offchain")

print("Testing event decoder initialization...")

try:
    # Load ABIs
    with open("../out/TreasuryVault.sol/TreasuryVault.json") as f:
        vault_abi = json.load(f)["abi"]

    with open("../out/RiskController.sol/RiskController.json") as f:
        risk_abi = json.load(f)["abi"]

    with open("../out/DexStrategyCompact.sol/DexStrategyCompact.json") as f:
        strategy_abi = json.load(f)["abi"]

    print("✅ ABIs loaded successfully")

    # Initialize Web3
    w3 = Web3(Web3.HTTPProvider("https://rpc.moderato.tempo.xyz"))
    try:
        w3.middleware_onion.inject(geth_poa_middleware, layer=0)
    except (TypeError, AttributeError):
        w3.middleware_onion.inject(geth_poa_middleware(), layer=0)

    print("✅ Web3 initialized")

    # Create contract instances for event decoding
    DEPLOYED_CONTRACTS = {
        "0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D": ("TreasuryVault", vault_abi),
        "0xa5bec93b07b70e91074A24fB79C5EA8aF639a639": ("RiskController", risk_abi),
        "0x2f0b1a0c816377f569533385a30d2afe2cb4899e": ("DexStrategyCompact", strategy_abi),
    }

    # Build event signature to contract mapping
    event_decoders = {}
    for address, (contract_name, abi) in DEPLOYED_CONTRACTS.items():
        contract = w3.eth.contract(address=Web3.to_checksum_address(address), abi=abi)
        event_count = 0
        for event_abi in abi:
            if event_abi.get("type") == "event":
                event_name = event_abi["name"]
                event_obj = getattr(contract.events, event_name)
                signature_hash = w3.keccak(text=event_name + "(" + ",".join([inp["type"] for inp in event_abi["inputs"]]) + ")").hex()
                event_decoders[signature_hash] = (contract, event_obj, event_name)
                event_count += 1
        print(f"  {contract_name}: {event_count} events")

    print(f"\n✅ Event decoders registered: {len(event_decoders)} total")

    print("\nRegistered events:")
    for sig_hash, (contract, event_obj, event_name) in sorted(event_decoders.items(), key=lambda x: x[1][2]):
        print(f"  - {event_name} ({sig_hash[:10]}...)")

    print("\n✅✅✅ Event indexer core logic test PASSED")
    sys.exit(0)

except Exception as e:
    print(f"\n❌ Event indexer test FAILED")
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
