#!/usr/bin/env bash
#
# TempoVault End-to-End Integration Test Script
# Tests all services and components for production readiness
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
PASSED=0
FAILED=0
WARNINGS=0

print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

print_error() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

check_command() {
    if command -v "$1" &> /dev/null; then
        print_success "$1 is installed"
        return 0
    else
        print_error "$1 is not installed"
        return 1
    fi
}

check_url() {
    local url=$1
    local name=$2
    if curl -sf "$url" > /dev/null 2>&1; then
        print_success "$name is accessible at $url"
        return 0
    else
        print_error "$name is not accessible at $url"
        return 1
    fi
}

check_json_response() {
    local url=$1
    local name=$2
    local response=$(curl -sf "$url" 2>&1)
    if echo "$response" | jq . > /dev/null 2>&1; then
        print_success "$name returns valid JSON"
        return 0
    else
        print_error "$name does not return valid JSON"
        echo "Response: $response"
        return 1
    fi
}

# Main test sequence
print_header "TempoVault E2E Integration Tests"

# 1. Prerequisites Check
print_header "Checking Prerequisites"
check_command "node"
check_command "npm"
check_command "python3"
check_command "psql"
check_command "jq"
check_command "curl"

# 2. Environment Check
print_header "Checking Environment"
if [ -f ".env" ]; then
    print_success ".env file exists"
else
    print_error ".env file not found"
fi

if [ -f "dashboard/.env" ]; then
    print_success "dashboard/.env file exists"
else
    print_warning "dashboard/.env file not found (using .env.example)"
fi

# 3. PostgreSQL Check
print_header "Checking PostgreSQL"
if pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
    print_success "PostgreSQL is running"

    # Check if database exists
    if psql -h localhost -U tempovault -d tempovault -c '\dt' > /dev/null 2>&1; then
        print_success "Database 'tempovault' exists and is accessible"

        # Check for required tables
        REQUIRED_TABLES=("deposits" "withdrawals" "deployments" "recalls" "losses" "rebalances" "circuit_breakers")
        for table in "${REQUIRED_TABLES[@]}"; do
            if psql -h localhost -U tempovault -d tempovault -c "SELECT 1 FROM $table LIMIT 1" > /dev/null 2>&1; then
                print_success "Table '$table' exists"
            else
                print_warning "Table '$table' does not exist or is empty"
            fi
        done
    else
        print_error "Database 'tempovault' is not accessible"
    fi
else
    print_error "PostgreSQL is not running on localhost:5432"
fi

# 4. API Server Check
print_header "Checking API Server"
API_URL="${VITE_API_URL:-http://localhost:3000}"

if check_url "$API_URL/health" "API Health Endpoint"; then
    check_json_response "$API_URL/health" "API Health Response"
fi

if check_url "$API_URL/ready" "API Ready Endpoint"; then
    check_json_response "$API_URL/ready" "API Ready Response"
fi

if check_url "$API_URL/docs" "API Documentation"; then
    print_success "API documentation is available"
fi

# Check specific API endpoints
print_header "Checking API Endpoints"
check_url "$API_URL/api/v1/stats" "Stats Endpoint"

# 5. RPC Connection Check
print_header "Checking Blockchain Connection"
RPC_URL="${RPC_URL:-https://rpc.moderato.tempo.xyz}"
CHAIN_ID="${CHAIN_ID:-42431}"

if curl -sf -X POST "$RPC_URL" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
    | jq -e ".result == \"0x$( printf '%x' $CHAIN_ID )\"" > /dev/null 2>&1; then
    print_success "Connected to Tempo Testnet (Chain ID: $CHAIN_ID)"
else
    print_warning "Could not verify blockchain connection"
fi

# 6. Event Indexer Check
print_header "Checking Event Indexer"
if pgrep -f "event_indexer.py" > /dev/null; then
    print_success "Event indexer process is running"

    # Check if indexer is making progress
    LATEST_BLOCK=$(psql -h localhost -U tempovault -d tempovault -t -c \
        "SELECT MAX(block_number) FROM deposits UNION ALL
         SELECT MAX(block_number) FROM withdrawals UNION ALL
         SELECT MAX(block_number) FROM deployments
         ORDER BY 1 DESC LIMIT 1" 2>/dev/null | tr -d ' ')

    if [ -n "$LATEST_BLOCK" ] && [ "$LATEST_BLOCK" != "" ]; then
        print_success "Indexer has processed up to block $LATEST_BLOCK"
    else
        print_warning "No indexed events found yet"
    fi
else
    print_warning "Event indexer process is not running"
fi

# 7. Oracle Relay Check
print_header "Checking Oracle Relay"
if pgrep -f "oracle_relay.py" > /dev/null; then
    print_success "Oracle relay process is running"
else
    print_warning "Oracle relay process is not running"
fi

# 8. Frontend Build Check
print_header "Checking Frontend Build"
cd dashboard
if npm run build > /dev/null 2>&1; then
    print_success "Frontend builds successfully"

    # Check bundle size
    if [ -f "dist/index.html" ]; then
        BUNDLE_SIZE=$(du -sh dist | cut -f1)
        print_success "Production bundle created (Size: $BUNDLE_SIZE)"
    fi
else
    print_error "Frontend build failed"
fi
cd ..

# 9. Contract Deployment Check
print_header "Checking Contract Deployments"
REQUIRED_CONTRACTS=(
    "GOVERNANCE_ROLES_ADDRESS"
    "TREASURY_VAULT_ADDRESS"
    "DEX_STRATEGY_ADDRESS"
    "RISK_CONTROLLER_ADDRESS"
)

for contract in "${REQUIRED_CONTRACTS[@]}"; do
    if [ -n "${!contract}" ]; then
        print_success "$contract is set: ${!contract}"
    else
        print_error "$contract is not set in environment"
    fi
done

# 10. Summary
print_header "Test Summary"
echo -e "Passed:   ${GREEN}$PASSED${NC}"
echo -e "Failed:   ${RED}$FAILED${NC}"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "\n${GREEN}✓ All critical tests passed!${NC}"
    echo -e "TempoVault is ready for production deployment.\n"
    exit 0
else
    echo -e "\n${RED}✗ Some tests failed!${NC}"
    echo -e "Please fix the issues before deploying to production.\n"
    exit 1
fi
