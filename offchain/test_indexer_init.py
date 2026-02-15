"""
Quick test to verify event_indexer.py can initialize without errors
"""
import sys
import os

# Set environment variables for testing
os.environ["RPC_URL"] = "https://rpc.moderato.tempo.xyz"
os.environ["INDEXER_DB_URL"] = "postgresql://localhost:5432/tempovault"
os.environ["START_BLOCK"] = "0"

print("Testing event_indexer initialization...")

try:
    # Change to offchain directory to match relative paths
    os.chdir("/Users/macbook/tempovault/offchain")

    # Import the module (this will execute initialization code)
    import event_indexer

    print("✅ ABIs loaded successfully")
    print(f"✅ Deployed contracts: {len(event_indexer.DEPLOYED_CONTRACTS)}")
    print(f"✅ Event decoders registered: {len(event_indexer.event_decoders)}")

    # List registered events
    print("\nRegistered events:")
    for sig_hash, (contract, event_obj, event_name) in event_indexer.event_decoders.items():
        print(f"  - {event_name} ({sig_hash[:10]}...)")

    print("\n✅ Event indexer initialization test PASSED")
    sys.exit(0)

except Exception as e:
    print(f"\n❌ Event indexer initialization test FAILED")
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
