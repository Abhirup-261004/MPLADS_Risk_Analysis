# FastAPI Changes & Integration Notes for MERN Frontend

This document outlines the recent bug fixes and adjustments made to the MPLADS Risk Analytics FastAPI backend. Frontend developers consuming these endpoints should review these changes to ensure proper integration.

## 1. Authentication Configuration
**All Endpoints**
* **Change:** The API is currently running in a fully open mode for integration testing. 
* **Action Required:** You do **not** need to pass an `X-API-Key` header in your HTTP requests. All endpoints (scoring, NLP, and dashboard) are free to use without authentication.

## 2. NLP Categorization Fallback Classes
**Endpoint:** `POST /nlp/categorize-work`
* **Change:** The rule-based fallback mechanism (triggered when the ML model is uncertain or fails) has been strictly aligned with the model's actual 10-class taxonomy (e.g., `"Drinking Water Infrastructure"`, `"Road & Pathway Infrastructure"`, `"School & Education Infrastructure"`, etc.).
* **Action Required:** The frontend will no longer receive rogue categories like `"Roads, Bridges & Pathways"` or `"Community Infrastructure"` that weren't in the official taxonomy. If you were doing any explicit string matching on those old fallback strings, you should update them to match the official classes. The default fallback category is now explicitly `"Other Public Infrastructure"`.

## 3. Disbursement Risk Null Handling
**Endpoint:** `POST /score/disbursement-risk`
* **Change:** Fixed a backend bug regarding how missing `shortfall_deficit_pct` values were parsed. The endpoint will explicitly return `0.0` for missing values, while maintaining the correct `coverage_flag` (e.g., `disbursement_unknown`).
* **Action Required:** Do not rely on the `shortfall_deficit_pct` numerical value to determine if disbursement data exists. You **must** read the `coverage_flag` in the response to accurately tell the user if the disbursement score is meaningful.

## 4. Dashboard Summary Serialization & State Risk
**Endpoints:** `GET /dashboard/summary?level=mp`, `GET /dashboard/summary?level=state`, `GET /score/state-risk/{state}`
* **Change:** Fixed a critical bug where these endpoints would occasionally crash and return a `500 Internal Server Error` due to JSON serialization failures when encountering `NaN` or un-sanitized numpy data types (especially when states had missing score data).
* **Action Required:** These endpoints now consistently return robust, sanitized JSON objects. Missing numerical values (like `mean_composite_risk_score`) will now properly return as `null` instead of crashing the server. If your frontend had any defensive `try/catch` logic specifically to handle 500 errors from these endpoints, it should no longer trigger. Ensure your UI gracefully handles `null` values for state-level averages. 

## 5. Cost Benchmarking & Vendor Risk Schemas
**Endpoints:** `POST /score/cost-anomaly`, `GET /score/vendor-risk/{vendor_id}`
* **Change:** Verified that the API schemas correctly match the newest upstream ML artifacts. No breaking changes were introduced.
* **Action Required:** Note that for `cost-anomaly`, the `peer_median_amount` field may legally return `null` if the work has an invalid cost mask. Your frontend components should gracefully handle `null` peer medians.
