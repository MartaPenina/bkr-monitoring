"""
dashboard — Web interface for the monitoring system.

Shows:
  - Real-time service health status (green/yellow/red)
  - Dependency graph visualization
  - Incident log with LLM diagnoses
  - Metrics charts
  - Ability to trigger fault injection for demo
"""
import json
import os
import time
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras
import requests
from flask import Flask, jsonify, render_template, request

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://monitor:monitor@postgres:5432/monitor")
COLLECTOR_URL = os.environ.get("COLLECTOR_URL", "http://monitoring-collector:8085")
DIAGNOSTIC_URL = os.environ.get("DIAGNOSTIC_URL", "http://diagnostic-engine:8090")
PORT = int(os.environ.get("PORT", "5000"))

app = Flask(__name__)
_start_time = time.time()


def log_json(level: str, message: str, **extra):
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "service_name": "dashboard",
        "message": message,
        **extra,
    }
    print(json.dumps(entry), flush=True)


def get_db():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


# ── Pages ───────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/health")
def health():
    return jsonify({
        "status": "healthy",
        "service": "dashboard",
        "uptime_seconds": round(time.time() - _start_time, 1),
    })


# ── API endpoints (consumed by frontend JS) ────────────────────────────────
@app.route("/api/services")
def api_services():
    """Proxy to collector's service state."""
    try:
        resp = requests.get(f"{COLLECTOR_URL}/api/services", timeout=5)
        return jsonify(resp.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.route("/api/service-map")
def api_service_map():
    """Proxy to collector's service map."""
    try:
        resp = requests.get(f"{COLLECTOR_URL}/api/service-map", timeout=5)
        return jsonify(resp.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.route("/api/incidents")
def api_incidents():
    """Return recent incidents with diagnoses."""
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, service_name, incident_type, severity,
                          description, diagnosis, resolved_at, created_at
                   FROM incidents
                   ORDER BY created_at DESC LIMIT 50"""
            )
            rows = cur.fetchall()
        conn.close()
        result = []
        for r in rows:
            d = dict(r)
            d["created_at"] = d["created_at"].isoformat() if d["created_at"] else None
            d["resolved_at"] = d["resolved_at"].isoformat() if d["resolved_at"] else None
            result.append(d)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/incidents/<int:incident_id>")
def api_incident_detail(incident_id):
    """Return full details of a single incident."""
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM incidents WHERE id = %s", (incident_id,))
            row = cur.fetchone()
        conn.close()
        if not row:
            return jsonify({"error": "Not found"}), 404
        d = dict(row)
        d["created_at"] = d["created_at"].isoformat() if d["created_at"] else None
        d["resolved_at"] = d["resolved_at"].isoformat() if d["resolved_at"] else None
        return jsonify(d)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/metrics/<service_name>")
def api_metrics(service_name):
    """Return time-series metrics for charts."""
    limit = request.args.get("limit", 100, type=int)
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                """SELECT service_name, status, response_time, http_status,
                          error_message, collected_at
                   FROM service_metrics
                   WHERE service_name = %s
                   ORDER BY collected_at DESC LIMIT %s""",
                (service_name, limit),
            )
            rows = cur.fetchall()
        conn.close()
        result = []
        for r in rows:
            d = dict(r)
            d["collected_at"] = d["collected_at"].isoformat() if d["collected_at"] else None
            result.append(d)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/diagnostic-engine/health")
def api_engine_health():
    """Check diagnostic engine status."""
    try:
        resp = requests.get(f"{DIAGNOSTIC_URL}/health", timeout=5)
        return jsonify(resp.json())
    except Exception as e:
        return jsonify({"error": str(e), "status": "unavailable"}), 502


if __name__ == "__main__":
    log_json("info", "Starting dashboard", port=PORT)
    app.run(host="0.0.0.0", port=PORT, debug=False)
