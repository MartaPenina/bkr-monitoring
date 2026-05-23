# LLM Integration — Claude API via OpenRouter

## Why Claude API

- Structured input/output: XML-tagged prompt sections → JSON response
- Large context window for telemetry data (metrics, logs, dependency graph)
- Strong reasoning for root cause and fault chain analysis
- Cost-effective via OpenRouter: `anthropic/claude-3-haiku` ≈ $0.001 per diagnosis

---

## How Diagnosis Works

### 1. Anomaly Detection

The Monitoring Collector triggers a diagnosis when:

| Condition | Threshold |
|---|---|
| Service does not respond to health check | `status: down` or `timeout` |
| HTTP status != 200 | `status: unhealthy` |
| Response time exceeds threshold | `> 5 seconds` → `high_latency` |
| Consecutive failures | `>= 2 consecutive failures` |

### 2. Context Collection

When an anomaly is detected, the collector builds the full incident context:
- Last 10 metrics of the affected service
- Metrics of all direct dependencies (`depends_on`)
- Reverse dependencies (services that depend on the affected one)
- Full service dependency map (`service_map.yaml`)
- Current state of all monitored services

### 3. Prompt Construction

The prompt (`prompt_templates/fault_diagnosis.txt`) uses XML sections:

| Section | Content |
|---|---|
| `<incident>` | Incident details: service name, status, timestamp |
| `<recent_metrics>` | Time-series metrics of the affected service |
| `<dependency_metrics>` | Health state of all dependencies |
| `<service_dependency_map>` | Full dependency graph |
| `<all_service_states>` | Current state of every monitored service |

### 4. API Call (via OpenRouter)

The system calls Claude through OpenRouter — no direct Anthropic SDK dependency:

```python
import httpx

response = httpx.post(
    "https://openrouter.ai/api/v1/chat/completions",
    headers={
        "Authorization": f"Bearer {ANTHROPIC_API_KEY}",  # OpenRouter key
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/MartaPenina/bkr-monitoring",
    },
    json={
        "model": "anthropic/claude-3-haiku",
        "max_tokens": 2048,
        "messages": [{"role": "user", "content": prompt}],
    },
    timeout=60,
)
```

> **Note:** `ANTHROPIC_API_KEY` holds an OpenRouter key (`sk-or-v1-...`), not a direct Anthropic key.

### 5. Response Parsing

Claude returns a JSON object:

```json
{
  "root_cause": "coinops-rabbitmq is down, causing cascading failure across the async pipeline",
  "confidence": 0.90,
  "fault_chain": ["coinops-rabbitmq", "coinops-proxy", "coinops-history-api", "coinops-ui"],
  "fault_chain_explanation": "RabbitMQ failure prevents proxy from publishing market data, which breaks history pipeline and frontend display",
  "predicted_impact": ["coinops-ui", "coinops-history-consumer"],
  "failure_prediction": {
    "next_failures": ["coinops-ui", "coinops-history-consumer"],
    "time_estimate": "2-5 minutes",
    "explanation": "Dependent services will fail as queue backlog grows"
  },
  "recommendations": [
    {
      "action": "Inspect RabbitMQ container logs",
      "priority": "immediate",
      "command": "docker inspect coinops-rabbitmq | grep 'Status|Error' && docker logs coinops-rabbitmq"
    }
  ],
  "prevention": "Implement circuit breakers and health-based routing to isolate queue failures",
  "diagnosis_source": "claude_api",
  "model": "anthropic/claude-3-haiku"
}
```

---

## Fallback Heuristic Diagnosis

When Claude API is unavailable (no key, API error, timeout), the system falls back to rule-based heuristics:

1. Check if the affected service's dependencies are also down
2. If yes → **cascading failure**: root = deepest failed dependency in the chain
3. If no → **isolated failure**: the service itself is the root cause
4. Generate basic recommendations: restart container, check logs

Heuristics always work — even without an API key. Confidence scores:
- Claude API: **0.85–0.95**
- Heuristic fallback: **0.40–0.70**

---

## Rate Limiting

- Maximum 1 diagnosis per service per **30 seconds** (`MIN_DIAGNOSIS_INTERVAL`)
- Diagnosis is triggered only on anomaly detection, not on every poll
- Manual re-diagnosis available via `POST /diagnose/force` endpoint (bypasses rate limit)

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | *(empty)* | OpenRouter API key (`sk-or-v1-...`). Leave empty to use heuristic fallback. |
| `CLAUDE_MODEL` | `anthropic/claude-3-haiku` | Model identifier on OpenRouter |
| `MAX_TOKENS` | `2048` | Maximum tokens in LLM response |
| `MIN_DIAGNOSIS_INTERVAL` | `30` | Minimum seconds between diagnoses per service |

---

## Enable / Disable LLM

See [llm-testing.md](./llm-testing.md) for step-by-step instructions.