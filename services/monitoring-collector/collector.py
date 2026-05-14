"""
monitoring-collector — The central nervous system of the monitoring platform.

Responsibilities:
  1. Poll health-check endpoints of all services every POLL_INTERVAL seconds
  2. Collect metrics: response time, status, error counts
  3. Store metrics in PostgreSQL (TimescaleDB hypertable)
  4. Detect anomalies (threshold breaches, service down, latency spikes)
  5. When anomaly detected → call the Diagnostic Engine API

Architecture note:
  This is Layer 2 in the three-layer architecture described in the thesis.
  Layer 1 = microservices (object of monitoring)
  Layer 2 = this collector
  Layer 3 = diagnostic engine (LLM)
"""
import json
import os
import sys
import time
import threading
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests
import yaml
from flask import Flask, jsonify

# ── Config ──────────────────────────────────────────────────────────────────
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://monitor:monitor@postgres:5432/monitor")
DIAGNOSTIC_ENGINE_URL = os.environ.get("DIAGNOSTIC_ENGINE_URL", "http://diagnostic-engine:8090")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "30"))
PORT = int(os.environ.get("PORT", "8085"))

# Anomaly thresholds
RESPONSE_TIME_THRESHOLD = float(os.environ.get("RESPONSE_TIME_THRESHOLD", "5.0"))
ERROR_RATE_THRESHOLD = float(os.environ.get("ERROR_RATE_THRESHOLD", "0.5"))
CONSECUTIVE_FAILURES_THRESHOLD = int(os.environ.get("CONSECUTIVE_FAILURES_THRESHOLD", "2"))


def log_json(level: str, message: str, **extra):
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "service_name": "monitoring-collector",
        "message": message,
        **extra,
    }
    print(json.dumps(entry), flush=True)


# ── Load service map ────────────────────────────────────────────────────────
def load_service_map():
    map_path = Path(__file__).parent / "service_map.yaml"
    if not map_path.exists():
        map_path = Path("/app/service_map.yaml")
    with open(map_path) as f:
        return yaml.safe_load(f)


SERVICE_MAP = load_service_map()
SERVICES = SERVICE_MAP["services"]

# ── State tracking ──────────────────────────────────────────────────────────
# Track consecutive failures per service for anomaly detection
_service_state = {}
_state_lock = threading.Lock()
_start_time = time.time()
_total_polls = 0


def init_service_state():
    for svc_name in SERVICES:
        _service_state[svc_name] = {
            "status": "unknown",
            "consecutive_failures": 0,
            "last_response_time": None,
            "last_check": None,
            "last_error": None,
            "error_count": 0,
            "success_count": 0,
        }


init_service_state()


# ── Database ────────────────────────────────────────────────────────────────
METRICS_SCHEMA = """
CREATE TABLE IF NOT EXISTS service_metrics (
    id              SERIAL PRIMARY KEY,
    service_name    TEXT NOT NULL,
    status          TEXT NOT NULL,
    response_time   DOUBLE PRECISION,
    http_status     INTEGER,
    error_message   TEXT,
    details         JSONB,
    collected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_service_time
    ON service_metrics (service_name, collected_at DESC);

CREATE TABLE IF NOT EXISTS incidents (
    id              SERIAL PRIMARY KEY,
    service_name    TEXT NOT NULL,
    incident_type   TEXT NOT NULL,
    severity        TEXT NOT NULL DEFAULT 'warning',
    description     TEXT,
    metrics_context JSONB,
    diagnosis       JSONB,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_service_time
    ON incidents (service_name, created_at DESC);
"""


def get_db():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def init_db():
    for attempt in range(30):
        try:
            conn = get_db()
            with conn.cursor() as cur:
                cur.execute(METRICS_SCHEMA)
            conn.commit()
            conn.close()
            log_json("info", "Monitoring schema initialized")
            return
        except psycopg2.OperationalError as e:
            log_json("warning", f"DB init attempt {attempt + 1}/30", error=str(e))
            time.sleep(2)
    log_json("error", "Cannot initialize database")
    sys.exit(1)


def store_metric(service_name, status, response_time, http_status, error_msg, details):
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO service_metrics
                   (service_name, status, response_time, http_status, error_message, details, collected_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (service_name, status, response_time, http_status, error_msg,
                 json.dumps(details) if details else None,
                 datetime.now(timezone.utc)),
            )
        conn.commit()
        conn.close()
    except Exception as e:
        log_json("error", "Failed to store metric", service=service_name, error=str(e))


def create_incident(service_name, incident_type, severity, description, metrics_context):
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO incidents
                   (service_name, incident_type, severity, description, metrics_context, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
                (service_name, incident_type, severity, description,
                 json.dumps(metrics_context), datetime.now(timezone.utc)),
            )
            incident_id = cur.fetchone()["id"]
        conn.commit()
        conn.close()
        return incident_id
    except Exception as e:
        log_json("error", "Failed to create incident", service=service_name, error=str(e))
        return None


def update_incident_diagnosis(incident_id, diagnosis):
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE incidents SET diagnosis = %s WHERE id = %s",
                (json.dumps(diagnosis), incident_id),
            )
        conn.commit()
        conn.close()
    except Exception as e:
        log_json("error", "Failed to update incident diagnosis", error=str(e))


# ── Health checking ─────────────────────────────────────────────────────────
def check_service_health(service_name: str, service_config: dict) -> dict:
    """Poll a single service's health endpoint and return result."""
    url = service_config["url"]
    health_ep = service_config.get("health_endpoint")

    if not health_ep:
        # TCP-only check (e.g., database)
        return {"status": "healthy", "response_time": 0, "http_status": None, "details": {}}

    check_url = f"{url}{health_ep}"
    start = time.time()
    try:
        resp = requests.get(check_url, timeout=5)
        elapsed = time.time() - start
        details = {}
        try:
            details = resp.json()
        except Exception:
            pass

        status = "healthy" if resp.status_code == 200 else "unhealthy"
        return {
            "status": status,
            "response_time": round(elapsed, 3),
            "http_status": resp.status_code,
            "details": details,
            "error": None,
        }
    except requests.exceptions.ConnectionError:
        return {
            "status": "down",
            "response_time": time.time() - start,
            "http_status": None,
            "details": {},
            "error": "Connection refused",
        }
    except requests.exceptions.Timeout:
        return {
            "status": "timeout",
            "response_time": 5.0,
            "http_status": None,
            "details": {},
            "error": "Request timeout (5s)",
        }
    except Exception as e:
        return {
            "status": "error",
            "response_time": time.time() - start,
            "http_status": None,
            "details": {},
            "error": str(e),
        }


# ── Anomaly detection ───────────────────────────────────────────────────────
def detect_anomaly(service_name: str, result: dict) -> dict | None:
    """Check if the health result constitutes an anomaly. Returns anomaly dict or None."""
    with _state_lock:
        state = _service_state[service_name]

        if result["status"] in ("down", "timeout", "error", "unhealthy"):
            state["consecutive_failures"] += 1
            state["error_count"] += 1
            state["status"] = result["status"]
            state["last_error"] = result.get("error", result["status"])

            if state["consecutive_failures"] >= CONSECUTIVE_FAILURES_THRESHOLD:
                return {
                    "type": "service_down",
                    "severity": "critical",
                    "consecutive_failures": state["consecutive_failures"],
                    "last_error": state["last_error"],
                }
        else:
            # Service recovered
            was_down = state["consecutive_failures"] >= CONSECUTIVE_FAILURES_THRESHOLD
            state["consecutive_failures"] = 0
            state["status"] = "healthy"
            state["success_count"] += 1
            state["last_error"] = None

            if was_down:
                log_json("info", "Service recovered", service=service_name)

        state["last_response_time"] = result.get("response_time")
        state["last_check"] = datetime.now(timezone.utc).isoformat()

        # High latency check
        if result.get("response_time") and result["response_time"] > RESPONSE_TIME_THRESHOLD:
            return {
                "type": "high_latency",
                "severity": "warning",
                "response_time": result["response_time"],
                "threshold": RESPONSE_TIME_THRESHOLD,
            }

    return None


# ── Trigger diagnostic engine ───────────────────────────────────────────────
def get_recent_metrics(service_name: str, limit: int = 10) -> list:
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                """SELECT service_name, status, response_time, http_status, error_message,
                          collected_at
                   FROM service_metrics
                   WHERE service_name = %s
                   ORDER BY collected_at DESC LIMIT %s""",
                (service_name, limit),
            )
            rows = cur.fetchall()
        conn.close()
        result = []
        for r in rows:
            row = dict(r)
            for k, v in row.items():
                if hasattr(v, 'isoformat'):
                    row[k] = v.isoformat()
            result.append(row)
        return result
    except Exception:
        return []


def get_all_service_states() -> dict:
    with _state_lock:
        result = {}
        for k, v in _service_state.items():
            row = dict(v)
            for key, val in row.items():
                if hasattr(val, 'isoformat'):
                    row[key] = val.isoformat()
            result[k] = row
        return result


def trigger_diagnosis(service_name: str, anomaly: dict, incident_id: int):
    """Call the diagnostic engine API with incident context."""
    # Build context for LLM
    affected_deps = []
    svc_config = SERVICES.get(service_name, {})
    for dep_name in svc_config.get("depends_on", []):
        dep_metrics = get_recent_metrics(dep_name, limit=5)
        affected_deps.append({
            "service": dep_name,
            "recent_metrics": dep_metrics,
        })

    # Find reverse dependencies (who depends on the broken service)
    reverse_deps = []
    for name, cfg in SERVICES.items():
        if service_name in cfg.get("depends_on", []):
            reverse_deps.append(name)

    context = {
        "incident_id": incident_id,
        "service_name": service_name,
        "anomaly": anomaly,
        "recent_metrics": get_recent_metrics(service_name, limit=10),
        "dependency_metrics": affected_deps,
        "reverse_dependencies": reverse_deps,
        "all_service_states": get_all_service_states(),
        "service_map": {
            name: {
                "depends_on": cfg.get("depends_on", []),
                "description": cfg.get("description", ""),
            }
            for name, cfg in SERVICES.items()
        },
    }

    try:
        resp = requests.post(
            f"{DIAGNOSTIC_ENGINE_URL}/diagnose",
            json=context,
            timeout=60,
        )
        if resp.status_code == 200:
            diagnosis = resp.json()
            update_incident_diagnosis(incident_id, diagnosis)
            log_json("info", "Diagnosis received",
                     service=service_name,
                     root_cause=diagnosis.get("root_cause", "unknown"))
        else:
            log_json("error", "Diagnostic engine error",
                     status=resp.status_code, body=resp.text[:200])
    except Exception as e:
        log_json("error", "Cannot reach diagnostic engine", error=str(e))


# ── Main polling loop ───────────────────────────────────────────────────────
def poll_all_services():
    global _total_polls
    _total_polls += 1
    log_json("info", f"Poll cycle #{_total_polls}")

    for svc_name, svc_config in SERVICES.items():
        result = check_service_health(svc_name, svc_config)

        # Store metric
        store_metric(
            service_name=svc_name,
            status=result["status"],
            response_time=result.get("response_time"),
            http_status=result.get("http_status"),
            error_msg=result.get("error"),
            details=result.get("details"),
        )

        # Check for anomaly
        anomaly = detect_anomaly(svc_name, result)
        if anomaly:
            log_json("warning", "Anomaly detected",
                     service=svc_name, anomaly_type=anomaly["type"],
                     severity=anomaly["severity"])

            incident_id = create_incident(
                service_name=svc_name,
                incident_type=anomaly["type"],
                severity=anomaly["severity"],
                description=f"{anomaly['type']} on {svc_name}: {anomaly}",
                metrics_context={
                    "anomaly": anomaly,
                    "health_result": result,
                },
            )

            if incident_id:
                # Trigger LLM diagnosis in background
                threading.Thread(
                    target=trigger_diagnosis,
                    args=(svc_name, anomaly, incident_id),
                    daemon=True,
                ).start()


def polling_loop():
    while True:
        try:
            poll_all_services()
        except Exception as e:
            log_json("error", "Poll cycle failed", error=str(e))
        time.sleep(POLL_INTERVAL)


# ── HTTP API (for dashboard) ───────────────────────────────────────────────
flask_app = Flask(__name__)


@flask_app.route("/health")
def health():
    return jsonify({
        "status": "healthy",
        "service": "monitoring-collector",
        "uptime_seconds": round(time.time() - _start_time, 1),
        "total_polls": _total_polls,
        "poll_interval": POLL_INTERVAL,
        "monitored_services": len(SERVICES),
    })


@flask_app.route("/api/services")
def api_services():
    """Return current state of all monitored services."""
    return jsonify(get_all_service_states())


@flask_app.route("/api/metrics/<service_name>")
def api_metrics(service_name):
    """Return recent metrics for a service."""
    limit = int(requests.args.get("limit", 50)) if hasattr(requests, 'args') else 50
    metrics = get_recent_metrics(service_name, limit=50)
    return jsonify(metrics)


@flask_app.route("/api/incidents")
def api_incidents():
    """Return recent incidents."""
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, service_name, incident_type, severity, description,
                          diagnosis, resolved_at, created_at
                   FROM incidents
                   ORDER BY created_at DESC LIMIT 50""",
            )
            rows = cur.fetchall()
        conn.close()
        result = []
        for r in rows:
            row = dict(r)
            for k, v in row.items():
                if hasattr(v, 'isoformat'):
                    row[k] = v.isoformat()
            result.append(row)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@flask_app.route("/api/service-map")
def api_service_map():
    """Return the service dependency map."""
    return jsonify(SERVICE_MAP)


# ── Entry point ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    log_json("info", "Starting monitoring collector",
             poll_interval=POLL_INTERVAL, services=list(SERVICES.keys()))

    init_db()

    # Start polling in background
    poller = threading.Thread(target=polling_loop, daemon=True)
    poller.start()

    # Run HTTP API
    flask_app.run(host="0.0.0.0", port=PORT)
