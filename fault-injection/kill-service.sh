#!/usr/bin/env bash
# kill-service.sh — Stop a container to simulate service crash.
#
# Usage: ./kill-service.sh <service-name>
# Example: ./kill-service.sh history-api
#
# This is the simplest fault injection: container goes down, health checks fail,
# monitoring collector detects the anomaly, triggers LLM diagnosis.

set -euo pipefail

SERVICE="${1:?Usage: $0 <service-name>}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-bkr-monitoring}"

echo "╔══════════════════════════════════════════════════════╗"
echo "║  FAULT INJECTION: Killing service '${SERVICE}'       "
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "[$(date -u +%H:%M:%S)] Stopping container..."
docker compose -p "$COMPOSE_PROJECT" stop "$SERVICE"
echo "[$(date -u +%H:%M:%S)] ✓ Service '${SERVICE}' stopped."
echo ""
echo "Wait ~60 seconds for the monitoring collector to detect the failure"
echo "and trigger LLM diagnosis. Check the dashboard at http://localhost:5000"
echo ""
echo "To restore: docker compose -p $COMPOSE_PROJECT start $SERVICE"
