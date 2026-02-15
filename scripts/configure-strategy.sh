#!/bin/bash

# Configure Strategy for AlphaUSD/BetaUSD

ADDRESS="0x2f0b1a0c816377f569533385a30d2afe2cb4899e"
RPC_URL="https://rpc.moderato.tempo.xyz"

# AlphaUSD
TOKEN_A="0x20c0000000000000000000000000000000000001"
# BetaUSD
TOKEN_B="0x20c0000000000000000000000000000000000002"

PAIR_ID="0x0000000000000000000000000000000000000000000000000000000000000001"

# Struct: (tokenA, tokenB, baseTickWidth, orderSizePerTick, numBidLevels, numAskLevels, useFlipOrders, active)
# Tuple: (address, address, int16, uint256, uint16, uint16, bool, bool)

echo "🔧 Configuring Strategy Pair $PAIR_ID..."

source .env

cast send $ADDRESS \
  "configureStrategy(bytes32,(address,address,int16,uint256,uint16,uint16,bool,bool))" \
  $PAIR_ID "($TOKEN_A,$TOKEN_B,100,100000000000000000000,5,5,true,true)" \
  --rpc-url $RPC_URL \
  --private-key $ADMIN_PRIVATE_KEY
