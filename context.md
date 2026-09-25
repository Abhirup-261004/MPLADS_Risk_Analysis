# MPLADS Risk Analysis - Project Context & Handoff

**Project:** MPLADS Risk Analytics (Problem Statement 26102)
**Repository:** https://github.com/Abhirup-261004/MPLADS_Risk_Analysis
**Branch:** `main`

This document provides a comprehensive overview of the system architecture, codebase structure, and the current deployment state. It is designed to rapidly onboard the next agent or developer.

---

## 1. System Architecture Overview

The system is a 3-tier application designed to evaluate and surface risk analytics for MPLADS (Member of Parliament Local Area Development Scheme) works and vendors.

1.  **Frontend (React/Vite)**
    *   **Location:** `/frontend/`
    *   **Status:** Deployed on Render as a static site (`MPLADS_Risk_Analysis-1`).
    *   **Role:** User interface for Risk Center, Agency Workspace, Map Intelligence, works explorers, etc.
    *   **Integration:** Connects to the Express backend via `VITE_API_URL`.

2.  **Core Backend (Express/Node.js + MongoDB)**
    *   **Location:** `/backend/`
    *   **Status:** Deployed on Render as a Node web service (`MPLADS_Risk_Analysis`).
    *   **Role:** Handles authentication (JWT), MongoDB data persistence (Works, Agencies, Users), core risk routing, and business logic.
    *   **Integration:** Contains a built-in reverse proxy (`backend/src/controllers/mlController.js`) that forwards advanced analytics requests (under `/api/analytics/*`) to the FastAPI ML Service. This proxy is gated by `FASTAPI_ENABLED` and `FASTAPI_URL` environment variables.

3.  **Machine Learning Service (FastAPI/Python)**
    *   **Location:** `/mplads_api/`
    *   **Status:** Ready in codebase but **NOT YET DEPLOYED**.
    *   **Role:** Serves advanced pre-computed ML risk scores and performs live NLP work categorization.
    *   **Integration:** Exposes endpoints like `/nlp/categorize-work` and `/score/*`. Expected to run on Port 8000 internally.

---

## 2. The Machine Learning Layer in Detail

The ML pipeline consists of 5 implemented features (F1, F2, F3, F5, F7). 
Instead of running heavy models at request-time, the FastAPI service uses an **in-memory FeatureStore** (`mplads_api/core/feature_store.py`) loaded during application startup (`lifespan` event).

### Runtime Artifacts (Loaded by FastAPI)
*   **Parquet Data (4 primary + 1 fallback):**
    *   `feature1_fact_work_disbursement_risk.parquet`
    *   `feature2_fact_work_cost_risk.parquet`
    *   `feature5_vendor_risk.parquet`
    *   `feature7_mp_composite_risk.parquet`
    *   Fallback: `shared_preprocessing_artifacts/fact_work_feature7.parquet`
*   **Joblib Models (6 total):**
    *   5 Anomaly Detection Models: F1 iForest, F2 LOF, F5 iForest, F7 KMeans, F7 iForest.
    *   1 NLP Classifier: `feature3_tfidf_lightgbm_classifier.joblib` (Live inference).
*   **Config:** `feature3_taxonomy_config.json`.
*   **Memory Footprint:** The combined runtime artifacts total ~120 MB.

### Training-Only Artifacts (To be Excluded from Deployment)
Several heavy artifacts are used only in the `/notebooks/` pipeline and are *never* loaded by FastAPI. They must be excluded from Docker images to save space:
*   `feature3_umap.joblib` (~235 MB, gitignored)
*   Sentence Transformer weights (~400 MB, gitignored)
*   `description_embeddings.npy` (~56 MB, tracked in git but unused in prod)
*   `feature3_hdbscan.joblib` (~16 MB, tracked in git but unused in prod)
*   Intermediate Parquets in `feature3_artifacts/` and `feature5_artifacts/`.

---

## 3. Current Deployment Status & Action Plan

A complete Dockerization and Render deployment plan has been generated and saved as `ML_Deployment.md` in the root directory. 

### What is done:
1.  **Architecture Designed:** Docker web service using `python:3.11-slim` with `libgomp1` (required for LightGBM).
2.  **Dependencies Pinned:** `scikit-learn==1.6.1` must be strictly maintained to deserialize the `.joblib` models.
3.  **Plan Documented:** All required Dockerfile scripts, `.dockerignore` contents, and `render.yaml` updates are thoroughly documented in `ML_Deployment.md`.

### Next Actions for Handoff:
If instructed to proceed with deployment, the next agent should execute the steps from `ML_Deployment.md`:
1.  **Create `Dockerfile`** in the root using the exact multi-stage spec from the plan.
2.  **Create `.dockerignore`** in the root, explicitly excluding `/backend`, `/frontend`, `/notebooks`, CSV files, and the specific training-only artifacts listed above.
3.  **Update `render.yaml`** to append the `mplads-ml` Docker service, and update the existing Node.js backend block to set `FASTAPI_ENABLED: "true"`.
4.  **Commit and Push** these three files to trigger Render CI/CD.
5.  **Dashboard Configuration:** Remind the user to configure `FASTAPI_URL` on the Express backend in the Render dashboard to point to the new ML service URL.
