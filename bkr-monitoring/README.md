# Система моніторингу та діагностики збоїв мікросервісних застосунків у хмарних середовищах

> Бакалаврська кваліфікаційна робота — Національний університет «Львівська політехніка»

## Що це

Система автоматичного моніторингу мікросервісних застосунків із **LLM-powered діагностикою збоїв**. На відміну від Prometheus + Grafana, які лише показують *що* зламалось, ця система показує *чому* зламалось і *що робити*.

### Ключова інновація

Інтеграція Claude API (Anthropic) для інтелектуальної діагностики:
- **Root Cause Analysis** — визначення кореневої причини збою
- **Fault Chain Tracing** — побудова ланцюжка залежностей (наприклад: PostgreSQL → History Consumer → History API → Web UI)
- **Actionable Recommendations** — конкретні дії з командами для виправлення
- **Predictive Impact** — прогноз які сервіси ще можуть бути уражені

## Архітектура

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Microservices (object of monitoring)          │
│  ┌──────┐ ┌───────┐ ┌──────────┐ ┌──────────┐ ┌────┐  │
│  │Web UI│→│ Proxy │→│ RabbitMQ │→│ Consumer │→│ DB │  │
│  └──────┘ └───────┘ └──────────┘ └──────────┘ └────┘  │
│                                        ↑               │
│  ┌────────────┐                   ┌────┴─────┐         │
│  │History API │←──────────────────│PostgreSQL│         │
│  └────────────┘                   └──────────┘         │
└─────────────────────────────────────────────────────────┘
         ↕ health checks (every 30s)
┌─────────────────────────────────────────────────────────┐
│  Layer 2: Monitoring Collector                          │
│  Polls health endpoints → stores metrics → detects      │
│  anomalies → triggers diagnosis                         │
└─────────────────────────────────────────────────────────┘
         ↕ incident context (on anomaly)
┌─────────────────────────────────────────────────────────┐
│  Layer 3: LLM Diagnostic Engine (Claude API)            │
│  Receives context → builds prompt → calls Claude →      │
│  returns structured diagnosis with root cause,          │
│  fault chain, recommendations, predictions              │
└─────────────────────────────────────────────────────────┘
         ↕
┌─────────────────────────────────────────────────────────┐
│  Dashboard: service status, dependency graph,           │
│  incident log with LLM diagnoses                        │
└─────────────────────────────────────────────────────────┘
```

## Швидкий старт

```bash
# Клонувати
git clone https://github.com/MartaPenina/bkr-monitoring.git
cd bkr-monitoring

# Запустити (без LLM — евристична діагностика)
docker compose up -d --build

# Запустити з LLM
export ANTHROPIC_API_KEY=sk-ant-...
docker compose up -d --build

# Dashboard
open http://localhost:5000

# Demo: fault injection → diagnosis
chmod +x fault-injection/*.sh
./fault-injection/demo.sh
```

## Технологічний стек

| Компонент | Технологія |
|-----------|------------|
| Інфраструктура | Terraform (GCP/AWS multi-cloud) |
| Provisioning | Ansible |
| Контейнеризація | Docker + Docker Compose |
| Мікросервіси | Python (Flask, FastAPI) |
| Черга повідомлень | RabbitMQ |
| База даних | PostgreSQL |
| Моніторинг | Python (custom collector) |
| Діагностика | Python + Claude API (Anthropic) |
| Dashboard | Flask + HTML/JS |
| CI/CD | GitHub Actions |

## Структура проєкту

```
bkr-monitoring/
├── services/
│   ├── proxy/                  # API шлюз
│   ├── ui/                     # Web frontend
│   ├── history-consumer/       # RabbitMQ consumer → PostgreSQL
│   ├── history-api/            # REST API для історичних даних
│   ├── monitoring-collector/   # Layer 2: збір метрик
│   ├── diagnostic-engine/      # Layer 3: LLM діагностика
│   └── dashboard/              # Веб-інтерфейс моніторингу
├── fault-injection/            # Скрипти для імітації збоїв
├── terraform/                  # IaC: GCP/AWS provisioning
├── ansible/                    # Конфігурація VM
├── docs/                       # Документація
├── docker-compose.yml          # Локальна розробка
└── .github/workflows/ci.yml    # CI pipeline
```

## Документація

- [Архітектура](docs/architecture.md)
- [LLM інтеграція](docs/llm-integration.md)
- [Deployment Guide](docs/deployment-guide.md)

## Автор

Марта Пеніна — Львівська політехніка, комп'ютерні науки

Науковий керівник: Назарій Плесканка
