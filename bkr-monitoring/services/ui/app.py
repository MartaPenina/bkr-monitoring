"""
web-ui — Simple web frontend with health endpoint.
In production, this would be a React SPA served by nginx.
For the thesis demo, a simplified Flask app suffices.
"""
import json
import os
import time
from datetime import datetime, timezone

import requests
from flask import Flask, jsonify, render_template_string

PORT = int(os.environ.get("PORT", "80"))
PROXY_URL = os.environ.get("PROXY_URL", "http://proxy:8080")
HISTORY_URL = os.environ.get("HISTORY_URL", "http://history-api:8000")

app = Flask(__name__)
_start_time = time.time()
_request_count = 0
_error_count = 0


def log_json(level: str, message: str, **extra):
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "service_name": "web-ui",
        "message": message,
        **extra,
    }
    print(json.dumps(entry), flush=True)


TEMPLATE = """<!DOCTYPE html>
<html><head><title>CoinOps Dashboard (BKR Demo)</title>
<style>
body { font-family: system-ui; background: #0f172a; color: #e2e8f0; padding: 40px; }
h1 { color: #3b82f6; }
.card { background: #1e293b; padding: 20px; border-radius: 12px; margin: 12px 0; border: 1px solid #334155; }
.price { font-size: 24px; font-weight: 700; }
.meta { color: #94a3b8; font-size: 13px; }
</style></head>
<body>
<h1>💰 CoinOps Dashboard (BKR Demo)</h1>
<p class="meta">Спрощений мікросервісний застосунок для демонстрації системи моніторингу</p>
<div id="prices">
{% for coin, data in prices.items() %}
<div class="card">
    <div class="price">{{ coin | capitalize }}: ${{ "%.2f" | format(data.get('usd', 0)) }}</div>
    <div class="meta">24h: {{ "%.2f" | format(data.get('usd_24h_change', 0)) }}%</div>
</div>
{% endfor %}
{% if not prices %}
<div class="card"><div class="meta">Дані завантажуються або Proxy недоступний...</div></div>
{% endif %}
</div>
<div class="card">
    <div class="meta">Proxy: {{ proxy_url }} | History: {{ history_url }}</div>
    <div class="meta">Оновлено: {{ now }}</div>
</div>
</body></html>
"""


@app.route("/")
def index():
    global _request_count
    _request_count += 1
    prices = {}
    try:
        resp = requests.get(f"{PROXY_URL}/api/prices", timeout=5)
        if resp.status_code == 200:
            prices = resp.json().get("prices", {})
    except Exception as e:
        log_json("warning", "Cannot reach proxy", error=str(e))

    return render_template_string(
        TEMPLATE,
        prices=prices,
        proxy_url=PROXY_URL,
        history_url=HISTORY_URL,
        now=datetime.now(timezone.utc).strftime("%H:%M:%S UTC"),
    )


@app.route("/health")
def health():
    global _error_count
    proxy_ok = False
    try:
        resp = requests.get(f"{PROXY_URL}/health", timeout=3)
        proxy_ok = resp.status_code == 200
    except Exception:
        _error_count += 1

    return jsonify({
        "status": "healthy" if proxy_ok else "degraded",
        "service": "web-ui",
        "uptime_seconds": round(time.time() - _start_time, 1),
        "requests_total": _request_count,
        "errors_total": _error_count,
        "proxy_reachable": proxy_ok,
    })


if __name__ == "__main__":
    log_json("info", "Starting web-ui", port=PORT)
    app.run(host="0.0.0.0", port=PORT)
