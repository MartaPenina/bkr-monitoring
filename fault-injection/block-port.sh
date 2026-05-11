#!/usr/bin/env bash
# block-port.sh — Block network traffic to a specific port using iptables.
#
# Usage: ./block-port.sh <service-name> <port>
# Example: ./block-port.sh postgres 5432
#
# Simulates network partition: the service runs but nobody can reach it.
# This triggers cascading failures across dependent services.

set -euo pipefail

SERVICE="${1:?Usage: $0 <service-name> <port>}"
PORT="${2:?Usage: $0 <service-name> <port>}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-bkr-monitoring}"

echo "╔══════════════════════════════════════════════════════╗"
echo "║  FAULT INJECTION: Blocking port ${PORT} on '${SERVICE}'"
echo "╚══════════════════════════════════════════════════════╝"

CONTAINER=$(docker compose -p "$COMPOSE_PROJECT" ps -q "$SERVICE")

if [ -z "$CONTAINER" ]; then
    echo "ERROR: Container for service '${SERVICE}' not found."
    exit 1
fi

echo "[$(date -u +%H:%M:%S)] Adding iptables DROP rule for port ${PORT}..."

docker exec "$CONTAINER" sh -c "
    if command -v iptables >/dev/null 2>&1; then
        iptables -A INPUT -p tcp --dport ${PORT} -j DROP
        echo 'iptables rule added: DROP incoming TCP on port ${PORT}'
    else
        echo 'WARNING: iptables not available in container. Using tc netem if available.'
        # Alternative: use tc to add 100% packet loss
        if command -v tc >/dev/null 2>&1; then
            tc qdisc add dev eth0 root netem loss 100%
            echo 'tc netem: 100% packet loss on eth0'
        else
            echo 'ERROR: Neither iptables nor tc available. Install iproute2.'
            exit 1
        fi
    fi
" 2>/dev/null || echo "WARNING: Could not exec in container (may need NET_ADMIN capability)"

echo "[$(date -u +%H:%M:%S)] ✓ Port ${PORT} blocked on '${SERVICE}'."
echo ""
echo "To restore: docker compose -p $COMPOSE_PROJECT restart $SERVICE"
