# Fault Injection Testing — FaultLens Demo Guide

Use this to demonstrate FaultLens LLM diagnosis during the thesis defense.
All commands run on **AWS infrastructure** (CoinOps — the monitored application).

---

## Infrastructure Map

| Service | Node | Container | IP |
|---|---|---|---|
| coinops-proxy | node-02 | `proxy-proxy-1` | `10.0.2.127` |
| coinops-history-api | node-01 | `history-history-api-1` | `10.0.2.46` |
| coinops-history-consumer | node-01 | `history-history-consumer-1` | `10.0.2.46` |
| coinops-rabbitmq | node-01 | `history-rabbitmq-1` | `10.0.2.46` |
| coinops-ui | node-03 | `ui-ui-1` | `10.0.5.224` |

---

## Connect to AWS (before any test)

```bash
# On your laptop
eval $(ssh-agent -s) && ssh-add /d/.ssh/id_ed25519
ssh -p 9922 -A marta_ops@18.185.17.147
```

---

## Scenario 1 — Stop coinops-proxy (best for demo)

**Expected fault chain:** `coinops-proxy → coinops-ui`

```bash
# SSH to node-02 from jump-host
ssh -p 9922 marta_ops@10.0.2.127

# Stop the proxy
sudo docker stop proxy-proxy-1

# Wait 30-60 seconds → check fault-lens-penina.pp.ua → Incidents
# LLM will diagnose: root_cause = coinops-proxy down, predicted_impact = coinops-ui

# Recover
sudo docker start proxy-proxy-1
```

---

## Scenario 2 — Stop coinops-rabbitmq (cascading failure)

**Expected fault chain:** `coinops-rabbitmq → coinops-proxy → coinops-history-api → coinops-history-consumer → coinops-ui`

```bash
# SSH to node-01 from jump-host
ssh -p 9922 marta_ops@10.0.2.46

# Stop RabbitMQ
sudo docker stop history-rabbitmq-1

# Wait 60-90 seconds → check dashboard → Incidents
# LLM will diagnose cascading failure across the entire pipeline

# Recover
sudo docker start history-rabbitmq-1
```

---

## Scenario 3 — Stop coinops-history-api

**Expected fault chain:** `coinops-history-api` isolated failure (depends on rabbitmq which is still up)

```bash
# SSH to node-01 from jump-host
ssh -p 9922 marta_ops@10.0.2.46

# Stop history API
sudo docker stop history-history-api-1

# Wait 30-60 seconds → check dashboard
# LLM will diagnose isolated failure, no cascade

# Recover
sudo docker start history-history-api-1
```

---

## What to show on dashboard during demo

1. **Services tab** — service turns red with consecutive failures count
2. **Incidents tab** — new incident appears with `Claude AI` badge and `90% confidence`
3. **Topology tab** — edges turn red showing fault propagation
4. Click **"🧠 Run LLM Diagnosis"** to trigger manual diagnosis
5. Show: root cause, fault chain, failure prediction, recommendations with docker commands

---

## Manual LLM diagnosis trigger

If auto-diagnosis doesn't fire (rate limit), trigger manually from dashboard:
- Go to **Incidents** tab
- Click **"🧠 Run LLM Diagnosis"** on the incident

Or via API (on **GCP node-03**):
```bash
curl -X POST http://localhost:8085/api/diagnose/force \
  -H "Content-Type: application/json" \
  -d '{"service_name": "coinops-proxy"}'
```

---

## Recovery verification

After recovering a service, verify on dashboard:
- Service card turns green
- Response time normalizes
- New "recovery" metric appears in Metrics tab
