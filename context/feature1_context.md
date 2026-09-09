# Feature 1 Context: Fund Disbursement Shortfall & Completion Integrity Score

## 1. What We Did
We implemented **Feature 1**, an end-to-end quantitative and Machine Learning pipeline designed to detect **fund disbursement shortfall anomalies and completion integrity breaches** across the MPLADS portfolio (43,150 works).

### Core Work Completed
- **Data Ingestion & Linkage:** Ingested `feature3_fact_work_enriched` (carrying Feature 3's `category_nlp` labels) and merged it with `fact_expenditure_rollup` from `shared_preprocessing_artifacts/`.
- **Coverage & Effective Disbursement:** Derived `effective_disbursed` (prioritizing completion-stage `amount_disbursed`, falling back to payment tranche sum `total_fund_disbursed`) and assigned `coverage_flag` (`linked` vs `disbursement_unknown`).
- **Robust Statistical Peer Scoring:** Grouped works by `(state_key, category_nlp)` to compute median shortfall and Median Absolute Deviation (MAD). Applied category national fallbacks for thin groups ($N < 10$) and enforced a $0.02$ MAD variance floor to produce clean z-scores.
- **Multivariate ML Model (Isolation Forest):** Trained an unsupervised scikit-learn `IsolationForest(n_estimators=100, contamination=0.03)` on 5 features:
  1. `shortfall_deficit_pct` (Shortfall deficit magnitude)
  2. `tranche_count_clean` (Number of payment tranches)
  3. `days_sanction_to_last_tranche` (Elapsed duration from sanction to last tranche/completion)
  4. `work_status_ordinal` (Pipeline progress encoding: 0-3)
  5. `log_sanction_amount` ($\log(1 + \text{sanction\_amount})$)
- **Blended Score & Risk Tiers:** Unified univariate z-scores (25%), shortfall deficit magnitude (35%), Isolation Forest anomaly score (20%), and completion integrity boosts into `disbursement_risk_score` ($0.0 - 1.0$) mapped into 5 tiers (`Critical`, `High`, `Medium`, `Low`, `Unknown / Unlinked`).
- **Audit Explanations & Plots:** Generated natural-language explanations for dashboard display and created 3-panel EDA plots (`feature1_shortfall_distribution.png`).

---

## 2. What It Produces
Feature 1 exports clean artifacts adhering to the system separation between canonical shared data and feature-specific internals:

1. **Canonical Shared Fact Table (`shared_preprocessing_artifacts/fact_work_feature1.parquet` & `.csv`):**
   * **This is the primary data bus output for downstream features.**
   * Contains the updated canonical work table enriched with Feature 1 fields: `disbursement_risk_score`, `disbursement_risk_tier`, `disbursement_risk_explanation`, `shortfall_pct`, `shortfall_deficit_pct`, `peer_shortfall_zscore`, `iforest_anomaly_score`, and `coverage_flag`.
2. **Feature Artifacts Directory (`feature1_artifacts/`):**
   * `feature1_fact_work_disbursement_risk.csv` & `.parquet`: Full work dataset enriched with Feature 1 metrics.
   * `feature1_disbursement_risk_worklist.csv`: Filtered worklist of top 700 `Critical` and `High` risk anomalies for immediate audit triage.
   * `feature1_isolation_forest.joblib`: Trained scikit-learn Isolation Forest model pipeline (`imputer` + `scaler` + `model`).
   * `feature1_run_metadata.json`: Execution metadata, parameters, risk tier counts, and artifact index.
   * `feature1_shortfall_distribution.png`: 3-panel visualization figure.

---

## 3. Key Engineering Decisions Preserved
These design decisions **must be preserved** in all future pipeline iterations:
- **Coverage Isolation:** Unlinked/missing-expenditure records are explicitly tagged `coverage_flag = "disbursement_unknown"` and **never** scored as zero shortfall. A coverage gap is not evidence of clean spend.
- **Hierarchy of Spending:** `amount_disbursed` from the completion record takes precedence over `total_fund_disbursed` from expenditure tranches.
- **Peer Group Stabilization:** Robust z-scoring uses MAD with a domain variance floor of $0.02$ to prevent zero-variance peer groups from exploding z-scores.
- **Multivariate ML Score Blending:** The Isolation Forest score is normalized to $[0.0, 1.0]$ and weighted at 20% to capture complex cost/duration/tranche anomalies without overwhelming explicit completion integrity rule violations.

---

## 4. How Feature 1 Affects Downstream Features

Feature 1 acts as a **critical prerequisite** for the remaining features in the deadline scope:

### A. Feature 2 (Cost Benchmarking & Sanction-Amount Anomaly Detection)
* **Dataset Handoff:** Feature 2 will ingest `shared_preprocessing_artifacts/fact_work_feature1.parquet` as its primary starting dataset.
* **Analytical Interaction:** Feature 2 evaluates *sanction-stage cost overruns/outliers* within peer groups. Cross-referencing Feature 2's `cost_risk_score` with Feature 1's `disbursement_risk_score` allows the system to distinguish between works that were **over-priced at recommendation time** (Feature 2) vs works that were **under-funded/un-disbursed upon completion** (Feature 1).

### B. Feature 5 (Vendor Concentration Risk)
* **Analytical Interaction:** Feature 5 analyzes vendor payment concentration (`vendor_id` spend share & HHI). Vendors receiving concentrated payments on projects tagged as `Critical` disbursement risk in Feature 1 will receive elevated risk weighting.

### C. Feature 7 (MP / District Composite Risk Score)
* **Direct Integration:** Feature 7 rolls up individual feature scores to `mp_key` and state levels. Feature 1's `disbursement_risk_score` serves as one of the 3 primary sub-scores, carrying a **40% weight** in the final composite scorecard.

---

## 5. Next Step Handoff Instructions for the Next Engineer
When starting the next feature (**Feature 2 — Cost Benchmarking**):
1. **Source Data:** Read `shared_preprocessing_artifacts/fact_work_feature1.parquet` (or `.csv`) instead of `fact_work` or raw CSVs.
2. **Key Preservation:** Maintain `work_key`, `category_nlp`, `disbursement_risk_score`, and `disbursement_risk_tier` intact.
3. **Execution Script:** Refer to `notebooks/feature1.ipynb` or `feature1.md` as the blueprint for cell structure and Colab compatibility.
