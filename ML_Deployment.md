# ML Layer Deployment Plan --- Dockerized FastAPI on AWS EC2

**Project:** MPLADS Risk Analytics --- Problem Statement 26102\
**Author:** ML Ops Engineer\
**Date:** 2026-09-26\
**Status:** Deployment target revised after local Docker validation.
Docker packaging is validated; Render deployment is blocked by measured
runtime memory usage. AWS EC2 is now the selected ML hosting target.

------------------------------------------------------------------------

## Table of Contents

1.  [Situation Assessment](#1-situation-assessment)
2.  [Architecture Decision](#2-architecture-decision)
3.  [Target Deployment Architecture](#3-target-deployment-architecture)
4.  [Pre-Deployment Checklist](#4-pre-deployment-checklist)
5.  [Step 1 --- Verify the Dockerfile](#5-step-1--verify-the-dockerfile)
6.  [Step 2 --- Verify .dockerignore](#6-step-2--verify-dockerignore)
7.  [Step 3 --- Local Docker Build &
    Validation](#7-step-3--local-docker-build--validation)
8.  [Step 4 --- Render Memory Blocker and Deployment
    Decision](#8-step-4--render-memory-blocker-and-deployment-decision)
9.  [Step 5 --- AWS EC2 Deployment
    Requirements](#9-step-5--aws-ec2-deployment-requirements)
10. [Step 6 --- Backend Integration
    Requirements](#10-step-6--backend-integration-requirements)
11. [Step 7 --- Production Validation
    Requirements](#11-step-7--production-validation-requirements)
12. [Future Update and Operations
    Strategy](#12-future-update-and-operations-strategy)
13. [Cost / Free-Plan Constraint](#13-cost--free-plan-constraint)
14. [Risk Register](#14-risk-register)
15. [Appendix --- Local Docker Test
    Commands](#15-appendix--local-docker-test-commands)

------------------------------------------------------------------------

## 1. Situation Assessment

### Current system

  ----------------------------------------------------------------------------
  Component               Status                  Hosting
  ----------------------- ----------------------- ----------------------------
  React/Vite Frontend     Deployed                Render Static Site
                                                  (`MPLADS_Risk_Analysis-1`)

  Express.js Backend      Deployed                Render Node Web Service
                                                  (`MPLADS_Risk_Analysis`)

  FastAPI ML Service      Docker image built and  **Target changed from Render
                          validated locally; not  to AWS EC2**
                          yet cloud-deployed      
  ----------------------------------------------------------------------------

The Express backend already contains the reverse-proxy integration for
the ML API. It reads `FASTAPI_URL`, forwards `X-API-Key`, and supports
`FASTAPI_ENABLED`. No frontend-to-ML direct connection is required.

### Runtime service

The FastAPI application continues to serve:

  Endpoint                          Purpose
  --------------------------------- ------------------------------
  `POST /nlp/categorize-work`       Live NLP work categorization
  `POST /score/disbursement-risk`   Disbursement risk lookup
  `POST /score/cost-anomaly`        Cost anomaly lookup
  `GET /score/vendor-risk/{id}`     Vendor risk lookup
  `GET /score/mp-risk/{id}`         MP composite risk
  `GET /score/state-risk/{state}`   State aggregate risk
  `GET /dashboard/summary`          Dashboard summary
  `GET /health`                     Health probe

------------------------------------------------------------------------

## 2. Architecture Decision

### Docker remains the packaging/runtime standard

The decision to use Docker is unchanged. The image uses Python 3.11,
pinned Python dependencies, `libgomp1` for LightGBM, a non-root runtime
user, selective artifact copying, and one Uvicorn worker.

### Hosting decision changed after real measurement

The original plan targeted a Render Docker Web Service. Local
production-equivalent testing showed that the application requires
substantially more memory than the original estimate.

**Observed local results:**

-   Docker image built successfully:
    `docker build -t mplads-ml:latest .`
-   FastAPI startup completed successfully.
-   FeatureStore indexed **86,300 work records**, **774 MP scorecards**,
    and **9,170 vendor risk records**.
-   NLP TF-IDF + LightGBM classifier loaded successfully.
-   Startup application log reported approximately **826 MB RSS** during
    loading.
-   Steady Docker measurement:
    -   `docker stats mplads-ml --no-stream`
    -   **710.3 MiB / 3.71 GiB**
-   `/health` returned HTTP 200.
-   Authenticated `/dashboard/summary` returned valid JSON when
    `X-API-Key: dev-local-key` was supplied.
-   Requests without the correct API key returned HTTP 401 as intended.

### Render blocker

The intended Render Free service provides **512 MB RAM**. The measured
steady-state container usage is approximately **710 MiB**, already above
that limit before allowing for future model/data growth or transient
memory spikes.

Therefore:

> **Do not deploy the ML Docker service to Render Free. Do not modify
> the ML code merely to fit the Render Free memory ceiling.**

The frontend and Express backend remain on Render. Only the ML Docker
service moves to AWS EC2.

------------------------------------------------------------------------

## 3. Target Deployment Architecture

``` text
┌───────────────────────────────────────────────────────────────┐
│                         RENDER                                │
│                                                               │
│  React/Vite Static Site                                      │
│          │                                                    │
│          ▼                                                    │
│  Express Backend                                              │
│  MPLADS_Risk_Analysis                                        │
│  FASTAPI_ENABLED=true                                        │
│  FASTAPI_URL=<AWS ML API HTTPS URL>                           │
│  MPLADS_API_KEY=<production secret>                           │
└──────────┬────────────────────────────────────────────────────┘
           │ HTTPS
           │ X-API-Key
           ▼
┌───────────────────────────────────────────────────────────────┐
│                     AWS EC2                                   │
│                                                               │
│  Selected instance: c7i-flex.large                            │
│  Architecture: x86-64                                        │
│  vCPU: 2                                                     │
│  Memory: 4 GiB                                               │
│                                                               │
│  Docker Engine                                               │
│       └── mplads-ml container                                 │
│             └── FastAPI / Uvicorn                             │
│                 Port 8000 internally                          │
│                 Health endpoint: /health                      │
└───────────────────────────────────────────────────────────────┘
```

### Selected EC2 instance

**Instance type: `c7i-flex.large`**

AWS currently lists `c7i-flex.large` as Free Tier eligible for eligible
newer AWS accounts. The instance provides **2 vCPU and 4 GiB memory** on
x86 architecture.

Reasons for selecting it:

1.  **Memory headroom:** current container steady usage is \~710 MiB; 4
    GiB leaves substantial room for the OS, Docker, startup spikes,
    larger Parquet indexes, and future model/data updates.
2.  **x86 compatibility:** matches the current Docker development/build
    architecture and avoids introducing ARM compatibility work.
3.  **Future growth:** preferable to a 2 GiB instance for this project
    because future ML artifacts and indexes are expected to increase.
4.  **Current account eligibility:** AWS console shows this instance as
    Free Tier eligible for the account.

### AWS account constraint

At the time of this revision, the AWS account reports:

-   **Account plan:** Free Plan
-   **Credits remaining:** **\$68.38 USD**
-   **Free Plan time remaining:** **126 days**
-   AWS account message: the Free Plan account does not get charged;
    credits cover Free Plan costs, and free access ends when the Free
    Plan expires or credits are depleted.

This is **not a permanently free EC2 deployment**. The instance consumes
the account's promotional credits. The engineer must design the
deployment so the account remains on the AWS **Free Plan** and must not
assume continued hosting after the remaining credits/time expire.

------------------------------------------------------------------------

## 4. Pre-Deployment Checklist

### Docker/application --- already validated

-   [x] Docker Engine works locally.
-   [x] Required runtime artifacts exist.
-   [x] Docker image builds successfully.
-   [x] FastAPI container starts successfully.
-   [x] `/health` returns HTTP 200.
-   [x] API-key authentication works.
-   [x] `/dashboard/summary` returns valid JSON with the correct key.
-   [x] Actual memory usage measured: \~710 MiB steady, \~826 MB RSS
    reported during startup.

### AWS work still required

The ML Ops engineer must create the detailed AWS implementation plan
for:

-   [ ] Launching a `c7i-flex.large` EC2 instance.
-   [ ] Selecting a compatible Free-Tier-eligible Linux AMI.
-   [ ] Choosing an AWS region with acceptable latency to the existing
    Render backend.
-   [ ] Creating and securely storing an EC2 SSH key pair.
-   [ ] Configuring the EC2 security group using least privilege.
-   [ ] Selecting EBS storage appropriate for the Docker image,
    artifacts, Docker layers, logs, and future updates while respecting
    Free Plan/credit constraints.
-   [ ] Installing Docker Engine on EC2.
-   [ ] Transferring/building/pulling the `mplads-ml` Docker image.
-   [ ] Running the container persistently with automatic restart.
-   [ ] Providing a stable public endpoint for the Render Express
    backend.
-   [ ] Adding HTTPS/TLS; production traffic must not expose the API key
    over plaintext HTTP.
-   [ ] Configuring DNS/domain or another stable HTTPS endpoint if
    required.
-   [ ] Keeping FastAPI port `8000` private where practical and exposing
    only the reverse-proxy HTTPS port.
-   [ ] Configuring production `MPLADS_API_KEY`.
-   [ ] Updating Render Express environment variables.
-   [ ] Adding health monitoring, logs, restart behavior, and
    disk/memory monitoring.
-   [ ] Creating an update/rollback procedure for future Docker images.
-   [ ] Tracking AWS credits and Free Plan expiration so the service
    does not unexpectedly disappear when free access ends.

------------------------------------------------------------------------

## 5. Step 1 --- Verify the Dockerfile

`Dockerfile` already exists in the repo root. Verify its contents match
below (selective per-file COPY, no whole-directory artifact copy):

``` dockerfile
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

  -----------------------------------------------------------------------
  Decision                            Rationale
  ----------------------------------- -----------------------------------
  **`python:3.11-slim`**              Slim base (\~50 MB) but includes
                                      glibc needed by numpy/scikit-learn.
                                      Alpine would fail on compiled
                                      wheels.

  **Multi-stage build**               Build stage has `build-essential`
                                      (\~200 MB); production stage drops
                                      it, saving image size.

  **`--workers 1`**                   Each worker holds \~60-100 MB of
                                      in-memory indexes (double-keyed
                                      work_index) plus the \~20 MB of
                                      parquets read at startup (\~36 MB
                                      total artifacts baked into the
                                      image). One worker fits comfortably
                                      in 512 MB; two would risk OOM. Uses
                                      precomputed mp_top20 so no
                                      per-request sort.

  **`--timeout-keep-alive 120`**      Prevents Render's load balancer
                                      from dropping the connection on
                                      cold-start when loading artifacts
                                      (\~15-30 sec).

  **`start-period=90s`**              Gives the FeatureStore 90 seconds
                                      to load the 4 startup parquets plus
                                      the NLP classifier before health
                                      checks start failing. Render uses
                                      healthCheckPath /health, not this
                                      Dockerfile HEALTHCHECK.

  **Non-root user**                   Security best practice; prevents
                                      container escape attacks.

  **`${PORT:-8000}`**                 Render injects `$PORT` at runtime;
                                      this respects it while defaulting
                                      to 8000 for local dev.

  **Docker `HEALTHCHECK`**            Used for local `docker run` and
                                      non-Render orchestrators. **Render
                                      ignores it** and uses
                                      `healthCheckPath: /health` from
                                      `render.yaml` instead. Both probe
                                      the same endpoint, so they are
                                      consistent.
  -----------------------------------------------------------------------

------------------------------------------------------------------------

------------------------------------------------------------------------

## 6. Step 2 --- Verify .dockerignore

`.dockerignore` already exists in the repo root. Verify its contents
match below (this block mirrors the real file exactly; global `*.csv` /
`*.png` patterns are safe because every runtime artifact is `.parquet`,
`.joblib`, or `.json`, and the tiny `*_run_metadata.json` files are
never read by `FeatureStore.load_all` so they are not worth excluding):

``` dockerignore
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

> \[!TIP\] This `.dockerignore` plus selective COPY keeps the Docker
> build context and image lean (\~36 MB runtime payload) by excluding
> the Node.js backend, frontend, notebooks, CSVs, training-only
> artifacts (`description_embeddings.npy`, `feature3_hdbscan.joblib`,
> intermediate Parquets), and visualization PNGs. Only the `mplads_api/`
> code, `requirements.txt`, and the **runtime-required**
> Parquet/Joblib/JSON artifact files are sent to the Docker daemon.

------------------------------------------------------------------------

------------------------------------------------------------------------

## 7. Step 3 --- Local Docker Build & Validation

The local Docker validation procedure remains part of the deployment
plan and has already been executed successfully.

``` powershell
# Build
docker build -t mplads-ml:latest .

# Run
docker run --rm -p 8000:8000 -e MPLADS_API_KEY=dev-local-key -e MPLADS_ENV=production --name mplads-ml mplads-ml:latest

# Health test
curl.exe http://localhost:8000/health

# Authenticated API test
curl.exe -H "X-API-Key: dev-local-key" http://localhost:8000/dashboard/summary

# Image size
docker images mplads-ml:latest --format "{{.Size}}"

# Runtime memory
docker stats mplads-ml --no-stream
```

### Recorded validation result

``` text
Application startup: SUCCESS
/health: HTTP 200
/dashboard/summary with correct X-API-Key: SUCCESS / valid JSON
Incorrect or missing API key: HTTP 401

FeatureStore:
works=86300
mps=774
vendors=9170

Startup RSS reported by application: ~826 MB
Docker steady-state memory: 710.3 MiB
```

`dev-local-key` is only a local test secret. It must not be used in
production.

------------------------------------------------------------------------

## 8. Step 4 --- Render Memory Blocker and Deployment Decision

### Original assumption

The original Render plan assumed the single-worker application would fit
inside a 512 MB service.

### Actual measurement

Production-style local testing disproved that assumption:

``` text
docker stats mplads-ml --no-stream

MEM USAGE / LIMIT
710.3MiB / 3.71GiB
```

The application also emitted:

``` text
FeatureStore Load Complete (... rss=826MB)
```

The disk size of the runtime artifacts is therefore **not an adequate
proxy for runtime RAM consumption**. Deserialized data, Python objects,
indexes, pandas/Arrow operations, the classifier, libraries, and startup
allocations materially increase memory consumption.

### Decision

-   **Render Free ML deployment: rejected due to insufficient RAM.**
-   **Code optimization solely to fit Render Free: rejected for this
    deployment iteration.**
-   **AWS EC2: selected.**
-   **EC2 type: `c7i-flex.large` (2 vCPU, 4 GiB RAM, x86-64).**

The existing Render frontend/backend deployment remains unchanged except
for the backend ML service URL and production ML API key.

------------------------------------------------------------------------

## 9. Step 5 --- AWS EC2 Deployment Requirements

This section intentionally defines **requirements and constraints**
rather than pretending the AWS implementation has already been
completed. The ML Ops engineer should use these facts to produce the
exact AWS deployment runbook.

### Required compute target

``` text
Provider: AWS EC2
Instance type: c7i-flex.large
vCPU: 2
Memory: 4 GiB
Architecture: x86-64
Application packaging: existing Dockerfile
Container name: mplads-ml
FastAPI internal port: 8000
Uvicorn workers: 1 (unchanged initially)
Health endpoint: /health
```

### OS / AMI

Choose a currently supported, **Free-Tier-eligible x86-64 Linux AMI**
compatible with `c7i-flex.large`. The final runbook must record the
exact AMI family/version selected.

### Network and security requirements

The deployment plan must include:

1.  EC2 in a public subnet only if direct internet ingress is required.
2.  Security group with least-privilege inbound rules.
3.  SSH (`22`) should not be globally open; restrict administration
    access as tightly as practical.
4.  Public application access should use **HTTPS (443)**.
5.  Do not intentionally expose FastAPI port `8000` directly to the
    public internet if a reverse proxy terminates HTTPS on the instance.
6.  `/health` may remain unauthenticated as currently designed.
7.  All protected endpoints continue to require `X-API-Key`.
8.  The production API key must be stored as an environment
    variable/secret on EC2, never baked into the Docker image or
    committed to git.
9.  The known development/default value `mpladsAPI123` must not be used
    in production.

### Container runtime requirements

The AWS runbook must specify:

-   Docker Engine installation.
-   Image build or image-pull strategy.
-   Exact production `docker run`/Compose/systemd strategy.
-   Restart policy (for example, automatic restart after process/VM
    reboot).
-   Environment variable injection.
-   Log access/rotation.
-   Disk cleanup strategy for old Docker layers/images.
-   Health-check verification.
-   Deployment rollback procedure.

### Stable endpoint / TLS

The Express backend on Render requires a stable HTTPS URL. The AWS plan
must therefore define the production endpoint strategy, including TLS
certificate provisioning/renewal and whether a domain/subdomain or
another AWS-supported stable endpoint will be used.

Do not finalize `FASTAPI_URL` until that HTTPS endpoint exists.

------------------------------------------------------------------------

## 10. Step 6 --- Backend Integration Requirements

The Express proxy implementation remains unchanged.

Once the EC2 ML endpoint is ready, configure the Render **Express
backend**:

``` text
FASTAPI_ENABLED=true
FASTAPI_URL=https://<final-aws-ml-endpoint>
MPLADS_API_KEY=<new-production-secret>
```

Configure the EC2 FastAPI container with the **same** secret:

``` text
MPLADS_API_KEY=<same-new-production-secret>
```

Request path:

``` text
Browser
  ↓ JWT-authenticated request
Render React → Render Express
                    ↓ X-API-Key
               HTTPS
                    ↓
              AWS EC2 ML API
                    ↓
              Docker / FastAPI
```

The API key must never be placed in the React frontend.

------------------------------------------------------------------------

## 11. Step 7 --- Production Validation Requirements

After AWS deployment, repeat the same functional checks against the AWS
HTTPS endpoint:

1.  `GET /health` → HTTP 200.
2.  `GET /dashboard/summary` without API key → HTTP 401.
3.  Same endpoint with incorrect key → HTTP 401.
4.  Same endpoint with production key → HTTP 200 + valid JSON.
5.  `POST /nlp/categorize-work` → successful inference.
6.  MP/vendor/state scoring endpoints → successful responses.
7.  Render Express `/api/analytics/*` proxy → successful end-to-end
    response.
8.  Verify `mpladsAPI123` is rejected.
9.  Verify container memory after deployment.
10. Reboot EC2 and confirm the ML container automatically returns.
11. Verify HTTPS certificate and ensure protected traffic is not sent
    over plaintext HTTP.

------------------------------------------------------------------------

## 12. Future Update and Operations Strategy

### Artifact/model updates

The Docker image remains the deployment unit. Future Parquet/model
updates should continue to be baked into a newly built image rather than
manually copied into a running container.

The AWS runbook should define a repeatable process:

``` text
Update artifacts/code
        ↓
Run local tests
        ↓
Build Docker image
        ↓
Version/tag image
        ↓
Deploy new image to EC2
        ↓
Wait for /health
        ↓
Run API validation
        ↓
Remove old image only after successful validation
```

### Future memory growth

The selected 4 GiB instance intentionally provides headroom over the
current \~710 MiB steady measurement. Nevertheless:

-   Record memory after each material model/data update.
-   Treat sustained memory approaching the instance limit as a scaling
    event.
-   Do not increase Uvicorn workers without re-measuring memory because
    each worker can duplicate substantial application state.
-   If future requirements exceed the selected instance, reassess EC2
    sizing and the AWS credit/cost impact before changing instance type.

### Versioning / rollback

Continue using Git tags for application releases and additionally tag
Docker images/releases so the previous known-good version can be
restored.

------------------------------------------------------------------------

## 13. Cost / Free-Plan Constraint

### Current account state

``` text
AWS plan: Free Plan
Credits remaining at decision time: $68.38 USD
Days remaining at decision time: 126
Selected instance: c7i-flex.large
```

AWS documentation for newer Free Tier accounts includes `c7i-flex.large`
among Free-Tier-eligible EC2 instance types. Under the AWS Free Plan,
usage consumes credits and the Free Plan ends when its duration expires
or credits are depleted.

### Mandatory operational constraint

> **Do not upgrade this AWS account to the Paid Plan as part of this
> deployment without explicit owner approval.**

The goal is zero out-of-pocket AWS charges during the current Free Plan.
The engineer must monitor remaining credits and understand that the ML
service will not remain hosted indefinitely for free under this
promotional plan.

The AWS implementation plan should include a credit/budget monitoring
procedure and an explicit migration/shutdown decision before the
remaining free period ends.

------------------------------------------------------------------------

## 14. Risk Register

  -----------------------------------------------------------------------
  Risk                    Status / Impact         Required mitigation
  ----------------------- ----------------------- -----------------------
  Render 512 MB OOM       **Confirmed blocker**   Do not deploy ML
                          --- container uses      service on Render Free;
                          \~710 MiB steady        use selected EC2 target

  EC2 memory growth       Future models/data may  4 GiB selected for
                          increase RAM            headroom; monitor after
                                                  every update

  AWS Free Plan expires / ML service loses free   Track credits and
  credits deplete         hosting                 remaining days; decide
                                                  migration/upgrade
                                                  before expiry

  Secret exposure         Unauthorized ML API     Fresh production key,
                          access                  identical on Express +
                                                  EC2, never in
                                                  frontend/git/image

  Plain HTTP              API key could be        Production endpoint
                          exposed in transit      must use HTTPS

  EC2 reboot/process      ML API unavailable      Configure persistent
  failure                                         container/restart
                                                  policy and verify
                                                  reboot recovery

  SSH exposure            Server compromise       Restrict port 22;
                                                  least-privilege
                                                  security group

  Port 8000 exposure      Unnecessary attack      Keep private behind
                          surface                 HTTPS reverse proxy
                                                  where practical

  scikit-learn mismatch   Joblib load failure /   Keep pinned serving
                          incorrect behavior      dependencies and
                                                  retrain/re-export when
                                                  versions change

  Docker disk growth      EC2 disk can fill over  Image/layer cleanup and
                          repeated deployments    disk monitoring

  Single EC2 instance     Single point of failure Accept for current
                                                  free/demo deployment;
                                                  document future HA path
                                                  if production SLA
                                                  requires it
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 15. Appendix --- Local Docker Test Commands

The original local Docker build/test block is retained below for
reference.

### Docker Build & Test Commands (Local Verification)

``` bash
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

------------------------------------------------------------------------

## Handoff to ML Ops Engineer

The Docker packaging phase is complete and locally validated. **Do not
redesign the application or optimize it merely to fit Render Free.**

Create the AWS deployment runbook using these fixed inputs:

``` text
Cloud: AWS EC2
Instance: c7i-flex.large
CPU/RAM: 2 vCPU / 4 GiB
Architecture: x86-64
Docker image: mplads-ml:latest
Current steady container RAM: ~710 MiB
Observed startup RSS: ~826 MB
FastAPI port: 8000
Health: /health
Workers: 1
Frontend: Render
Express backend: Render
Express → ML: HTTPS + X-API-Key
AWS account: Free Plan
Credits at decision: $68.38
Free-plan time remaining at decision: 126 days
Constraint: no intentional upgrade to Paid Plan
```

The AWS runbook must cover **AMI selection, EC2 launch configuration,
EBS sizing, key pair/SSH, security groups, Docker installation, image
deployment, persistent restart behavior, HTTPS/TLS, stable endpoint/DNS
strategy, secrets, Render backend wiring, monitoring, credit tracking,
updates, rollback, and final end-to-end validation**.

------------------------------------------------------------------------

> **End of revised deployment plan.**
