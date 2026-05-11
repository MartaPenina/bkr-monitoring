"""
api-proxy — Lightweight HTTP proxy that fetches external data,
caches it in memory, and publishes events to RabbitMQ.

Simplified version of the CoinOps Go proxy, rewritten in Python
for the bachelor thesis demonstration.
"""
import json
import logging
import os
import sys
import time
import threading
from datetime import datetime, timezone

import pika
import requests
from flask import Flask, jsonify

# ── Config ──────────────────────────────────────────────────────────────────
RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")
COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price"
EXCHANGE_NAME = "market_events"
QUEUE_NAME = "market_events"
FETCH_INTERVAL = int(os.environ.get("FETCH_INTERVAL", "30"))
PORT = int(os.environ.get("PORT", "8080"))

# ── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("api-proxy")


def log_json(level: str, message: str, **extra):
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "service_name": "api-proxy",
        "message": message,
        **extra,
    }
    print(json.dumps(entry), flush=True)


# ── App ─────────────────────────────────────────────────────────────────────
app = Flask(__name__)

# In-memory cache
_cache = {
    "prices": {},
    "last_fetch": None,
    "errors": 0,
    "requests_total": 0,
    "start_time": time.time(),
}
_cache_lock = threading.Lock()
_rmq_connection = None
_rmq_channel = None


def get_rabbitmq_channel():
    global _rmq_connection, _rmq_channel
    if _rmq_channel and _rmq_channel.is_open:
        return _rmq_channel
    try:
        params = pika.URLParameters(RABBITMQ_URL)
        params.heartbeat = 30
        _rmq_connection = pika.BlockingConnection(params)
        _rmq_channel = _rmq_connection.channel()
        _rmq_channel.queue_declare(queue=QUEUE_NAME, durable=True)
        log_json("info", "Connected to RabbitMQ")
        return _rmq_channel
    except Exception as e:
        log_json("error", "RabbitMQ connection failed", error=str(e))
        _rmq_channel = None
        return None


def publish_event(event: dict):
    ch = get_rabbitmq_channel()
    if ch is None:
        log_json("warning", "Cannot publish: no RabbitMQ channel")
        return False
    try:
        ch.basic_publish(
            exchange="",
            routing_key=QUEUE_NAME,
            body=json.dumps(event),
            properties=pika.BasicProperties(delivery_mode=2),
        )
        return True
    except Exception as e:
        log_json("error", "Publish failed", error=str(e))
        return False


def fetch_prices():
    """Fetch BTC/ETH prices from CoinGecko (or mock if unreachable)."""
    try:
        resp = requests.get(
            COINGECKO_URL,
            params={"ids": "bitcoin,ethereum", "vs_currencies": "usd", "include_24hr_change": "true"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        with _cache_lock:
            _cache["prices"] = data
            _cache["last_fetch"] = datetime.now(timezone.utc).isoformat()
        log_json("info", "Prices fetched successfully", source="coingecko")

        # Publish price events to queue
        for coin, vals in data.items():
            event = {
                "type": "price",
                "coin": coin,
                "price_usd": vals.get("usd", 0),
                "change_24h": vals.get("usd_24h_change", 0),
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            }
            publish_event(event)

    except Exception as e:
        with _cache_lock:
            _cache["errors"] += 1
        log_json("error", "Price fetch failed", error=str(e))


def background_fetcher():
    """Periodically fetch prices in background thread."""
    while True:
        fetch_prices()
        time.sleep(FETCH_INTERVAL)


# ── Routes ──────────────────────────────────────────────────────────────────
@app.route("/health")
def health():
    with _cache_lock:
        uptime = time.time() - _cache["start_time"]
        return jsonify({
            "status": "healthy",
            "service": "api-proxy",
            "uptime_seconds": round(uptime, 1),
            "errors_total": _cache["errors"],
            "requests_total": _cache["requests_total"],
            "last_fetch": _cache["last_fetch"],
            "rabbitmq_connected": _rmq_channel is not None and _rmq_channel.is_open,
        })


@app.route("/api/prices")
def prices():
    with _cache_lock:
        _cache["requests_total"] += 1
        return jsonify({
            "prices": _cache["prices"],
            "fetched_at": _cache["last_fetch"],
        })


@app.route("/api/health")
def api_health():
    return health()


# ── Main ────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    log_json("info", "Starting api-proxy", port=PORT)
    fetcher = threading.Thread(target=background_fetcher, daemon=True)
    fetcher.start()
    app.run(host="0.0.0.0", port=PORT)
