"""
TempoVault Oracle Relay
Queries Tempo DEX directly, signs with EIP-712, submits to RiskController
Updated for Tempo protocol: uses books() and getTickLevel() from DEX contract
"""

import os
import time
from web3 import Web3
from eth_account import Account
from eth_account.messages import encode_structured_data
import json

# Environment variables
RPC_URL = os.getenv("RPC_URL", "https://rpc.moderato.tempo.xyz")  # Tempo Testnet
ORACLE_PRIVATE_KEY = os.getenv("ORACLE_PRIVATE_KEY")
RISK_CONTROLLER_ADDRESS = os.getenv("RISK_CONTROLLER_ADDRESS")

# Tempo DEX predeployed address (same on testnet and mainnet)
TEMPO_DEX_ADDRESS = "0xdec0000000000000000000000000000000000000"

w3 = Web3(Web3.HTTPProvider(RPC_URL))

# Load ABIs
with open("../out/RiskController.sol/RiskController.json") as f:
    risk_controller_abi = json.load(f)["abi"]

with open("../out/ITempoOrderbook.sol/ITempoOrderbook.json") as f:
    tempo_dex_abi = json.load(f)["abi"]

risk_controller = w3.eth.contract(
    address=Web3.to_checksum_address(RISK_CONTROLLER_ADDRESS),
    abi=risk_controller_abi
)

tempo_dex = w3.eth.contract(
    address=Web3.to_checksum_address(TEMPO_DEX_ADDRESS),
    abi=tempo_dex_abi
)

oracle_account = Account.from_key(ORACLE_PRIVATE_KEY)


def get_current_nonce(pair_id: str) -> int:
    """Get current nonce from RiskController"""
    pair_id_bytes = Web3.to_bytes(hexstr=pair_id)
    return risk_controller.functions.oracleNonces(pair_id_bytes).call()


def query_tempo_dex(token_a: str, token_b: str) -> dict:
    """
    Query Tempo DEX directly for orderbook state
    Uses books() and getTickLevel() functions from ITempoOrderbook
    """
    token_a = Web3.to_checksum_address(token_a)
    token_b = Web3.to_checksum_address(token_b)

    # Get pair key
    pair_key = tempo_dex.functions.pairKey(token_a, token_b).call()

    # Get orderbook state
    books_data = tempo_dex.functions.books(pair_key).call()
    base = books_data[0]
    quote = books_data[1]
    best_bid_tick = books_data[2]  # int16
    best_ask_tick = books_data[3]  # int16

    # Get liquidity at best levels
    bid_liquidity_data = tempo_dex.functions.getTickLevel(base, best_bid_tick, True).call()
    ask_liquidity_data = tempo_dex.functions.getTickLevel(base, best_ask_tick, False).call()

    bid_liquidity = bid_liquidity_data[2]  # totalLiquidity (uint128)
    ask_liquidity = ask_liquidity_data[2]  # totalLiquidity (uint128)

    # Calculate reference tick (midpoint)
    reference_tick = (best_bid_tick + best_ask_tick) // 2

    # Calculate peg deviation in basis points
    # tick = (price - 1) × 100_000
    # Each tick = 0.001% = 0.1 basis point
    # Convert tick to basis points: tick × 0.1
    peg_deviation_bps = abs(reference_tick) * 10 // 100  # Convert to basis points

    return {
        "referenceTick": reference_tick,
        "pegDeviation": peg_deviation_bps,
        "orderbookDepthBid": bid_liquidity,
        "orderbookDepthAsk": ask_liquidity,
        "timestamp": int(time.time()),
        "bestBidTick": best_bid_tick,
        "bestAskTick": best_ask_tick,
        "base": base,
        "quote": quote
    }


def sign_oracle_signal(pair_id: str, signal: dict) -> str:
    """
    Sign oracle signal using EIP-712
    Updated for Tempo: includes referenceTick field
    """
    domain = {
        "name": "TempoVaultRiskController",
        "version": "1",
        "chainId": w3.eth.chain_id,
        "verifyingContract": RISK_CONTROLLER_ADDRESS
    }

    types = {
        "EIP712Domain": [
            {"name": "name", "type": "string"},
            {"name": "version", "type": "string"},
            {"name": "chainId", "type": "uint256"},
            {"name": "verifyingContract", "type": "address"}
        ],
        "OracleUpdate": [
            {"name": "pairId", "type": "bytes32"},
            {"name": "referenceTick", "type": "int16"},  # NEW: Tempo reference tick
            {"name": "pegDeviation", "type": "uint256"},
            {"name": "orderbookDepthBid", "type": "uint256"},
            {"name": "orderbookDepthAsk", "type": "uint256"},
            {"name": "timestamp", "type": "uint256"},
            {"name": "nonce", "type": "uint256"}
        ]
    }

    message = {
        "pairId": Web3.to_bytes(hexstr=pair_id),
        "referenceTick": signal["referenceTick"],  # NEW
        "pegDeviation": signal["pegDeviation"],
        "orderbookDepthBid": signal["orderbookDepthBid"],
        "orderbookDepthAsk": signal["orderbookDepthAsk"],
        "timestamp": signal["timestamp"],
        "nonce": signal["nonce"]
    }

    structured_data = {
        "types": types,
        "domain": domain,
        "primaryType": "OracleUpdate",
        "message": message
    }

    encoded_data = encode_structured_data(structured_data)
    signed_message = oracle_account.sign_message(encoded_data)

    return signed_message.signature.hex()


def submit_oracle_signal(pair_id: str, signal: dict, signature: str):
    """
    Submit signed oracle signal to RiskController
    Updated for Tempo: includes referenceTick in signal tuple
    """
    pair_id_bytes = Web3.to_bytes(hexstr=pair_id)

    # Signal tuple must match OracleSignal struct in RiskController
    signal_tuple = (
        signal["referenceTick"],  # NEW: int16 referenceTick
        signal["pegDeviation"],   # uint256 pegDeviation
        signal["orderbookDepthBid"],  # uint256 orderbookDepthBid
        signal["orderbookDepthAsk"],  # uint256 orderbookDepthAsk
        signal["timestamp"],  # uint256 timestamp
        signal["nonce"]  # uint256 nonce
    )

    tx = risk_controller.functions.updateOracleSignal(
        pair_id_bytes,
        signal_tuple,
        Web3.to_bytes(hexstr=signature)
    ).build_transaction({
        "from": oracle_account.address,
        "nonce": w3.eth.get_transaction_count(oracle_account.address),
        "gas": 200000,
        "gasPrice": w3.eth.gas_price
    })

    signed_tx = oracle_account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)

    print(f"Submitted oracle signal. Tx hash: {tx_hash.hex()}")

    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    if receipt["status"] == 1:
        print(f"✓ Oracle signal accepted. Nonce: {signal['nonce']}")
    else:
        print(f"✗ Oracle signal rejected")

    return receipt


def relay_loop(pair_id: str, token_a: str, token_b: str, interval: int = 60):
    """
    Main relay loop
    Queries Tempo DEX directly instead of external API
    """
    print(f"Starting oracle relay for pair {pair_id}")
    print(f"Oracle address: {oracle_account.address}")
    print(f"Tempo DEX: {TEMPO_DEX_ADDRESS}")
    print(f"Chain ID: {w3.eth.chain_id}")
    print(f"Token A: {token_a}")
    print(f"Token B: {token_b}")

    while True:
        try:
            # Get current nonce from RiskController
            onchain_nonce = get_current_nonce(pair_id)
            print(f"\nCurrent onchain nonce: {onchain_nonce}")

            # Query Tempo DEX directly
            dex_data = query_tempo_dex(token_a, token_b)
            print(f"Queried Tempo DEX:")
            print(f"  Base: {dex_data['base']}")
            print(f"  Quote: {dex_data['quote']}")
            print(f"  Best Bid Tick: {dex_data['bestBidTick']}")
            print(f"  Best Ask Tick: {dex_data['bestAskTick']}")
            print(f"  Reference Tick: {dex_data['referenceTick']}")
            print(f"  Peg Deviation: {dex_data['pegDeviation']} bps")
            print(f"  Bid Liquidity: {dex_data['orderbookDepthBid']}")
            print(f"  Ask Liquidity: {dex_data['orderbookDepthAsk']}")

            # Prepare signal with incremented nonce
            signal = {
                "referenceTick": dex_data["referenceTick"],
                "pegDeviation": dex_data["pegDeviation"],
                "orderbookDepthBid": dex_data["orderbookDepthBid"],
                "orderbookDepthAsk": dex_data["orderbookDepthAsk"],
                "timestamp": dex_data["timestamp"],
                "nonce": onchain_nonce + 1
            }

            # Sign with EIP-712
            signature = sign_oracle_signal(pair_id, signal)
            print(f"Signed with EIP-712")

            # Submit to RiskController
            submit_oracle_signal(pair_id, signal, signature)

        except Exception as e:
            print(f"Error in relay loop: {e}")
            import traceback
            traceback.print_exc()

        print(f"\nSleeping for {interval} seconds...")
        time.sleep(interval)


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 4:
        print("Usage: python oracle_relay.py <pair_id> <token_a> <token_b> [interval]")
        print("\nExample:")
        print("  python oracle_relay.py 0x1234... 0xUSDC... 0xpathUSD... 60")
        sys.exit(1)

    pair_id = sys.argv[1]
    token_a = sys.argv[2]
    token_b = sys.argv[3]
    interval = int(sys.argv[4]) if len(sys.argv) > 4 else 60

    relay_loop(pair_id, token_a, token_b, interval)
