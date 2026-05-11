COMPOSE := docker compose

.PHONY: up down logs ps restart build demo clean health

# ── Development ─────────────────────────────────────────────────────────
up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

restart:
	$(COMPOSE) down
	$(COMPOSE) up -d --build

build:
	$(COMPOSE) build

# ── Monitoring ──────────────────────────────────────────────────────────
health:
	@echo "=== Service Health ==="
	@curl -sf http://localhost:8080/health 2>/dev/null | python3 -m json.tool || echo "proxy: DOWN"
	@curl -sf http://localhost:8000/health 2>/dev/null | python3 -m json.tool || echo "history-api: DOWN"
	@curl -sf http://localhost:8085/health 2>/dev/null | python3 -m json.tool || echo "collector: DOWN"
	@curl -sf http://localhost:8090/health 2>/dev/null | python3 -m json.tool || echo "engine: DOWN"
	@curl -sf http://localhost:5000/health 2>/dev/null | python3 -m json.tool || echo "dashboard: DOWN"

services:
	@curl -sf http://localhost:8085/api/services | python3 -m json.tool

incidents:
	@curl -sf http://localhost:5000/api/incidents | python3 -m json.tool

# ── Fault Injection ─────────────────────────────────────────────────────
demo:
	chmod +x fault-injection/demo.sh
	./fault-injection/demo.sh

kill-%:
	chmod +x fault-injection/kill-service.sh
	./fault-injection/kill-service.sh $*

# ── Cleanup ─────────────────────────────────────────────────────────────
clean:
	$(COMPOSE) down -v --remove-orphans
	docker image prune -f
