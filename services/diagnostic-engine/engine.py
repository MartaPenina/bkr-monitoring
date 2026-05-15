"""
diagnostic-engine — Layer 3: LLM-powered fault diagnosis.

This is the core innovation of the bachelor thesis.
It receives incident context from the monitoring collector,
builds a structured prompt, sends it to Claude API, and returns
an intelligent diagnosis with root cause analysis, fault chain
tracing, and actionable recommendations.

Fallback: if Claude API is unavailable, uses rule-based heuristics.
"""
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import anthropic
from flask import Flask, jsonify, request

# ── Config ──────────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-5")
PORT = int(os.environ.get("PORT", "8090"))
MAX_TOKENS = int(os.environ.get("MAX_TOKENS", "2048"))

# Rate limiting: don't call LLM more often than this
MIN_DIAGNOSIS_INTERVAL = int(os.environ.get("MIN_DIAGNOSIS_INTERVAL", "30"))
_last_diagnosis_time = {}

_start_time = time.time()
_diagnosis_count = 0
_fallback_count = 0


def log_json(level: str, message: str, **extra):
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "service_name": "diagnostic-engine",
        "message": message,
        **extra,
    }
    print(json.dumps(entry), flush=True)


# ── Prompt construction ─────────────────────────────────────────────────────
def load_prompt_template():
    template_path = Path(__file__).parent / "prompt_templates" / "fault_diagnosis.txt"
    if not template_path.exists():
        template_path = Path("/app/prompt_templates/fault_diagnosis.txt")
    return template_path.read_text()


PROMPT_TEMPLATE = load_prompt_template()


def format_metrics_for_prompt(metrics: list) -> str:
    if not metrics:
        return "No recent metrics available."
    lines = []
    for m in metrics[:10]:
        ts = m.get("collected_at", m.get("timestamp", "unknown"))
        lines.append(
            f"  [{ts}] status={m.get('status', '?')} "
            f"response_time={m.get('response_time', '?')}s "
            f"http_status={m.get('http_status', '?')} "
            f"error={m.get('error_message', 'none')}"
        )
    return "\n".join(lines)


def format_dependency_metrics(dep_metrics: list) -> str:
    if not dep_metrics:
        return "No dependency metrics available."
    sections = []
    for dep in dep_metrics:
        svc = dep.get("service", "unknown")
        metrics = dep.get("recent_metrics", [])
        sections.append(f"  --- {svc} ---\n{format_metrics_for_prompt(metrics)}")
    return "\n".join(sections)


def format_service_map(service_map: dict) -> str:
    lines = []
    for name, info in service_map.items():
        deps = ", ".join(info.get("depends_on", [])) or "none"
        lines.append(f"  {name}: depends_on=[{deps}] — {info.get('description', '')}")
    return "\n".join(lines)


def format_service_states(states: dict) -> str:
    lines = []
    for name, state in states.items():
        lines.append(
            f"  {name}: status={state.get('status', '?')} "
            f"consecutive_failures={state.get('consecutive_failures', 0)} "
            f"last_response_time={state.get('last_response_time', '?')}s"
        )
    return "\n".join(lines)


def build_prompt(context: dict) -> str:
    """Build the structured prompt from incident context."""
    return PROMPT_TEMPLATE.format(
        service_name=context.get("service_name", "unknown"),
        anomaly_type=context.get("anomaly", {}).get("type", "unknown"),
        severity=context.get("anomaly", {}).get("severity", "unknown"),
        timestamp=datetime.now(timezone.utc).isoformat(),
        recent_metrics=format_metrics_for_prompt(context.get("recent_metrics", [])),
        dependency_metrics=format_dependency_metrics(context.get("dependency_metrics", [])),
        service_map=format_service_map(context.get("service_map", {})),
        all_service_states=format_service_states(context.get("all_service_states", {})),
        reverse_dependencies=", ".join(context.get("reverse_dependencies", [])) or "none",
    )


# ── Claude API call ─────────────────────────────────────────────────────────
def call_claude_api(prompt: str) -> dict:
    """Send structured prompt to OpenRouter/Claude API and parse JSON response."""
    global _diagnosis_count
    if not ANTHROPIC_API_KEY:
        log_json("warning", "No ANTHROPIC_API_KEY set, using fallback")
        return None
    try:
        import httpx as req
        response = req.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {ANTHROPIC_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/MartaPenina/bkr-monitoring",
            },
            json={
                "model": MODEL,
                "max_tokens": MAX_TOKENS,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=60,
        )
        response.raise_for_status()
        response_text = response.json()["choices"][0]["message"]["content"]
        _diagnosis_count += 1
        text = response_text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()
        diagnosis = json.loads(text)
        diagnosis["diagnosis_source"] = "claude_api"
        diagnosis["model"] = MODEL
        diagnosis["diagnosed_at"] = datetime.now(timezone.utc).isoformat()
        return diagnosis
    except json.JSONDecodeError as e:
        log_json("error", "Failed to parse response as JSON", error=str(e))
        return None
    except Exception as e:
        log_json("error", "Claude API error", error=str(e))
        return None


# ── Fallback heuristic diagnosis ────────────────────────────────────────────
def heuristic_diagnosis(context: dict) -> dict:
    """
    Rule-based fallback when LLM is unavailable.
    Analyzes dependency chains and basic patterns.
    """
    global _fallback_count
    _fallback_count += 1

    service_name = context.get("service_name", "unknown")
    anomaly = context.get("anomaly", {})
    all_states = context.get("all_service_states", {})
    service_map = context.get("service_map", {})

    anomaly_type = anomaly.get("type", "unknown")
    severity = anomaly.get("severity", "warning")

    # Check if dependencies are also down
    svc_deps = service_map.get(service_name, {}).get("depends_on", [])
    down_deps = []
    for dep in svc_deps:
        dep_state = all_states.get(dep, {})
        if dep_state.get("status") in ("down", "timeout", "error", "unhealthy"):
            down_deps.append(dep)

    # Determine root cause
    if down_deps:
        # Cascading failure — a dependency is down
        root = down_deps[0]
        # Check if that dependency also has failed deps
        root_deps = service_map.get(root, {}).get("depends_on", [])
        deeper_root = None
        for rd in root_deps:
            rd_state = all_states.get(rd, {})
            if rd_state.get("status") in ("down", "timeout", "error"):
                deeper_root = rd
                break

        actual_root = deeper_root or root
        fault_chain = [actual_root]
        if deeper_root and deeper_root != root:
            fault_chain.append(root)
        fault_chain.append(service_name)

        # Find all affected
        affected = set()
        for name, cfg in service_map.items():
            if actual_root in cfg.get("depends_on", []):
                affected.add(name)
            if root in cfg.get("depends_on", []):
                affected.add(name)
        affected.discard(actual_root)

        return {
            "root_cause": f"{actual_root} is down, causing cascading failure to {service_name}",
            "confidence": 0.7,
            "fault_chain": fault_chain,
            "fault_chain_explanation": f"{actual_root} failure propagated through dependency chain to {service_name}",
            "affected_services": list(affected),
            "predicted_impact": [n for n in service_map if service_name in service_map[n].get("depends_on", [])],
            "severity": "critical" if len(down_deps) > 1 else severity,
            "recommendations": [
                {
                    "action": f"Check and restart {actual_root}",
                    "priority": "immediate",
                    "command": f"docker restart {actual_root}",
                },
                {
                    "action": f"Check logs of {actual_root} for error details",
                    "priority": "immediate",
                    "command": f"docker logs --tail 50 {actual_root}",
                },
                {
                    "action": "Verify network connectivity between services",
                    "priority": "short-term",
                    "command": None,
                },
            ],
            "similar_patterns": "Cascading failure due to dependency unavailability",
            "diagnosis_source": "heuristic_fallback",
            "diagnosed_at": datetime.now(timezone.utc).isoformat(),
        }
    else:
        # Isolated failure
        recommendations = [
            {
                "action": f"Restart {service_name}",
                "priority": "immediate",
                "command": f"docker restart {service_name}",
            },
            {
                "action": f"Check {service_name} logs",
                "priority": "immediate",
                "command": f"docker logs --tail 100 {service_name}",
            },
        ]

        if anomaly_type == "high_latency":
            recommendations.append({
                "action": f"Check resource usage (CPU/memory) on {service_name}",
                "priority": "short-term",
                "command": f"docker stats {service_name} --no-stream",
            })

        return {
            "root_cause": f"{service_name} is experiencing {anomaly_type}",
            "confidence": 0.4,
            "fault_chain": [service_name],
            "fault_chain_explanation": f"Isolated failure in {service_name}, no dependency issues detected",
            "affected_services": [service_name],
            "predicted_impact": [n for n in service_map if service_name in service_map[n].get("depends_on", [])],
            "severity": severity,
            "recommendations": recommendations,
            "similar_patterns": f"Isolated {anomaly_type} event",
            "diagnosis_source": "heuristic_fallback",
            "diagnosed_at": datetime.now(timezone.utc).isoformat(),
        }


# ── Flask API ───────────────────────────────────────────────────────────────
app = Flask(__name__)


@app.route("/health")
def health():
    return jsonify({
        "status": "healthy",
        "service": "diagnostic-engine",
        "uptime_seconds": round(time.time() - _start_time, 1),
        "total_diagnoses": _diagnosis_count,
        "fallback_diagnoses": _fallback_count,
        "llm_available": bool(ANTHROPIC_API_KEY),
        "model": MODEL,
    })


@app.route("/diagnose", methods=["POST"])
def diagnose():
    """
    Main diagnostic endpoint.
    Receives incident context from monitoring collector,
    runs LLM diagnosis (or fallback), returns structured result.
    """
    context = request.json
    if not context:
        return jsonify({"error": "No context provided"}), 400

    service_name = context.get("service_name", "unknown")

    # Rate limiting per service
    now = time.time()
    last = _last_diagnosis_time.get(service_name, 0)
    if now - last < MIN_DIAGNOSIS_INTERVAL:
        return jsonify({
            "message": "Rate limited — diagnosis too recent",
            "last_diagnosis_seconds_ago": round(now - last),
        }), 429

    _last_diagnosis_time[service_name] = now

    log_json("info", "Diagnosis requested", service=service_name,
             anomaly_type=context.get("anomaly", {}).get("type"))

    # Build prompt and try Claude API
    prompt = build_prompt(context)
    diagnosis = call_claude_api(prompt)

    if diagnosis is None:
        # Fallback to heuristics
        log_json("info", "Using heuristic fallback", service=service_name)
        diagnosis = heuristic_diagnosis(context)

    log_json("info", "Diagnosis complete",
             service=service_name,
             source=diagnosis.get("diagnosis_source"),
             root_cause=diagnosis.get("root_cause", "unknown")[:100])

    return jsonify(diagnosis)


@app.route("/diagnose/test", methods=["POST"])
def diagnose_test():
    """Test endpoint — always uses heuristic fallback for testing without API key."""
    context = request.json
    if not context:
        return jsonify({"error": "No context provided"}), 400
    diagnosis = heuristic_diagnosis(context)
    return jsonify(diagnosis)


# ── Entry point ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    log_json("info", "Starting diagnostic engine",
             port=PORT, model=MODEL,
             llm_available=bool(ANTHROPIC_API_KEY))
    app.run(host="0.0.0.0", port=PORT)
