# Deployment Guide

## Локальна розробка (Docker Compose)

### Передумови
- Docker Engine 24+
- Docker Compose plugin v2+
- (Опціонально) API ключ Anthropic для LLM-діагностики

### Швидкий старт

```bash
git clone https://github.com/MartaPenina/bkr-monitoring.git
cd bkr-monitoring

# Без LLM (евристична діагностика)
docker compose up -d --build

# З LLM діагностикою
export ANTHROPIC_API_KEY=sk-ant-...
docker compose up -d --build
```

### Перевірка

```bash
# Стан сервісів
docker compose ps

# Health checks
curl http://localhost:8080/health   # proxy
curl http://localhost:8000/health   # history-api
curl http://localhost:8085/health   # monitoring collector
curl http://localhost:8090/health   # diagnostic engine
curl http://localhost:5000/health   # dashboard

# Dashboard
open http://localhost:5000
```

### Порти

| Сервіс | Порт | Призначення |
|--------|------|-------------|
| Dashboard | 5000 | Веб-інтерфейс моніторингу |
| Web UI | 3000 | Демо-застосунок (CoinOps) |
| API Proxy | 8080 | API шлюз |
| History API | 8000 | Історичні дані |
| Monitoring Collector | 8085 | API метрик та стану |
| Diagnostic Engine | 8090 | LLM діагностика |
| PostgreSQL | 5432 | База даних |
| RabbitMQ | 5672 / 15672 | Черга + management UI |

## Demo-сценарій (для захисту БКР)

```bash
# 1. Запустити систему
docker compose up -d --build

# 2. Дочекатись поки все здорове (~30 сек)
curl http://localhost:8085/api/services | python3 -m json.tool

# 3. Запустити демо
chmod +x fault-injection/demo.sh
./fault-injection/demo.sh

# Або вручну:
# Вбити базу даних
./fault-injection/kill-service.sh postgres

# Дочекатись діагнозу (~60 сек) і подивитись на dashboard
open http://localhost:5000

# Відновити
docker compose start postgres
```

## Хмарне розгортання (GCP)

### Передумови
- GCP акаунт з увімкненим Compute Engine
- Terraform >= 1.5
- Ansible >= 2.15
- SSH ключ (`~/.ssh/id_ed25519`)

### Крок 1: Terraform

```bash
cd terraform

# Створити terraform.tfvars (gitignored)
cat > terraform.tfvars <<EOF
gcp_project          = "your-project-id"
gcp_credentials_file = "/path/to/service-account.json"
EOF

terraform init
terraform plan
terraform apply
```

### Крок 2: Ansible

```bash
cd ansible

# Заповнити IP-адреси з terraform output
nano inventory.ini

# Встановити Docker на всі VM
ansible-playbook -i inventory.ini site.yml --tags common

# Розгорнути сервіси
ansible-playbook -i inventory.ini site.yml
```

### Крок 3: Перевірка

```bash
# SSH на jump host
ssh -A -p 9922 ops@<JUMP_HOST_IP>

# Перевірити стан
curl http://localhost:5000/health
```

## Перемикання хмари (AWS)

Змінити у `terraform/config.yaml`:
```yaml
cloud: aws
```

Запустити:
```bash
terraform plan
terraform apply
```

Ansible залишається таким самим — лише IP-адреси міняються.

## Логи та діагностика

```bash
# Логи конкретного сервісу
docker compose logs -f monitoring-collector
docker compose logs -f diagnostic-engine

# Всі логи
docker compose logs -f

# Перевірити інциденти
curl http://localhost:5000/api/incidents | python3 -m json.tool
```
