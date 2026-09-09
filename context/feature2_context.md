# Feature 2 Context: Cost Benchmarking & Sanction-Amount Anomaly Detection

## 1. What We Did
We implemented **Feature 2**, an end-to-end quantitative statistical and Machine Learning pipeline designed to detect **cost overrun anomalies, sanction-amount inflation, and peer-group outliers** across the MPLADS portfolio (43,150 works).

### Core Work Completed
- **Data Ingestion & Linkage:** Ingested `shared_preprocessing_artifacts/fact_work_feature1.parquet` (preserving all Feature 1 fields such as `work_key`, `category_nlp`, and `disbursement_risk_score`) and extracted `sanction_amount` and `recommended_amount`.
- **Data Cleaning & Log Transformation:** Filtered invalid or missing sanction amounts into `Unknown / Invalid` cost tiers. Applied log-transformation ($\log(1 + \text{sanction\_amount})$) to handle cost distributions spanning over 3 orders of magnitude (₹10,000 to ₹5,000,000+).
- **Robust Statistical Peer Grouping:** Constructed `peer_group_key = (state_key, category_nlp)` combining regional location with Feature 3's NLP work categories. Derived peer medians and Median Absolute Deviation (MAD). Applied national `category_nlp`-only fallback for thin groups ($N < 10$) and enforced a $0.02$ MAD variance floor to prevent zero-variance division errors.
- **Multivariate ML Model (Local Outlier Factor - LOF):** Trained a scikit-learn `LocalOutlierFactor(n_neighbors=20, contamination=0.03, novelty=True)` model on 2 features:
  1. `log_sanction_amount` ($\log(1 + \text{sanction\_amount})$)
  2. `log_desc_length` ($\log(1 + \text{desc\_token\_count})$)
  *This captures local multivariate anomalies where work cost is disproportional to project specification detail (e.g. ₹1 Crore sanction with a 2-word description).*
- **Blended Risk Score & Tiers:** Unified univariate MAD Z-scores (40%), peer median cost ratio overrun magnitude (35%), and LOF anomaly scores (25%) into a normalized `cost_risk_score` ($0.0 - 1.0$) mapped across 5 risk tiers:
  - **Critical** (2.1%, 899 works): Cost ratio $\ge 3.0\times$ peer median or $Z \ge 4.0$.
  - **High** (3.9%, 1,698 works): Cost ratio $2.0\times - 3.0\times$ peer median or $Z \ge 2.5$.
  - **Medium** (4.4%, 1,910 works): Cost ratio $1.5\times - 2.0\times$ peer median or $Z \ge 1.5$.
  - **Low** (68.4% overall, 29,493 works): Standard cost alignment.
  - **Unknown / Invalid** (21.2%, 9,150 works): Non-sanctioned or missing amount records.
- **Visualizations & Audit Explanations:** Created natural-language explanations for audit triage, a 3-panel distribution summary (`feature2_cost_distribution.png`), and 3 specialized diagnostic plots (`costoutlierdistribution.png`, `actualvspeermediancost.png`, `multivariateLOFvsUnivariateScore.png`) integrated into `notebooks/feature2.ipynb` Cell 10.
- **Documentation:** Created comprehensive `feature2_explanation.md` detailing domain rationale, cell-by-cell walkthrough, and empirical plot analyses.

---

## 2. What It Produces
Feature 2 exports clean artifacts adhering to the system separation between canonical shared data and feature-specific internal models:

1. **Canonical Shared Fact Table (`shared_preprocessing_artifacts/fact_work_feature2.parquet` & `.csv`):**
   - **Primary data bus output for downstream features.**
   - Enriches canonical `fact_work` with Feature 2 metrics: `cost_risk_score`, `cost_risk_tier`, `cost_risk_explanation`, `peer_median_amount`, `cost_ratio_to_peer_median`, `cost_zscore`, `lof_anomaly_score`, `peer_group_key`, and `peer_group_size`.
2. **Feature Artifacts Directory (`feature2_artifacts/`):**
   - `feature2_fact_work_cost_risk.csv` & `.parquet`: Full work dataset enriched with Feature 2 metrics.
   - `feature2_cost_risk_worklist.csv`: Filtered priority audit worklist of top 2,597 `Critical` and `High` cost risk anomalies.
   - `feature2_lof_model.joblib`: Exported scikit-learn LOF model pipeline (`imputer` + `scaler` + `model`).
   - `feature2_run_metadata.json`: Run execution metadata, parameter settings, risk tier counts, and artifact index.
   - **Plots:** `feature2_cost_distribution.png`, `costoutlierdistribution.png`, `actualvspeermediancost.png`, `multivariateLOFvsUnivariateScore.png`.

---

## 3. Key Engineering Decisions Preserved
These design decisions **must be preserved** in all future pipeline iterations:
- **Pandas Join & Merge Protection:** Coerced `peer_group_key` explicitly to `str` before merging, and dropped pre-existing aggregated stats columns prior to merging to prevent suffix collisions (`_x`, `_y`) and pandas `ValueError` dtype mismatches between categorical Parquet columns and string groupby objects.
- **Log-Scale Normalization:** Log-transforming sanction amounts stabilizes MAD z-scores across multi-million rupee variances.
- **Hierarchical Fallback:** State-level peer groups preserve local economic and geographic baseline costs; national fallbacks stabilize small peer groups ($N < 10$).
- **MAD Variance Floor:** Enforced $0.02$ floor on MAD to prevent division-by-zero in uniform cost categories.
- **Complementary Multivariate Modeling:** LOF score provides neighborhood density anomaly detection that catches works with extreme cost-to-description ratios even when univariate z-scores are moderate.

---

## 4. How Feature 2 Affects Downstream Features

Feature 2 serves as a core input for downstream features in the deadline pipeline:

### A. Feature 5 (Vendor Concentration Risk)
- **Data Bus Ingestion:** Feature 5 ingests `shared_preprocessing_artifacts/fact_work_feature2.parquet` to combine vendor payment concentration (`vendor_id` HHI) with high cost-risk works.
- **Cross-Feature Synergy:** Vendors receiving disproportionate spend on works tagged with `Critical` cost risk in Feature 2 receive elevated risk weighting.

### B. Feature 7 (MP / District Composite Risk Score)
- **Direct Integration:** Feature 7 rolls up individual feature scores to `mp_key` and state levels. Feature 2's `cost_risk_score` serves as one of the 3 primary sub-scores, carrying a **35% weight** in the final composite scorecard.

---

## 5. Next Step Handoff Instructions for the Next Engineer
When starting downstream development:
1. **Source Data:** Read `shared_preprocessing_artifacts/fact_work_feature2.parquet` (or `.csv`) as the primary input.
2. **Key Preservation:** Preserve `work_key`, `category_nlp`, `disbursement_risk_score`, `disbursement_risk_tier`, `cost_risk_score`, and `cost_risk_tier` intact.
3. **Notebook Blueprint:** Refer to `notebooks/feature2.ipynb` and `feature2_explanation.md` for standard Colab compatibility patterns, drive detection, and error handling.
