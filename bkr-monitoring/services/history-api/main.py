"""
history-api — FastAPI service exposing historical market and price data.
Read-only: never writes to PostgreSQL.
"""
import json
import os
import time
from datetime import datetime, timezone
from typing import Optional

import psycopg2
import psycopg2.extras
import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://monitor:monitor@postgres:5432/monitor")
PORT = int(os.environ.get("PORT", "8000"))

app = FastAPI(title="BKR History API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

_start_time = time.time()
_request_count = 0


def log_json(level: str, message: str, **extra):
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "service_name": "history-api",
        "message": message,
        **extra,
    }
    print(json.dumps(entry), flush=True)


def get_db():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


@app.get("/health")
def health():
    global _request_count
    db_ok = False
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        conn.close()
        db_ok = True
    except Exception:
        pass

    return {
        "status": "healthy" if db_ok else "degraded",
        "service": "history-api",
        "uptime_seconds": round(time.time() - _start_time, 1),
        "requests_total": _request_count,
        "database_connected": db_ok,
    }


@app.get("/history")
def get_history(
    limit: int = Query(default=50, ge=1, le=200),
    category: Optional[str] = Query(default=None),
):
    global _request_count
    _request_count += 1
    conn = get_db()
    try:
        with conn.cursor() as cur:
            if category:
                cur.execute(
                    """SELECT id, fetched_at, question, slug, yes_price, no_price,
                              volume_24h, category, end_date
                       FROM market_snapshots
                       WHERE category ILIKE %s
                       ORDER BY fetched_at DESC LIMIT %s""",
                    (f"%{category}%", limit),
                )
            else:
                cur.execute(
                    """SELECT id, fetched_at, question, slug, yes_price, no_price,
                              volume_24h, category, end_date
                       FROM market_snapshots
                       ORDER BY fetched_at DESC LIMIT %s""",
                    (limit,),
                )
            rows = cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.get("/history/{slug}")
def get_market_history(slug: str, limit: int = Query(default=100, ge=1, le=500)):
    global _request_count
    _request_count += 1
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, fetched_at, question, slug, yes_price, no_price,
                          volume_24h, category, end_date
                   FROM market_snapshots
                   WHERE slug = %s
                   ORDER BY fetched_at DESC LIMIT %s""",
                (slug, limit),
            )
            rows = cur.fetchall()
        if not rows:
            raise HTTPException(status_code=404, detail="Market not found")
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.get("/prices/history/{coin}")
def get_price_history(coin: str, limit: int = Query(default=100, ge=1, le=500)):
    global _request_count
    _request_count += 1
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT fetched_at, coin, price_usd, change_24h
                   FROM price_snapshots
                   WHERE coin = %s
                   ORDER BY fetched_at DESC LIMIT %s""",
                (coin, limit),
            )
            rows = cur.fetchall()
        if not rows:
            raise HTTPException(status_code=404, detail="No price data for this coin")
        return [dict(r) for r in rows]
    finally:
        conn.close()


if __name__ == "__main__":
    log_json("info", "Starting history-api", port=PORT)
    uvicorn.run(app, host="0.0.0.0", port=PORT)
