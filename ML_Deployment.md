# ML Layer Deployment Plan — Dockerized FastAPI on Render

**Project:** MPLADS Risk Analytics — Problem Statement 26102  
**Author:** ML Ops Engineer  
**Date:** 2026-09-25 (updated 2026-09-26)  
**Status:** Updated 2026-09-26 (rev 2) - aligned with ML-1 through ML-7 fixes; Dockerfile and render.yaml exist in repo root; doc/code drift from final review (D1-D4) resolved: `.dockerignore` block now matches the real file, parquet load wording corrected to 4-at-startup (5 baked), `MPLADS_ENV` marked optional, dev-default API key rotation warning added + startup WARNING log in `main.py`

---

## Table of Contents

1. [Situation Assessment](#1-situation-assessment)
2. [Architecture Decision — Why Docker is Required](#2-architecture-decision--why-docker-is-required)
3. [Target Deployment Architecture](#3-target-deployment-architecture)
4. [Pre-Deployment Checklist](#4-pre-deployment-checklist)
5. [Step 1 — Verify the Dockerfile](#5-step-1--verify-the-dockerfile)
6. [Step 2 — Verify .dockerignore](#6-step-2--verify-dockerignore)
7. [Step 3 — Verify render.yaml Blueprint](#7-step-3--verify-renderyaml-blueprint)
8. [Step 4 — Configure Environment Variables on Render](#8-step-4--configure-environment-variables-on-render)
9. [Step 5 — Configure the Node.js Backend to Connect](#9-step-5--configure-the-nodejs-backend-to-connect)
10. [Step 6 — Deploy & Validate](#10-step-6--deploy--validate)
11. [Step 7 — Health Monitoring & Alerting](#11-step-7--health-monitoring--alerting)
12. [Seamless Future Update Strategy](#12-seamless-future-update-strategy)
13. [Cost Estimation](#13-cost-estimation)
14. [Risk Register & Mitigations](#14-risk-register--mitigations)
15. [Appendix — Complete File Contents](#15-appendix--complete-file-contents)

---

## 1. Situation Assessment

### What Exists Today

| Component | Status | Location on Render |
|---|---|---|
| **React/Vite Frontend** | ✅ Deployed | Static site (`MPLADS_Risk_Analysis-1`) |
| **Express.js Backend** | ✅ Deployed | Node web service (`MPLADS_Risk_Analysis`), Singapore region |
| **FastAPI ML Service** | ❌ Not deployed | Exists as `mplads_api/` in the repo, fully functional locally |

### What the ML Service Does

The FastAPI app (`mplads_api/`) serves **pre-computed risk scores** and a **live NLP classifier** to the frontend via the Express backend proxy:

| Endpoint | Function | Model/Data |
|---|---|---|
| `POST /nlp/categorize-work` | Live NLP work categorization | TF-IDF + LightGBM classifier (5.84 MB) |
| `POST /score/disbursement-risk` | Work-level disbursement risk lookup | Pre-scored Parquet (9.48 MB) |
| `POST /score/cost-anomaly` | Work-level cost anomaly lookup | Pre-scored Parquet (9.75 MB) |
| `GET /score/vendor-risk/{id}` | Vendor risk lookup | Pre-scored Parquet (0.76 MB) |
| `GET /score/mp-risk/{id}` | MP composite risk scorecard | Pre-scored Parquet (0.15 MB) |
| `GET /score/state-risk/{state}` | State aggregated risk | Computed from MP scorecard |
| `GET /dashboard/summary` | Top-N dashboard + summary stats | In-memory indexes |
| `GET /health` | Service health probe | — |

### How the Backend Already Integrates

The Express backend has a **fully-built reverse proxy** layer:

- **Route:** `app.use('/api/analytics', analyticsRouter)` in [`app.js`](file:///C:/Users/anura/OneDrive/Desktop/MPLADS_Risk_Analysis/backend/src/app.js)
- **Proxy:** [`mlController.js`](file:///C:/Users/anura/OneDrive/Desktop/MPLADS_Risk_Analysis/backend/src/controllers/mlController.js) uses native `fetch()` to forward requests to `FASTAPI_URL`
- **Auth gate:** All `/api/analytics/*` routes require JWT auth + `INTERNAL_ROLES` authorization
- **Graceful fallback:** If `FASTAPI_ENABLED=false`, returns HTTP 503 with a meaningful message

> [!IMPORTANT]
> The integration code is complete. The **only missing piece** is deploying the FastAPI service and setting `FASTAPI_URL` + `FASTAPI_ENABLED=true` on the Express backend.

### Artifact Size Budget

| Category | Size | In Git? | Needed at Serving Time? |
|---|---|---|---|
| Parquet data files copied into the image (4 loaded at startup + 1 fallback: F1 9.48 + F2 9.75 + F5 vendor 0.76 + F7 MP 0.15 = ~20 MB loaded; F7 fallback `fact_work_feature7.parquet` 10.04 = ~30 MB total) | ~30 MB | ✅ Yes | ✅ Yes (4 loaded; fallback read only if F1 missing) |
| Parquet data files NOT loaded (shared intermediates, F3/F5 intermediates, incl. 56 MB embeddings-adjacent npy counted below) | ~70 MB | ✅ Yes | ❌ No |
| Anomaly audit models — 5 Joblib files (F1 3.65 + F2 3.82 + F5 0.89 + F7 iforest 1.30 + F7 kmeans 0.01) | ~10 MB | ✅ Yes | ❌ No - removed from FeatureStore startup in ML-2/ML-7 cleanup; kept in git only |
| NLP classifier (`feature3_tfidf_lightgbm_classifier.joblib`) | ~6 MB | ✅ Yes | ✅ Yes |
| Taxonomy config (`feature3_taxonomy_config.json`) | <0.1 MB | ✅ Yes | ✅ Yes |
| HDBSCAN model (`feature3_hdbscan.joblib`) — training only | ~16 MB | ✅ Yes | ❌ No |
| Embeddings (`description_embeddings.npy`) — training only | ~56 MB | ✅ Yes | ❌ No |
| UMAP reducer (`feature3_umap.joblib`) | ~235 MB | ❌ Gitignored | ❌ No |
| Sentence Transformer weights | ~400 MB | ❌ Gitignored | ❌ No |

> [!NOTE]
> The gitignored files (`feature3_umap.joblib` and `feature3_sentence_transformer/`) are **not needed at serving time**. Additionally, `description_embeddings.npy` (56 MB) and `feature3_hdbscan.joblib` (16 MB) are in git but also **not needed** — the Dockerfile selective COPY plus `.dockerignore` excludes them from the image. The production classifier is the lightweight TF-IDF+LightGBM pipeline (6 MB).

**Runtime image payload: ~36 MB of data/models (30 MB parquet + 6 MB NLP classifier + taxonomy) copied selectively; ~10 MB of unused audit joblibs stay in git but are excluded from the image → Docker image is ~400-550 MB total** (base image + Python deps + runtime artifacts).

---

## 2. Architecture Decision — Why Docker is Required

| Option | Verdict | Reason |
|---|---|---|
| **Render Native Python** | ❌ Rejected | Render's native Python runtime uses `pip install` on a minimal environment. scikit-learn 1.6.1 has strict C-extension build requirements. LightGBM requires `libgomp`. Native builds are fragile and slow (~8 min). |
| **Docker on Render** | ✅ Selected | Full control over OS-level deps (`libgomp1` for LightGBM), deterministic builds, pinned scikit-learn version matches training environment exactly, and Render natively supports Docker web services. |

> [!CAUTION]
> The model artifacts were trained with **scikit-learn==1.6.1**. Loading `.joblib` files with a different scikit-learn version will raise `ModuleNotFoundError` or produce silent wrong results. Docker pins all serving deps exactly (see fully pinned `requirements.txt`; Python 3.11 target).

---

## 3. Target Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        RENDER PLATFORM                          │
│                                                                 │
│  ┌──────────────────────┐     ┌────────────────────────────┐   │
│  │  Static Site          │     │  Node Web Service           │   │
│  │  (React/Vite)         │────▶│  (Express Backend)          │   │
│  │  MPLADS_Risk_         │     │  MPLADS_Risk_Analysis       │   │
│  │  Analysis-1           │     │                             │   │
│  │  Port: N/A (CDN)      │     │  FASTAPI_ENABLED=true       │   │
│  └──────────────────────┘     │  FASTAPI_URL=https://       │   │
│                                │    mplads-ml.onrender.com   │   │
│                                │                             │   │
│                                │  /api/analytics/* ──proxy──▶│   │
│                                └──────────────┬─────────────┘   │
│                                               │                  │
│                                               │ HTTP (internal)  │
│                                               ▼                  │
│                                ┌────────────────────────────┐   │
│                                │  Docker Web Service         │   │
│                                │  (FastAPI ML Service)       │   │
│                                │  mplads-ml                  │   │
│                                │                             │   │
│                                │  Port: 8000                 │   │
│                                │  Health: /health            │   │
│                                │                             │   │
│                                │  Baked into image:            │   │
│                                │  • 5 Parquet fact tables      │   │
│                                │    (F1 + F2 + F5 vendor +     │   │
│                                │     F7 MP + F7 fallback)      │   │
│                                │    4 loaded at startup;       │   │
│                                │    fallback only if F1 absent │   │
│                                │  • 1 Joblib model (NLP clf)   │   │
│                                │  • 1 JSON taxonomy config     │   │
│                                │  • In-memory indexes          │   │
│                                └────────────────────────────┘   │
│                                          Singapore Region        │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Same region (Singapore)** — minimizes inter-service latency between Express ↔ FastAPI
2. **Public URL but proxied access** — Render gives `mplads-ml` a public URL, but the frontend never calls it directly; all browser traffic flows through Express `/api/analytics/*` (JWT plus INTERNAL_ROLES, X-API-Key forwarded). Direct calls without `X-API-Key` return 401 by design.
3. **Startup loading pattern** — 4 Parquet fact tables (F1 work risk, F2 cost risk, F5 vendor, F7 MP) plus the NLP classifier and taxonomy are loaded once during the `lifespan` startup event into dict indexes (frames released via del plus gc.collect; top-20 MPs precomputed). `shared_preprocessing_artifacts/fact_work_feature7.parquet` is baked into the image as a fallback that is read only when the F1 parquet is absent. Subsequent requests are pure dict lookups (sub-millisecond).

---

## 4. Pre-Deployment Checklist

- [ ] Verify `Dockerfile`, `.dockerignore`, `render.yaml`, `requirements.txt`, and the 7 runtime artifacts (5 parquets — 4 loaded at startup plus the F1 fallback — plus NLP classifier plus taxonomy) are committed or staged (Dockerfile plus .dockerignore may still be untracked locally — run `git status --short` and `git add` them per §10a)
- [ ] Confirm `requirements.txt` is fully pinned with == (fastapi, uvicorn, pydantic, pandas, numpy, pyarrow, joblib, scikit-learn==1.6.1, lightgbm, httpx, psutil, pytest) and targets Python 3.11
- [ ] Confirm `.gitignore` excludes `*.csv` plus ONLY training-time artifacts (`feature3_umap.joblib`, `feature3_sentence_transformer/`); shared CSVs stay untracked by design since serving uses parquet
- [ ] Ensure the repo is pushed to the Git provider connected to Render (GitHub/GitLab)
- [ ] Have Render dashboard access with permission to create new services

### Verify Artifacts Are Tracked

Run this locally to confirm all required files are tracked by git:

```bash
# All these should return the filename (tracked), not empty (untracked)
git ls-files Dockerfile .dockerignore render.yaml requirements.txt
git ls-files feature3_artifacts/feature3_tfidf_lightgbm_classifier.joblib
git ls-files feature3_artifacts/feature3_taxonomy_config.json
git ls-files feature7_artifacts/feature7_mp_composite_risk.parquet
git ls-files feature5_artifacts/feature5_vendor_risk.parquet
git ls-files feature1_artifacts/feature1_fact_work_disbursement_risk.parquet
git ls-files feature2_artifacts/feature2_fact_work_cost_risk.parquet
git ls-files shared_preprocessing_artifacts/fact_work_feature7.parquet
```

---

## 5. Step 1 — Verify the Dockerfile

`Dockerfile` already exists in the repo root. Verify its contents match below (selective per-file COPY, no whole-directory artifact copy):

```dockerfile
# ──────────────────────────────────────────────────────────────────
# MPLADS Risk Analytics — FastAPI ML Service
# Multi-stage build for minimal production image
# ──────────────────────────────────────────────────────────────────

# Stage 1: Build dependencies in a full image
FROM python:3.11-slim AS builder

# libgomp is required at runtime by LightGBM for OpenMP parallelism.
# Build-essential is needed to compile any wheels without prebuilt binaries.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        libgomp1 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Install Python dependencies into a virtual env for clean copy
COPY requirements.txt .
RUN python -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir --upgrade pip && \
    /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

# ──────────────────────────────────────────────────────────────────
# Stage 2: Production image (no build tools)
FROM python:3.11-slim AS production

# Runtime dependency: libgomp for LightGBM OpenMP threading, curl for HEALTHCHECK
RUN apt-get update && \
    apt-get install -y --no-install-recommends libgomp1 curl && \
    rm -rf /var/lib/apt/lists/*

# Copy the virtual env from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

# Create non-root user for security
RUN groupadd --gid 1001 appuser && \
    useradd --uid 1001 --gid appuser --shell /bin/bash appuser

WORKDIR /app

# Copy ML service code
COPY mplads_api/ ./mplads_api/

# Copy only the runtime-required artifacts (selective per-file COPY)
COPY shared_preprocessing_artifacts/fact_work_feature7.parquet ./shared_preprocessing_artifacts/fact_work_feature7.parquet
COPY feature1_artifacts/feature1_fact_work_disbursement_risk.parquet ./feature1_artifacts/feature1_fact_work_disbursement_risk.parquet
COPY feature2_artifacts/feature2_fact_work_cost_risk.parquet ./feature2_artifacts/feature2_fact_work_cost_risk.parquet
COPY feature3_artifacts/feature3_tfidf_lightgbm_classifier.joblib ./feature3_artifacts/feature3_tfidf_lightgbm_classifier.joblib
COPY feature3_artifacts/feature3_taxonomy_config.json ./feature3_artifacts/feature3_taxonomy_config.json
COPY feature5_artifacts/feature5_vendor_risk.parquet ./feature5_artifacts/feature5_vendor_risk.parquet
COPY feature7_artifacts/feature7_mp_composite_risk.parquet ./feature7_artifacts/feature7_mp_composite_risk.parquet

# Copy requirements.txt for metadata
COPY requirements.txt .

# Switch to non-root
USER appuser

# Expose the port uvicorn will bind to
EXPOSE 8000

# Health check for local docker runs (Render uses healthCheckPath: /health instead)
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Start uvicorn — Render sets $PORT, we default to 8000
CMD ["sh", "-c", "uvicorn mplads_api.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --timeout-keep-alive 120"]
```

### Why These Specific Choices

| Decision | Rationale |
|---|---|
| **`python:3.11-slim`** | Slim base (~50 MB) but includes glibc needed by numpy/scikit-learn. Alpine would fail on compiled wheels. |
| **Multi-stage build** | Build stage has `build-essential` (~200 MB); production stage drops it, saving image size. |
| **`--workers 1`** | Each worker holds ~60-100 MB of in-memory indexes (double-keyed work_index) plus the ~20 MB of parquets read at startup (~36 MB total artifacts baked into the image). One worker fits comfortably in 512 MB; two would risk OOM. Uses precomputed mp_top20 so no per-request sort. |
| **`--timeout-keep-alive 120`** | Prevents Render's load balancer from dropping the connection on cold-start when loading artifacts (~15-30 sec). |
| **`start-period=90s`** | Gives the FeatureStore 90 seconds to load the 4 startup parquets plus the NLP classifier before health checks start failing. Render uses healthCheckPath /health, not this Dockerfile HEALTHCHECK. |
| **Non-root user** | Security best practice; prevents container escape attacks. |
| **`${PORT:-8000}`** | Render injects `$PORT` at runtime; this respects it while defaulting to 8000 for local dev. |
| **Docker `HEALTHCHECK`** | Used for local `docker run` and non-Render orchestrators. **Render ignores it** and uses `healthCheckPath: /health` from `render.yaml` instead. Both probe the same endpoint, so they are consistent. |

---

## 6. Step 2 — Verify .dockerignore

`.dockerignore` already exists in the repo root. Verify its contents match below (this block mirrors the real file exactly; global `*.csv` / `*.png` patterns are safe because every runtime artifact is `.parquet`, `.joblib`, or `.json`, and the tiny `*_run_metadata.json` files are never read by `FeatureStore.load_all` so they are not worth excluding):

```dockerignore
# Node.js and frontend stay out of the ML image
backend/
frontend/
node_modules/

# Training-only model artifacts (stay in git, never enter the image)
feature3_artifacts/feature3_umap.joblib
feature3_artifacts/feature3_sentence_transformer/
feature3_artifacts/description_embeddings.npy
feature3_artifacts/feature3_hdbscan.joblib

# Intermediate parquets not read by FeatureStore.load_all
feature3_artifacts/feature3_fact_work_enriched.parquet
feature3_artifacts/feature3_work_categories.parquet
feature3_artifacts/feature3_category_mismatch_worklist.parquet
feature5_artifacts/feature5_fact_work_vendor_risk.parquet
shared_preprocessing_artifacts/fact_work.parquet
shared_preprocessing_artifacts/fact_work_feature1.parquet
shared_preprocessing_artifacts/fact_work_feature2.parquet
shared_preprocessing_artifacts/fact_work_feature3.parquet
shared_preprocessing_artifacts/fact_work_feature5.parquet
shared_preprocessing_artifacts/fact_work_vendor.parquet
shared_preprocessing_artifacts/fact_calamity.parquet
shared_preprocessing_artifacts/fact_expenditure.parquet
shared_preprocessing_artifacts/fact_expenditure_rollup.parquet
shared_preprocessing_artifacts/fact_work_quarantine.parquet
shared_preprocessing_artifacts/dim_mp.parquet
shared_preprocessing_artifacts/state_wise_summary.parquet
shared_preprocessing_artifacts/vendor_resolution_table.parquet

# Unused audit models (kept in git, not loaded since ML-2 cleanup)
feature1_artifacts/feature1_isolation_forest.joblib
feature2_artifacts/feature2_lof_model.joblib
feature5_artifacts/feature5_isolation_forest.joblib
feature7_artifacts/feature7_isolation_forest.joblib
feature7_artifacts/feature7_kmeans_model.joblib

# Notebooks
notebooks/

# Git and docs
.git/
.gitignore
.github/
*.md
render.yaml

# Python caches
__pycache__/
*.pyc
.pytest_cache/

# Env and OS files
.env
.env.*
.DS_Store
Thumbs.db

# CSVs (parquet is the serving format; gitignore already excludes *.csv)
*.csv

# Visualizations
*.png
```

> [!TIP]
> This `.dockerignore` plus selective COPY keeps the Docker build context and image lean (~36 MB runtime payload) by excluding the Node.js backend, frontend, notebooks, CSVs, training-only artifacts (`description_embeddings.npy`, `feature3_hdbscan.joblib`, intermediate Parquets), and visualization PNGs. Only the `mplads_api/` code, `requirements.txt`, and the **runtime-required** Parquet/Joblib/JSON artifact files are sent to the Docker daemon.

---

## 7. Step 3 — Verify render.yaml Blueprint

`render.yaml` in the repo root must match below (already updated to add `mplads-ml`, remove the PORT override, and use `sync: false` secrets):

```yaml
# Render Blueprint — Express API, React/Vite Frontend, FastAPI ML Service
# Enter all `sync: false` values in the Render dashboard when creating or syncing.
services:
  # ──────────────────────────────────────────────
  # 1. Express.js Backend (Node.js Web Service)
  # ──────────────────────────────────────────────
  - type: web
    name: MPLADS_Risk_Analysis
    runtime: node
    region: singapore
    rootDir: backend
    buildCommand: npm install
    startCommand: npm run start
    healthCheckPath: /api/health
    autoDeployTrigger: commit
    envVars:
      - key: NODE_VERSION
        value: "20"
      - key: NODE_ENV
        value: "production"
      - key: MONGODB_URI
        sync: false
      - key: JWT_SECRET
        sync: false
      - key: JWT_EXPIRES_IN
        value: "7d"
      - key: CLIENT_URL
        sync: false
      - key: SEED_ADMIN_ON_START
        value: "false"
      # ── FastAPI ML Service Integration ──
      - key: FASTAPI_ENABLED
        value: "true"
      - key: FASTAPI_URL
        sync: false   # Set to https://mplads-ml.onrender.com in dashboard
      - key: MPLADS_API_KEY
        sync: false   # same strong random value as on mplads-ml

  # ──────────────────────────────────────────────
  # 2. React/Vite Frontend (Static Site)
  # ──────────────────────────────────────────────
  - type: web
    name: MPLADS_Risk_Analysis-1
    runtime: static
    rootDir: frontend
    buildCommand: npm install && npm run build
    staticPublishPath: dist
    autoDeployTrigger: commit
    envVars:
      - key: VITE_API_URL
        sync: false

  # ──────────────────────────────────────────────
  # 3. FastAPI ML Service (Docker Web Service)
  # ──────────────────────────────────────────────
  - type: web
    name: mplads-ml
    runtime: docker
    region: singapore
    dockerfilePath: ./Dockerfile
    dockerContext: .
    healthCheckPath: /health
    plan: starter            # 512 MB RAM, 0.5 vCPU — sufficient for serving
    autoDeployTrigger: commit
    envVars:
      - key: MPLADS_API_KEY
        sync: false   # set a strong random value in the dashboard on both services
      - key: PYTHONUNBUFFERED
        value: "1"
```

### What Changed from the Original

| Change | Detail |
|---|---|
| `FASTAPI_ENABLED` flipped to `"true"` | Was `"false"` — enables the proxy in Express |
| `FASTAPI_URL` added | Points Express at the new ML service's Render URL |
| **New service block** added | `mplads-ml` — Docker web service for FastAPI |
| **Same region** | Both Express and FastAPI in `singapore` for minimal latency |
| **`starter` plan** | 512 MB RAM, adequate for ~60-100 MB of in-memory indexes plus Python overhead (precomputed mp_top20, frames released with del plus gc.collect) |

> [!WARNING]
> The `plan: starter` ($7/month) is the minimum paid tier with enough RAM. The free tier has 512 MB too, but spins down after 15 minutes of inactivity — causing 30-60 second cold starts where the FeatureStore reloads all artifacts. For production use, `starter` or higher is recommended.

---

## 8. Step 4 — Configure Environment Variables on Render

After deploying the blueprint, set these values **manually** in the Render dashboard (marked `sync: false`):

### On `MPLADS_Risk_Analysis` (Express Backend)

| Variable | Value |
|---|---|
| `FASTAPI_URL` | `https://mplads-ml.onrender.com` (the URL Render assigns to the ML service) |
| `MPLADS_API_KEY` | strong random value via `sync: false`, identical on both services (code default `mpladsAPI123` is dev-only) |
| `MONGODB_URI` | *(keep existing value)* |
| `JWT_SECRET` | *(keep existing value)* |
| `CLIENT_URL` | *(keep existing value — your frontend URL)* |

### On `mplads-ml` (FastAPI ML Service)

| Variable | Value |
|---|---|
| `MPLADS_API_KEY` | **New** strong random value via `sync: false`, identical on both services — see warning below |
| `MPLADS_ENV` | *Optional.* Only needed for explicitness; its absence already means auth-enforced (see NOTE) |
| `PYTHONUNBUFFERED` | `1` (ensures logs stream in real-time to Render's log viewer) |

> [!WARNING]
> **Do not reuse `mpladsAPI123` in production.** The old `render.yaml` committed the literal value `mpladsAPI123` as `MPLADS_API_KEY`, so that string is permanently public in this repo's git history. `config.py` falls back to that default when `MPLADS_API_KEY` is unset, which would silently leave the service protected only by a publicly known key. Generate a fresh secret (e.g. `python -c "import secrets; print(secrets.token_urlsafe(32))"`) and set it via `sync: false` on **both** services. `main.py` now logs a startup `WARNING` if the service boots in non-development mode while still using the dev default, and §10c includes a verification curl for it.

> [!NOTE]
> `MPLADS_ENV` is absent in `render.yaml` by design: production defaults to enforced auth (no escape hatch). Only set `MPLADS_ENV=development` locally for tests. `verify_api_key` in `security.py` now **enforces** auth: it raises `HTTPException(401)` on a missing/wrong `X-API-Key` and `500` if no key is configured. `mlController.js` forwards `X-API-Key` on every proxied call. The key must be **identical** on both services; the default in code/env templates is `mpladsAPI123` (dev-only, must be rotated — see warning above).

---

## 9. Step 5 — Configure the Node.js Backend to Connect

The Express backend is **already fully configured** to proxy to FastAPI. No code changes are needed. The integration flow is:

```
Frontend                Express Backend              FastAPI ML Service
  │                        │                             │
  │  GET /api/analytics/   │  JWT plus INTERNAL_ROLES     │
  │  dashboard-summary    │  X-API-Key forwarded          │
  │───────────────────────▶│                             │
  │                        │  GET /dashboard/summary     │
  │                        │  X-API-Key: MPLADS_API_KEY    │
  │                        │────────────────────────────▶│
  │                        │                             │
  │                        │◀────────────────────────────│
  │                        │  200 OK { composite_risk..} │
  │◀───────────────────────│                             │
  │  200 OK (proxied JSON) │                             │
```

The proxy already forwards `X-API-Key` (ML-1 fix) and requires JWT plus INTERNAL_ROLES on `/api/analytics/*`. The only action required is setting `FASTAPI_ENABLED=true`, `FASTAPI_URL` (two-step: deploy `mplads-ml` first, then paste its URL), and matching `MPLADS_API_KEY` (`sync: false`) on both services, which the updated `render.yaml` already declares. Note: use `/api/analytics/dashboard-summary` on Express (it maps to FastAPI `/dashboard/summary`), and URL-encode MP identifiers because ambiguous names return 400 plus candidates.

---

## 10. Step 6 — Deploy & Validate

### 6a. Commit & Push

```bash
# Stage the new files
git add Dockerfile .dockerignore render.yaml

# Commit with a descriptive message
git commit -m "deploy: Add Docker config for FastAPI ML service on Render

- Dockerfile: multi-stage Python 3.11-slim build with libgomp for LightGBM
- .dockerignore: excludes Node.js, frontend, notebooks, training artifacts
- render.yaml: adds mplads-ml Docker web service in Singapore region
- Enables FASTAPI_ENABLED=true on Express backend"

# Push to trigger auto-deploy
git push origin main
```

### 6b. Monitor the Build on Render

1. Go to **Render Dashboard** → **mplads-ml** service
2. Watch the build logs. Expected timeline:
   - Docker image build: ~3–5 minutes (first build; cached afterward)
   - Artifact copy into image: ~30 seconds
   - Startup / FeatureStore load: ~15–30 seconds
3. Health check at `/health` should turn green within 90 seconds of container start (Docker HEALTHCHECK start-period is 90s to cover parquet plus classifier load)

### 6c. Validation Test Suite

Run these curl commands against the deployed ML service URL:

```bash
ML_URL="https://mplads-ml.onrender.com"
API_KEY="<your MPLADS_API_KEY from the Render dashboard>"

# 1. Health check (public, no key needed)
curl -s "$ML_URL/health" | python -m json.tool
# Expected: {"status":"healthy","works_indexed":>0,"mps_indexed":>0,...}

# 2. NLP categorization (live inference)
curl -s -X POST "$ML_URL/nlp/categorize-work" -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"description":"Construction of PCC road in village","declared_category":"Normal/Others"}' \
  | python -m json.tool
# Expected: {"category_nlp":"Road & Pathway Infrastructure","confidence":>0.5,...}

# 3. MP risk lookup
curl -s "$ML_URL/score/mp-risk/RS_KARTIKEYA%20SHARMA" -H "X-API-Key: $API_KEY" | python -m json.tool
# Expected: {"mp_key":"RS_KARTIKEYA SHARMA","composite_risk_score":...}

# 4. State risk aggregation
curl -s "$ML_URL/score/state-risk/JHARKHAND" -H "X-API-Key: $API_KEY" | python -m json.tool
# Expected: {"state":"Jharkhand","mp_count":>0,...}

# 5. Key rotation check — the leaked dev default MUST be rejected
curl -s -o /dev/null -w "%{http_code}\n" "$ML_URL/dashboard/summary" -H "X-API-Key: mpladsAPI123"
# Expected: 401 (if 200, the dashboard MPLADS_API_KEY was never rotated — fix immediately)

# 6. Missing key rejected
curl -s -o /dev/null -w "%{http_code}\n" "$ML_URL/dashboard/summary"
# Expected: 401
```

### 6d. End-to-End Validation via Express Proxy

```bash
BACKEND_URL="https://your-express-backend.onrender.com"
TOKEN="<your-jwt-token>"

# Proxied health check (Express JWT required; ML /health itself is public)
curl -s "$BACKEND_URL/api/analytics/health" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
# Expected: {"status":"healthy",...} relayed from FastAPI /health

# Proxied NLP categorization
curl -s -X POST "$BACKEND_URL/api/analytics/categorize-work" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"Installation of solar street lights"}' \
  | python -m json.tool
```

---

## 11. Step 7 — Health Monitoring & Alerting

### Render Built-in Monitoring

- **Health check path:** `/health` — Render pings this every 30 seconds. If 3 consecutive checks fail, the service is restarted.
- **Logs:** Available in Render dashboard under the service's "Logs" tab. `PYTHONUNBUFFERED=1` ensures real-time streaming.

### Recommended: Add a Startup Log Banner

The existing `lifespan` function in [`main.py`](file:///C:/Users/anura/OneDrive/Desktop/MPLADS_Risk_Analysis/mplads_api/main.py) already logs startup/shutdown. The FeatureStore logs the count of indexed records. Additionally, `lifespan` now emits a `WARNING` at boot when the service runs outside `MPLADS_ENV=development` while still using the publicly-known dev-default API key — visible in Render's log streamer as a guardrail against the forgotten `sync: false` rotation. This is sufficient for monitoring.

### Optional: Express-Side Health Relay

The Express backend already exposes `GET /api/analytics/health` which proxies to FastAPI's `/health`. The frontend can call this to show an ML service status indicator in the dashboard.

---

## 12. Seamless Future Update Strategy

This is the critical section for **handling future ML updates without downtime**.

### Update Type 1: Re-scored Artifacts (Most Common)

**Scenario:** Re-run notebooks with updated data → new Parquet/Joblib files.

**Process:**
1. Replace artifact files locally (e.g., new `feature7_mp_composite_risk.parquet`)
2. Commit and push:
   ```bash
   git add feature1_artifacts/feature1_fact_work_disbursement_risk.parquet feature2_artifacts/feature2_fact_work_cost_risk.parquet feature5_artifacts/feature5_vendor_risk.parquet feature7_artifacts/feature7_mp_composite_risk.parquet shared_preprocessing_artifacts/fact_work_feature7.parquet feature3_artifacts/feature3_tfidf_lightgbm_classifier.joblib feature3_artifacts/feature3_taxonomy_config.json
   git commit -m "data: Re-score with September 2026 data refresh"
   git push origin main
   ```
3. Render auto-deploys the Docker service. The new image contains the updated artifacts.
4. Render performs a **zero-downtime rolling deploy** — the old container serves traffic until the new one passes health checks.

> [!TIP]
> This is the beauty of the architecture: because artifacts are baked into the Docker image at build time and loaded into RAM at startup, updating data is just a `git push`. No database migrations, no file uploads, no manual steps.

### Update Type 2: New API Endpoints

**Scenario:** Feature 4 (Duplicate Detection) or Feature 6 (Process Delay) is implemented.

**Process:**
1. Add new router file (e.g., `mplads_api/routers/duplicate.py`)
2. Add new schema file (e.g., `mplads_api/schemas/duplicate.py`)
3. Register the router in [`main.py`](file:///C:/Users/anura/OneDrive/Desktop/MPLADS_Risk_Analysis/mplads_api/main.py):
   ```python
   from mplads_api.routers import duplicate
   app.include_router(duplicate.router)
   ```
4. Add the corresponding proxy endpoint in Express's `mlController.js` and `mlRoutes.js` (forward `X-API-Key`; keep JWT plus INTERNAL_ROLES)
5. Commit, push → auto-deploy

### Update Type 3: Model Retraining (scikit-learn version change)

**Scenario:** Retrained models with a newer scikit-learn version.

**Process:**
1. Update `requirements.txt` to the new version:
   ```
   scikit-learn==1.7.0  # Updated from 1.6.1
   ```
2. Re-train and re-export all `.joblib` files with the new version
3. Commit all updated joblib files + `requirements.txt`
4. Push → Docker rebuilds with the new scikit-learn → auto-deploy

> [!CAUTION]
> **Never update `requirements.txt` without re-exporting ALL joblib files.** Joblib serialization includes the scikit-learn version in the pickle metadata. Version mismatches will crash at load time.

### Update Type 4: Python Dependency Changes

**Scenario:** Add a new library (e.g., `sentence-transformers` for live embedding inference).

**Process:**
1. Add to `requirements.txt`
2. If the new library requires system packages (e.g., `libblas`), update the `apt-get install` line in the Dockerfile
3. Push → full Docker rebuild → auto-deploy

### Update Type 5: Infrastructure Scaling

**Scenario:** Data volume grows, need more RAM or workers.

**Process:**
1. Update `render.yaml`:
   ```yaml
   plan: standard   # Upgraded from starter (1 GB RAM, 1 vCPU)
   ```
2. Optionally increase workers in the Dockerfile CMD:
   ```dockerfile
   CMD ["sh", "-c", "uvicorn mplads_api.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2"]
   ```
3. Push → Render applies the new plan on next deploy

### Version Tagging Strategy

Tag each deployment for rollback capability:

```bash
git tag -a ml-v1.0.0 -m "Initial ML deployment with F1/F2/F3/F5/F7 scoring"
git push origin ml-v1.0.0

# After a data refresh:
git tag -a ml-v1.1.0 -m "Data refresh: September 2026 MPLADS portal data"
git push origin ml-v1.1.0
```

To rollback on Render: go to the service dashboard → "Manual Deploy" → select a previous commit.

---

## 13. Cost Estimation

| Service | Plan | Monthly Cost | RAM | Notes |
|---|---|---|---|---|
| Express Backend | Starter | $7/month | 512 MB | Already deployed |
| React Frontend | Static (Free) | $0/month | N/A | CDN-served |
| **FastAPI ML Service** | **Starter** | **$7/month** | **512 MB** | New service |
| **FastAPI ML Service** | Free | $0/month | 512 MB | Spins down after 15 min inactivity |
| | | | | |
| **Total (with Starter ML)** | | **$14/month** | | |
| **Total (with Free ML)** | | **$7/month** | | Cold starts on ML endpoints |

> [!NOTE]
> The free tier is viable for demo/staging environments. The Starter tier ($7/month) eliminates cold starts and is recommended for production. The Standard tier ($25/month, 1 GB RAM) would be needed if in-memory indexes grow past ~300 MB or you want 2+ workers.

---

## 14. Risk Register & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **OOM on Starter plan** | Low | Service crash | Monitor memory via Render metrics. Runtime payload is ~36 MB on disk; in-memory indexes are ~60-100 MB plus Python overhead, total well under 512 MB (startup log reports rss=...MB via psutil). If OOM, upgrade to Standard plan. |
| **Cold start on free tier** | High (if free) | 30-60s latency on first request | Use Starter plan for production. Or add a cron job to ping `/health` every 10 minutes. |
| **scikit-learn version mismatch** | Medium | Model load failure | `requirements.txt` is fully pinned (scikit-learn==1.6.1 plus all serving deps). Never change without re-exporting ALL joblibs and re-running tests. |
| **Git repo too large** | Low | Slow clones | Current tracked artifacts are ~110 MB parquet plus ~31 MB joblib plus ~72 MB training-only npy/HDBSCAN in git (gitignored UMAP/transformer excluded). If they grow past 500 MB, switch to Git LFS for `.parquet` and `.joblib` files. |
| **CORS issues** | Very Low | API errors | FastAPI currently sets `allow_origins=["*"]` with credentials (ML-5, skipped as non-severe). Express is the only caller via server-side fetch, so no browser CORS is involved. |
| **Secret exposure** | Low | Security breach | `MPLADS_API_KEY` uses `sync: false` on both services (dashboard-set, encrypted); the Docker image contains no secret. Code default `mpladsAPI123` is dev-only. Prod auth is enforced (401/500) with an `MPLADS_ENV=development` escape hatch for local tests. |
| **Render service URL changes** | Very Low | Integration break | URL is stable once created. If renamed, update `FASTAPI_URL` in Express's env vars. Deploy order: create `mplads-ml` first, then set `FASTAPI_URL` on Express and enable `FASTAPI_ENABLED=true`. |

---

## 15. Appendix — Complete File Contents

### Files Created

| File | Path | Status |
|---|---|---|
| `Dockerfile` | `./Dockerfile` | **Created** - selective COPY of 5 parquets (4 loaded at startup + 1 fallback) plus NLP classifier and taxonomy (contents in Step 1) |
| `.dockerignore` | `./.dockerignore` | **Created** - excludes intermediates, unused audit joblibs, CSVs, PNGs (contents in Step 2) |
| `render.yaml` | `./render.yaml` | **Replaced** - adds `mplads-ml` Docker service, no PORT override, `sync: false` API key (contents in Step 3) |

### Files That Require NO Changes

| File | Reason |
|---|---|
| `mplads_api/main.py` | Already has lifespan, CORS, all routers |
| `mplads_api/config.py` | Uses relative `Path(__file__)` — works in Docker |
| `mplads_api/core/feature_store.py` | Loads from relative paths that match Docker COPY layout |
| `backend/src/controllers/mlController.js` | Proxy already built and tested |
| `backend/src/routes/mlRoutes.js` | Routes already wired |
| `backend/src/config/env.js` | Reads `FASTAPI_URL`, `FASTAPI_ENABLED`, and `MPLADS_API_KEY` from env vars |
| `requirements.txt` | Fully pinned with == including `psutil==6.1.0` for RSS logging; Python 3.11 target |

### Docker Build & Test Commands (Local Verification)

```bash
# Build locally
docker build -t mplads-ml:latest .

# Run locally (maps to port 8000)
docker run --rm -p 8000:8000 -e MPLADS_API_KEY=dev-local-key -e MPLADS_ENV=production --name mplads-ml mplads-ml:latest

# Test health endpoint (public on ML service)
curl http://localhost:8000/health

# Test authed endpoint (401 without key, 200 with key)
curl -H "X-API-Key: dev-local-key" http://localhost:8000/dashboard/summary | python -m json.tool

# Check image size
docker images mplads-ml:latest --format "{{.Size}}"

# Check container memory usage
docker stats mplads-ml --no-stream --format "{{.MemUsage}}"
```

### Quick Summary: Three Commands to Deploy

```bash
# 1. Files already exist — verify, then commit if untracked
git status --short
# Expected: Dockerfile, .dockerignore present; render.yaml modified

# 2. Commit and push
git add Dockerfile .dockerignore render.yaml ML_Deployment.md
git commit -m "deploy: Dockerize and deploy FastAPI ML service on Render"
git push origin main

# 3. Two-step wiring: deploy mplads-ml first, then set FASTAPI_URL
#    on the Express service in the Render dashboard, keeping the
#    same MPLADS_API_KEY (sync: false) on both services.
#    → https://mplads-ml.onrender.com (URL assigned by Render after deploy)
```

---

> **End of Deployment Plan.** All steps above are concrete, copy-pasteable, and designed so that future updates to the ML layer require only `git push` — no manual infrastructure changes.
