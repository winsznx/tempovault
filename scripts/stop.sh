#!/bin/bash
# TempoVault Development Services Stopper
# Stops all running offchain services

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PID_DIR="$PROJECT_ROOT/.pids"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}╔════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║   Stopping TempoVault Services         ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════╝${NC}"
echo ""

if [ ! -d "$PID_DIR" ]; then
    echo -e "${YELLOW}⚠ No services appear to be running${NC}"
    exit 0
fi

# Function to stop a service
stop_service() {
    local service_name=$1
    local pid_file="$PID_DIR/${service_name}.pid"

    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p $pid > /dev/null 2>&1; then
            echo -e "  ${YELLOW}Stopping $service_name (PID: $pid)...${NC}"
            kill $pid 2>/dev/null || true
            sleep 1

            # Force kill if still running
            if ps -p $pid > /dev/null 2>&1; then
                echo -e "  ${YELLOW}Force stopping $service_name...${NC}"
                kill -9 $pid 2>/dev/null || true
            fi

            echo -e "  ${GREEN}✓ $service_name stopped${NC}"
        else
            echo -e "  ${YELLOW}⚠ $service_name not running${NC}"
        fi
        rm -f "$pid_file"
    fi
}

# Stop all services
stop_service "api_server"
stop_service "oracle_relay"
stop_service "event_indexer"

# Cleanup PID directory
rmdir "$PID_DIR" 2>/dev/null || true

echo ""
echo -e "${GREEN}✓ All services stopped${NC}"
echo ""
