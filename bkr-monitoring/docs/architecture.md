# Архітектура системи моніторингу та діагностики збоїв

## Три шари системи

### Шар 1 — Мікросервісний застосунок (об'єкт моніторингу)

Спрощена версія CoinOps — розподілений застосунок із 6 компонентів:

```
Browser → Web UI (Flask) → API Proxy (Flask) → CoinGecko API
                                    ↓
                              RabbitMQ (queue)
                                    ↓
                           History Consumer (Python)
                                    ↓
                             PostgreSQL (DB)
                                    ↑
                            History API (FastAPI) → Browser
```

Кожен сервіс має:
- `GET /health` — JSON зі статусом, uptime, помилками, залежностями
- Structured logging — JSON-формат: timestamp, level, service_name, message
- Dependency declaration — описано у `service_map.yaml`

### Шар 2 — Monitoring Collector

Python-сервіс, який кожні 30 секунд:
1. Обходить health endpoints усіх сервісів
2. Вимірює response time, HTTP status, доступність
3. Зберігає метрики в PostgreSQL (`service_metrics`)
4. Відстежує послідовні збої (`consecutive_failures`)
5. При виявленні аномалії → створює інцидент → викликає Diagnostic Engine

Таблиці БД:
- `service_metrics` — time-series метрики (service, status, response_time, timestamp)
- `incidents` — журнал інцидентів (service, type, severity, diagnosis)

### Шар 3 — LLM Diagnostic Engine

Серце роботи. При виявленні аномалії:

1. Збирає контекст: метрики проблемного сервісу + його залежностей
2. Будує промпт з XML-тегами для Claude API
3. Отримує структурований JSON-діагноз:
   - Root cause (кореневу причину)
   - Fault chain (ланцюжок збою)
   - Recommendations (рекомендації з командами)
   - Predicted impact (прогноз впливу)
   - Confidence score

Fallback: якщо Claude API недоступне — евристичний аналіз залежностей.

## Інфраструктура

### Локальна розробка
Docker Compose з усіма сервісами на одній машині.

### Хмарне розгортання (GCP)
```
Laptop → Jump Host (public IP, port 9922)
              │
              ├── VM-1: Web UI + API Proxy + Monitoring Collector
              ├── VM-2: History Consumer + History API + Diagnostic Engine
              └── VM-3: RabbitMQ + PostgreSQL + Dashboard
```

Terraform для VM provisioning, Ansible для конфігурації.

## Відмінності від Prometheus + Grafana

| Аспект | Prometheus + Grafana | Ця система |
|--------|---------------------|------------|
| Діагностика | Відсутня | LLM аналізує причину |
| Залежності | Не враховує | Будує fault chain |
| Рекомендації | Відсутні | Конкретні дії з командами |
| Прогнозування | Тільки поточний стан | Передбачає каскадні збої |

**Prometheus показує ЩО зламалось. Ця система показує ЧОМУ і ЩО РОБИТИ.**
