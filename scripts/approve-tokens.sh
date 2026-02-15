#!/bin/bash

# TempoVault - Approve All Tempo Testnet Tokens

set -e

echo "🔐 Approving tokens in TreasuryVault..."

VAULT_ADDRESS="0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D"
RPC_URL="https://rpc.moderato.tempo.xyz"

# Read private key from .env
source .env

if [ -z "$ADMIN_PRIVATE_KEY" ]; then
    echo "❌ ADMIN_PRIVATE_KEY not set in .env"
    exit 1
fi

echo ""
echo "Vault: $VAULT_ADDRESS"
echo "RPC: $RPC_URL"
echo ""

# Approve PathUSD
echo "1/4 Approving PathUSD (0x20c0...0000)..."
cast send $VAULT_ADDRESS \
  "setApprovedToken(address,bool)" \
  0x20c0000000000000000000000000000000000000 \
  true \
  --rpc-url $RPC_URL \
  --private-key $ADMIN_PRIVATE_KEY

echo "✅ PathUSD approved"
echo ""

# Approve AlphaUSD
echo "2/4 Approving AlphaUSD (0x20c0...0001)..."
cast send $VAULT_ADDRESS \
  "setApprovedToken(address,bool)" \
  0x20c0000000000000000000000000000000000001 \
  true \
  --rpc-url $RPC_URL \
  --private-key $ADMIN_PRIVATE_KEY

echo "✅ AlphaUSD approved"
echo ""

# Approve BetaUSD
echo "3/4 Approving BetaUSD (0x20c0...0002)..."
cast send $VAULT_ADDRESS \
  "setApprovedToken(address,bool)" \
  0x20c0000000000000000000000000000000000002 \
  true \
  --rpc-url $RPC_URL \
  --private-key $ADMIN_PRIVATE_KEY

echo "✅ BetaUSD approved"
echo ""

# Approve ThetaUSD
echo "4/4 Approving ThetaUSD (0x20c0...0003)..."
cast send $VAULT_ADDRESS \
  "setApprovedToken(address,bool)" \
  0x20c0000000000000000000000000000000000003 \
  true \
  --rpc-url $RPC_URL \
  --private-key $ADMIN_PRIVATE_KEY

echo "✅ ThetaUSD approved"
echo ""
echo "🎉 All tokens approved!"
echo ""
echo "You can now deposit these tokens:"
echo "  - PathUSD:   0x20c0000000000000000000000000000000000000"
echo "  - AlphaUSD:  0x20c0000000000000000000000000000000000001"
echo "  - BetaUSD:   0x20c0000000000000000000000000000000000002"
echo "  - ThetaUSD:  0x20c0000000000000000000000000000000000003"
echo ""
echo "Next steps:"
echo "  1. Refresh your browser"
echo "  2. Select a token (e.g., BetaUSD)"
echo "  3. Click 'Deposit Funds'"
echo "  4. Enter amount and deposit"
echo ""
