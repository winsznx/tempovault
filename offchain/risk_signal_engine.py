"""
TempoVault Risk Signal Engine
Monitors Tempo DEX orderbook and computes risk signals
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import os
import requests
from datetime import datetime

app = FastAPI(title="TempoVault Risk Signal Engine")

TEMPO_API_URL = os.getenv("TEMPO_API_URL", "https://api.tempo.network")


class OracleSignal(BaseModel):
    pegDeviation: int
    orderbookDepthBid: int
    orderbookDepthAsk: int
    timestamp: int
    nonce: int


class RiskSignalResponse(BaseModel):
    pairId: str
    signal: OracleSignal
    status: str


def compute_peg_deviation(tokenA: str, tokenB: str) -> int:
    """
    Compute peg deviation in ticks
    Returns deviation from expected 1:1 peg
    Positive = tokenA overvalued, Negative = tokenA undervalued
    """
    try:
        response = requests.get(
            f"{TEMPO_API_URL}/orderbook/{tokenA}/{tokenB}",
            timeout=5
        )
        response.raise_for_status()
        data = response.json()

        best_bid = data.get("bestBid", 0)
        best_ask = data.get("bestAsk", 0)
        mid_price = (best_bid + best_ask) / 2

        peg_price = 1.0
        deviation = (mid_price - peg_price) / peg_price * 100000

        return int(deviation)
    except Exception as e:
        print(f"Error computing peg deviation: {e}")
        return 0


def compute_orderbook_depth(tokenA: str, tokenB: str) -> tuple[int, int]:
    """
    Compute total orderbook depth on bid and ask sides
    Returns (bidDepth, askDepth) in 18-decimal token units
    """
    try:
        response = requests.get(
            f"{TEMPO_API_URL}/orderbook/{tokenA}/{tokenB}/depth",
            timeout=5
        )
        response.raise_for_status()
        data = response.json()

        bid_depth = int(data.get("bidDepth", 0) * 1e18)
        ask_depth = int(data.get("askDepth", 0) * 1e18)

        return (bid_depth, ask_depth)
    except Exception as e:
        print(f"Error computing orderbook depth: {e}")
        return (0, 0)


nonce_state = {}


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "risk-signal-engine"}


@app.get("/risk-signal/{pair_id}")
async def get_risk_signal(pair_id: str, tokenA: str, tokenB: str) -> RiskSignalResponse:
    """
    Compute and return risk signal for a trading pair

    Args:
        pair_id: Keccak256 hash of sorted token addresses
        tokenA: Address of first token
        tokenB: Address of second token

    Returns:
        RiskSignalResponse with computed signal
    """
    if not tokenA or not tokenB:
        raise HTTPException(status_code=400, detail="tokenA and tokenB are required")

    peg_deviation = compute_peg_deviation(tokenA, tokenB)
    bid_depth, ask_depth = compute_orderbook_depth(tokenA, tokenB)

    if pair_id not in nonce_state:
        nonce_state[pair_id] = 0

    nonce_state[pair_id] += 1

    signal = OracleSignal(
        pegDeviation=peg_deviation,
        orderbookDepthBid=bid_depth,
        orderbookDepthAsk=ask_depth,
        timestamp=int(datetime.now().timestamp()),
        nonce=nonce_state[pair_id]
    )

    return RiskSignalResponse(
        pairId=pair_id,
        signal=signal,
        status="success"
    )


@app.get("/risk-signal/{pair_id}/current-nonce")
async def get_current_nonce(pair_id: str) -> dict:
    """Get current nonce for a pair"""
    return {
        "pairId": pair_id,
        "nonce": nonce_state.get(pair_id, 0)
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("RISK_ENGINE_PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
