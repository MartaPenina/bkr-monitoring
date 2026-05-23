# Nginx & UFW Troubleshooting — AWS Jump-Host

This documents the nginx reverse proxy setup on the AWS jump-host that enables
FaultLens (GCP) to monitor CoinOps internal services (AWS private subnet).

---

## Why nginx is needed

CoinOps internal nodes (`10.0.2.x`) are in a private AWS subnet — not reachable from the internet.
nginx on the jump-host acts as a reverse proxy:

```
FaultLens GCP (34.118.77.243)
    ↓ HTTP request to 18.185.17.147:8080
AWS jump-host nginx
    ↓ proxy_pass to 10.0.2.127:8080
coinops-proxy container (private subnet)
```

---

## Port mapping

| External port (jump-host) | Internal target | Service |
|---|---|---|
| `:8080` | `10.0.2.127:8080` | coinops-proxy (node-02) |
| `:8000` | `10.0.2.46:8000` | coinops-history-api (node-01) |
| `:5672` | `10.0.2.46:5672` | coinops-rabbitmq (node-01) |

---

## After AWS redeploy — nginx is missing

When `terraform apply` recreates the jump-host, the new instance is blank.
**Ansible provision handles this automatically** — just run it:

```bash
# On AWS jump-host
cd ~/coinops && source .env
ansible-playbook -i ansible/inventory ansible/provision.yml
```

This installs nginx and configures all proxy rules via `group_vars/jump/main.yml`.

---

## Manual nginx setup (if Ansible fails)

```bash
# On AWS jump-host
sudo apt update && sudo apt install -y nginx

sudo nano /etc/nginx/sites-available/coinops-proxy
```

Paste this config:
```nginx
server {
    listen 8080;
    location / {
        proxy_pass http://10.0.2.127:8080;
        proxy_connect_timeout 5s;
        proxy_read_timeout 10s;
    }
}
server {
    listen 8000;
    location / {
        proxy_pass http://10.0.2.46:8000;
        proxy_connect_timeout 5s;
        proxy_read_timeout 10s;
    }
}
server {
    listen 5672;
    location / {
        proxy_pass http://10.0.2.46:5672;
        proxy_connect_timeout 5s;
        proxy_read_timeout 10s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/coinops-proxy /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## UFW — firewall rules

Ansible opens ports automatically via `group_vars/jump/main.yml`.
If services still show red after nginx setup, check UFW:

```bash
sudo ufw status
```

Expected output:
```
Status: active
To                         Action      From
--                         ------      ----
9922/tcp                   ALLOW       Anywhere
8080/tcp                   ALLOW       Anywhere
8000/tcp                   ALLOW       Anywhere
5672/tcp                   ALLOW       Anywhere
```

If ports are missing:
```bash
sudo ufw allow 8080/tcp
sudo ufw allow 8000/tcp
sudo ufw allow 5672/tcp
```

---

## Diagnosis checklist — services still red?

Run these in order on **AWS jump-host**:

```bash
# 1. Is nginx running?
sudo systemctl status nginx

# 2. Is nginx listening on correct ports?
sudo ss -tlnp | grep nginx
# Expected: 0.0.0.0:8080, 0.0.0.0:8000, 0.0.0.0:5672

# 3. Can nginx reach internal nodes?
curl http://localhost:8080/health   # → {"status":"ok"}
curl http://localhost:8000/health   # → {"status":"ok"}

# 4. Are UFW ports open?
sudo ufw status

# 5. Are packets arriving from GCP? (run, then curl from GCP)
sudo tcpdump -i any port 8080 -n
# Should show: 34.118.77.243.xxxxx > 10.0.1.xxx.8080: Flags [S]

# 6. Does GCP reach AWS? (run on GCP node-03)
curl -v --max-time 5 http://<AWS_JUMP_HOST_IP>:8080/health
```

---

## After fixing — reload monitoring collector

On **GCP node-03** (FaultLens system):
```bash
docker compose --env-file ~/.env pull monitoring-collector
docker compose --env-file ~/.env up -d monitoring-collector
```

Wait ~30 seconds for the first poll cycle. Services should turn green on the dashboard.
