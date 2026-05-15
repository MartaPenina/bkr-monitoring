# FaultLens — Microservice Monitoring & LLM Fault Diagnosis System

> **Bachelor's thesis project** — Lviv Polytechnic National University, 2026  
> **Author:** Marta Penina  
> **Supervisor:** Nazariy Pleskanka  
> **Topic:** Development of a Monitoring and Fault Diagnosis System for Microservice Applications in Cloud Environments

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

---

## Live Demo

- **Dashboard:** https://fault-lens-penina.pp.ua
- **Direct IP:** http://34.118.77.243:5000

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     MONITORED APPLICATIONS                   │
│                                                              │
│  GCP (BKR microservices)        AWS (Coin-Ops)              │
│  ├── api-proxy      :8080       ├── coinops-api  (HTTPS)    │
│  ├── rabbitmq       :5672       └── coinops-ui   (HTTPS)    │
│  ├── history-consumer           
│  ├── history-api    :8000       
│  ├── web-ui         :3000       
│  └── database (Cloud SQL)       
└─────────────────────────────────────────────────────────────┘
                          │ health checks every 30s
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  MONITORING LAYER (node-03, GCP)             │
│                                                              │
│  monitoring-collector :8085                                  │
│  ├── Polls /health endpoints for all 8 services             │
│  ├── Detects anomalies (down, high latency, failures)       │
│  ├── Stores metrics in Cloud SQL (PostgreSQL)               │
│  └── Triggers LLM diagnosis on anomaly                      │
│                                                              │
│  diagnostic-engine :8090                                     │
│  ├── Receives incident context from collector               │
│  ├── Builds structured prompt with dependency map           │
│  ├── Calls OpenRouter API → Claude claude-3-haiku           │
│  ├── Returns: root cause, fault chain, prediction           │
│  └── Fallback: heuristic rules if LLM unavailable          │
│                                                              │
│  dashboard :5000                                             │
│  ├── Real-time service status grid                          │
│  ├── Response time charts (Chart.js)                        │
│  ├── Incident log with LLM diagnoses                        │
│  └── Service dependency topology graph                      │
└─────────────────────────────────────────────────────────────┘
```

### Infrastructure

| Node | IP | Services |
|------|----|---------|
| jump-host | 34.118.111.49:9922 | SSH gateway |
| node-01 | 10.0.1.12 | history-api, history-consumer |
| node-02 | 10.0.1.13 | api-proxy, rabbitmq |
| node-03 | 10.0.1.11 / 34.118.77.243 | dashboard, collector, diagnostic-engine, web-ui |
| Cloud SQL | 10.205.0.3 | PostgreSQL 16 |

---

## Key Features

### LLM Fault Diagnosis
When a service fails, the system automatically:
1. Collects incident context (metrics, dependency map, service states)
2. Builds a structured prompt and sends to Claude via OpenRouter
3. Returns a structured JSON diagnosis with:
   - **Root cause** with confidence score (0–100%)
   - **Fault chain** — which services caused which failures
   - **Failure prediction** — which services will fail next and when
   - **Cascade risk** — low / medium / high / critical
   - **Recommendations** with specific `docker` commands
   - **Prevention** advice

### Multi-Cloud Monitoring
FaultLens monitors services across cloud providers simultaneously:
- **GCP** — BKR microservice pipeline (6 services)
- **AWS** — Coin-Ops crypto market application (2 services)

This demonstrates the "cloud environments" (plural) aspect of the thesis topic.

### Fault Injection Demo
```bash
# Stop RabbitMQ to trigger cascading failure
ssh -p 9922 bkr_ops@10.0.1.13 "docker stop bkr-node02-rabbitmq-1"
# Wait 60 seconds → LLM diagnoses rabbitmq → predicts history-consumer and web-ui failures
# Restore
ssh -p 9922 bkr_ops@10.0.1.13 "docker start bkr-node02-rabbitmq-1"
```

---

## Technology Stack

| Component | Technology | Purpose |
|---|---|---|
| Infrastructure | Terraform (GCP + AWS) | Multi-cloud VM provisioning |
| Configuration | Ansible | Docker, firewall, service setup |
| Containerization | Docker + Docker Compose | Service isolation |
| Message Queue | RabbitMQ | Async communication |
| Database | Cloud SQL (PostgreSQL 16) | Metrics + incident storage |
| LLM Provider | OpenRouter → Claude claude-3-haiku | Fault diagnosis & prediction |
| Dashboard | Flask + Chart.js | Real-time monitoring UI |
| CI/CD | GitHub Actions → GHCR | Automated builds & deployments |
| DNS + CDN | Cloudflare + Let's Encrypt | HTTPS, domain management |

---

## Repository Structure

```
bkr-monitoring/
├── services/
│   ├── api-proxy/              # Market data fetcher → RabbitMQ publisher
│   ├── history-api/            # REST API for historical data
│   ├── history-consumer/       # Queue consumer → PostgreSQL writer
│   ├── ui/                     # Web UI (Flask)
│   ├── monitoring-collector/   # Health poller + anomaly detector
│   │   └── service_map.yaml    # Service dependency definitions
│   ├── diagnostic-engine/      # LLM diagnosis service
│   │   └── prompt_templates/   # Structured LLM prompts
│   └── dashboard/              # Web dashboard (Flask + JS)
├── deploy/
│   ├── node-01.yml             # Docker Compose for node-01
│   ├── node-02.yml             # Docker Compose for node-02
│   └── node-03.yml             # Docker Compose for node-03
├── terraform/                  # GCP + AWS infrastructure as code
├── ansible/                    # VM provisioning playbooks
├── fault-injection/            # Demo scripts for fault simulation
└── .github/workflows/ci.yml    # GitHub Actions CI/CD pipeline
```

---

## Local Development

```bash
# Clone
git clone https://github.com/MartaPenina/bkr-monitoring
cd bkr-monitoring

# Set environment variables
cp deploy/.env.example deploy/.env
# Edit: DATABASE_URL, ANTHROPIC_API_KEY (OpenRouter key)

# Run all services locally
docker compose up -d
```

---

## Deployment

### Prerequisites
- GCP project with $300 free credits
- Terraform + Ansible installed
- GitHub account (for GHCR image registry)
- OpenRouter API key ($5 = ~5000 diagnoses with claude-3-haiku)

### Deploy to GCP
```bash
cd terraform
terraform init && terraform apply

cd ../ansible
ansible-playbook -i inventory provision.yml

# Push code — GitHub Actions builds images automatically
git push origin main

# Deploy on nodes
ssh -p 9922 bkr_ops@<jump-host-ip>
ssh -p 9922 bkr_ops@10.0.1.11 "docker compose pull && docker compose up -d"
```

---

## LLM Cost Management

The system uses rate limiting to control LLM API costs:
- `MIN_DIAGNOSIS_INTERVAL=300` — minimum 5 minutes between diagnoses per service
- `MAX_TOKENS=512` — limits response length
- Model: `anthropic/claude-3-haiku` via OpenRouter — ~$0.001 per diagnosis
- **Estimated cost:** $5 covers ~5000 diagnoses (months of operation)

To disable LLM (use heuristic fallback only):
```bash
# Comment out ANTHROPIC_API_KEY in deploy/.env
# ANTHROPIC_API_KEY=sk-or-v1-...
```

---

## What's Next (Planned)

- [ ] **n8n workflow automation** — webhook trigger → LLM alert → Telegram notification
- [ ] **k3s cluster** — Kubernetes-based deployment for production-grade resilience  
- [ ] **Extended Coin-Ops monitoring** — deeper integration with AWS-hosted application
- [ ] **Multi-cloud Terraform demo** — switch between GCP/AWS with single config change

---

## Defense Talking Points

> "Prometheus shows **what** broke. FaultLens shows **why** it broke, **what will break next**, and **what to do** — powered by LLM."

- **Fault chain analysis:** rabbitmq → history-consumer → web-ui cascade
- **Failure prediction:** LLM predicts next failures with time estimates (2–5 min)  
- **Multi-cloud:** Monitors GCP and AWS services from a single dashboard
- **Cost-effective LLM:** OpenRouter + claude-3-haiku = $5 for months of operation
- **Production-ready:** CI/CD, HTTPS domain, rate limiting, heuristic fallback
