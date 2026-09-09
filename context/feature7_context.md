# Feature 7 Context: Unified Composite MP & Constituency Risk Scorecard

## 1. What We Did
We implemented **Feature 7**, the end-to-end quantitative score unification and risk scorecard pipeline designed to roll up work-level, cost-level, and vendor-level anomaly signals into a **Unified Composite MP & Constituency Risk Scorecard** across all 774 Members of Parliament.

### Core Work Completed (Per `unified_risk_score_plan.md`)
- **Data Ingestion & Multi-Source Data Bus Resolution:** Ingested `dim_mp`, `fact_work_feature5` (carrying upstream Feature 1 `disbursement_risk_score`, Feature 2 `cost_risk_score`, and Feature 3 `category_nlp`), `fact_expenditure`, and `feature5_vendor_risk`.
- **Sub-Score Aggregation & Winsorization:** Aggregated three distinct sub-scores per MP ($i \in \{1 \dots 774\}$):
  1. **Disbursement Risk Sub-Score ($S_{\text{F1}, i}$):** Mean `disbursement_risk_score` across linked expenditure works per MP.
  2. **Cost Risk Sub-Score ($S_{\text{F2}, i}$):** Mean `cost_risk_score` across valid-cost works per MP.
  3. **Vendor Concentration Sub-Score ($S_{\text{F5}, i}$):** Mean `vendor_risk_score` of the top 3 most-utilized contractors per MP.
  *Applied outlier Winsorization at the 1st and 99th percentiles to prevent extreme single-project outliers from skewing MP rankings.*
- **Z-Score Standardization:** Derived population-standardized scores ($Z_{\text{F1}}, Z_{\text{F2}}, Z_{\text{F5}} \sim \mathcal{N}(0, 1)$) to eliminate scale dominance and equalize numerical variance across feature dimensions.
- **Pairwise Correlation Diagnostic & Weight Selection:** Computed the pairwise Pearson correlation matrix $R$. Confirmed non-collinearity across dimensions ($r_{\text{F1, F2}} = 0.21$, $r_{\text{F1, F5}} = 0.24$, $r_{\text{F2, F5}} = 0.21 \le 0.70$), validating **Strategy A (Equal Weighting $w = 0.333 / 0.333 / 0.333$)** without requiring collinear dimension averaging.
- **Composite Risk Assembly & Percentile Tiering:** Min-Max normalized raw composite scores to $[0.0, 1.0]$ and assigned risk tiers using exact empirical percentiles:
  - **Critical** (Top 10%, 78 MPs): Score $\ge P_{90}$ ($0.4431$).
  - **High** (Next 15%, 116 MPs): Score $\in [P_{75}, P_{90})$ ($0.3181 - 0.4431$).
  - **Medium** (Next 25%, 193 MPs): Score $\in [P_{50}, P_{75})$ ($0.2190 - 0.3181$).
  - **Low** (Bottom 50%, 387 MPs): Score $< P_{50}$ ($< 0.2190$).
- **Efficiency Decoupling:** Maintained `allocation_utilization_pct` ($\text{Total Sanctioned} / \text{Allocated Amount}$) strictly separate as an administrative efficiency context metric, never blending it into fraud/anomaly risk.
- **Audit Explanations & Visualizations:** Generated natural language explanations (`composite_risk_explanation`), a 3-panel visualization figure (`feature7_risk_distribution.png`), priority audit worklists, and metadata JSON.

---

## 2. What It Produces
Feature 7 exports clean artifacts adhering to system separation between canonical shared data and feature-specific scorecards:

1. **Canonical Shared Fact Table (`shared_preprocessing_artifacts/fact_work_feature7.parquet` & `.csv`):**
   * **Final Data Bus Output for the deadline scope.**
   * Enriches canonical `fact_work` with MP-level composite metrics: `mp_composite_risk_score` and `mp_composite_risk_tier`.
2. **Feature Artifacts Directory (`feature7_artifacts/`):**
   * `feature7_mp_composite_risk.parquet` & `.csv`: Master MP scorecard containing sub-scores ($S_{\text{F1}}, S_{\text{F2}}, S_{\text{F5}}$), standardized Z-scores ($Z_{\text{F1}}, Z_{\text{F2}}, Z_{\text{F5}}$), composite scores, risk tiers, and natural-language explanations.
   * `feature7_priority_mp_audit_worklist.csv`: Filtered priority audit list of top 194 `Critical` and `High` risk MPs.
   * `feature7_run_metadata.json`: Execution metadata, correlation matrix, weights used, percentile cutoffs, tier counts, and artifact index.
   * `feature7_risk_distribution.png`: 3-panel diagnostic visualization figure (Correlation Heatmap + Score Distribution + Risk Tier Breakdown).

---

## 3. Key Engineering Decisions Preserved
These design decisions **must be preserved** in all future pipeline iterations:
- **Z-Score Standardization Before Weighting:** Standardizing sub-scores prevents wide-spread anomaly features from silently dominating the composite score.
- **Correlation Diagnostic Gate:** Weighting strategies automatically check $r > 0.70$ collinearity before applying weights.
- **Top-3 Vendor Attribution:** Attribution of vendor concentration risk to MPs relies on the top 3 most-utilized contractors by disbursed amount.
- **Strict Efficiency Decoupling:** `allocation_utilization_pct` remains an independent context metric to prevent administrative underspending from being misclassified as financial corruption.
- **Data Bus Handoff Chain:** `fact_work_feature7` maintains full backward compatibility with all fields from `fact_work_feature5`, `fact_work_feature2`, `fact_work_feature1`, and `shared_preprocessing_artifacts`.
