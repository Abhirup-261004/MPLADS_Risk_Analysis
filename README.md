# Prahari AI — MPLADS ML & Risk Analytics

This repository contains the machine learning models, anomaly detection algorithms, FastAPI scoring backend, Parquet feature store, and full-stack web application for monitoring and risk intelligence under the **MPLAD Scheme** (Member of Parliament Local Area Development Scheme).

---

## 🏛️ System Architecture

```text
React/Vite Frontend (Port 5173)
        ↓  (Authenticated HTTP / JSON via /api/ml/...)
Express Backend (Port 5001)
        ↓  (Server-to-Server Native fetch)
FastAPI ML Service (Port 8000)
```

- **Client Isolation**: The browser **MUST NOT** and **DOES NOT** call FastAPI directly. The browser exclusively communicates with the Express backend (`http://localhost:5001/api`).
- **Secure ML Proxy**: Express exposes authenticated routes under `/api/ml/*` protected by existing JWT authentication middleware.
- **How React Reaches ML**:
  1. React components call service functions in `frontend/src/services/api.js`.
  2. `api.js` sends requests with `Authorization: Bearer <token>` to Express (`/api/ml/...`).
  3. Express authenticates the JWT and proxies the request to FastAPI (`${ML_API_URL}/...`), forwarding request bodies, headers, query parameters (`house`, `state`), and preserving FastAPI status codes and `{ detail: "..." }` errors.
  4. FastAPI executes inference using loaded scikit-learn and LightGBM models against the Parquet feature store.
  5. The response flows back through Express to the React UI.

---

## 📋 Table of Contents
1. [Quick Start: How Teammates Can Access ML Models](#-how-teammates-can-access-ml-models)
   - [Interactive FastAPI REST API (Recommended)](#method-1-interactive-fastapi-rest-api-recommended)
2. [ML Model Artifacts & Directory Structure](#-ml-model-artifacts--directory-structure)
3. [API Endpoints Overview](#-api-endpoints-overview)
4. [Running Unit Tests](#-running-unit-tests)
5. [Running the Full Stack (Frontend + Express Backend + FastAPI)](#-running-the-full-stack)
1. [Required Environment Variables](#-required-environment-variables)
2. [Starting the Services](#-starting-the-services)
3. [Testing ML Endpoints](#-testing-ml-endpoints)
4. [API Endpoints Overview](#-api-endpoints-overview)
5. [ML Model Artifacts & Directory Structure](#-ml-model-artifacts--directory-structure)
6. [Running Unit Tests](#-running-unit-tests)

---

## 🚀 How Teammates Can Access ML Models
## ⚙️ Required Environment Variables

Teammates can access and consume trained ML models using three simple methods depending on their workflow:
### 1. Express Backend (`backend/.env`)
See `backend/.env.example` for reference:
```env
NODE_ENV=development
PORT=5001
MONGODB_URI=mongodb://127.0.0.1:27017/prahari-ai
JWT_SECRET=replace_with_a_long_random_secret_at_least_32_characters
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
ML_API_URL=http://localhost:8000
```
> **Security Note**: `ML_API_URL` is private and must only be read by the Express server. Never expose it to Vite or the browser.

### Interactive FastAPI REST API (Recommended)
### 2. React Frontend (`frontend/.env`)
See `frontend/.env.example` for reference:
```env
VITE_API_URL=http://localhost:5001/api
```
> The browser only knows the Express backend API URL.

Start the Python FastAPI server to serve live model predictions and anomaly scores:
---

## 🚀 Starting the Services

Open 3 separate terminal tabs to run all three tiers:

### Step 1: Start FastAPI ML Service (Port 8000)
```powershell
# 1. Install dependencies
pip install -r requirements.txt

# 2. Start the FastAPI server
# 2. Launch FastAPI service on Port 8000
python -m uvicorn mplads_api.main:app --reload --host 0.0.0.0 --port 8000
```
FastAPI Swagger documentation is available at: [http://localhost:8000/docs](http://localhost:8000/docs)

Once running, open **[http://localhost:8000/docs](http://localhost:8000/docs)** in your browser to test endpoints interactively via Swagger UI.
### Step 2: Start Express Backend (Port 5001)
```powershell
cd backend
npm install
npm run dev
```
Express runs on port `5001` (or the configured `PORT`) and proxies ML calls to `http://localhost:8000`.

#### Quick REST API Examples:
### Step 3: Start React / Vite Frontend (Port 5173)
```powershell
cd frontend
npm install
npm run dev
```
Access the web portal at: [http://localhost:5173](http://localhost:5173)

- **Categorize Work Description (NLP - TF-IDF + LightGBM)**:
  ```bash
  curl -X POST "http://localhost:8000/categorize" \
       -H "Content-Type: application/json" \
       -d '{"description": "Installation of 500W Solar Street Lights in Gram Panchayat"}'
  ```
---

- **Get MP Composite Risk Score (Flexible Name Resolution)**:
  ```bash
  # Search by clean name or ID
  curl "http://localhost:8000/score/mp-risk/Kartikeya%20Sharma"
  
  # Disambiguate if same name exists in Lok Sabha and Rajya Sabha
  curl "http://localhost:8000/score/mp-risk/Sanjay%20Seth?house=LS"
  ```
## 🧪 Testing ML Endpoints

- **Get Work Disbursement Risk (Isolation Forest)**:
  ```bash
  curl -X POST "http://localhost:8000/score/disbursement-risk" \
       -H "Content-Type: application/json" \
       -d '{"work_id": "WS/LS/17/001"}'
  ```
### 1. From the Web Application (Real UI Integration)
1. Open [http://localhost:5173](http://localhost:5173) and sign in.
2. Click **Works Explorer** in the left sidebar (`#/works`).
3. Click any work record in the table to open **Work Investigation** (`#/investigation`).
4. Under the **AI Risk Assessment** section, the **Live ML NLP Verification** card runs real-time inference on the selected work description using the TF-IDF + LightGBM pipeline through Express & FastAPI, displaying:
   - ML-predicted category
   - Model confidence score percentage
   - Category mismatch flag (verifying work description against declared sector)
   - Alternative predicted categories with confidence distribution

- **Get Vendor Risk Profile (Vendor Risk Model)**:
  ```bash
  curl -X POST "http://localhost:8000/score/vendor-risk/VEND_00123"
  ```
### 2. From Terminal via Express ML Proxy (`/api/ml`)
Authenticate first to obtain a JWT token, then query the proxy:

```powershell
# Authenticate
$authResponse = Invoke-RestMethod -Uri "http://localhost:5001/api/auth/login" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"email":"admin@prahariai.com","password":"ChangeThisPassword123!"}'

$token = $authResponse.token

# Test Work Categorization through Express Proxy
Invoke-RestMethod -Uri "http://localhost:5001/api/ml/categorize-work" `
  -Method Post `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body '{"description":"Installation of 500W Solar Street Lights in Gram Panchayat","declared_category":"Normal/Others"}'

# Test MP Composite Risk (preserves query params like house and state)
Invoke-RestMethod -Uri "http://localhost:5001/api/ml/mp-risk/Sanjay%20Seth?house=LS" `
  -Method Get `
  -Headers @{ Authorization = "Bearer $token" }
```

---

## 🛠️ API Endpoints Overview

The Express backend forwards authenticated `/api/ml/*` requests to the corresponding FastAPI endpoints:

| Module | Express Proxy Route | Target FastAPI Endpoint | Method | Description |
|---|---|---|---|---|
| **NLP Categorization** | `/api/ml/categorize-work` | `/nlp/categorize-work` | `POST` | Predict work category & detect category-description mismatch |
| **Disbursement Risk** | `/api/ml/disbursement-risk` | `/score/disbursement-risk` | `POST` | Calculate disbursement shortfall & Isolation Forest risk score |
| **Cost Anomaly** | `/api/ml/cost-anomaly` | `/score/cost-anomaly` | `POST` | LOF cost anomaly detection & peer median cost deviation |
| **Vendor Risk** | `/api/ml/vendor-risk/:vendorId` | `/score/vendor-risk/{vendor_id}` | `GET` | Vendor concentration, high-risk ratio, and composite risk tier |
| **MP Risk** | `/api/ml/mp-risk/:mpIdentifier` | `/score/mp-risk/{mp_identifier}` | `GET` | Multi-dimensional composite MP risk scorecard (preserves `house`, `state`) |
| **State Risk** | `/api/ml/state-risk/:state` | `/score/state-risk/{state}` | `GET` | State-wide composite risk rollup & utilization metrics |
| **Dashboard Summary** | `/api/ml/dashboard-summary` | `/dashboard/summary` | `GET` | Top 20 ranked risk scorecards (MP or State level) |

---

## 📁 ML Model Artifacts & Directory Structure

```text
MPLADs_ML/
├── mplads_api/                     <-- FastAPI Python Application
MPLADS_Risk_Analysis/
├── mplads_api/                     <-- FastAPI Python Application (Port 8000)
│   ├── main.py                     <-- Server entry point & CORS
│   ├── config.py                   <-- Directory & settings configuration
│   ├── config.py                   <-- Artifact directory & settings configuration
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
├── backend/                        <-- Express + MongoDB Backend & ML Proxy (Port 5001)
│   ├── src/controllers/mlController.js
│   ├── src/routes/mlRoutes.js
│   └── src/config/env.js
├── frontend/                       <-- React + Vite User Interface (Port 5173)
│   ├── src/services/api.js         <-- ML API client helper methods
│   └── src/components/WorkInvestigation.jsx
└── requirements.txt                <-- Python dependencies
```

---

## 🛠️ API Endpoints Overview
## 🧪 Running Unit Tests

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
### FastAPI Test Suite
```powershell
python -m pytest mplads_api/tests
```
Verifies NLP categorization, scoring endpoints, name resolution, and dashboard routes (11 tests).

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
### Frontend Build Validation
```powershell
cd frontend
npm run build
```
Validates compilation and module bundling for production.
