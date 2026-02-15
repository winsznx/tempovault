#!/bin/bash
# TempoVault - Stop All Services

echo "🛑 Stopping TempoVault Services..."

# Stop frontend
echo "   Stopping frontend..."
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

# Stop API server
echo "   Stopping API server..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Stop all Python processes (oracle, indexer)
echo "   Stopping backend services..."
pkill -f "oracle_relay.py" 2>/dev/null || true
pkill -f "event_indexer.py" 2>/dev/null || true
pkill -f "api_server.py" 2>/dev/null || true

# Stop PostgreSQL
echo "   Stopping PostgreSQL..."
docker-compose down 2>/dev/null || true

echo "✅ All services stopped"
