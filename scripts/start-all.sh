#!/bin/bash
# TempoVault - Complete Startup Script
# This script starts all services in the correct order

set -e

echo "🚀 Starting TempoVault Production Environment"
echo "=============================================="

# Step 1: Start PostgreSQL
echo ""
echo "📦 Step 1: Starting PostgreSQL..."
if ! docker info > /dev/null 2>&1; then
    echo "⚠️  Docker is not running. Please start Docker Desktop first."
    echo "   After starting Docker, run this script again."
    exit 1
fi

docker-compose up -d postgres
echo "✅ PostgreSQL started"

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 5

# Step 2: Start Backend Services
echo ""
echo "🔧 Step 2: Starting Backend Services..."
echo "   - API Server (port 3000)"
echo "   - Oracle Relay"
echo "   - Event Indexer"

# Kill any existing processes on port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Start backend in background
cd offchain
python3 -m venv venv 2>/dev/null || true
source venv/bin/activate
pip install -q -r requirements.txt

# Start API server
python api_server.py > ../logs/api.log 2>&1 &
API_PID=$!
echo "   ✅ API Server started (PID: $API_PID)"

# Start oracle relay
python oracle_relay.py > ../logs/oracle.log 2>&1 &
ORACLE_PID=$!
echo "   ✅ Oracle Relay started (PID: $ORACLE_PID)"

# Start event indexer
python event_indexer.py > ../logs/indexer.log 2>&1 &
INDEXER_PID=$!
echo "   ✅ Event Indexer started (PID: $INDEXER_PID)"

cd ..

# Step 3: Start Frontend
echo ""
echo "🎨 Step 3: Starting Frontend..."
cd dashboard

# Kill any existing processes on port 5173
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

npm run dev > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   ✅ Frontend started (PID: $FRONTEND_PID)"

cd ..

# Step 4: Health Check
echo ""
echo "🏥 Step 4: Running Health Checks..."
sleep 3

# Check API
if curl -s http://localhost:3000/health > /dev/null; then
    echo "   ✅ API Server: Healthy"
else
    echo "   ❌ API Server: Not responding"
fi

# Check Frontend
if curl -s http://localhost:5173 > /dev/null; then
    echo "   ✅ Frontend: Healthy"
else
    echo "   ❌ Frontend: Not responding"
fi

# Check PostgreSQL
if docker ps | grep -q postgres; then
    echo "   ✅ PostgreSQL: Running"
else
    echo "   ❌ PostgreSQL: Not running"
fi

# Summary
echo ""
echo "=============================================="
echo "✅ TempoVault is now running!"
echo "=============================================="
echo ""
echo "📊 Service URLs:"
echo "   Frontend:  http://localhost:5173"
echo "   API:       http://localhost:3000"
echo "   API Docs:  http://localhost:3000/docs"
echo ""
echo "📝 Process IDs:"
echo "   API Server:     $API_PID"
echo "   Oracle Relay:   $ORACLE_PID"
echo "   Event Indexer:  $INDEXER_PID"
echo "   Frontend:       $FRONTEND_PID"
echo ""
echo "📋 Logs:"
echo "   API:       tail -f logs/api.log"
echo "   Oracle:    tail -f logs/oracle.log"
echo "   Indexer:   tail -f logs/indexer.log"
echo "   Frontend:  tail -f logs/frontend.log"
echo ""
echo "🛑 To stop all services:"
echo "   ./scripts/stop-all.sh"
echo ""
echo "Press Ctrl+C to stop monitoring logs..."
echo ""

# Tail all logs
tail -f logs/*.log
