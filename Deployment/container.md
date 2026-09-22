# Containerization Plan – MPLADS Risk Analysis (Final, Corrected)

Goal: `docker compose up --build` reproduces the full stack locally. Same images promote to prod.
This document incorporates fixes for all 9 issues found in plan review.

## 0. Architecture

```
browser (host)
  -> web (nginx:80 -> host:5173) serves Vite SPA
  -> api (node:5001 -> host:5001) Express + JWT, proxies /api/ml/*
  -> ml (python:8000, internal only) FastAPI + in-memory FeatureStore
  -> mongo (mongo:7, internal + host:27017 for debug) persistent volume
```

Flow: `frontend/src/services/api.js:1` (`VITE_API_URL`) -> `backend/src/app.js:31` (`/api/ml`) ->
`backend/src/controllers/mlController.js:53,66,80,93,100,107,117` (`ML_API_URL`) ->
`mplads_api/main.py:35-40` routers -> `mplads_api/core/feature_store.py:72` in-memory indexes.
Browser never calls ML directly.

## 1. Scope – What Is Containerized

| Container | Context / Dockerfile | Base | Ports | Contents |
|---|---|---|---|---|
| `web` | `frontend/Dockerfile` | `node:20-alpine` build -> `nginx:alpine` runtime | `80` container, `5173:80` host (prod-style). Dev override uses `5173:5173` with Vite HMR | Vite build output only. No secrets. `VITE_API_URL` via `ARG` (baked at build, see §6) |
| `api` | `backend/Dockerfile` | `node:20-alpine` | `5001:5001` (`backend/src/config/env.js:21` default `5001`) | `src/`, `data/` (9 CSVs for `import:data`), `package*.json`. No `node_modules`, no `.env` |
| `ml` | `mplads_api/Dockerfile` (repo root context) | `python:3.11-slim` + `libgomp1` for LightGBM | `8000` internal, published as `8000:8000` locally for debug, **not published in prod** | `mplads_api/`, `requirements.txt`, only runtime-needed artifacts (see §4). Single replica, `workers=1` |
| `mongo` | `mongo:7.x` pinned image, no custom Dockerfile | `mongo:7` | `27017` internal, optionally `27017:27017` locally | `mongo-data` named volume. Local only; prod uses Atlas |

Not containerized: `notebooks/`, `explanations/`, `*.csv` at repo root, `feature3_sentence_transformer/`, `feature3_umap.joblib` (gitignored, training-only, never loaded by `feature_store.py`).

## 2. Pre-Fixes Applied

Fixed before Docker (source of prior inconsistency):

- `backend/.env.example`: removed duplicate `PORT=8000` + `PORT=5000`. Canonical `PORT=5001` matching `env.js:21` and `README.md`.
- `frontend/.env.example`: removed duplicate `VITE_API_URL=http://localhost:8000/api` / `...:5000/api`. Canonical single line `VITE_API_URL=http://localhost:5001/api` matching `services/api.js:1` fallback.

## 3. Dockerfiles (Corrected)

### 3.1 `backend/Dockerfile`

```dockerfile
FROM node:20-alpine AS prod
WORKDIR /app

# Install prod deps first for layer caching
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev

# App + seed/import CSVs (required by src/scripts/importMpladsData.js:10 + config/dataSources.js:1-10)
COPY --chown=node:node src/ ./src/
COPY --chown=node:node data/ ./data/

USER node
EXPOSE 5001

# /api/health (src/app.js:20) is liveness only (no DB check).
# Readiness is enforced by compose depends_on mongo/ml healthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:5001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
```

Notes:
- No `nodemon`, no `--watch`. Dev uses override (§6).
- `MONGODB_URI`, `JWT_SECRET (>=32 chars, src/config/env.js:3,11)` injected at runtime, never baked.
- Fixes review #2 (missing `data/`) and #3 (`USER node` + `--chown`).

### 3.2 `mplads_api/Dockerfile` (build context = repo root)

```dockerfile
FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

# LightGBM runtime dep
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY mplads_api/ ./mplads_api/

# One COPY per dir. Do NOT use `COPY a/ b/ ./` (flattens dirs, breaks config.py:9-14 PROJECT_ROOT/<name>).
COPY shared_preprocessing_artifacts/ ./shared_preprocessing_artifacts/
COPY feature1_artifacts/ ./feature1_artifacts/
COPY feature2_artifacts/ ./feature2_artifacts/
COPY feature3_artifacts/ ./feature3_artifacts/
COPY feature5_artifacts/ ./feature5_artifacts/
COPY feature7_artifacts/ ./feature7_artifacts/

EXPOSE 8000

# Lifespan load (main.py:13-16 -> feature_store.py:72-211) is 15-30s (parquet iterrows + joblib).
# start_period prevents restart loop. python:slim has no curl/wget, use python probe.
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

# workers=1: FeatureStore is in-memory singleton. Scale via replicas, not workers. No --reload in prod.
CMD ["uvicorn", "mplads_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
```

Runtime-needed files only (see §5 for exclusion list):
`feature1_fact_work_disbursement_risk.parquet`, `feature2_fact_work_cost_risk.parquet`,
`feature7_mp_composite_risk.parquet`, `feature5_vendor_risk.parquet`,
`feature3_tfidf_lightgbm_classifier.joblib`, `feature3_taxonomy_config.json`,
`feature1_isolation_forest.joblib`, `feature2_lof_model.joblib`, `feature5_isolation_forest.joblib`,
`feature7_kmeans_model.joblib`, `feature7_isolation_forest.joblib`,
+ fallback `shared/.../fact_work_feature7.parquet` (`feature_store.py:76,93,111,158,174,182,191,195,199,203,207`).
Fixes review #1 (COPY flattening), #4 (start_period), #8 (bloat), #10 (workers/reload).

### 3.3 `frontend/Dockerfile`

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . ./
# Vite bakes env at build time. Runtime -e does nothing without rebuild.
ARG VITE_API_URL=http://localhost:5001/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

`frontend/nginx.conf`:
```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
}
```
Note: `App.jsx:51-74` uses hash routing (`routeFromHash`), so `try_files` fallback is optional but harmless and future-proofs a BrowserRouter migration. Fixes review #6.

## 4. .dockerignore

Root `.dockerignore` (repo root context for `ml`):
```
.git/
node_modules/
dist/
__pycache__/
*.pyc
.pytest_cache/
notebooks/
explanations/
*.log
.env
.env.local
.gitignore
# Training-only / unused at runtime (feature_store.py never loads these)
**/*.npy
**/*.png
feature3_artifacts/feature3_hdbscan.joblib
feature3_artifacts/feature3_fact_work_enriched.parquet
feature3_artifacts/feature3_work_categories.parquet
feature3_artifacts/feature3_category_mismatch_worklist.parquet
feature3_artifacts/description_embeddings.npy
feature3_artifacts/feature3_sentence_transformer/
feature3_artifacts/feature3_umap.joblib
# Keep *.parquet + *.joblib + taxonomy json; root *.csv already gitignored
```

`backend/.dockerignore`:
```
node_modules/
npm-debug.log
.git/
.env
coverage/
```

`frontend/.dockerignore`:
```
node_modules/
dist/
.git/
.env.local
```

Fixes review #8 (~70 MB saved: `description_embeddings.npy 55 MB` + `hdbscan 15 MB` + enriched parquet).

## 5. Compose

### 5.1 `docker-compose.yml` (local parity, prod-style images)

```yaml
services:
  mongo:
    image: mongo:7.0
    restart: unless-stopped
    volumes:
      - mongo-data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s

  ml:
    build:
      context: .
      dockerfile: mplads_api/Dockerfile
    expose:
      - "8000"
    ports:
      - "8000:8000"  # local debug only; remove in prod, keep internal
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 2G
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 90s

  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "5001:5001"
    environment:
      NODE_ENV: production
      PORT: 5001
      MONGODB_URI: mongodb://mongo:27017/prahari-ai
      JWT_SECRET: ${JWT_SECRET:?set JWT_SECRET (>=32 chars) in shell/.env}
      JWT_EXPIRES_IN: 7d
      CLIENT_URL: http://localhost:5173
      ML_API_URL: http://ml:8000
      SEED_ADMIN_ON_START: "false"
    depends_on:
      mongo:
        condition: service_healthy
      ml:
        condition: service_healthy
    restart: unless-stopped

  web:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        VITE_API_URL: http://localhost:5001/api
    ports:
      - "5173:80"
    depends_on:
      - api
    restart: unless-stopped

volumes:
  mongo-data:
```

Key corrections vs prior draft:
- `ML_API_URL: http://ml:8000` (service DNS), not `localhost` (`env.js:22`, `mlController.js:4` strips trailing `/`).
- `api` waits for `ml healthy`, not `service_started` – avoids `503` from `mlController.js:11`.
- Only `mongo-data` persists. No artifact bind-mounts in this file.
- `JWT_SECRET` fail-fast (`env.js:3`).

### 5.2 `docker-compose.override.yml` (dev only, auto-loaded locally)

```yaml
services:
  api:
    build:
      target: prod
    command: ["npm", "run", "dev"]
    volumes:
      - ./backend/src:/app/src:ro
    environment:
      NODE_ENV: development
      SEED_ADMIN_ON_START: "true"

  ml:
    volumes:
      - ./mplads_api:/app/mplads_api:ro
    command: ["uvicorn", "mplads_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

  web:
    image: node:20-alpine
    working_dir: /app
    command: ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    depends_on:
      - api
```

Prod deploy uses `docker compose -f docker-compose.yml up --build` (ignores override).

## 6. Env Matrix

| Var | `api` local | `api` prod | `web` build | Source |
|---|---|---|---|---|
| `PORT` | `5001` | `5001` (or platform `$PORT`) | – | `env.js:21` |
| `MONGODB_URI` | `mongodb://mongo:27017/prahari-ai` | Atlas URI (secret) | – | `database.js:5` |
| `JWT_SECRET` | shell `.env` >=32 chars | platform secret | – | `env.js:3,11` |
| `CLIENT_URL` | `http://localhost:5173` | `https://<web-domain>` | – | `app.js:18` CORS |
| `ML_API_URL` | `http://ml:8000` | `https://<ml-internal>` / `http://ml:8000` | – | `env.js:22`, never exposed to browser |
| `VITE_API_URL` | `ARG http://localhost:5001/api` | `ARG https://<api-domain>/api` + rebuild | baked | `services/api.js:1` |
| `SEED_ADMIN_*` | `true` + dev creds (override) | `false` (or one-shot job) | – | `scripts/seedAdmin.js:13-16` |

`.env` (Compose, gitignored) holds only `JWT_SECRET`. All other values are in compose files above.

## 7. Prod Deltas

1. Remove `ml.ports` – keep `expose: ["8000"]` only. Browser never hits ML.
2. Fix `mplads_api/main.py:27-33`: replace `allow_origins=["*"]` with env-driven list (`CLIENT_URL` + web domain). Wildcard + `allow_credentials=True` is rejected by browsers.
3. `mongo` service removed; `MONGODB_URI` points to Atlas. Keep `mongo:7.0` pin locally (Mongoose `8.9.5` compatible).
4. One-off jobs, not boot: `docker compose run --rm api npm run import:data [-- --replace]` (needs `data/` baked, §3.1). `seedAdmin` idempotent (`seedAdmin.js:18-23` `findOne` + `$setOnInsert`) but keep `false` in prod.
5. Resources: `ml` limit `2G`, `api` `512M`, `web` `128M`. `ml` replicas scale horizontally (`workers=1` per replica).

## 8. Build / Verify Runbook

```powershell
# 0. Set secret (PowerShell)
$env:JWT_SECRET = "replace_with_32_plus_char_random_string_for_local_only"

# 1. ML cold start (expect 15-30s FeatureStore load)
docker compose up --build ml
# check http://localhost:8000/health -> {"status":"healthy","works_indexed":...,"classifier_loaded":true}
# check http://localhost:8000/docs

# 2. API + DB
docker compose up --build mongo api
# check http://localhost:5001/api/health -> {"status":"ok"}
# login, then GET /api/ml/dashboard-summary (proxied to ml:8000/dashboard/summary)

# 3. Web
docker compose up --build web
# open http://localhost:5173 -> login -> Works Explorer -> Work Investigation Live ML card

# 4. Clean rebuild
docker compose down -v
docker compose up --build

# 5. Seed/import one-offs
docker compose run --rm api npm run import:data
docker compose run --rm api npm run backfill:progress
```

## 9. Traceability – Review Issues Resolved

1. ML COPY flattening → §3.2 per-dir COPY.
2. Missing `backend/data/` → §3.1 `COPY data/`.
3. `USER node` perms + misleading healthcheck → §3.1 `--chown`, node-fetch probe + `depends_on healthy`.
4. ML restart loop → §3.2 + §5.1 `start_period: 90s`.
5. Frontend port/dev confusion → §3.3 + §5.2 split prod (`80`) vs dev (`5173` HMR).
6. Duplicate `.env.example` → §2 fixed in repo.
7. Image bloat (`*.npy`, hdbscan, enriched parquet) → §4 dockerignore + §3.2 selective set.
8. CORS + public ML exposure → §7 internal-only ML, env-driven origins.
9. Hash-router nginx overstatement + workers/reload → §3.3 note on `App.jsx:51-74`, §3.2 `workers=1` no reload.
