"""
TempoVault REST API Server
Provides HTTP endpoints for querying indexed data and onchain state
"""

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Any
import os
import psycopg2
from psycopg2.extras import RealDictCursor
from web3 import Web3
import json
import asyncio
from datetime import datetime

app = FastAPI(
    title="TempoVault API",
    version="1.0.0",
    description="REST API for TempoVault treasury management protocol",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS configuration - can be restricted to specific origins in production
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

RPC_URL = os.getenv("RPC_URL", "http://localhost:8545")
DB_URL = os.getenv("INDEXER_DB_URL", "postgresql://localhost:5432/tempovault")

w3 = Web3(Web3.HTTPProvider(RPC_URL))

with open("../out/TreasuryVault.sol/TreasuryVault.json") as f:
    vault_abi = json.load(f)["abi"]

with open("../out/DexStrategyCompact.sol/DexStrategyCompact.json") as f:
    strategy_abi = json.load(f)["abi"]


class ErrorResponse(BaseModel):
    """Structured error response"""
    error: str = Field(..., description="Error type")
    message: str = Field(..., description="Human-readable error message")
    details: Optional[Any] = Field(None, description="Additional error details")
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class HealthResponse(BaseModel):
    """Health check response"""
    status: str = Field(..., description="Service status (healthy/degraded/unhealthy)")
    service: str = Field(default="tempovault-api", description="Service name")
    chain_id: Optional[int] = Field(None, description="Connected blockchain chain ID")
    latest_block: Optional[int] = Field(None, description="Latest indexed block number")
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class ReadyResponse(BaseModel):
    """Readiness check response"""
    ready: bool = Field(..., description="Whether service is ready to accept requests")
    checks: dict = Field(..., description="Individual component health checks")


class VaultBalance(BaseModel):
    vault_id: int
    token: str
    total_balance: str
    deployed_capital: str
    available_balance: str
    accrued_performance_fees: str
    accrued_management_fees: str


class VaultExposure(BaseModel):
    vault_id: int
    pair_id: str
    exposure: str
    utilization_bps: int


class VaultPnL(BaseModel):
    vault_id: int
    token: str
    total_deposited: str
    total_withdrawn: str
    total_deployed: str
    total_losses: str
    total_performance_fees: str
    total_management_fees: str
    net_pnl: str


class RiskStatus(BaseModel):
    pair_id: str
    circuit_broken: bool


class ActiveOrder(BaseModel):
    """Active flip order"""
    order_id: int = Field(..., description="Order ID from DEX")
    tick: int = Field(..., description="Price tick (-2000 to +2000)")
    amount: str = Field(..., description="Order amount in wei")
    is_bid: bool = Field(..., description="True if bid (buy), False if ask (sell)")
    is_flip: bool = Field(True, description="True for flip orders")


class ActiveOrdersResponse(BaseModel):
    """Response model for active orders"""
    pair_id: str
    strategy_address: str
    orders: List[ActiveOrder]
    total_orders: int
    latest_peg_deviation: Optional[int]
    latest_depth_bid: Optional[str]
    latest_depth_ask: Optional[str]
    oracle_freshness: Optional[int]


def get_db_connection():
    """Get database connection"""
    return psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)


def structured_error(error_type: str, message: str, details: Any = None, status_code: int = 500) -> HTTPException:
    """Create structured error response"""
    return HTTPException(
        status_code=status_code,
        detail=ErrorResponse(
            error=error_type,
            message=message,
            details=details
        ).dict()
    )


@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """
    Health check endpoint

    Returns basic service health status without checking dependencies.
    Use /ready for full dependency checks.
    """
    try:
        chain_id = w3.eth.chain_id
        latest_block = w3.eth.block_number
        return HealthResponse(
            status="healthy",
            chain_id=chain_id,
            latest_block=latest_block
        )
    except Exception:
        return HealthResponse(
            status="degraded",
            chain_id=None,
            latest_block=None
        )


@app.get("/ready", response_model=ReadyResponse, tags=["System"])
async def readiness_check():
    """
    Readiness check endpoint

    Checks all dependencies (RPC, Database) to determine if service is ready
    to handle requests. Returns 503 if not ready.
    """
    checks = {
        "rpc": False,
        "database": False
    }

    # Check RPC connection
    try:
        w3.eth.block_number
        checks["rpc"] = True
    except Exception as e:
        checks["rpc_error"] = str(e)

    # Check database connection
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        conn.close()
        checks["database"] = True
    except Exception as e:
        checks["database_error"] = str(e)

    ready = all([checks["rpc"], checks["database"]])

    if not ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"ready": False, "checks": checks}
        )

    return ReadyResponse(ready=ready, checks=checks)


@app.get("/api/v1/vault/{vault_id}/balance", response_model=List[VaultBalance], tags=["Vault"])
async def get_vault_balance(vault_id: int, vault_address: str):
    """
    Get vault balance for all tokens

    Args:
        vault_id: Vault identifier
        vault_address: Vault contract address

    Returns:
        List of token balances including deployed capital and accrued fees
    """
    try:
        vault = w3.eth.contract(address=Web3.to_checksum_address(vault_address), abi=vault_abi)

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT token FROM deposits WHERE vault_id = %s
            """, (vault_id,))
            tokens = [row['token'] for row in cur.fetchall()]

        balances = []
        for token in tokens:
            token_balance = vault.functions.tokenBalances(token).call()
            deployed = vault.functions.deployedCapital(token).call()
            perf_fees = vault.functions.accruedPerformanceFees(token).call()
            mgmt_fees = vault.functions.accruedManagementFees(token).call()

            balances.append(VaultBalance(
                vault_id=vault_id,
                token=token,
                total_balance=str(token_balance),
                deployed_capital=str(deployed),
                available_balance=str(token_balance - deployed),
                accrued_performance_fees=str(perf_fees),
                accrued_management_fees=str(mgmt_fees)
            ))

        conn.close()
        return balances

    except psycopg2.Error as e:
        raise structured_error("database_error", "Failed to query vault balance", str(e))
    except Exception as e:
        raise structured_error("internal_error", "Failed to fetch vault balance", str(e))


@app.get("/api/v1/vault/{vault_id}/exposure", response_model=List[VaultExposure], tags=["Vault"])
async def get_vault_exposure(vault_id: int, vault_address: str):
    """
    Get vault pair exposures

    Args:
        vault_id: Vault identifier
        vault_address: Vault contract address

    Returns:
        List of pair exposures showing deployed capital per trading pair
    """
    try:
        vault = w3.eth.contract(address=Web3.to_checksum_address(vault_address), abi=vault_abi)

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT pair_id FROM deployments WHERE vault_id = %s
            """, (vault_id,))
            pairs = [row['pair_id'] for row in cur.fetchall()]

        exposures = []
        for pair_id in pairs:
            exposure = vault.functions.pairExposure(bytes.fromhex(pair_id[2:])).call()

            exposures.append(VaultExposure(
                vault_id=vault_id,
                pair_id=pair_id,
                exposure=str(exposure),
                utilization_bps=0
            ))

        conn.close()
        return exposures

    except psycopg2.Error as e:
        raise structured_error("database_error", "Failed to query vault exposure", str(e))
    except Exception as e:
        raise structured_error("internal_error", "Failed to fetch vault exposure", str(e))


@app.get("/api/v1/vault/{vault_id}/pnl", response_model=VaultPnL, tags=["Vault"])
async def get_vault_pnl(vault_id: int, token: str):
    """
    Get vault profit & loss summary

    Args:
        vault_id: Vault identifier
        token: Token address to query P&L for

    Returns:
        Comprehensive P&L breakdown including deposits, withdrawals, losses, and fees
    """
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    COALESCE(SUM(d.amount), 0) as total_deposited,
                    COALESCE(SUM(w.amount), 0) as total_withdrawn,
                    COALESCE(SUM(dep.amount), 0) as total_deployed,
                    COALESCE(SUM(l.loss), 0) as total_losses,
                    COALESCE(SUM(pf.fee_amount), 0) as total_performance_fees,
                    COALESCE(SUM(mf.fee_amount), 0) as total_management_fees
                FROM
                    (SELECT %s as vault_id, %s as token) AS v
                LEFT JOIN deposits d ON d.vault_id = v.vault_id AND d.token = v.token
                LEFT JOIN withdrawals w ON w.vault_id = v.vault_id AND w.token = v.token
                LEFT JOIN deployments dep ON dep.vault_id = v.vault_id AND dep.token = v.token
                LEFT JOIN losses l ON l.vault_id = v.vault_id AND l.token = v.token
                LEFT JOIN performance_fees pf ON pf.vault_id = v.vault_id AND pf.token = v.token
                LEFT JOIN management_fees mf ON mf.vault_id = v.vault_id AND mf.token = v.token
            """, (vault_id, token))

            row = cur.fetchone()

        total_deposited = int(row['total_deposited'] or 0)
        total_withdrawn = int(row['total_withdrawn'] or 0)
        total_losses = int(row['total_losses'] or 0)
        total_perf_fees = int(row['total_performance_fees'] or 0)
        total_mgmt_fees = int(row['total_management_fees'] or 0)

        net_pnl = total_deposited - total_withdrawn - total_losses - total_perf_fees - total_mgmt_fees

        conn.close()

        return VaultPnL(
            vault_id=vault_id,
            token=token,
            total_deposited=str(total_deposited),
            total_withdrawn=str(total_withdrawn),
            total_deployed=str(row['total_deployed'] or 0),
            total_losses=str(total_losses),
            total_performance_fees=str(total_perf_fees),
            total_management_fees=str(total_mgmt_fees),
            net_pnl=str(net_pnl)
        )

    except psycopg2.Error as e:
        raise structured_error("database_error", "Failed to query vault P&L", str(e))
    except Exception as e:
        raise structured_error("internal_error", "Failed to calculate vault P&L", str(e))


@app.get("/api/v1/risk/{pair_id}/status", response_model=RiskStatus, tags=["Risk"])
async def get_risk_status(pair_id: str, risk_controller_address: str):
    """
    Get risk metrics for a trading pair

    Args:
        pair_id: Trading pair identifier (bytes32 hex string)
        risk_controller_address: RiskController contract address

    Returns:
        Risk status including circuit breaker state, peg deviation, and orderbook depth
    """
    try:
        with open("../out/RiskController.sol/RiskController.json") as f:
            risk_abi = json.load(f)["abi"]

        risk = w3.eth.contract(address=Web3.to_checksum_address(risk_controller_address), abi=risk_abi)

        circuit_broken = risk.functions.pairCircuitBroken(bytes.fromhex(pair_id[2:])).call()

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT peg_deviation, orderbook_depth_bid, orderbook_depth_ask, block_timestamp
                FROM oracle_updates
                WHERE pair_id = %s
                ORDER BY block_timestamp DESC
                LIMIT 1
            """, (pair_id,))
            latest = cur.fetchone()

        conn.close()

        return RiskStatus(
            pair_id=pair_id,
            circuit_broken=circuit_broken,
            latest_peg_deviation=latest['peg_deviation'] if latest else None,
            latest_depth_bid=str(latest['orderbook_depth_bid']) if latest else None,
            latest_depth_ask=str(latest['orderbook_depth_ask']) if latest else None,
            oracle_freshness=None
        )

    except psycopg2.Error as e:
        raise structured_error("database_error", "Failed to query risk status", str(e))
    except Exception as e:
        raise structured_error("internal_error", "Failed to fetch risk status", str(e))


@app.get("/api/v1/events/{vault_id}/{event_type}", tags=["Events"])
async def get_events(vault_id: int, event_type: str, limit: int = 100, offset: int = 0):
    """
    Get historical events for a vault

    Args:
        vault_id: Vault identifier
        event_type: Event type (deposits, withdrawals, deployments, recalls, losses)
        limit: Maximum number of events to return (default: 100)
        offset: Pagination offset (default: 0)

    Returns:
        List of events ordered by block timestamp descending
    """
    try:
        valid_types = ['deposits', 'withdrawals', 'deployments', 'recalls', 'losses']
        if event_type not in valid_types:
            raise structured_error(
                "validation_error",
                f"Invalid event type: {event_type}",
                {"valid_types": valid_types},
                status_code=400
            )

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT * FROM {event_type}
                WHERE vault_id = %s
                ORDER BY block_timestamp DESC
                LIMIT %s OFFSET %s
            """, (vault_id, limit, offset))
            events = cur.fetchall()

        conn.close()
        return events

    except HTTPException:
        raise
    except psycopg2.Error as e:
        raise structured_error("database_error", "Failed to query events", str(e))
    except Exception as e:
        raise structured_error("internal_error", "Failed to fetch events", str(e))


@app.get("/api/v1/strategy/{strategy_address}/orders/{pair_id}",
         response_model=ActiveOrdersResponse,
         tags=["Strategy"])
async def get_active_orders(strategy_address: str, pair_id: str):
    """
    Get active flip orders for a strategy pair

    Args:
        strategy_address: DexStrategyCompact contract address
        pair_id: Trading pair identifier (bytes32 hex string)

    Returns:
        List of active orders with details
    """
    try:
        if not w3.is_connected():
            raise structured_error("rpc_error", "Not connected to blockchain", status_code=503)

        # Create contract instance
        strategy_contract = w3.eth.contract(
            address=Web3.to_checksum_address(strategy_address),
            abi=strategy_abi
        )

        # Query activeOrderIds mapping for this pair
        # Note: This requires the contract to have a getter or we query the storage directly
        # For now, we'll return a placeholder response since the contract stores order IDs internally
        # In production, this would query the actual storage or use events

        try:
            # Attempt to call a view function if it exists
            # The DexStrategyCompact contract stores activeOrderIds but may not expose it
            # We'll construct a response based on available data
            orders = []

            # For MVP, return empty list - this would need actual contract integration
            # In production, either:
            # 1. Add a getter function to DexStrategyCompact to expose activeOrderIds
            # 2. Query storage directly using eth_getStorageAt
            # 3. Index OrderPlaced events from the event indexer database

            return ActiveOrdersResponse(
                pair_id=pair_id,
                strategy_address=strategy_address,
                orders=orders,
                total_orders=len(orders),
                latest_peg_deviation=None,
                latest_depth_bid=None,
                latest_depth_ask=None,
                oracle_freshness=None
            )

        except Exception as contract_error:
            # If contract call fails, return empty orders
            return ActiveOrdersResponse(
                pair_id=pair_id,
                strategy_address=strategy_address,
                orders=[],
                total_orders=0,
                latest_peg_deviation=None,
                latest_depth_bid=None,
                latest_depth_ask=None,
                oracle_freshness=None
            )

    except HTTPException:
        raise
    except Exception as e:
        raise structured_error("internal_error", "Failed to fetch active orders", str(e))


@app.get("/api/v1/stats", tags=["System"])
async def get_protocol_stats():
    """
    Get live protocol statistics for landing page

    Returns:
        Current protocol stats including TVL, deployed capital, active orders, oracle health
    """
    try:
        # For MVP, return placeholder data
        # In production, this would aggregate from multiple sources:
        # - Query all vaults for TVL
        # - Sum deployed capital across strategies
        # - Count active orders from DB or contracts
        # - Check oracle update timestamp

        return {
            "tvl": "$0",
            "deployedCapital": "$0",
            "activeOrders": 0,
            "lastOracleUpdate": datetime.utcnow().isoformat(),
            "oracleHealth": "healthy"
        }
    except Exception as e:
        raise structured_error("internal_error", "Failed to fetch stats", str(e))


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass


manager = ConnectionManager()


@app.websocket("/ws/events")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time event updates"""
    await manager.connect(websocket)
    try:
        while True:
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("API_PORT", 3000))
    uvicorn.run(app, host="0.0.0.0", port=port)
