What Feature 1: Fund Disbursement Shortfall & Completion Integrity Score Does
Feature 1 is an end-to-end risk scoring and anomaly detection pipeline designed to audit **fund disbursement integrity** across the entire MPLADS portfolio (43,150 works). 

Specifically, it:
1. Merges sanitized work lifecycle records with payment tranche expenditure rollups.
2. Quantifies relative disbursement shortfall between sanctioned amounts ($\text{sanction\_amount}$) and actual realized spending ($\text{effective\_disbursed}$).
3. Measures statistical peer-group deviation using robust Median Absolute Deviation (MAD) z-scores within state and NLP-derived work categories.
4. Fits an **unsupervised multivariate Machine Learning model (Isolation Forest)** across 5 features (cost scale, shortfall magnitude, payment tranche frequency, project duration, and stage progress) to detect complex fraud and inefficiency patterns.
5. Synthesizes a unified **Disbursement Risk Score ($0.0$ to $1.0$)**, assigns human-understandable **Risk Tiers** (`Critical`, `High`, `Medium`, `Low`, `Unknown / Unlinked`), and generates plain-English audit explanations for dashboard display.

---

### Why Feature 1 Does This
Data profiling (§1.2 of `ML_Architecture_fordeadline.md`) revealed that **disbursement shortfall on completed works is the single strongest, most concrete quantitative anomaly signal in the dataset**.

* **The Problem:** 39% of matched works exhibit $>5\%$ shortfall. Extreme cases show works marked as **`Work Completed`** in government records while suffering severe fund deficits of **$-71.7\%$**, **$-61.6\%$**, **$-59.7\%$**, **$-55.5\%$**, and **$-52.3\%$** relative to sanctioned funds.
* **Red-Flag Risks:** 
  * *Ghost Completion:* Works marked "Completed" on paper where funds were siphoned off or left unutilized.
  * *Financial Parking / Misreporting:* Unspent funds lying unaccounted for while administrative closure is logged.
  * *Multivariate Anomalies:* Projects with high sanction amounts (e.g. ₹25L–₹50L) exhibiting unusual stage-versus-disbursement patterns that univariate rules alone fail to catch.
