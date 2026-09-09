Feature 5: Vendor Concentration Risk 
1.1 Objective
Feature 5 — Vendor Concentration Risk is designed to identify favoritism, contractor monopolies, split-work allocations, and potential vendor-MP collusion within the Member of Parliament Local Area Development Scheme (MPLADS).

In public infrastructure programs, a common pattern of inefficiency or financial irregularity occurs when a single commercial entity (vendor) receives a disproportionately large share of project funds allocated by a specific Member of Parliament (MP) or District Implementation Authority (IDA).

Feature 5 evaluates vendor spend distributions using quantitative concentration indices—specifically the Herfindahl-Hirschman Index (HHI) and Top-MP Spend Share—and synergizes them with project-level risk metrics derived from upstream features (Feature 1 Disbursement Shortfalls and Feature 2 Cost Outliers).

1.2 Role in the Composite Risk Scorecard (Feature 7 Integration)
Feature 5 serves as the third primary pillar of the unified MPLADS risk architecture. In Feature 7 (MP / Constituency Composite Risk Score), individual work and vendor metrics are aggregated to the MP level (mp_key):

Attribution Mechanism:
Tranche-Level Linkage: Payment tranches in fact_expenditure link vendor_id to work_key and mp_key.
Vendor Master Scoring: Feature 5 computes vendor_risk_score for each entity resolved vendor (vendor_id).
MP Portfolio Attribution: For a given MP, Feature 5 calculates the mean vendor_risk_score of their top 3 most-utilized vendors (mean_vendor_risk_top3), measuring whether an MP relies heavily on high-risk, concentrated contractors.
