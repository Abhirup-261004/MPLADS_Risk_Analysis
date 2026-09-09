# Feature 2 — Cost Benchmarking & Sanction-Amount Anomaly Detection: Technical Explanation

---

## 1. What This Feature Does

**Feature 2** implements an end-to-end quantitative and machine learning pipeline designed to detect **cost benchmarking anomalies and sanction-amount overruns** across the MPLADS (Member of Parliament Local Area Development Scheme) project portfolio (43,150 total works).

Specifically, it evaluates whether the sanctioned amount for an individual work is statistically abnormal when compared to comparable works of the same physical asset type (`category_nlp`), located within the same state (`state_key`), and executed under similar conditions.

### Primary Outputs & Artifacts Produced
1. **`cost_risk_score`**: A unified, normalized continuous anomaly score $\in [0.0, 1.0]$.
2. **`cost_risk_tier`**: A 5-tier risk categorization (`Critical`, `High`, `Medium`, `Low`, `Unknown / Invalid`).
3. **`cost_risk_explanation`**: Natural language audit explanation strings designed for UI dashboard display.
4. **Canonical Shared Data Bus Output (`shared_preprocessing_artifacts/fact_work_feature2.parquet` & `.csv`)**: Enriched work fact table updating the shared pipeline bus for downstream features (e.g. Feature 5 Vendor Concentration and Feature 7 Composite Risk Score).
5. **Feature Internal Artifacts (`feature2_artifacts/`)**:
   * `feature2_fact_work_cost_risk.parquet` & `.csv`: Complete work dataset enriched with Feature 2 metrics.
   * `feature2_cost_risk_worklist.csv`: Prioritized triage worklist of top 2,597 `Critical` and `High` cost anomalies for manual audit.
   * `feature2_lof_model.joblib`: Serialized scikit-learn Local Outlier Factor (LOF) model pipeline (`imputer` + `scaler` + `model`).
   * `feature2_run_metadata.json`: Execution metadata, parameters, timestamp, and risk tier counts.
   * Visualizations: `feature2_cost_distribution.png`, `actualvspeermediancost.png`, `multivariateLOFvsUnivariateScore.png`, `costoutlierdistribution.png`.

---

## 2. Why Does It Do It? (Domain & Business Rationale)

1. **Detecting Pricing Overruns & Fraud Patterns:**
   In public infrastructure fund management, one of the classic fraud and inefficiency patterns is **sanction-stage price inflation** — approving a project at $3\times$ to $10\times$ the price of identical works in the same region (e.g. sanctioning ₹198,000 for a standard solar street light in a district where the state median price is ₹22,000).
2. **Overcoming Raw Data Limitations:**
   In the raw source portal CSVs, over 97% of works are unhelpfully tagged under the generic category `"Normal/Others"`. Feature 2 leverages Feature 3's NLP-derived categories (`category_nlp`) to establish real-world, granular peer groups (e.g., "Road & Pathway Infrastructure", "Street Lighting & Solar Energy", "Drinking Water Infrastructure", "Community & Public Buildings").
3. **Targeting Recommendation-Time Anomalies:**
   Data profiling reveals that `Recommended Amount == Sanction Amount` for 100% of matched records in the dataset. Because sanctioning is functionally a rubber-stamp of the recommended amount, price padding occurs at recommendation time. Feature 2 benchmarks pricing at recommendation/sanctioning time to surface outlier pricing early.
4. **Delivering Actionable Audit Triage:**
   With over 43,000 projects, government audit teams cannot physically inspect every site. Feature 2 filters the dataset down to the top ~2.6% most severe cost overruns (`Critical`), providing a focused triage worklist for targeted physical and financial audits.

---
