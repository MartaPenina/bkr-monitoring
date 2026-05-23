# FaultLens — LLM Engine & Service Map Maintenance Guide

## 1. Enable / Disable LLM Diagnosis

All commands run on **GCP node-03** (where diagnostic-engine lives).

### Connect to node-03
```bash
# From your laptop
eval $(ssh-agent -s) && ssh-add /d/ssh-keys/id_ed25519
ssh -p 9922 -A bkr_ops@34.118.111.49

# From jump-host → node-03
ssh -p 9922 bkr_ops@10.0.1.11
```

### Enable LLM
```bash
nano ~/.env
# Find the line:  #ANTHROPIC_API_KEY=sk-or-v1-...
# Remove the #    ANTHROPIC_API_KEY=sk-or-v1-...

docker compose --env-file ~/.env up -d diagnostic-engine
```

### Disable LLM (heuristic fallback only)
```bash
nano ~/.env
# Find the line:  ANTHROPIC_API_KEY=sk-or-v1-...
# Add the #       #ANTHROPIC_API_KEY=sk-or-v1-...

docker compose --env-file ~/.env up -d diagnostic-engine
```

### Verify LLM status
```bash
curl -s http://localhost:8090/health | python3 -m json.tool
```

Expected when **enabled**:
```json
{
    "llm_available": true,
    "total_diagnoses": 5,
    ...
}
```

Expected when **disabled**:
```json
{
    "llm_available": false,
    "fallback_diagnoses": 7566,
    ...
}
```

---

## 2. Update AWS Jump-Host IP in service_map.yaml

When the AWS infrastructure is redeployed (e.g. `terraform apply` after jump-host termination), the public IP of the AWS jump-host changes. FaultLens uses this IP to reach CoinOps services via nginx proxy.

### Where to change
File: `bkr-monitoring/services/monitoring-collector/service_map.yaml`

### What to change
Find all occurrences of the old IP and replace with the new one. Affected services:

| Service | Field |
|---|---|
| `coinops-proxy` | `url` |
| `coinops-history-api` | `url` |
| `coinops-history-consumer` | `url` |
| `coinops-rabbitmq` | `url` |

### How to find the new IP
```bash
# On your laptop, in faultlens-target-app/terraform folder
terraform output jump_host_external_ip
```

Or check AWS Console → EC2 → jump-host → Public IPv4.

### How to update (VS Code)
1. Open `services/monitoring-collector/service_map.yaml`
2. Press `Ctrl+H` (Find & Replace)
3. Find: `<old IP>` (e.g. `18.198.197.77`)
4. Replace: `<new IP>` (e.g. `18.185.17.147`)
5. Click Replace All
6. Save the file

### Deploy the change
```bash
cd /d/nulp-thesis/bkr-monitoring
git add services/monitoring-collector/service_map.yaml
git commit -m "fix: update AWS jump-host IP to <new IP>"
git push origin main
```

GitHub Actions will build and deploy automatically (~2 min).

### Reload the collector on node-03
After CI/CD finishes, pull the new image and restart:
```bash
# On node-03
docker compose --env-file ~/.env pull monitoring-collector
docker compose --env-file ~/.env up -d monitoring-collector
```

Wait ~30 seconds (one poll cycle) and check the dashboard — all CoinOps services should turn green.

---

## 3. Quick Health Check

Run on node-03 to verify all components are running:

```bash
# Collector
curl -s http://localhost:8085/health | python3 -m json.tool

# Diagnostic engine
curl -s http://localhost:8090/health | python3 -m json.tool

# Dashboard
curl -s http://localhost:5000/health | python3 -m json.tool

# All containers
docker ps --format "table {{.Names}}\t{{.Status}}"
```

---

## 4. Current Infrastructure IPs

| Component | Cloud | IP |
|---|---|---|
| FaultLens jump-host | GCP | `34.118.111.49` |
| FaultLens node-03 (monitoring) | GCP | `10.0.1.11` |
| CoinOps jump-host | AWS | `18.185.17.147` ← changes on redeploy |
| CoinOps node-01 | AWS | `10.0.2.46` |
| CoinOps node-02 | AWS | `10.0.2.127` |
| CoinOps node-03 | AWS | `10.0.5.224` |

> **Note:** AWS public IPs change every time `terraform apply` recreates instances. GCP IPs are static.
