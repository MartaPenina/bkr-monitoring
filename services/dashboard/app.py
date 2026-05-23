"""
dashboard — Web interface for the monitoring system.
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
    entry = {"timestamp": datetime.now(timezone.utc).isoformat(), "level": level,
             "service_name": "dashboard", "message": message, **extra}
    print(json.dumps(entry), flush=True)


def get_db():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def serialize_rows(rows):
    result = []
    for r in rows:
        d = dict(r)
        for k, v in d.items():
            if hasattr(v, "isoformat"):
                d[k] = v.isoformat()
        result.append(d)
    return result


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/health")
def health():
    return jsonify({"status": "healthy", "service": "dashboard",
                    "uptime_seconds": round(time.time() - _start_time, 1)})


@app.route("/api/services")
def api_services():
    try:
        resp = requests.get(f"{COLLECTOR_URL}/api/services", timeout=5)
        return jsonify(resp.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.route("/api/service-map")
def api_service_map():
    try:
        resp = requests.get(f"{COLLECTOR_URL}/api/service-map", timeout=5)
        return jsonify(resp.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.route("/api/incidents")
def api_incidents():
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("""SELECT id, service_name, incident_type, severity,
                                  description, diagnosis, resolved_at, created_at
                           FROM incidents ORDER BY created_at DESC LIMIT 200""")
            rows = cur.fetchall()
        conn.close()
        return jsonify(serialize_rows(rows))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/incidents/<int:incident_id>")
def api_incident_detail(incident_id):
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM incidents WHERE id = %s", (incident_id,))
            row = cur.fetchone()
        conn.close()
        if not row:
            return jsonify({"error": "Not found"}), 404
        return jsonify(serialize_rows([row])[0])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/incidents/<int:incident_id>/diagnose", methods=["POST"])
def api_diagnose_incident(incident_id):
    """Proxy manual re-diagnosis request to monitoring collector."""
    try:
        resp = requests.post(
            f"{COLLECTOR_URL}/api/incidents/{incident_id}/diagnose",
            timeout=90,
        )
        return jsonify(resp.json()), resp.status_code
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.route("/api/metrics/<service_name>")
def api_metrics(service_name):
    limit = request.args.get("limit", 60, type=int)
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("""SELECT service_name, status, response_time, http_status,
                                  error_message, collected_at
                           FROM service_metrics WHERE service_name = %s
                           ORDER BY collected_at DESC LIMIT %s""", (service_name, limit))
            rows = cur.fetchall()
        conn.close()
        return jsonify(serialize_rows(rows))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/metrics/history")
def api_metrics_history():
    limit = min(request.args.get("limit", 40, type=int), 200)
    since_hours = request.args.get("since_hours", None, type=float)
    if not DATABASE_URL:
        return jsonify([])
    try:
        conn = get_db()
        with conn.cursor() as cur:
            if since_hours:
                cur.execute("""
                    SELECT service_name, status, response_time, http_status, collected_at
                    FROM service_metrics
                    WHERE collected_at >= NOW() - (%s * INTERVAL '1 hour')
                    ORDER BY service_name, collected_at ASC
                """, (since_hours,))
            else:
                cur.execute("""
                    SELECT service_name, status, response_time, http_status, collected_at
                    FROM (
                        SELECT *, ROW_NUMBER() OVER (
                            PARTITION BY service_name ORDER BY collected_at DESC
                        ) AS rn FROM service_metrics
                    ) sub WHERE rn <= %s
                    ORDER BY service_name, collected_at ASC
                """, (limit,))
            rows = cur.fetchall()
        conn.close()
        return jsonify(serialize_rows(rows))
    except Exception as e:
        log_json("error", "metrics/history failed", error=str(e))
        return jsonify([])


@app.route("/api/diagnostic-engine/health")
def api_engine_health():
    try:
        resp = requests.get(f"{DIAGNOSTIC_URL}/health", timeout=5)
        return jsonify(resp.json())
    except Exception as e:
        return jsonify({"error": str(e), "status": "unavailable"}), 502

@app.route("/api/metrics/uptime")
def api_metrics_uptime():
    hours = request.args.get("hours", 24, type=int)
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT service_name,
                       COUNT(*) as total_polls,
                       SUM(CASE WHEN status = 'healthy' THEN 1 ELSE 0 END) as healthy_polls,
                       ROUND((100.0 * SUM(CASE WHEN status = 'healthy' THEN 1 ELSE 0 END) / COUNT(*))::numeric, 1) as uptime_pct,
                       ROUND(AVG(CASE WHEN response_time IS NOT NULL THEN response_time * 1000 END)::numeric, 0) as avg_response_ms
                FROM service_metrics
                WHERE collected_at >= NOW() - (%s * INTERVAL '1 hour')
                GROUP BY service_name
            """, (hours,))
            rows = cur.fetchall()
        conn.close()
        return jsonify(serialize_rows(rows))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    log_json("info", "Starting dashboard", port=PORT)
    app.run(host="0.0.0.0", port=PORT, debug=False)