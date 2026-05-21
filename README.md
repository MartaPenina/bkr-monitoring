# FaultLens — Microservice Monitoring & LLM Fault Diagnosis System

> **Bachelor's thesis** — Lviv Polytechnic National University, 2026  
> **Author:** Marta Penina  
> **Supervisor:** Nazariy Pleskanka  
> **Topic:** Development of a Monitoring and Fault Diagnosis System for Microservice Applications in Cloud Environments

Live dashboard: **[fault-lens-penina.pp.ua](https://fault-lens-penina.pp.ua)**  
Monitored application: **[coinops-penina.pp.ua](https://coinops-penina.pp.ua)**

---

## What is FaultLens?

FaultLens is a cloud-native monitoring system that goes beyond traditional tools like Prometheus and Grafana. While those tools tell you **what** broke and **when**, FaultLens uses a Large Language Model (LLM) to explain **why** it broke, **what will break next**, and **what to do about it**.

| Capability | Prometheus + Grafana | FaultLens |
|---|---|---|
| Metric collection | ✅ | ✅ |
| Dashboards & charts | ✅ | ✅ |
| Threshold-based alerts | ✅ | ✅ |
| Root cause analysis | ❌ | ✅ LLM-powered |
| Fault chain tracing | ❌ | ✅ Dependency-aware |
| Failure prediction | ❌ | ✅ Next failures + time estimate |
| Actionable recommendations | ❌ | ✅ Specific docker commands |
| Multi-cloud monitoring | ❌ | ✅ GCP + AWS simultaneously |
| Automated alerting | ❌ | ✅ Webhook → n8n → Telegram |

---

## Multi-Cloud Architecture

```
┌─────────────────────────────────────────┐     ┌──────────────────────────────────────┐
│         AWS (eu-central-1)              │     │         GCP (europe-central2)        │
│      CoinOps — Monitored Application    │     │    FaultLens — Monitoring System     │
│                                         │     │                                      │
│  jump-host  18.198.197.77               │     │  jump-host  34.118.111.49            │
│   └── nginx reverse proxy               │     │  node-03    10.0.1.11                │
│  node-01    10.0.2.46                   │     │   ├── dashboard          :5000       │
│   ├── history-api       :8000      ◄────┼─────┼── monitoring-collector   :8085      │
│   ├── history-consumer                  │     │   └── diagnostic-engine  :8090      │
│   └── rabbitmq          :5672           │     │  node-01    10.0.1.12                │
│  node-02    10.0.2.127                  │     │   ├── history-api                   │
│   └── proxy             :8080      ◄────┼─────┼── └── history-consumer              │
│  node-03    10.0.5.53                   │     │  node-02    10.0.1.13                │
│   └── web-ui            :80             │     │   ├── api-proxy                     │
│  RDS PostgreSQL (managed)               │     │   └── rabbitmq                      │
│  ALB → coinops-penina.pp.ua             │     │  Cloud SQL (managed PostgreSQL)      │
└─────────────────────────────────────────┘     └──────────────────────────────────────┘
                    ▲                                         │
                    └──── FaultLens polls every 30s ──────────┘
                          via nginx proxy on AWS jump-host
```

**Key architecture decision:** FaultLens on GCP monitors CoinOps on AWS via nginx reverse proxy on AWS jump-host. The proxy routes requests from GCP collector to private subnet nodes — enabling true multi-cloud monitoring without exposing internal services directly.

---

## Monitored Services (11 total)

| Service | Cloud | Endpoint | Status |
|---|---|---|---|
| coinops-ui | AWS | coinops-penina.pp.ua | ✅ healthy |
| coinops-proxy | AWS | 18.198.197.77:8080 via nginx | ✅ healthy |
| coinops-history-api | AWS | 18.198.197.77:8000 via nginx | ✅ healthy |
| coinops-history-consumer | AWS | TCP 18.198.197.77:5672 | ✅ healthy |
| coinops-rabbitmq | AWS | TCP 18.198.197.77:5672 | ✅ healthy |
| api-proxy | GCP | 10.0.1.13:8080 | ✅ healthy |
| rabbitmq | GCP | 10.0.1.13:15672 | ✅ healthy |
| history-api | GCP | 10.0.1.12:8000 | ✅ healthy |
| history-consumer | GCP | TCP 10.0.1.12:8081 | ✅ healthy |
| database | GCP | TCP 10.205.0.3:5432 | ✅ healthy |
| web-ui | GCP | node-03:80 | ✅ healthy |

---

## How LLM Diagnosis Works

```
Anomaly detected (service down / timeout / high latency)
      ↓
Collector builds context:
  - recent metrics (last 10 polls)
  - all service states
  - dependency graph from service_map.yaml
  - incident history
      ↓
POST /diagnose/force → Diagnostic Engine
      ↓
Claude API (anthropic/claude-3-haiku via OpenRouter)
      ↓
JSON response:
  - root_cause
  - fault_chain  
  - predicted_impact
  - failure_prediction (next failures + time estimate)
  - recommendations (specific docker commands)
  - prevention
      ↓
Stored in PostgreSQL → shown in dashboard → Telegram alert via n8n
```

**Confidence score: 90–95%**  
**Time from anomaly to Telegram: < 60 seconds**

---

## Dashboard Features

- **Overview** — total services (11), healthy count, incidents, LLM diagnoses count
- **Services** — per-service health cards with response time and failure count
- **Metrics** — response time charts (last 40 polls), auto-refresh every 20s
- **Incidents** — anomaly log with Claude AI diagnosis; "🧠 Run LLM Diagnosis" button; diagnoses auto-expanded on load
- **Topology** — Canvas dependency graph; edges turn red on failure propagation; fault chain cards

---

## Current Status

### Done ✅
- GCP infrastructure (4 VMs + Cloud SQL) via Terraform + Ansible
- AWS infrastructure (4 VMs + RDS + ALB) via Terraform + Ansible
- CoinOps deployed on AWS — live at coinops-penina.pp.ua
- **Multi-cloud monitoring: FaultLens (GCP) monitors CoinOps (AWS) — all 11 services healthy**
- nginx reverse proxy on AWS jump-host for cross-cloud health checks
- AWS Security Group rules for GCP collector IPs
- Docker Compose deployment for all services
- Monitoring collector (polling every 30s, anomaly detection, incident creation)
- LLM diagnostic engine with Claude API (via OpenRouter)
- Heuristic fallback when LLM unavailable
- Dashboard with 5 tabs
- Dependency graph with red edges on failure propagation
- CI/CD via GitHub Actions (push → build → deploy on GCP)
- Telegram notifications via n8n webhook
- Manual "🧠 Run LLM Diagnosis" button per incident
- Rate-limit bypass `/diagnose/force` endpoint
- Auto-expand Claude AI diagnoses on page load

### Planned improvements 📋
- Fault injection demo scripts for defense presentation (`docker stop coinops-proxy` → LLM diagnosis → recovery)
- nginx config as code — move to Ansible role instead of manual setup
- Persistent nginx config across AWS redeployments
- Defense presentation slides update with multi-cloud architecture
- Bachelor thesis document

---

## Infrastructure Management

### GCP (FaultLens)
```bash
eval $(ssh-agent -s) && ssh-add /d/ssh-keys/id_ed25519
ssh -p 9922 -A bkr_ops@34.118.111.49

# Check all GCP nodes
for ip in 10.0.1.11 10.0.1.12 10.0.1.13; do
  echo "=== $ip ==="
  ssh -p 9922 bkr_ops@$ip "docker ps --format '{{.Names}}'"
done

# LLM ON
ssh -p 9922 bkr_ops@10.0.1.11
nano ~/.env  # uncomment ANTHROPIC_API_KEY
docker compose --env-file ~/.env up -d diagnostic-engine

# Update collector after service_map.yaml change
docker compose --env-file ~/.env pull monitoring-collector
docker compose --env-file ~/.env up -d monitoring-collector
```

### AWS (CoinOps)
```bash
eval $(ssh-agent -s) && ssh-add ~/.ssh/id_ed25519
ssh -p 9922 -A marta_ops@18.198.197.77

# Check all AWS nodes
for ip in 10.0.2.46 10.0.2.127 10.0.5.53; do
  echo "=== $ip ==="
  ssh -p 9922 marta_ops@$ip "docker ps --format '{{.Names}}'"
done

# nginx proxy status
sudo systemctl status nginx
sudo tail -f /var/log/nginx/access.log

# Redeploy CoinOps
cd ~/coinops && source .env
ansible-playbook -i ansible/inventory ansible/deploy.yml
```

### Demo scenario (fault injection)
```bash
# 1. SSH to AWS jump-host
ssh -p 9922 marta_ops@18.198.197.77

# 2. Stop coinops-proxy on node-02
ssh -p 9922 marta_ops@10.0.2.127
sudo docker stop proxy-coinops-proxy-1

# 3. Watch FaultLens detect and diagnose (30-60 seconds)
# fault-lens-penina.pp.ua → Incidents → Run LLM Diagnosis

# 4. Recover
sudo docker start proxy-coinops-proxy-1
```

---

## Repositories

| Repo | Description |
|---|---|
| [bkr-monitoring](https://github.com/MartaPenina/bkr-monitoring) | FaultLens — monitoring system (this repo) |
| [-coinops-aws](https://github.com/MartaPenina/-coinops-aws) | CoinOps — monitored application on AWS |

---

## Author

Marta Penina — Computer Science, Lviv Polytechnic National University  
Supervisor: Nazariy Pleskanka (`nazarii.m.pleskanka@lpnu.ua`)  
DevOps internship: UA Academy / SoftServe Academy
