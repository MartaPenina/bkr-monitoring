# Git Workflow Guide — FaultLens Thesis Project

## Два репозиторії

| Репо | Що це | Локальна папка |
|---|---|---|
| `MartaPenina/faultlens-target-app` | CoinOps — апка яку моніторимо, деплоїться на AWS | `/d/nulp-thesis/faultlens-target-app` |
| `MartaPenina/bkr-monitoring` | FaultLens — система моніторингу, деплоїться на GCP | `/d/nulp-thesis/bkr-monitoring` |

> ⚠️ `ua-academy-projects/coin-ops` — це стажування, **не чіпати!**

---

## 1) faultlens-target-app (CoinOps на AWS)

```bash
cd /d/nulp-thesis/faultlens-target-app
```

**Активна гілка:** `aws-deploy`

**Remote:**
- `faultlens` → `https://github.com/MartaPenina/faultlens-target-app.git` ✅
- `origin` → `https://github.com/ua-academy-projects/coin-ops` ⚠️ не пушити!

**Як пушити зміни:**
```bash
git add -A
git commit -m "опис змін"
git push faultlens aws-deploy
```

**Ніколи не писати:**
```bash
git push origin ...   # це стажування!
```

---

## 2) bkr-monitoring (FaultLens на GCP)

```bash
cd /d/nulp-thesis/bkr-monitoring
```

**Активна гілка:** `main`

**Remote:**
- `origin` → `https://github.com/MartaPenina/bkr-monitoring.git` ✅

**Як пушити зміни:**
```bash
git add -A
git commit -m "опис змін"
git push origin main
```

CI/CD (GitHub Actions) автоматично деплоїть на GCP після кожного push в `main`.

---

## Швидка перевірка перед push

```bash
git remote -v   # перевір куди пушиш
git branch      # перевір на якій гілці
```
