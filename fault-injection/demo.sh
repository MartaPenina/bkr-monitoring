#!/usr/bin/env bash
# demo.sh — Full demo scenario for thesis defense.
#
# This script demonstrates:
#   1. All services running and healthy
#   2. Fault injection (kill database)
#   3. Cascading failures detected by monitoring
#   4. LLM diagnosis with root cause + recommendations
#   5. Service recovery
#
# Usage: ./demo.sh
# Prerequisites: docker compose up -d --build (all services running)

set -euo pipefail
COMPOSE_PROJECT="${COMPOSE_PROJECT:-bkr-monitoring}"
DASHBOARD="http://localhost:5000"
COLLECTOR="http://localhost:8085"
ENGINE="http://localhost:8090"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

pause() {
    echo ""
    read -rp "  ⏎ Натисніть Enter для продовження..."
    echo ""
}

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  BKR Demo: Моніторинг та діагностика збоїв мікросервісів   ║${NC}"
echo -e "${BLUE}║  Розроблення системи моніторингу та діагностики збоїв       ║${NC}"
echo -e "${BLUE}║  мікросервісних застосунків у хмарних середовищах           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Step 1: Show healthy system ─────────────────────────────────────────
echo -e "${GREEN}━━━ Крок 1: Перевірка здоров'я системи ━━━${NC}"
echo "Перевіряємо стан усіх сервісів..."

echo ""
echo "Collector health:"
curl -s "$COLLECTOR/health" | python3 -m json.tool 2>/dev/null || echo "(collector недоступний)"
echo ""
echo "Service states:"
curl -s "$COLLECTOR/api/services" | python3 -m json.tool 2>/dev/null || echo "(не вдалось отримати)"
echo ""
echo "Diagnostic Engine:"
curl -s "$ENGINE/health" | python3 -m json.tool 2>/dev/null || echo "(engine недоступний)"
echo ""
echo -e "${GREEN}✓ Усі сервіси працюють. Dashboard: ${DASHBOARD}${NC}"

pause

# ── Step 2: Inject fault ────────────────────────────────────────────────
echo -e "${RED}━━━ Крок 2: Fault Injection — вимикаємо PostgreSQL ━━━${NC}"
echo "Це спричинить каскадний збій:"
echo "  PostgreSQL → History Consumer (не може писати)"
echo "  PostgreSQL → History API (не може читати)"
echo "  History API → Web UI (застарілі дані)"
echo ""

docker compose -p "$COMPOSE_PROJECT" stop postgres
echo ""
echo -e "${RED}✗ PostgreSQL зупинено!${NC}"

pause

# ── Step 3: Wait for detection ──────────────────────────────────────────
echo -e "${YELLOW}━━━ Крок 3: Очікуємо виявлення збою (30-90 сек) ━━━${NC}"
echo "Monitoring Collector опитує сервіси кожні 30 секунд."
echo "Після 2 послідовних невдач — створює інцидент і викликає LLM."
echo ""
echo "Слідкуйте за Dashboard: ${DASHBOARD}"
echo ""

for i in $(seq 1 6); do
    echo -n "  Очікування... (${i}/6, $((i * 15)) сек) "
    sleep 15
    # Check if incident appeared
    INCIDENTS=$(curl -s "$DASHBOARD/api/incidents" 2>/dev/null | python3 -c "
import sys,json
try:
    data=json.load(sys.stdin)
    recent=[i for i in data if 'database' in i.get('service_name','').lower() or 'history' in i.get('service_name','').lower()]
    print(len(recent))
except: print(0)
" 2>/dev/null || echo "0")
    if [ "$INCIDENTS" -gt 0 ]; then
        echo -e "${YELLOW}⚡ Інцидент виявлено!${NC}"
        break
    fi
    echo ""
done

pause

# ── Step 4: Show diagnosis ──────────────────────────────────────────────
echo -e "${BLUE}━━━ Крок 4: Перегляд LLM діагнозу ━━━${NC}"
echo ""
echo "Останні інциденти з діагнозами:"
curl -s "$DASHBOARD/api/incidents" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for inc in data[:5]:
    print(f\"  ID: {inc['id']} | Сервіс: {inc['service_name']} | Severity: {inc['severity']}\")
    diag = inc.get('diagnosis')
    if diag:
        print(f\"    Root cause: {diag.get('root_cause', 'N/A')}\")
        print(f\"    Fault chain: {' → '.join(diag.get('fault_chain', []))}\")
        print(f\"    Source: {diag.get('diagnosis_source', 'N/A')}\")
        print(f\"    Confidence: {diag.get('confidence', 'N/A')}\")
        recs = diag.get('recommendations', [])
        if recs:
            print(f\"    Рекомендації:\")
            for r in recs:
                print(f\"      [{r.get('priority','?')}] {r.get('action','')}\")
                if r.get('command'):
                    print(f\"        → {r['command']}\")
    print()
" 2>/dev/null || echo "(не вдалось отримати інциденти)"

pause

# ── Step 5: Recovery ────────────────────────────────────────────────────
echo -e "${GREEN}━━━ Крок 5: Відновлення — запускаємо PostgreSQL ━━━${NC}"
docker compose -p "$COMPOSE_PROJECT" start postgres
echo ""
echo "Очікуємо відновлення (15 сек)..."
sleep 15
echo ""
echo "Стан сервісів після відновлення:"
curl -s "$COLLECTOR/api/services" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for name, state in data.items():
    status = state.get('status', 'unknown')
    icon = '✓' if status == 'healthy' else '✗'
    print(f'  {icon} {name}: {status}')
" 2>/dev/null || echo "(перевірте вручну)"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Demo завершено!                                            ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║  Ключові моменти:                                            ║${NC}"
echo -e "${GREEN}║  1. Моніторинг автоматично виявив збій                       ║${NC}"
echo -e "${GREEN}║  2. LLM проаналізував причину та ланцюжок залежностей        ║${NC}"
echo -e "${GREEN}║  3. Система надала конкретні рекомендації по виправленню      ║${NC}"
echo -e "${GREEN}║  4. Це те, чого НЕ вміє Prometheus + Grafana                 ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
