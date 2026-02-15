"""
TempoVault Event Indexer
Indexes all protocol events to PostgreSQL for querying and analytics
"""

import os
import time
import json
from web3 import Web3
try:
    from web3.middleware import geth_poa_middleware
except ImportError:
    from web3.middleware import ExtraDataToPOAMiddleware as geth_poa_middleware
import psycopg2
from psycopg2.extras import Json, execute_values
from datetime import datetime

print("Starting Event Indexer initialization...", flush=True)

RPC_URL = os.getenv("RPC_URL", "http://localhost:8545")
DB_URL = os.getenv("INDEXER_DB_URL", "postgresql://localhost:5432/tempovault")

START_BLOCK = int(os.getenv("START_BLOCK", "0"))
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "5"))

print(f"Connecting to RPC: {RPC_URL}", flush=True)
w3 = Web3(Web3.HTTPProvider(RPC_URL))
print("Web3 instance created", flush=True)
try:
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)
except (TypeError, AttributeError):
    # web3.py v7+ uses different injection method
    w3.middleware_onion.inject(geth_poa_middleware(), layer=0)

print("Loading ABI files...", flush=True)
with open("../out/TreasuryVault.sol/TreasuryVault.json") as f:
    vault_abi = json.load(f)["abi"]
print("Loaded TreasuryVault ABI", flush=True)

with open("../out/RiskController.sol/RiskController.json") as f:
    risk_abi = json.load(f)["abi"]
print("Loaded RiskController ABI", flush=True)

with open("../out/DexStrategyCompact.sol/DexStrategyCompact.json") as f:
    strategy_abi = json.load(f)["abi"]
print("Loaded DexStrategyCompact ABI", flush=True)

# Create contract instances for event decoding
DEPLOYED_CONTRACTS = {
    "0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D": ("TreasuryVault", vault_abi),
    "0xa5bec93b07b70e91074A24fB79C5EA8aF639a639": ("RiskController", risk_abi),
    "0x2f0b1a0c816377f569533385a30d2afe2cb4899e": ("DexStrategyCompact", strategy_abi),
}

# Build event signature to contract mapping
print("Building event decoders...", flush=True)
event_decoders = {}
for address, (contract_name, abi) in DEPLOYED_CONTRACTS.items():
    print(f"Processing contract {contract_name} at {address}", flush=True)
    contract = w3.eth.contract(address=Web3.to_checksum_address(address), abi=abi)
    print(f"Contract instance created for {contract_name}", flush=True)
    for event in contract.events:
        event_obj = getattr(contract.events, event.event_name)
        signature_hash = w3.keccak(text=event_obj.event_name + "(" + ",".join([inp["type"] for inp in event_obj.abi["inputs"]]) + ")").hex()
        event_decoders[signature_hash] = (contract, event_obj, event.event_name)
        print(f"  Registered event: {event.event_name}", flush=True)
print(f"Event decoders built: {len(event_decoders)} events", flush=True)

EVENT_SIGNATURES = {
    "Deposited": "Deposited(uint256,address,uint256,address,uint256)",
    "Withdrawn": "Withdrawn(uint256,address,uint256,address,uint256)",
    "CapitalDeployed": "CapitalDeployed(uint256,uint256,address,address,uint256,bytes32)",
    "CapitalRecalled": "CapitalRecalled(uint256,uint256,uint256)",
    "LossRealized": "LossRealized(uint256,uint256,address,uint256,uint256,uint256)",
    "PerformanceFeeAccrued": "PerformanceFeeAccrued(uint256,address,uint256,uint256)",
    "ManagementFeeAccrued": "ManagementFeeAccrued(uint256,address,uint256,uint256)",
    "OracleSignalUpdated": "OracleSignalUpdated(bytes32,(int24,uint256,uint256,uint256,uint256),uint256)",
    "CircuitBreakerTriggered": "CircuitBreakerTriggered(bytes32,address)",
    "CircuitBreakerReset": "CircuitBreakerReset(bytes32,address)",
    "OrderPlaced": "OrderPlaced(bytes32,uint256,int24,uint256,bool,bool)",
}


def get_db_connection():
    """Create PostgreSQL connection"""
    print(f"Attempting DB connection to: {DB_URL}", flush=True)
    conn = psycopg2.connect(DB_URL)
    print("DB connection established", flush=True)
    return conn


def get_last_indexed_block(conn):
    """Get last indexed block from database"""
    print("Querying indexer_state...", flush=True)
    with conn.cursor() as cur:
        cur.execute("SELECT last_indexed_block FROM indexer_state WHERE id = 1")
        print("Query executed, fetching result...", flush=True)
        result = cur.fetchone()
        print(f"Query result: {result}", flush=True)
        return result[0] if result else START_BLOCK


def update_last_indexed_block(conn, block_number):
    """Update last indexed block"""
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE indexer_state SET last_indexed_block = %s, last_indexed_at = %s WHERE id = 1",
            (block_number, datetime.now())
        )
    conn.commit()


def insert_event(conn, event_data):
    """Insert raw event into events table"""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO events
            (block_number, block_timestamp, transaction_hash, log_index, event_type, contract_address, event_data)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (transaction_hash, log_index) DO NOTHING
            RETURNING id
        """, (
            event_data["block_number"],
            datetime.fromtimestamp(event_data["block_timestamp"]),
            event_data["transaction_hash"],
            event_data["log_index"],
            event_data["event_type"],
            event_data["contract_address"],
            Json(event_data["decoded_data"])
        ))
        result = cur.fetchone()
        return result[0] if result else None


def process_deposit_event(conn, event_id, data, timestamp):
    """Process Deposited event"""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO deposits
            (event_id, vault_id, token, amount, depositor, new_balance, block_timestamp)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            event_id,
            data["vaultId"],
            data["token"],
            str(data["amount"]),
            data["depositor"],
            str(data["newBalance"]),
            timestamp
        ))


def process_withdrawal_event(conn, event_id, data, timestamp):
    """Process Withdrawn event"""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO withdrawals
            (event_id, vault_id, token, amount, recipient, new_balance, block_timestamp)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            event_id,
            data["vaultId"],
            data["token"],
            str(data["amount"]),
            data["recipient"],
            str(data["newBalance"]),
            timestamp
        ))


def process_deployment_event(conn, event_id, data, timestamp):
    """Process CapitalDeployed event"""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO deployments
            (event_id, vault_id, deployment_id, strategy, token, amount, pair_id, block_timestamp)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            event_id,
            data["vaultId"],
            data["deploymentId"],
            data["strategy"],
            data["token"],
            str(data["amount"]),
            data["pairId"],
            timestamp
        ))


def process_recall_event(conn, event_id, data, timestamp):
    """Process CapitalRecalled event"""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO recalls
            (event_id, vault_id, deployment_id, returned_amount, block_timestamp)
            VALUES (%s, %s, %s, %s, %s)
        """, (
            event_id,
            data["vaultId"],
            data["deploymentId"],
            str(data["returnedAmount"]),
            timestamp
        ))


def process_loss_event(conn, event_id, data, timestamp):
    """Process LossRealized event"""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO losses
            (event_id, vault_id, deployment_id, token, deployed_amount, returned_amount, loss, block_timestamp)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            event_id,
            data["vaultId"],
            data["deploymentId"],
            data["token"],
            str(data["deployedAmount"]),
            str(data["returnedAmount"]),
            str(data["loss"]),
            timestamp
        ))


def process_oracle_update_event(conn, event_id, data, timestamp):
    """Process OracleSignalUpdated event"""
    signal = data["signal"]
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO oracle_updates
            (event_id, pair_id, peg_deviation, orderbook_depth_bid, orderbook_depth_ask, nonce, block_timestamp)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            event_id,
            data["pairId"],
            signal["pegDeviation"],
            str(signal["orderbookDepthBid"]),
            str(signal["orderbookDepthAsk"]),
            signal["nonce"],
            timestamp
        ))


def process_performance_fee_event(conn, event_id, data, timestamp):
    """Process PerformanceFeeAccrued event"""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO performance_fees
            (event_id, vault_id, token, yield_amount, fee_amount, block_timestamp)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            event_id,
            data["vaultId"],
            data["token"],
            str(data["yieldAmount"]),
            str(data["feeAmount"]),
            timestamp
        ))


def process_management_fee_event(conn, event_id, data, timestamp):
    """Process ManagementFeeAccrued event"""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO management_fees
            (event_id, vault_id, token, fee_amount, period_seconds, block_timestamp)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            event_id,
            data["vaultId"],
            data["token"],
            str(data["feeAmount"]),
            data["periodSeconds"],
            timestamp
        ))


def process_circuit_breaker_event(conn, event_id, data, timestamp, triggered):
    """Process CircuitBreakerTriggered or CircuitBreakerReset event"""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO circuit_breakers
            (event_id, pair_id, triggered, triggered_by, block_timestamp)
            VALUES (%s, %s, %s, %s, %s)
        """, (
            event_id,
            data["pairId"],
            triggered,
            data.get("triggeredBy", data.get("resetBy", "0x0000000000000000000000000000000000000000")),
            timestamp
        ))


def process_order_placed_event(conn, event_id, data, timestamp):
    """Process OrderPlaced event"""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO orders_placed
            (event_id, pair_id, order_id, tick, amount, is_bid, is_flip, block_timestamp)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            event_id,
            data["pairId"],
            data["orderId"],
            data["tick"],
            str(data["amount"]),
            data["isBid"],
            data["isFlip"],
            timestamp
        ))


def index_block(conn, block_number):
    """Index all events in a block"""
    try:
        block = w3.eth.get_block(block_number, full_transactions=False)
        block_timestamp = block["timestamp"]

        logs = w3.eth.get_logs({
            "fromBlock": block_number,
            "toBlock": block_number
        })

        for log in logs:
            try:
                # Skip if not from our contracts
                contract_address = log["address"].lower()
                if contract_address not in [addr.lower() for addr in DEPLOYED_CONTRACTS.keys()]:
                    continue

                topic0 = log["topics"][0].hex()

                # Decode event using web3.py
                decoded_event = None
                event_type = None

                if topic0 in event_decoders:
                    contract, event_obj, event_name = event_decoders[topic0]
                    try:
                        decoded_event = event_obj.process_log(log)
                        event_type = event_name
                    except Exception as e:
                        print(f"Failed to decode event {event_name}: {e}")
                        continue

                if not decoded_event:
                    continue

                # Prepare event data for storage
                event_data = {
                    "block_number": block_number,
                    "block_timestamp": block_timestamp,
                    "transaction_hash": log["transactionHash"].hex(),
                    "log_index": log["logIndex"],
                    "contract_address": log["address"],
                    "event_type": event_type,
                    "decoded_data": dict(decoded_event["args"])
                }

                # Insert raw event
                event_id = insert_event(conn, event_data)
                if not event_id:
                    continue

                timestamp = datetime.fromtimestamp(block_timestamp)
                decoded_data = event_data["decoded_data"]

                # Process event based on type
                if event_type == "Deposited":
                    process_deposit_event(conn, event_id, decoded_data, timestamp)
                elif event_type == "Withdrawn":
                    process_withdrawal_event(conn, event_id, decoded_data, timestamp)
                elif event_type == "CapitalDeployed":
                    process_deployment_event(conn, event_id, decoded_data, timestamp)
                elif event_type == "CapitalRecalled":
                    process_recall_event(conn, event_id, decoded_data, timestamp)
                elif event_type == "LossRealized":
                    process_loss_event(conn, event_id, decoded_data, timestamp)
                elif event_type == "OracleSignalUpdated":
                    process_oracle_update_event(conn, event_id, decoded_data, timestamp)
                elif event_type == "PerformanceFeeAccrued":
                    process_performance_fee_event(conn, event_id, decoded_data, timestamp)
                elif event_type == "ManagementFeeAccrued":
                    process_management_fee_event(conn, event_id, decoded_data, timestamp)
                elif event_type == "CircuitBreakerTriggered":
                    process_circuit_breaker_event(conn, event_id, decoded_data, timestamp, True)
                elif event_type == "CircuitBreakerReset":
                    process_circuit_breaker_event(conn, event_id, decoded_data, timestamp, False)
                elif event_type == "OrderPlaced":
                    process_order_placed_event(conn, event_id, decoded_data, timestamp)

            except Exception as e:
                print(f"Error processing log: {e}")
                import traceback
                traceback.print_exc()
                continue

        conn.commit()

    except Exception as e:
        print(f"Error indexing block {block_number}: {e}")
        conn.rollback()


def main():
    """Main indexer loop"""
    print("Starting TempoVault Event Indexer...", flush=True)

    print("Connecting to database...", flush=True)
    conn = get_db_connection()
    print("Database connected!", flush=True)

    try:
        print("Getting last indexed block...", flush=True)
        last_indexed = get_last_indexed_block(conn)
        print(f"Last indexed block: {last_indexed}", flush=True)

        while True:
            print(f"Fetching current block number... (last indexed: {last_indexed})", flush=True)
            current_block = w3.eth.block_number
            print(f"Current block: {current_block}", flush=True)
            print(f"Checking if {last_indexed} < {current_block}...", flush=True)

            if last_indexed < current_block:
                print(f"Indexing blocks {last_indexed + 1} to {current_block}...", flush=True)

                for block_num in range(last_indexed + 1, current_block + 1):
                    index_block(conn, block_num)
                    last_indexed = block_num

                update_last_indexed_block(conn, last_indexed)
                print(f"Indexed up to block {last_indexed}")

            time.sleep(POLL_INTERVAL)

    except KeyboardInterrupt:
        print("\nShutting down indexer...")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
