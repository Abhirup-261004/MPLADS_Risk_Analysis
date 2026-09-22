# Deployment Plan – MPLADS Risk Analysis on AWS EC2 (v2 – All Blockers Fixed)

Goal: push to `main` auto-deploys. Same images validated locally via `container.md` promote to prod.
Target: single AWS EC2 (Docker Compose) + MongoDB Atlas. No `mongo` container in prod.

Source of truth for images: `container.md` §3 (Dockerfiles), §4 (`.dockerignore`), §5 (local Compose), §6 (Env matrix).
This file wires them to EC2 + GHCR + GitHub Actions. Where it differs from v1, v2 wins.

## 0. Locked Decisions (read first – removes all v1 ambiguity)

| Decision | Value | Why |
|---|---|---|
| Domain model | **Single domain**: `https://<WEB_DOMAIN>` serves both UI (`/`) and API (`/api/*`). No separate `<API_DOMAIN>`. | One DNS record, one TLS cert, no CORS ambiguity (`backend/src/app.js:18` CORS origin = web origin). `VITE_API_URL=https://<WEB_DOMAIN>/api` baked once. |
| Registry owner | Lowercase GHCR owner, e.g. `abhirup-261004`. Never `Abhirup-261004`. | GHCR rejects uppercase namespaces. Workflow computes it – do not hand-type. |
| Prod env file | `/opt/mplads/.env` (mode `600`), always passed as `docker compose --env-file /opt/mplads/.env`. | Compose interpolates `${VAR}` from this file only when `--env-file` is given. Fixes v1 bug where compose looked in `/opt/mplads/app/.env`. |
| Image tags | `IMAGE_TAG` env, default `latest`. Immutable per-build tag `:git-<sha>`. | Makes rollback real (v1 `pull :git-<sha>` was a no-op against `:latest`-pinned compose). |
| ML route mapping | **Verified** – Express → FastAPI is correct, no code change needed. | `categorize.py:5` `prefix="/nlp"`, `disbursement.py:5`/`cost.py:5`/`vendor.py:5`/`mp_risk.py:7` `prefix="/score"`, `dashboard.py:8,19` bare `/health` + `/dashboard/summary`. Matches `mlController.js:53,66,80,93,100,107,117`. |
| Login token shape | `res.json({ token, ... })` (`authController.js:215`). Smoke test `json['token']` is correct. | Verified – no fix needed. |

Search-replace once before starting: `<WEB_DOMAIN>` → your domain, `<OWNER_LC>` → lowercase owner.
Example used in comments: `WEB_DOMAIN=app.example.com`, `OWNER_LC=abhirup-261004`.

### 0.1 Required Repo Files (v1 blocker: they did not exist)

Deployment is **blocked** until these are committed (contents in `container.md` §3–§5):

```
backend/Dockerfile
backend/.dockerignore
frontend/Dockerfile
frontend/nginx.conf
frontend/.dockerignore
mplads_api/Dockerfile        # build context = repo root
.dockerignore                # repo root, artifact exclusions
docker-compose.yml           # local parity (container.md §5.1)
docker-compose.prod.yml      # §2.1 below
Caddyfile                    # §2.2 below
.github/workflows/deploy.yml # §3.2 below
```

Fail-fast check (run before §4):
```powershell
Test-Path backend/Dockerfile, frontend/Dockerfile, frontend/nginx.conf, mplads_api/Dockerfile, docker-compose.prod.yml, Caddyfile, .github/workflows/deploy.yml
```

## 1. Prerequisites

### 1.1 AWS
- 1x EC2 **`t3.medium` (4 GB RAM) minimum**. 30 GB gp3 EBS. Elastic IP attached. (v1 `t3.small` fixed: `ml` alone needs ~2 GB during `FeatureStore.load_all()`, `main.py:13-16`; 2 GB host OOMs.)
- Security Group: inbound `22` (prefer SSM over open SSH), `80`, `443` from `0.0.0.0/0`. **No `5001`, `8000`, `27017` inbound.** Outbound all.
- DNS: single `A` record `<WEB_DOMAIN>` → Elastic IP.
- IAM: SSM-managed role preferred; otherwise SSH key in GitHub Secrets.

### 1.2 Data
- Atlas cluster, DB user `prahari-svc`, IP access `EC2 EIP/32`. Connection string in `/opt/mplads/.env`, never in repo (`env.js:3` requires `MONGODB_URI`; `env.js:11` requires `JWT_SECRET` ≥ 32 chars).
- Local parity DB remains `mongo:7.0` container (`container.md` §5.1). Prod compose has no `mongo` service.

### 1.3 Registry + Repo
- GHCR, no ECR. Deploy branch `main` (`origin https://github.com/Abhirup-261004/MPLADS_Risk_Analysis.git`).
- Images: `ghcr.io/<OWNER_LC>/mplads-web`, `.../mplads-api`, `.../mplads-ml`, tags `:git-<sha>` + `:latest`.

### 1.4 Required Pre-Deploy Code Fix
- `mplads_api/main.py:27-33`: replace `allow_origins=["*"]` + `allow_credentials=True` (browsers reject wildcard + credentials) with:
```python
import os
allow_origins=[os.getenv("CLIENT_URL", "https://<WEB_DOMAIN>")]
# or remove CORSMiddleware entirely: only api calls ml server-to-server, no browser CORS needed.
```
Merge before first prod deploy.

## 2. Prod Files

### 2.1 `docker-compose.prod.yml` (EC2 runs this – fixed v1 networking/env/memory/rollback bugs)

```yaml
services:
  ml:
    image: ghcr.io/<OWNER_LC>/mplads-ml:${IMAGE_TAG:-latest}
    expose:
      - "8000"
    # No ports: in prod. Only api reaches ml via http://ml:8000. Caddy never routes to ml.
    restart: unless-stopped
    mem_limit: 2g
    mem_reservation: 1g
    env_file:
      - /opt/mplads/.env   # provides CLIENT_URL for CORS fix if ml reads it; harmless otherwise
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 90s
    logging:
      driver: json-file
      options: {max-size: "10m", max-file: "3"}

  api:
    image: ghcr.io/<OWNER_LC>/mplads-api:${IMAGE_TAG:-latest}
    expose:
      - "5001"
    # No host ports: Caddy reaches api via service DNS api:5001 (v1 127.0.0.1:5001 was unreachable from Caddy container).
    restart: unless-stopped
    mem_limit: 512m
    mem_reservation: 256m
    env_file:
      - /opt/mplads/.env
    environment:
      NODE_ENV: production
      PORT: 5001
      JWT_EXPIRES_IN: 7d
      CLIENT_URL: https://<WEB_DOMAIN>
      ML_API_URL: http://ml:8000
      SEED_ADMIN_ON_START: "false"
      # MONGODB_URI + JWT_SECRET come from env_file, not baked. Do not list values here.
    depends_on:
      ml:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:5001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
    logging:
      driver: json-file
      options: {max-size: "10m", max-file: "3"}

  web:
    image: ghcr.io/<OWNER_LC>/mplads-web:${IMAGE_TAG:-latest}
    expose:
      - "80"
    # No host ports: Caddy reaches web via service DNS web:80.
    depends_on:
      - api
    restart: unless-stopped

  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - web
      - api
    restart: unless-stopped

volumes:
  caddy-data:
  caddy-config:
```

Why each v1 fix:
- Service DNS (`api:5001`, `web:80`, `ml:8000`) instead of `127.0.0.1` – containers have isolated loopback.
- `env_file: /opt/mplads/.env` + `--env-file` flag (§3–§4 commands) – fixes `${MONGODB_URI:?}` never resolving.
- `mem_limit`/`mem_reservation` instead of `deploy.resources.limits` (ignored by plain `docker compose up`).
- `${IMAGE_TAG:-latest}` on all three images – rollback sets `IMAGE_TAG=git-<sha>`.
- `MONGODB_URI`/`JWT_SECRET` removed from `environment:` values – sourced from `env_file` only.

### 2.2 `Caddyfile` (single-domain – locked, no split-domain branch)

```
<WEB_DOMAIN> {
  handle /api/* {
    reverse_proxy api:5001
  }
  handle {
    reverse_proxy web:80
  }
}
```

Build `web` with `ARG VITE_API_URL=https://<WEB_DOMAIN>/api` (§3.2). `CLIENT_URL=https://<WEB_DOMAIN>` (§2.1) matches `app.js:18` CORS exactly.

### 2.3 EC2 `/opt/mplads/.env` (mode `600`, never committed)

```
MONGODB_URI=mongodb+srv://prahari-svc:<pwd>@<cluster>/prahari-ai?retryWrites=true&w=majority
JWT_SECRET=<64-hex-chars, >=32 chars per backend/src/config/env.js:11>
IMAGE_TAG=latest
GHCR_PAT=<classic PAT with read:packages for private images; empty if GHCR public>
```

`IMAGE_TAG` here is the default; deploy job overrides it per-release. `GHCR_PAT` is used by the pull step (§3.2), never baked into images.

## 3. CI/CD – Push to `main` Deploys

### 3.1 GitHub Secrets

| Secret | Value |
|---|---|
| `EC2_HOST` | Elastic IP / DNS |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | Private key (or switch deploy job to SSM) |
| `EC2_SSH_PORT` | `22` |
| `VITE_API_URL_PROD` | `https://<WEB_DOMAIN>/api` (must match §2.2) |
| `WEB_DOMAIN` | `<WEB_DOMAIN>` (used for `CLIENT_URL` smoke checks) |
| `GHCR_PAT` | PAT with `read:packages` (EC2 pulls private images; `GITHUB_TOKEN` cannot be reused on host – v1 bug) |

### 3.2 `.github/workflows/deploy.yml` (fixed: lowercase owner, PAT login, per-service builds, test gate)

```yaml
name: build-push-deploy
on:
  push:
    branches: [main]
permissions:
  contents: read
  packages: write

env:
  REGISTRY: ghcr.io

jobs:
  detect:
    runs-on: ubuntu-latest
    outputs:
      web: ${{ steps.f.outputs.web }}
      api: ${{ steps.f.outputs.api }}
      ml: ${{ steps.f.outputs.ml }}
    steps:
      - uses: actions/checkout@v4
        with: {fetch-depth: 2}
      - id: f
        uses: dorny/paths-filter@v3
        with:
          filters: |
            web: ["frontend/**"]
            api: ["backend/**"]
            ml: ["mplads_api/**", "requirements.txt", "shared_preprocessing_artifacts/**", "feature*_artifacts/**"]

  test-ml:
    needs: detect
    if: needs.detect.outputs.ml == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: {python-version: "3.11"}
      - run: pip install -r requirements.txt
      - run: python -m pytest mplads_api/tests -q

  build-push:
    needs: detect
    if: needs.detect.outputs.web == 'true' || needs.detect.outputs.api == 'true' || needs.detect.outputs.ml == 'true'
    runs-on: ubuntu-latest
    strategy:
      matrix:
        include:
          - svc: web
            context: ./frontend
            dockerfile: ./frontend/Dockerfile
          - svc: api
            context: ./backend
            dockerfile: ./backend/Dockerfile
          - svc: ml
            context: .
            dockerfile: ./mplads_api/Dockerfile
    steps:
      - uses: actions/checkout@v4
      - id: owner
        run: echo "lc=$(echo '${{ github.repository_owner }}' | tr '[:upper:]' '[:lower:]')" >> "$GITHUB_OUTPUT"
      - uses: docker/login-action@v3
        with: {registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }}}
      - uses: docker/setup-buildx-action@v3
      # Skip rebuild when this service's paths did not change (fixes v1 always-build-all).
      - if: needs.detect.outputs.web == 'true' && matrix.svc == 'web' || needs.detect.outputs.api == 'true' && matrix.svc == 'api' || needs.detect.outputs.ml == 'true' && matrix.svc == 'ml'
        uses: docker/build-push-action@v6
        with:
          context: ${{ matrix.context }}
          file: ${{ matrix.dockerfile }}
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ steps.owner.outputs.lc }}/mplads-${{ matrix.svc }}:git-${{ github.sha }}
            ${{ env.REGISTRY }}/${{ steps.owner.outputs.lc }}/mplads-${{ matrix.svc }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: ${{ matrix.svc == 'web' && format('VITE_API_URL={0}', secrets.VITE_API_URL_PROD) || '' }}

  deploy:
    # Gated on tests (v1 deployed even when pytest failed).
    needs: [detect, build-push, test-ml]
    if: always() && needs.build-push.result == 'success' && (needs.test-ml.result == 'success' || needs.test-ml.result == 'skipped')
    runs-on: ubuntu-latest
    steps:
      - id: owner
        run: echo "lc=$(echo '${{ github.repository_owner }}' | tr '[:upper:]' '[:lower:]')" >> "$GITHUB_OUTPUT"
      - uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USER }}
          key: ${{ secrets.EC2_SSH_KEY }}
          port: ${{ secrets.EC2_SSH_PORT }}
          script: |
            set -e
            cd /opt/mplads/app
            git fetch origin main && git reset --hard origin/main
            # PAT login: GITHUB_TOKEN is runner-scoped and expired here (v1 bug). Use GHCR_PAT from host .env.
            set -a; . /opt/mplads/.env; set +a
            echo "$GHCR_PAT" | docker login ghcr.io -u ${{ github.actor }} --password-stdin
            export OWNER_LC="${{ steps.owner.outputs.lc }}"
            export IMAGE_TAG="git-${{ github.sha }}"
            sed -i "s#ghcr.io/<OWNER_LC>#ghcr.io/$OWNER_LC#g" docker-compose.prod.yml
            docker compose --env-file /opt/mplads/.env -f docker-compose.prod.yml pull
            IMAGE_TAG="git-${{ github.sha }}" docker compose --env-file /opt/mplads/.env -f docker-compose.prod.yml up -d --remove-orphans
            docker image prune -f --filter "until=72h"
```

Notes:
- `backend/package.json:8` is `node src/server.js` (no `nodemon`) – prod image behavior preserved.
- No `docker compose build` on EC2. `web` `ARG VITE_API_URL` comes from `VITE_API_URL_PROD` – must equal §2.2 or UI calls wrong API (blank-page failure in §6 map).
- `dorny/paths-filter@v3` outputs `'true'` strings – comparisons above are correct.

## 4. First-Time EC2 Provision (One-Time, corrected)

```bash
# Ubuntu 24.04 – official Docker repo (v1 docker.io is stale; do NOT install host caddy – port 80/443 belongs to container Caddy)
sudo apt-get update && sudo apt-get install -y ca-certificates curl gnupg git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER && newgrp docker

sudo mkdir -p /opt/mplads/app && sudo chown $USER:$USER /opt/mplads /opt/mplads/app
git clone https://github.com/Abhirup-261004/MPLADS_Risk_Analysis.git /opt/mplads/app
cd /opt/mplads/app
git pull origin main
# Verify §0.1 files exist before continuing (fail-fast from v1 blocker 1)
ls backend/Dockerfile frontend/Dockerfile frontend/nginx.conf mplads_api/Dockerfile docker-compose.prod.yml Caddyfile .github/workflows/deploy.yml

# Create /opt/mplads/.env (0600) per §2.3, then:
chmod 600 /opt/mplads/.env
set -a; . /opt/mplads/.env; set +a
echo "$GHCR_PAT" | docker login ghcr.io -u <GITHUB_USER> --password-stdin
docker compose --env-file /opt/mplads/.env -f docker-compose.prod.yml up -d
```

Keep AMI vanilla; state is images + Atlas + EBS (`caddy-data`).

## 5. Data Jobs (Not on Boot – non-hanging fix for v1 seed bug)

`backend/src/server.js:7-9` calls `seedAdmin()` (`seedAdmin.js:12-23`) on every boot, then `listen()`. A `docker compose run ... node src/server.js` one-off therefore **never exits**. Use the service-restart procedure instead:

```bash
cd /opt/mplads/app
# 1. Operational collections (baked backend/data/*.csv, container.md §3.1)
docker compose --env-file /opt/mplads/.env -f docker-compose.prod.yml run --rm api npm run import:data
docker compose --env-file /opt/mplads/.env -f docker-compose.prod.yml run --rm api npm run backfill:progress

# 2. One-time admin seed: flip flag in host .env, recreate api (it seeds on boot, then serves normally)
#    /opt/mplads/.env: SEED_ADMIN_ON_START=true + SEED_ADMIN_EMAIL/PASSWORD/NAME
docker compose --env-file /opt/mplads/.env -f docker-compose.prod.yml up -d api
sleep 15; docker compose -f docker-compose.prod.yml logs --tail=20 api  # expect "Development admin created"
# 3. Immediately revert to false and recreate (do not leave seeding on)
#    /opt/mplads/.env: SEED_ADMIN_ON_START=false (+ rotate SEED_ADMIN_PASSWORD)
docker compose --env-file /opt/mplads/.env -f docker-compose.prod.yml up -d api
```

`seedAdmin.js:18-23` is idempotent (`findOne` + `$setOnInsert`). ML retrain stays offline (notebooks → commit parquet/joblib → push → `ml` rebuild).

## 6. Verification (Smoke, Every Deploy – fixed for internal-only ml + single domain)

```bash
cd /opt/mplads/app
docker compose --env-file /opt/mplads/.env -f docker-compose.prod.yml ps
curl -fsS https://<WEB_DOMAIN>/api/health  # {"status":"ok"} (backend/src/app.js:20)
# ml has no host port by design – probe from inside its container (v1 localhost:8000 failed here):
docker compose -f docker-compose.prod.yml exec ml python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/health').read().decode())"
# expect {"status":"healthy","classifier_loaded":true} (routers/dashboard.py:8)
TOKEN=$(curl -s -X POST https://<WEB_DOMAIN>/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@prahariai.com","password":"<pwd>"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s https://<WEB_DOMAIN>/api/ml/dashboard-summary -H "Authorization: Bearer $TOKEN" | head -c 500
curl -s https://<WEB_DOMAIN>/ | head -c 200  # web dist/index.html
```

Failure map: `503 ML unavailable` (`mlController.js:11`) = `ml` unhealthy or `ML_API_URL=http://ml:8000` wrong. `CORS blocked` = `CLIENT_URL` ≠ `https://<WEB_DOMAIN>` (`app.js:18`). HTML ok but blank app = `VITE_API_URL` baked wrong – rebuild `web` with correct `ARG` (runtime `-e` does nothing).

## 7. Scaling, Reliability, Ops (corrected sizing + rollback)

- Floor is **`t3.medium`**. `t3.small` OOMs (`ml` 2 GB + `api` 512 MB + Caddy + OS). `ml` stays `workers=1` (singleton `FeatureStore`); horizontal replicas (`--scale ml=2`) require Swarm/ECS + shared LB – not single Compose. Next step: ASG (min1/max3) + ALB, or same GHCR tags to ECS Fargate.
- Logs capped `10m x3`; `docker compose logs -f api ml`. CloudWatch via `awslogs` driver when needed.
- Uptime checks every 60s: `https://<WEB_DOMAIN>/api/health` + `https://<WEB_DOMAIN>/`.
- Backups: Atlas continuous backup (primary). EBS snapshot covers `caddy-data` only. Code/artifacts recoverable from git + GHCR `:git-<sha>`.
- Rollback (real – v1 command was a no-op):
```bash
IMAGE_TAG=git-<prior-sha> docker compose --env-file /opt/mplads/.env -f docker-compose.prod.yml up -d
# or: echo IMAGE_TAG=git-<prior-sha> >> /opt/mplads/.env && docker compose --env-file /opt/mplads/.env -f docker-compose.prod.yml up -d
```
No DB migration to reverse (imports are upserts).
- Cost (corrected): `t3.medium` (~$30) + 30 GB gp3 (~$2.40) + EIP (free in-use) + Atlas M0 free dev ≈ **~$33/mo**; with Atlas M10 (~$57) ≈ **~$90/mo**.

## 8. Consistency Checklist (vs `container.md` + Code)

- [ ] §0.1 files committed; fail-fast `ls` passes.
- [ ] `api:5001` (`env.js:21`), `ml:8000`, `web:80` internal; host publishes only `80/443` (Caddy). No `8000`/`27017` in SG.
- [ ] `ML_API_URL=http://ml:8000`, `PORT=5001`, `CLIENT_URL=https://<WEB_DOMAIN>`, `VITE_API_URL=https://<WEB_DOMAIN>/api` (baked `ARG`, `services/api.js:1`).
- [ ] `MONGODB_URI`/`JWT_SECRET` (≥32 chars, `env.js:3,11`) + `GHCR_PAT` only in `/opt/mplads/.env` + GH Secrets; `--env-file` on every compose call.
- [ ] No `mongo` service in prod; Atlas only. `depends_on: ml healthy` retained (`start_period: 90s`).
- [ ] CORS fix merged (§1.4). `SEED_ADMIN_ON_START=false` steady-state (§5 restart procedure for one-time seed).
- [ ] GHCR owner lowercase (`steps.owner`), `mem_limit` (not `deploy.limits`), `IMAGE_TAG` rollback, `test-ml` gates `deploy`.
