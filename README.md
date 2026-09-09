# Prahari AI — MPLADS ML & Risk Analytics

This repository contains the machine learning models, anomaly detection algorithms, FastAPI scoring backend, Parquet feature store, and full-stack web application for monitoring and risk intelligence under the **MPLAD Scheme** (Member of Parliament Local Area Development Scheme).

---

## 📋 Table of Contents
1. [Quick Start: How Teammates Can Access ML Models](#-how-teammates-can-access-ml-models)
   - [Interactive FastAPI REST API (Recommended)](#method-1-interactive-fastapi-rest-api-recommended)
2. [ML Model Artifacts & Directory Structure](#-ml-model-artifacts--directory-structure)
3. [API Endpoints Overview](#-api-endpoints-overview)
4. [Running Unit Tests](#-running-unit-tests)
5. [Running the Full Stack (Frontend + Express Backend + FastAPI)](#-running-the-full-stack)

---

## 🚀 How Teammates Can Access ML Models

Teammates can access and consume trained ML models using three simple methods depending on their workflow:

### Interactive FastAPI REST API (Recommended)

Start the Python FastAPI server to serve live model predictions and anomaly scores:

```powershell
# 1. Install dependencies
pip install -r requirements.txt

# 2. Start the FastAPI server
python -m uvicorn mplads_api.main:app --reload --host 0.0.0.0 --port 8000
```

Once running, open **[http://localhost:8000/docs](http://localhost:8000/docs)** in your browser to test endpoints interactively via Swagger UI.

#### Quick REST API Examples:

- **Categorize Work Description (NLP - TF-IDF + LightGBM)**:
  ```bash
  curl -X POST "http://localhost:8000/categorize" \
       -H "Content-Type: application/json" \
       -d '{"description": "Installation of 500W Solar Street Lights in Gram Panchayat"}'
  ```

- **Get MP Composite Risk Score (Flexible Name Resolution)**:
  ```bash
  # Search by clean name or ID
  curl "http://localhost:8000/score/mp-risk/Kartikeya%20Sharma"
  
  # Disambiguate if same name exists in Lok Sabha and Rajya Sabha
  curl "http://localhost:8000/score/mp-risk/Sanjay%20Seth?house=LS"
  ```

- **Get Work Disbursement Risk (Isolation Forest)**:
  ```bash
  curl -X POST "http://localhost:8000/score/disbursement-risk" \
       -H "Content-Type: application/json" \
       -d '{"work_id": "WS/LS/17/001"}'
  ```

- **Get Vendor Risk Profile (Vendor Risk Model)**:
  ```bash
  curl -X POST "http://localhost:8000/score/vendor-risk/VEND_00123"
  ```

---


---

## 📁 ML Model Artifacts & Directory Structure

```text
MPLADs_ML/
├── mplads_api/                     <-- FastAPI Python Application
│   ├── main.py                     <-- Server entry point & CORS
│   ├── config.py                   <-- Directory & settings configuration
│   ├── core/                       <-- FeatureStore engine & security
│   ├── schemas/                    <-- Pydantic request/response schemas
│   ├── routers/                    <-- REST API routes (categorize, disbursement, cost, vendor, mp_risk, dashboard)
│   └── tests/                      <-- Pytest unit test suite (11 tests)
├── shared_preprocessing_artifacts/ <-- Parquet Data Bus (dim_mp, fact_work, fact_expenditure)
├── feature1_artifacts/             <-- Feature 1: Isolation Forest (Disbursement Shortfall Risk)
├── feature2_artifacts/             <-- Feature 2: LOF Model (Cost Anomaly & Parity Outliers)
├── feature3_artifacts/             <-- Feature 3: LightGBM Classifier, Taxonomy & Work Categories
├── feature5_artifacts/             <-- Feature 5: Vendor Risk Model & Concentration Parquet
├── feature7_artifacts/             <-- Feature 7: K-Means & Isolation Forest (MP Composite Risk)
├── notebooks/                      <-- Exploratory & Training Notebooks (SharedPreprocessing, feature1 -> feature7)
├── context/                        <-- Technical feature documentation & mathematical details
├── backend/                        <-- Express + MongoDB Authentication API
├── frontend/                       <-- React + Vite User Interface
└── requirements.txt                <-- Python dependencies
```

---

## 🛠️ API Endpoints Overview

| Module | Endpoint | Method | Description |
|---|---|---|---|
| **NLP** | `/categorize` | `POST` | Predict work category & detect description-category mismatch |
| **Disbursement** | `/score/disbursement-risk` | `POST` | Calculate disbursement shortfall & time-lag risk tier |
| **Cost Risk** | `/score/cost-anomaly` | `POST` | Compute cost Z-score & Local Outlier Factor (LOF) cost anomaly |
| **Vendor Risk** | `/score/vendor-risk/{vendor_id}` | `GET` | Retrieve vendor concentration, splitting risk & risk tier |
| **MP Composite Risk** | `/score/mp-risk/{mp_identifier}` | `GET` | Multi-dimensional composite MP risk scorecard & subscores |
| **State Risk** | `/score/state-risk/{state}` | `GET` | State-wide composite risk & utilization summary |
| **Dashboard** | `/dashboard/summary` | `GET` | High-level system statistics & key performance indicators |
| **Health** | `/health` | `GET` | API status check |

---



---

## 💻 Running the Full Stack (Frontend + Express + FastAPI)

1. **Python FastAPI ML Backend**:
   ```powershell
   python -m uvicorn mplads_api.main:app --reload --host 0.0.0.0 --port 8000
   ```
2. **Express Auth Backend**:
   ```powershell
   cd backend
   npm install
   npm run dev
   ```
3. **React Frontend**:
   ```powershell
   cd frontend
   npm install
   npm run dev
   ```
