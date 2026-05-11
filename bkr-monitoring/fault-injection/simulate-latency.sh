#!/usr/bin/env bash
# simulate-latency.sh — Add artificial network delay to a container.
#
# Usage: ./simulate-latency.sh <service-name> [delay_ms]
# Example: ./simulate-latency.sh history-api 3000
#
# Uses tc netem to add delay. Container needs NET_ADMIN capability.
# This simulates slow network connections or overloaded services.

set -euo pipefail

SERVICE="${1:?Usage: $0 <service-name> [delay_ms]}"
DELAY="${2:-3000}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-bkr-monitoring}"

echo "╔══════════════════════════════════════════════════════╗"
echo "║  FAULT INJECTION: ${DELAY}ms latency on '${SERVICE}' "
echo "╚══════════════════════════════════════════════════════╝"

CONTAINER=$(docker compose -p "$COMPOSE_PROJECT" ps -q "$SERVICE")

if [ -z "$CONTAINER" ]; then
    echo "ERROR: Container for service '${SERVICE}' not found."
    exit 1
fi

echo "[$(date -u +%H:%M:%S)] Adding ${DELAY}ms delay..."

docker exec "$CONTAINER" sh -c "
    if command -v tc >/dev/null 2>&1; then
        tc qdisc add dev eth0 root netem delay ${DELAY}ms 2>/dev/null || \
        tc qdisc change dev eth0 root netem delay ${DELAY}ms
        echo 'Latency set: ${DELAY}ms on eth0'
    else
        echo 'ERROR: tc not available. Install iproute2 in the container.'
        exit 1
    fi
"

echo "[$(date -u +%H:%M:%S)] ✓ Latency injection active."
echo ""
echo "To remove: docker exec \$(docker compose -p $COMPOSE_PROJECT ps -q $SERVICE) tc qdisc del dev eth0 root"
echo "Or restart: docker compose -p $COMPOSE_PROJECT restart $SERVICE"
