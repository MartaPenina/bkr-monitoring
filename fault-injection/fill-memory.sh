#!/usr/bin/env bash
# fill-memory.sh — Simulate memory exhaustion in a container.
#
# Usage: ./fill-memory.sh <service-name> [megabytes]
# Example: ./fill-memory.sh proxy 256
#
# Allocates memory inside the container to cause OOM pressure,
# leading to degraded performance or crashes.

set -euo pipefail

SERVICE="${1:?Usage: $0 <service-name> [megabytes]}"
MB="${2:-256}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-bkr-monitoring}"

echo "╔══════════════════════════════════════════════════════╗"
echo "║  FAULT INJECTION: Memory pressure on '${SERVICE}'    "
echo "║  Allocating ${MB}MB of memory                        "
echo "╚══════════════════════════════════════════════════════╝"

CONTAINER=$(docker compose -p "$COMPOSE_PROJECT" ps -q "$SERVICE")

if [ -z "$CONTAINER" ]; then
    echo "ERROR: Container for service '${SERVICE}' not found or not running."
    exit 1
fi

echo "[$(date -u +%H:%M:%S)] Allocating ${MB}MB in container ${CONTAINER:0:12}..."

# Use dd to allocate memory via /dev/zero -> tmpfs
docker exec "$CONTAINER" sh -c "
    dd if=/dev/zero of=/tmp/memory_hog bs=1M count=${MB} 2>/dev/null || true
    echo 'Memory allocated: ${MB}MB'
" || echo "WARNING: exec failed (container may have crashed — that's the point)"

echo "[$(date -u +%H:%M:%S)] ✓ Memory pressure applied."
echo ""
echo "To clean up: docker exec \$(docker compose -p $COMPOSE_PROJECT ps -q $SERVICE) rm -f /tmp/memory_hog"
