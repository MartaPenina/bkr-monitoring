# Інтеграція з LLM (Claude API)

## Чому Claude API

- Структурований вхід/вихід (XML-теги у промпті → JSON у відповіді)
- Великий контекстний вікно для телеметричних даних
- Якісне reasoning для аналізу причинно-наслідкових зв'язків

## Як працює діагностика

### 1. Виявлення аномалії

Monitoring Collector виявляє проблему коли:
- Сервіс не відповідає на health check (status: down/timeout)
- HTTP status != 200 (status: unhealthy)
- Response time > 5 секунд (status: high_latency)
- 2+ послідовних збої (consecutive_failures >= threshold)

### 2. Збір контексту

При аномалії collector збирає:
- Останні 10 метрик проблемного сервісу
- Метрики усіх залежностей (depends_on)
- Зворотні залежності (хто залежить від цього сервісу)
- Повну карту залежностей
- Поточний стан усіх сервісів

### 3. Формування промпту

Промпт (`prompt_templates/fault_diagnosis.txt`) містить XML-секції:
- `<incident>` — деталі інциденту
- `<recent_metrics>` — часовий ряд метрик
- `<dependency_metrics>` — стан залежностей
- `<service_dependency_map>` — граф залежностей
- `<all_service_states>` — загальний стан системи

### 4. Claude API виклик

```python
client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
message = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=2048,
    messages=[{"role": "user", "content": prompt}],
)
```

### 5. Парсинг відповіді

Claude повертає JSON:
```json
{
  "root_cause": "PostgreSQL is down, causing cascading failure",
  "confidence": 0.85,
  "fault_chain": ["database", "history-consumer", "history-api", "web-ui"],
  "recommendations": [
    {
      "action": "Restart PostgreSQL container",
      "priority": "immediate",
      "command": "docker restart postgres"
    }
  ],
  "predicted_impact": ["web-ui", "history-consumer"]
}
```

## Fallback евристики

Якщо Claude API недоступне:
1. Перевірити чи залежності сервісу також down
2. Якщо так → cascading failure, root = найглибша down-залежність
3. Якщо ні → isolated failure
4. Сформувати базові рекомендації (restart, check logs)

Евристики працюють завжди, навіть без API ключа.
Confidence евристик: 0.4-0.7 (vs 0.7-0.95 для Claude).

## Rate Limiting

- Не більше 1 діагнозу на сервіс за 30 секунд
- Діагностика тільки при anomaly, не на кожен poll

## Конфігурація

Змінні середовища:
- `ANTHROPIC_API_KEY` — ключ API (обов'язково для LLM)
- `CLAUDE_MODEL` — модель (default: claude-sonnet-4-20250514)
- `MAX_TOKENS` — макс. токенів у відповіді (default: 2048)
- `MIN_DIAGNOSIS_INTERVAL` — мін. інтервал між діагнозами (default: 30s)
