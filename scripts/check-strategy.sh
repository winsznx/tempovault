#!/bin/bash

# Check Strategy Configuration

STRATEGY_ADDRESS="0x403E518F21F5Ceeb0874e6457a447169A120cC84"
PAIR_ID="0x0000000000000000000000000000000000000000000000000000000000000001"
RPC_URL="https://rpc.moderato.tempo.xyz"

echo "🔍 Checking Strategy Configuration for Pair $PAIR_ID..."

cast call $STRATEGY_ADDRESS "pairConfigs(bytes32)" $PAIR_ID --rpc-url $RPC_URL
