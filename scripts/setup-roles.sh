#!/bin/bash

# Setup Roles for Admin

GOVERNANCE_ADDRESS="0x7D5b74F2dd093c32594Ab547F57E9ecf3Dd04565"
ADMIN_ADDRESS="0xaD4F47fD92Cb53481b94Fd9BB11D9313e7442CDa"
RPC_URL="https://rpc.moderato.tempo.xyz"

echo "👑 Setting up Roles for Admin ($ADMIN_ADDRESS)..."

source .env

# STRATEGIST_ROLE
echo "1. Granting STRATEGIST_ROLE..."
cast send $GOVERNANCE_ADDRESS \
  "grantRole(bytes32,address)" \
  $(cast keccak "STRATEGIST") \
  $ADMIN_ADDRESS \
  --rpc-url $RPC_URL \
  --private-key $ADMIN_PRIVATE_KEY

echo "✅ STRATEGIST_ROLE granted"

# TREASURY_MANAGER_ROLE
echo "2. Granting TREASURY_MANAGER_ROLE..."
cast send $GOVERNANCE_ADDRESS \
  "grantRole(bytes32,address)" \
  $(cast keccak "TREASURY_MANAGER") \
  $ADMIN_ADDRESS \
  --rpc-url $RPC_URL \
  --private-key $ADMIN_PRIVATE_KEY

echo "✅ TREASURY_MANAGER_ROLE granted"
