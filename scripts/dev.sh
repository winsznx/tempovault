#!/bin/bash
# TempoVault Development Services Launcher
# Starts all services required for local development

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OFFCHAIN_DIR="$PROJECT_ROOT/offchain"
PID_DIR="$PROJECT_ROOT/.pids"

mkdir -p "$PID_DIR"
mkdir -p "$PROJECT_ROOT/logs"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   TempoVault Development Services     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""

# Check .env exists
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo -e "${RED}✗ .env file not found${NC}"
    echo -e "${YELLOW}  Create from template:${NC}"
    echo -e "${YELLOW}  cp .env.example .env${NC}"
    exit 1
fi

# Load environment
echo -e "${YELLOW}→ Loading environment...${NC}"
set -a
source "$PROJECT_ROOT/.env"
set +a
echo -e "${GREEN}✓ Environment loaded${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}⚠ Docker not found - install from https://docker.com${NC}"
    echo -e "${YELLOW}  PostgreSQL must be running manually${NC}"
else
    # Start PostgreSQL
    echo -e "${YELLOW}→ Starting PostgreSQL...${NC}"
    cd "$PROJECT_ROOT"
    docker-compose up -d postgres

    # Wait for PostgreSQL
    echo -e "${YELLOW}  Waiting for PostgreSQL...${NC}"
    timeout=30
    elapsed=0
    while ! docker-compose exec -T postgres pg_isready -U tempovault > /dev/null 2>&1; do
        if [ $elapsed -ge $timeout ]; then
            echo -e "${RED}✗ PostgreSQL timeout${NC}"
            exit 1
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done
    echo -e "${GREEN}✓ PostgreSQL ready${NC}"
fi

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}✗ Python 3 not found${NC}"
    exit 1
fi

# Install Python dependencies
echo -e "${YELLOW}→ Checking Python dependencies...${NC}"
cd "$OFFCHAIN_DIR"
if ! python3 -c "import fastapi, web3, psycopg2" 2>/dev/null; then
    echo -e "${YELLOW}  Installing...${NC}"
    pip3 install -q -r requirements.txt
fi
echo -e "${GREEN}✓ Dependencies OK${NC}"

echo ""
echo -e "${YELLOW}→ Starting services...${NC}"
echo ""

# Start API Server
echo -e "  ${YELLOW}Starting API Server (port ${API_PORT:-3000})...${NC}"
cd "$OFFCHAIN_DIR"
python3 api_server.py > "$PROJECT_ROOT/logs/api_server.log" 2>&1 &
API_PID=$!
echo $API_PID > "$PID_DIR/api_server.pid"
sleep 2

if ps -p $API_PID > /dev/null; then
    echo -e "  ${GREEN}✓ API Server (PID: $API_PID)${NC}"
else
    echo -e "  ${RED}✗ API Server failed${NC}"
    cat "$PROJECT_ROOT/logs/api_server.log"
    exit 1
fi

# Start Oracle Relay
echo -e "  ${YELLOW}Starting Oracle Relay...${NC}"
cd "$OFFCHAIN_DIR"
python3 oracle_relay.py > "$PROJECT_ROOT/logs/oracle_relay.log" 2>&1 &
ORACLE_PID=$!
echo $ORACLE_PID > "$PID_DIR/oracle_relay.pid"
sleep 1

if ps -p $ORACLE_PID > /dev/null; then
    echo -e "  ${GREEN}✓ Oracle Relay (PID: $ORACLE_PID)${NC}"
else
    echo -e "  ${RED}✗ Oracle Relay failed${NC}"
    cat "$PROJECT_ROOT/logs/oracle_relay.log"
    exit 1
fi

# Start Event Indexer
echo -e "  ${YELLOW}Starting Event Indexer...${NC}"
if python3 -c "import psycopg2; psycopg2.connect('${INDEXER_DB_URL}')" 2>/dev/null; then
    cd "$OFFCHAIN_DIR"
    python3 event_indexer.py > "$PROJECT_ROOT/logs/event_indexer.log" 2>&1 &
    INDEXER_PID=$!
    echo $INDEXER_PID > "$PID_DIR/event_indexer.pid"
    sleep 1

    if ps -p $INDEXER_PID > /dev/null; then
        echo -e "  ${GREEN}✓ Event Indexer (PID: $INDEXER_PID)${NC}"
    else
        echo -e "  ${RED}✗ Event Indexer failed${NC}"
        cat "$PROJECT_ROOT/logs/event_indexer.log"
    fi
else
    echo -e "  ${YELLOW}⚠ Event Indexer skipped (DB not available)${NC}"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   All Services Running                 ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${YELLOW}API:${NC}            http://localhost:${API_PORT:-3000}"
echo -e "  ${YELLOW}API Docs:${NC}       http://localhost:${API_PORT:-3000}/docs"
echo -e "  ${YELLOW}Health:${NC}         http://localhost:${API_PORT:-3000}/health"
echo -e "  ${YELLOW}Ready:${NC}          http://localhost:${API_PORT:-3000}/ready"
echo -e "  ${YELLOW}Logs:${NC}           $PROJECT_ROOT/logs/"
echo ""
echo -e "  ${YELLOW}Stop:${NC}           ./scripts/stop.sh"
echo -e "  ${YELLOW}View Logs:${NC}      tail -f logs/*.log"
echo ""
