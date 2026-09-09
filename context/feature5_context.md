# Feature 5 Context: Vendor Concentration Risk

## 1. What We Did
We implemented **Feature 5**, an end-to-end quantitative statistical and Machine Learning pipeline designed to detect **vendor spend concentration risk, single-MP contractor monopolies, split allocations, and vendor-MP collusion signals** across the MPLADS vendor ecosystem.

### Core Work Completed
- **Data Ingestion & Data Bus Resolution:** Ingested `shared_preprocessing_artifacts/fact_expenditure` and merged payment tranches with `fact_work_feature2` (preserving `cost_risk_score`, `disbursement_risk_score`, and category taxonomy from upstream features).
- **Noise Filtering & Thresholding:** Filtered tiny administrative correction tranches ($< \text{₹}500$) for spend share calculations. Categorized low-volume vendors ($\text{total spend} < \text{₹}50,000$ or $< 2$ tranches) as `Low Volume / Unrated` to eliminate false alarms on small suppliers.
- **Quantitative Concentration Indices (HHI & Spend Shares):** Grouped spend by `vendor_id` and `mp_key` to calculate:
  - `top_mp_spend_share`: Share of total vendor spend originating from a single top MP relationship.
  - `hhi_within_mp`: Herfindahl-Hirschman Index ($\sum s_i^2$) measuring spend concentration across Members of Parliament.
  - `n_distinct_mps` & `n_distinct_idas`: Count of unique MPs and district implementation authorities served.
- **Cross-Feature Synergy Metrics:** Derived `mean_work_cost_risk` (from Feature 2), `mean_work_disbursement_risk` (from Feature 1), and `high_risk_work_ratio` (ratio of projects handled carrying Critical/High risk in F1 or F2).
- **Multivariate ML Model (Isolation Forest):** Trained a scikit-learn `IsolationForest(n_estimators=100, contamination=0.03)` model on 5 scaled features:
  1. `top_mp_spend_share`
  2. `hhi_within_mp`
  3. `log_total_disbursed` ($\log(1 + \text{total\_disbursed})$)
  4. `high_risk_work_ratio`
  5. `mean_work_cost_risk`
  *This captures complex multivariate anomalies where high spend volume, single-MP concentration, and high work risk scores interact.*
- **Unified Risk Score & Tier Assignment:** Unified Concentration Sub-scores (35%), Risk Synergy Sub-scores (30%), Isolation Forest anomaly scores (25%), and Single-MP High Spend Penalties (10%) into a normalized `vendor_risk_score` ($0.0 - 1.0$) mapped across 5 tiers: `Critical`, `High`, `Medium`, `Low`, and `Low Volume / Unrated`.
- **Audit Explanations & Visualizations:** Created natural-language audit explanation strings (`vendor_risk_explanation`), a 3-panel visualization figure (`feature5_vendor_concentration_distribution.png`), priority audit worklists, and metadata JSON.
- **Documentation:** Created comprehensive `feature5_explanation.md` detailing domain rationale, cell-by-cell walkthrough, ML architecture, math formulas, and empirical plot analyses.

---

## 2. What It Produces
Feature 5 exports clean artifacts adhering to system separation between canonical shared data and feature-specific models:

1. **Canonical Shared Fact Table (`shared_preprocessing_artifacts/fact_work_feature5.parquet` & `.csv`):**
   * **Primary data bus output for downstream Feature 7 (Composite MP Risk Score).**
   * Enriches canonical `fact_work` with work-level vendor metrics: `vendor_id`, `vendor_risk_score`, `vendor_risk_tier`, `vendor_risk_explanation`, `vendor_hhi_mp`, and `vendor_top_mp_share`.
2. **Feature Artifacts Directory (`feature5_artifacts/`):**
   * `feature5_vendor_risk.csv` & `.parquet`: Full vendor master dataset enriched with spend shares, HHI, and blended risk scores.
   * `feature5_vendor_risk_worklist.csv`: Filtered priority audit list of top `Critical` and `High` vendor anomalies.
   * `feature5_isolation_forest.joblib`: Exported scikit-learn Isolation Forest model pipeline (`imputer` + `scaler` + `model`).
   * `feature5_run_metadata.json`: Run execution metadata, parameter settings, timestamp, and tier counts.
   * `feature5_vendor_concentration_distribution.png`: 3-panel diagnostic visualization plot.

---

## 3. Key Engineering Decisions Preserved
These design decisions **must be preserved** in all future pipeline iterations:
- **Canonical Contracting & Defensive Column Fallbacks:** Cell 3 explicitly prioritizes `vendor_clean` (normalized name from `SharedPreprocessing`) and `vendor_raw` (raw name) for vendor name resolution, while retaining defensive fallbacks (`vendor_name_raw`, `vendor_name`) to prevent KeyError crashes across CSV/Parquet formats in Google Colab.
- **Noise Floor Filtering:** Administrative tranches below ₹500 are excluded from HHI share math to prevent small adjustments from distorting concentration ratios.
- **Low-Volume Thresholding:** Vendors below ₹50,000 spend or under 2 tranches are categorized as `Low Volume / Unrated` to eliminate false alarms on small one-off suppliers.
- **Single-MP Penalty Boost:** Vendors receiving 100% of spend from a single MP above ₹15L/₹50L thresholds receive an explicit penalty boost (+0.10 to +0.20).
- **Data Bus Continuity:** The updated table `shared_preprocessing_artifacts/fact_work_feature5.parquet` maintains full backward compatibility with all fields from `fact_work_feature2.parquet` and `fact_work_feature1.parquet`.

---

## 4. How Feature 5 Affects Downstream Features (Feature 7)

Feature 5 is the **final prerequisite feature** before Feature 7:

### Feature 7 (MP / Constituency Composite Risk Score)
- **Direct Integration:** Feature 7 rolls up work-level, cost-level, and vendor-level anomaly scores to `mp_key` and state levels.
- **Score Weighting:** Feature 5's vendor risk metrics serve as one of the 3 primary sub-scores, carrying a **25% weight** in the final composite scorecard:
  $$\text{Composite Risk Score}_{\text{MP}} = 0.40 \times \text{Disbursement Risk}_{\text{F1}} + 0.35 \times \text{Cost Risk}_{\text{F2}} + 0.25 \times \text{Vendor Risk}_{\text{F5}}$$
- **MP Portfolio Attribution:** For a given MP, Feature 7 calculates the mean `vendor_risk_score` of their top 3 most-utilized vendors (`mean_vendor_risk_top3`), measuring whether an MP relies heavily on high-risk, concentrated contractors.

---

## 5. Next Step Handoff Instructions for the Next Engineer
When starting the final feature (**Feature 7 — Composite MP / Constituency Risk Score**):
1. **Source Data:** Read `shared_preprocessing_artifacts/fact_work_feature5.parquet` (or `.csv`) as the primary input dataset.
2. **Key Preservation:** Preserve `work_key`, `mp_key`, `category_nlp`, `disbursement_risk_score`, `disbursement_risk_tier`, `cost_risk_score`, `cost_risk_tier`, `vendor_id`, `vendor_risk_score`, and `vendor_risk_tier` intact.
3. **Execution Script:** Refer to `notebooks/feature5.ipynb` and `feature5_explanation.md` as the blueprints for Colab compatibility, drive detection, and data bus handoff patterns.
