# MPLADS Risk Analytics — ML Architecture

**Problem Statement ID 26102** — AI-powered anomaly, fraud & inefficiency detection for the Members of Parliament Local Area Development Scheme (MPLADS)

---

## The Simple Explanation — What This System Does and Why

Imagine you are auditing how thousands of government development projects across India are funded, approved, and completed. Every Member of Parliament (MP) receives a fixed annual allocation (around Rs.5 crore/year) to sanction local public works — roads, lights, water pipelines, hospitals, schools — through their constituency. The money flows through a chain:

**MP recommends a work → District Authority (IDA) sanctions it → A vendor executes it → Payments are disbursed in tranches → Work is marked Completed**

With over **43,000 works** across both Lok Sabha and Rajya Sabha MPs, spanning hundreds of districts and thousands of vendors, it is physically impossible for a small audit team to manually review every transaction for red flags. This is where the ML system steps in.

The system is a **multi-layer risk scoring engine** that reads 13 government CSV data files, cleans and normalizes them into a reliable internal database, then runs five specialized ML models — each looking for a different kind of problem — and finally rolls everything up into a single per-MP composite risk scorecard that prioritizes where auditors should look first.

### The Five Risk Dimensions the System Covers

| Feature | What it looks for | Type of risk |
|---|---|---|
| **Feature 1** | Works where disbursed money is far less than what was sanctioned, yet marked "Completed" | Integrity / Diversion |
| **Feature 2** | Works priced far above or below comparable works of the same type in the same region | Fraud / Over-invoicing |
| **Feature 3** | Classifies what type of work each project really is (the raw data is 97% "Normal/Others") | Prerequisite layer for F1, F2, F5, F7 |
| **Feature 5** | Vendors receiving a disproportionate share of payments from a single MP or district | Collusion / Favoritism |
| **Feature 7** | Per-MP composite scorecard aggregating all signals above into one ranked risk tier | Dashboard / Prioritization |

> **Note:** Features 4 (Duplicate/Structuring Detection), 6 (Process Delay & Fund-Parking), 8 (State Utilization Forecast), and 9 (Calamity Fund Anomaly) are designed in the architecture but were **not yet implemented as executed notebooks in this release**. The five features above are fully implemented, trained, and have produced scored artifacts.

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          RAW DATA (13 CSV Files)                             │
│  Allocated Limits · Expenditure · Works Sanctioned/Recommended/Completed    │
│  Calamity Consents · State-Wise Summary                                      │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SHARED PREPROCESSING LAYER                                │
│  SharedPreprocessing.ipynb                                                   │
│                                                                              │
│  Step 1: Structural Cleaning (drop footer rows, parse Rs amounts, dates)    │
│  Step 2: Entity Resolution (mp_key · work_id · vendor_id · ida_key)         │
│  Step 3: Star Schema Assembly                                                │
│                                                                              │
│  Outputs: dim_mp · fact_work · fact_expenditure · fact_calamity             │
│           vendor_resolution_table · fact_work_quarantine                     │
└───────┬──────────────────┬────────────────────┬──────────────────┬──────────┘
        │                  │                    │                  │
        ▼                  ▼                    │                  │
┌───────────────┐  ┌───────────────┐            │                  │
│  FEATURE 3    │  │  FEATURE 1    │            │                  │
│  NLP Work     │  │  Disbursement │            │                  │
│  Categorizer  │  │  Shortfall    │            │                  │
│  (Prerequisite│  │  Integrity    │            │                  │
│   for F1,F2,  │  │  Score        │            │                  │
│   F5, F7)     │  │               │            │                  │
└───────┬───────┘  └───────┬───────┘            │                  │
        │ category_nlp     │ disbursement_risk   │                  │
        │  injected into   │  score              │                  │
        │  fact_work       │                     │                  │
        ▼                  ▼                     ▼                  ▼
┌───────────────┐  ┌───────────────┐   ┌───────────────┐  ┌───────────────┐
│  FEATURE 2    │  │  FEATURE 5    │   │  (Feature 4)  │  │  (Feature 6)  │
│  Cost         │  │  Vendor       │   │  Duplicate    │  │  Process      │
│  Benchmarking │  │  Concentration│   │  Detection    │  │  Delay        │
│  & Anomaly    │  │  & Collusion  │   │  [Designed,   │  │  [Designed,   │
│  Detection    │  │  Network Risk │   │   not yet     │  │   not yet     │
│               │  │               │   │   executed]   │  │   executed]   │
└───────┬───────┘  └───────┬───────┘   └───────────────┘  └───────────────┘
        │ cost_risk_score  │ vendor_risk_score
        │                  │
        └──────────────────┘
                  │ All sub-scores
                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FEATURE 7                                            │
│             MP Composite Risk Scorecard & Risk Tier Assignment               │
│                                                                              │
│  Input: F1 disbursement score · F2 cost score · F5 vendor score             │
│  ML: Weighted Aggregation → K-Means Clustering → Isolation Forest           │
│                                                                              │
│  Output: Per-MP risk score + tier (Critical / High / Medium / Low)          │
│          774 MPs scored: 23 Critical, 35 High, 132 Medium, 387 Low          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The Data Bus Pattern

All features share artifacts through a **common Parquet-based data bus** stored in `shared_preprocessing_artifacts/`. Each feature notebook reads from this bus and writes enriched fact tables back to it (`fact_work_feature1.parquet`, `fact_work_feature2.parquet`, etc.), so downstream features can pick up the enriched columns without re-running expensive upstream computations.

---

## Shared Preprocessing Layer

**Notebook:** `SharedPreprocessing.ipynb`
**Artifacts:** `shared_preprocessing_artifacts/`

### Why This Layer Exists

The 13 source CSV files come from a government portal export with significant data quality issues: footer "Grand Total" rows that corrupt numeric aggregations, MP names in completely different formats across Lok Sabha and Rajya Sabha files, Work IDs embedded inside free-text description strings rather than in separate columns, vendor names with hundreds of spelling variants for the same real-world entity, and two calamity files that are byte-for-byte identical duplicates. Without a centralized cleaning layer, every feature notebook would have to independently solve the same problems — leading to inconsistencies, divergent entity keys, and impossible-to-maintain code. This layer solves it once, validates it with Pydantic schemas, and gives every downstream feature a clean, consistent starting point.

### What It Does

**Step 1 — Structural Cleaning:**
- Drops footer rows where the primary key (`Sr. No.`) is non-numeric — catches "Grand Total" rows and blank-key rows in a single rule
- Strips stray whitespace, non-breaking spaces (`\xa0`), and embedded tab characters from every string column
- Parses all Rs amount columns using an Indian-numbering-aware parser that handles both plain digit strings (`197500`) and lakh/crore comma-grouped strings (`41,86,57,13,956.23`)
- Parses all date columns with `%d-%b-%Y` format (e.g., `08-Jul-2024`) and stores as `datetime64`
- Deduplicates the two identical calamity files to a single 20-row table

**Step 2 — Entity Resolution:**
- **`mp_key`**: Uppercases the MP name, strips honorifics (Dr., Shri, Smt, Ms, Kumari, etc.), strips trailing term-year parentheses like `(2026-32) (2026-2032)`, strips punctuation, collapses whitespace, and combines with `house in {LS, RS}` to create a stable join key across both houses
- **`work_id`**: Regex-extracts `WS/MP\d+/\d{4}-\d{4}/\d+` from the concatenated `Work` field (which embeds the ID inside a description string in 3 of the 4 work-lifecycle files), after removing embedded tabs. Success rate: ~99.995% on Lok Sabha data
- **`ida_key`**: Splits raw IDA strings like `"ARARIA(DISTRICT PLANNING OFFICER ARARIA_IDA)"` into `district_name` (text before the parenthesis) and keeps the full raw string as `ida_raw`
- **`vendor_key`**: Uppercases, strips legal-suffix noise (PVT, PRIVATE, LTD, LIMITED, &, punctuation), collapses whitespace, then applies **fuzzy blocking** using RapidFuzz `token_sort_ratio >= 90` within the same state to merge near-duplicate vendor name strings into a canonical `vendor_id`

**Step 3 — Fact-Table Assembly:**
Assembles a clean star schema:
- `dim_mp` — one row per MP (mp_key, house, state, constituency, allocated_amount)
- `fact_work` — one row per work (work_id, mp_key, state, ida_key, category, amounts, dates, work_status)
- `fact_expenditure` — one row per payment tranche (work_id, mp_key, ida_key, vendor_id, expenditure_date, payment_status, fund_disbursed_amount)
- `fact_calamity` — one row per calamity consent from the deduplicated 20-row table
- `vendor_resolution_table` — vendor_id to vendor_name mapping with fuzzy-match confidence
- `fact_work_quarantine` — rows that failed parsing validation and need manual review

**How It Does It:**
- Python + pandas for batch cleaning (largest file is 21K rows — no Spark needed at this scale)
- RapidFuzz for fuzzy vendor name resolution
- Pydantic BaseModel schemas (`DimMPRow`, `FactWorkRow`) to validate each fact table's row shape before allowing it downstream
- Parquet as the storage format for efficient columnar reads by downstream features

**What It Provides to Risk Analysis:**
- A clean, entity-resolved, schema-validated data bus of **43,150 total work rows** across both houses
- `fact_work_quarantine` containing rows with data issues (quarantined, not silently dropped) so they can be reviewed separately
- `vendor_resolution_table` mapping 9,170 raw vendor name strings to canonical `vendor_id` values
- The foundation that makes all five risk features consistent with each other — same MP keys, same work IDs, same amounts

---

## Feature 3 — NLP Work Categorization

**Notebook:** `feature3.ipynb`
**Artifacts:** `feature3_artifacts/`

> **Important:** Feature 3 is listed here **before** Features 1 and 2 because it is a **prerequisite** for both. It runs first in the pipeline DAG and injects `category_nlp` into the shared fact table. Features 1 and 2 depend on this column to form meaningful peer groups for comparison.

### Why This Feature Was Added

The raw `Work Category` field in the source data is essentially useless: **97%+ of all works are tagged `"Normal/Others"`**, with only `Repair and Renovation`, `Trust and Society`, and `Bar and Associations` appearing otherwise. Without a meaningful category label, it is impossible to answer the most basic question in cost anomaly detection: *"Is this work priced normally compared to similar works?"* You cannot benchmark a road against a hospital. Feature 3 solves this by mining the free-text `Work Description` field — which does contain real information like "High Mast Light", "PCC Road", "Construction of ambulances" — and using ML to assign each work a meaningful category label.

A second reason: the description corpus is **bilingual**. It contains pure English (`"Installation of Semi High Mast Lights..."`), transliterated Hindi (`"navi vasahat faliya ma bore motor nu kam"`), and mixed forms. A plain English TF-IDF or English-only BERT model would treat the Hindi tokens as noise. The architecture specifically chooses a multilingual embedding model to handle this.

### What It Does

1. **Categorizes** all 43,150 works into a 12-class taxonomy of meaningful infrastructure types (Road & Pathway, Street Lighting & Solar Energy, Drinking Water, Sanitation & Drainage, etc.)
2. **Flags category mismatches** — cases where the declared `Work Category` column and the NLP-inferred category disagree in a way suggesting miscoding or mischaracterization
3. Injects the `category_nlp` column into the shared fact table so all other features can use it as a peer-grouping key

### How It Does It

**Stage 1 — Text Preprocessing:**
- Lowercases, strips punctuation, removes pure placeholder descriptions (null, "NA", etc.)
- De-duplicates exact-text descriptions before embedding to avoid bulk-rollout descriptions (one MP had the same description 118 times for multi-village rollouts) from dominating cluster centroids. The label is re-attached to all instances after clustering.
- Explicitly does **not** strip non-English tokens — the code-mixed Hindi terms carry real signal

**Stage 2 — Multilingual Sentence Embeddings:**
- Model: **`paraphrase-multilingual-MiniLM-L12-v2`** (Sentence Transformers) — 384-dimensional embeddings per description
- Runs on GPU (CUDA) in Colab if available, falls back to CPU
- Produces embeddings for all unique description texts (not duplicates), saved as `description_embeddings.npy`

**Stage 3 — UMAP Dimensionality Reduction:**
- Reduces 384 embedding dimensions to **15 components** using UMAP with `n_neighbors=30`, `min_dist=0.0`, cosine metric
- Purpose: improves density-based clustering quality and tractability; the saved UMAP model is `feature3_umap.joblib` (235 MB — the full fitted reducer)
- Run across **3 random seeds** (42, 52, 62) for stability assessment

**Stage 4 — HDBSCAN Clustering:**
- **Algorithm: HDBSCAN** (Hierarchical Density-Based Spatial Clustering of Applications with Noise)
- Parameters: `min_cluster_size=30`, `min_samples=10`
- Why HDBSCAN over K-Means: the true number of work-types is unknown upfront, HDBSCAN handles noise points (genuinely ambiguous descriptions) natively without forcing every row into a cluster, and it finds clusters of varying densities
- Produces **290 clusters** across the corpus; saved as `feature3_hdbscan.joblib`
- Each cluster is reviewed via `feature3_cluster_review.csv` (centroid-representative descriptions per cluster)

**Stage 5 — Taxonomy Alignment & Label Assignment:**

A **12-category provisional taxonomy** is defined with semantic prototypes and keyword lists:

| Category | Example keywords |
|---|---|
| Road & Pathway Infrastructure | road, pathway, paver, culvert, bridge, CC road |
| Street Lighting & Solar Energy | light, lighting, solar, LED, high mast |
| Drinking Water Infrastructure | water supply, RO plant, borewell, pipeline, pumping |
| Sanitation & Drainage | drain, drainage, sewer, toilet, sanitation |
| School & Education Infrastructure | school, classroom, college, library, laboratory |
| Healthcare & Ambulance Services | hospital, health, medical, ambulance, clinic |
| Community & Public Buildings | community hall, community center, building, shelter, anganwadi |
| Agriculture & Irrigation | irrigation, agriculture, farm, canal, check dam |
| Sports & Recreation | sport, playground, stadium, gym, recreation |
| Religious & Cultural Infrastructure | temple, mandir, mosque, church, cultural |
| Other Public Infrastructure | public, civic, infrastructure (catch-all) |
| Unclassified | Confidence too low to assign any category |

Each HDBSCAN cluster is matched to the nearest taxonomy label using a **hybrid scoring**: 70% semantic similarity (cosine distance between cluster centroid and taxonomy prototype embedding) + 30% keyword overlap. `prototype_confidence_threshold = 0.55` — clusters below this threshold are labeled "Unclassified".

Stability: **83.7% of descriptions agree** on the same category across all 3 random seeds; 16.3% are "unstable" (assigned different labels by different seeds).

**Stage 6 — Supervised Classification (Production Layer):**
- Training data: HDBSCAN-labeled descriptions with prototype confidence >= 0.55 and >= 20 training samples per class
- **Algorithm: TF-IDF Vectorizer + LightGBM Classifier** (scikit-learn Pipeline) — enables instant categorization of any new incoming work description without re-running the full embedding + clustering pipeline
- Saved as `feature3_tfidf_lightgbm_classifier.joblib`
- New works classified using the supervised model; fallback to prototype cosine similarity for categories without sufficient training data
- **Noise rate:** 27.2% of descriptions end up as "Unclassified" (genuinely ambiguous or too short to categorize reliably) — these receive `category_nlp = "Unclassified"` rather than a forced label

**Stage 7 — Category Mismatch Detection:**
- Compares `category_nlp` (ML-assigned) against the raw `Work Category` field
- Any disagreement between an explicit (non-generic) declared category and the NLP-inferred category is flagged as `category_mismatch_flag = True`
- Result: 0 mismatch flags in this run (because 97%+ of declared categories are generic "Normal/Others", leaving little to disagree with)

**Key Numbers:**
- 43,150 total works categorized
- 290 HDBSCAN clusters found
- 83.7% stable category assignment rate (agreement across 3 seeds)
- 27.2% noise/unclassified rate

### What It Provides to Risk Analysis

- **`category_nlp` column** in `fact_work` — the single most important enrichment for all downstream features. Without this, peer-group comparisons in Feature 1 and Feature 2 would be meaningless (comparing a hospital to a road)
- **`category_mismatch_flag`** — a low-weight integrity signal (miscoding is usually clerical, rarely fraudulent, but worth logging)
- **`feature3_work_categories.parquet`** — enriched work table with category, confidence, cluster_id, and mismatch flag for every work

---

## Feature 1 — Fund Disbursement Shortfall & Completion Integrity Score

**Notebook:** `feature1.ipynb`
**Artifacts:** `feature1_artifacts/`

### Why This Feature Was Added

This feature targets **the strongest quantitative anomaly signal in the entire dataset**, measured empirically during data profiling. When joining sanctioned works against expenditure records: 354 of 897 matched works (39%) show more than 5% shortfall between the sanctioned amount and the total actually disbursed — with extreme cases showing -82%, -80%, -79% shortfalls on works marked "Work Completed". A work officially marked as completed but where only 18% of the sanctioned money can be traced to actual payment tranches is a credible red flag for diverted funds, prematurely-closed records, or fabricated completions. No ML is required to recognize this is worth flagging — but ML is needed to score it fairly across different work types, states, and funding sizes, and to catch subtler multi-variable combinations that a simple threshold rule would miss.

### What It Does

Scores every work in the portfolio on a `disbursement_risk_score in [0, 1]` that reflects how anomalous its disbursement pattern is relative to comparable works. A high score means: money was sanctioned but significantly less was actually disbursed, in a way that is unusual even compared to similar works in the same state and category.

### How It Does It

**Data Coverage Handling (Critical Design Decision):**

The join between sanctioned works and expenditure tranches covers only ~67% of works (29,013 linked rows out of 43,150 total). The remaining 14,137 works have no linked expenditure records. The architecture handles this explicitly:
- Works with linked records get a full risk score
- Works with no linked records get `coverage_flag = "disbursement_unknown"` and **no risk score** — they are not scored as "zero risk" or "maximum risk"; they are put on a **data-completeness worklist** for separate review
- This distinction is non-negotiable: silently treating unlinked works as "all clear" would hide a large fraction of the portfolio from scrutiny

**Two Parallel Shortfall Measures:**
- `shortfall_deficit_pct_final` — using the `Works_Completed` file's `Amount Disbursed` field (only for formally closed works)
- `shortfall_deficit_pct_tranche` — using the **sum of all expenditure tranches** from `fact_expenditure` grouped by `work_id` (exists for any work with at least 1 payment)

Both are computed and kept because they answer different questions: the first asks "is the closure record itself inconsistent with the sanctioned amount?" while the second asks "is money actually moving at the pace the sanction implies?"

**Chronological Train/Validation/Holdout Split:**
- Split method: **chronological date split** on sanction/observation date
- Training: 30,062 rows
- Validation: 9,968 rows
- Holdout: 3,120 rows

This is critical: peer-group statistics (medians, MADs) are computed **only on the training partition** and applied to validation/holdout — preventing data leakage where future works influence the baseline for past works.

**Peer-Group Statistical Scoring:**

Works are grouped into peer groups by `(state, category_nlp)` — statistics computed only from the training partition. Within each peer group, a **robust z-score** is computed using MAD (Median Absolute Deviation) rather than standard deviation, because amount distributions are heavily right-skewed:

```
peer_shortfall_zscore = (shortfall_deficit_pct - peer_median) / (1.4826 x peer_MAD)
```

Fallback hierarchy when a peer group is too small:
1. State + Category (state_category): 26,286 rows resolved this way
2. Category nationally (category_national): 16,862 rows
3. Global fallback: 2 rows only

This peer normalization is what makes the score fair: a category with natural cost savings (bulk equipment purchases) will show negative shortfalls for legitimate reasons — the z-score controls for this by comparing within category, not across the whole portfolio.

**Isolation Forest ML Augmentation:**

A multivariate **Isolation Forest** is trained on 6 features using only the training partition:

```
Features used:
  - shortfall_deficit_pct_tranche
  - shortfall_deficit_pct_final
  - tranche_count_clean
  - days_sanction_to_last_tranche
  - work_status_ordinal  (0=Time Estimation, 1=Vendor ID, 2=Physical Inspection,
                          3=Sanction, 4=Work partially Completed, 5=Work Completed)
  - log_sanction_amount
```

- `n_estimators=100`, `contamination=0.03`
- **5-seed ensemble** (seeds 42, 52, 62, 72, 82) — final anomaly score is the mean of per-seed training-quantile-normalized scores, reducing sensitivity to any single random initialization
- **RobustScaler** applied before fitting; **SimpleImputer** (median strategy) for missing values
- Saved as `feature1_isolation_forest.joblib`

The Isolation Forest catches combinations the univariate z-score misses — e.g., a work with a moderate shortfall but an unusually long payment tail and a high sanction amount is more suspicious than any of those features alone.

**Completion Integrity Rules (Hard Rule Boosts):**
- `critical_completion_shortfall`: work is formally completed AND has a final disbursement record AND that shortfall > 50% → hard boost to risk score
- `severe_completion_shortfall`: similar rule with a lower threshold
- These apply **only when both a completion record and final disbursement exist** — not on works that are simply missing data

**Blended Score Assembly:**
The final `disbursement_risk_score` is a sigmoid-normalized blend of:
- Peer z-score (rescaled)
- Isolation Forest anomaly score (mean of 5-seed ensemble)
- Completion integrity rule boosts

Score normalized to `[0, 1]` and binned into tiers: Low / Medium / High / Critical.

**Natural Language Explanation Generator:**
Each row gets a `disbursement_risk_explanation` field generated automatically — e.g., "Sanctioned Rs.448,127. Only Rs.220,000 (50.9% shortfall) traced to expenditure tranches. Shortfall is 3.4 standard deviations above peer group median for Road & Pathway Infrastructure in Bihar."

### What It Provides to Risk Analysis

- **`disbursement_risk_score`** per work (0-1 continuous) and **`disbursement_risk_tier`** (Low/Medium/High/Critical)
- **`feature1_disbursement_risk_worklist.csv`** — top anomalies (Critical and High tier works) ready for auditor review
- **`coverage_flag`** per work — `linked_final`, `linked_tranche`, or `disbursement_unknown` (data gap worklist)
- **`peer_shortfall_zscore`** and **`iforest_anomaly_score`** — individual sub-scores for explainability
- These scores are consumed by Feature 7 to contribute to the MP-level composite risk score

---

## Feature 2 — Cost Benchmarking & Sanction-Amount Anomaly Detection

**Notebook:** `feature2.ipynb`
**Artifacts:** `feature2_artifacts/`

### Why This Feature Was Added

Even if money is disbursed correctly, the original sanctioned price could be inflated. A classic fraud pattern in public works is "same asset, wildly different price" — one MP sanctions a community hall for Rs.200,000 while another in the same state sanctions an identical community hall for Rs.2,000,000. Without a category taxonomy (which Feature 3 provides), this comparison is impossible. With it, Feature 2 can compute what a fair market rate looks like for each work type in each state, then flag works priced far outside that range.

A key data finding drives this: **Sanction Amount always equals Recommended Amount** (confirmed on 13,681 matched work IDs with 0% deviation). This means there is no "sanction-stage padding" to detect — the anomaly is in the *original recommendation price*, not in any approval-stage modification.

### What It Does

Scores every work on a `cost_risk_score in [0, 1]` reflecting how anomalous its sanctioned amount is relative to comparable works. Also generates a cost-vs-peer visualization and explanation for each flagged work.

### How It Does It

**Feature Engineering:**
- `log_sanction_amount = log(1 + sanction_amount)` — log transformation because raw amounts span three orders of magnitude (Rs.12,881 to Rs.4.6 crore)
- `peer_group_key = (state, category_nlp)` — the primary peer group; falls back to `(category_nlp)` nationally if state-level group has fewer than 10 members
- `desc_token_count` — number of words in the description; very short descriptions on high-cost works is itself a mild risk signal ("vague high-cost" works)
- `log_mp_work_count_category` — how many works of this category this MP has recommended total (controls for volume)

**Chronological Train/Validation/Holdout Split:**
- Training cutoff: November 12, 2025
- Validation: up to March 28, 2026
- Holdout: up to September 7, 2026

**Peer-Group Robust Z-Score:**
Trained only on the training partition:

```
upper_cost_zscore = (log_sanction_amount - peer_median_log_amount) / (1.4826 x peer_MAD_log_amount)
```

Only the **upper tail** (overpriced works) is scored — works priced lower than peers are not fraudulent.

`sanction_peer_ratio = sanction_amount / peer_median_amount` — a directly interpretable number (e.g., "this work costs 4.2x the median for its type in this state").

**Local Outlier Factor (LOF) ML Augmentation:**
- **Algorithm: Local Outlier Factor** (scikit-learn, fitted on training partition)
- Why LOF over Isolation Forest here: cost anomalies are *local* — a work can be normal nationally but anomalous for its specific district/category combination. LOF is specifically designed for local density-based outlier detection, making it more suitable than Isolation Forest's global partitioning approach for this problem
- Features: `[log_sanction_amount, desc_token_count, upper_cost_zscore, log_mp_work_count_category]`
- Fitted with **RobustScaler** + **SimpleImputer** (median strategy)
- Output: `lof_anomaly_score in [0, 1]` (normalized from raw LOF scores using the training partition's quantile distribution)
- Saved as `feature2_lof_model.joblib`

**Blended Cost Risk Score — Validated Candidate C Weights:**

After validation experiments, the selected weights (summing to 1.0):

```
cost_risk_score = 0.40 x z_score_component
                + 0.35 x lof_anomaly_component
                + 0.25 x peer_ratio_component
                + 0.10 boost (if vague high-cost: amount >= Rs.1M AND token_count < 5)
```

Score normalized using percentile clipping at Q1=0.963 and Q99=1.524 from the training set.

**Risk Tier Distribution:**

| Tier | Count |
|---|---|
| Low | 28,657 |
| Medium | 2,751 |
| High | 1,760 |
| Critical | 832 |
| Unknown / Invalid | 9,150 |

**Visual Artifacts:**
- `feature2_parity_outliers.png` — log-log scatter of actual sanction amount vs. peer median amount, colored by risk tier (parity line shows where cost equals median)
- `feature2_lof_vs_zscore.png` — scatter of LOF score vs. robust z-score (verifying independence of the two signals)
- `feature2_category_outliers.png` — distribution of cost risk scores per NLP category

### What It Provides to Risk Analysis

- **`cost_risk_score`** per work (0-1) and **`cost_risk_tier`** (Low/Medium/High/Critical)
- **`sanction_peer_ratio`** — directly interpretable: "This work costs X times the typical work in this category in this state"
- **`peer_group_size`** and **`effective_peer_median_amount`** — transparency for the auditor to assess whether the peer comparison is based on enough data
- **`cost_risk_explanation`** — natural language: "Sanctioned Rs.1,875,000 for Community Hall Construction in Karnataka. Peer median: Rs.480,000 (3.9x above median). Z-score: 5.1. LOF anomaly: 0.88."
- These scores feed directly into Feature 7's MP composite score

---

## Feature 5 — Vendor Concentration & Collusion Network Risk

**Notebook:** `feature5.ipynb`
**Artifacts:** `feature5_artifacts/`

### Why This Feature Was Added

In public works contracting, a healthy vendor ecosystem means multiple contractors compete for work across different MPs and districts. A red flag is when a single vendor receives a disproportionate share of payments from **one specific MP** — especially if that vendor's works also show elevated cost or disbursement risk. This pattern can indicate kickback arrangements, favoritism, or collusion where the MP effectively controls both the recommendation and the execution side. Feature 5 detects this concentration pattern and also checks whether a vendor's overall payment profile looks anomalous in aggregate.

### What It Does

Scores every vendor on a `vendor_risk_score in [0, 1]` based on how concentrated their payment stream is, how risky the works they are associated with appear from Features 1 and 2, and whether their overall financial profile is anomalous compared to other vendors.

### How It Does It

**Vendor Coverage Context:**
- Total vendors processed: 9,170 (from vendor_resolution_table)
- **Active vendors** (meeting minimum tranche threshold for meaningful scoring): 2,550
- Total known vendor spend: Rs.4.62 billion (60.8% coverage of all disbursements)
- Total unknown vendor spend: Rs.2.98 billion (39.2% — works where vendor could not be resolved)
- Multi-vendor works (works with more than one vendor): 852 — handled via a `fact_work_vendor` bridge table linking works to multiple vendors

**Noise Floor Filtering:**
Tranches below Rs.500 are excluded from spend calculations — these are administrative correction entries that distort concentration metrics.

**Vendor-Level Aggregation Metrics:**
Computed per `vendor_id` from `fact_expenditure`:
- `total_disbursed` — total amount paid to this vendor
- `n_tranches` — number of payment tranches received
- `n_distinct_works` — number of unique works this vendor worked on
- `n_distinct_mps` — number of different MPs this vendor has worked for
- `n_distinct_idas` — number of different district authorities this vendor has worked under
- `top_mp_spend_share` — fraction of the vendor's total spend that came from their single top MP (ranges 0 to 1.0; 1.0 = 100% from one MP)
- `mean_work_cost_risk` — average Feature 2 cost risk score across all this vendor's works
- `mean_work_disbursement_risk` — average Feature 1 disbursement risk score across all this vendor's works
- `high_risk_work_ratio` — fraction of the vendor's works that are High or Critical tier in either F1 or F2

**Herfindahl-Hirschman Index (HHI) Concentration:**

Measures market concentration — applied here within each vendor's MP-spend distribution:

```
hhi_within_mp = Sum of (share_from_each_mp)^2
```

HHI ranges from near 0 (spread across many MPs) to 1.0 (100% from one MP). A vendor with HHI=1.0 has all their revenue from a single MP — the most concentrated possible arrangement.

**Isolation Forest ML Augmentation:**
- Features: `[top_mp_spend_share, hhi_within_mp, log_total_disbursed, high_risk_work_ratio, mean_work_cost_risk]`
- Standard Isolation Forest (`n_estimators=100`, `contamination=0.03`, `random_state=42`)
- Applied **only to active vendors** (2,550) — inactive low-volume vendors are not ML-scored to avoid distortion from statistically thin data
- Saved as `feature5_isolation_forest.joblib`

**Three-Component Blended Vendor Risk Score:**

1. **Concentration sub-score** = 0.50 x `top_mp_spend_share` + 0.50 x `hhi_within_mp`
   → Contribution weight: **35%** of final score

2. **Risk synergy sub-score** = 0.40 x `mean_work_cost_risk` + 0.40 x `mean_work_disbursement_risk` + 0.20 x `high_risk_work_ratio`
   → Contribution weight: **30%** of final score
   *(This cross-feature enrichment is the key insight: a vendor concentrated with one MP is more alarming if that MP's works are also expensive and under-disbursed)*

3. **Isolation Forest anomaly score** (normalized to [0,1])
   → Contribution weight: **25%** of final score

4. **Single-MP high-volume penalty boost** applied on top if both concentration is high AND total spend from one MP is large

**Work-Vendor Bridge Table:**
Feature 5 generates `fact_work_vendor.parquet` — a `(work_key, vendor_id)` bridge table that allows Feature 7 to attribute vendor risk back to the MP who recommended the works containing this vendor.

### What It Provides to Risk Analysis

- **`vendor_risk_score`** per vendor (0-1) and **`vendor_risk_tier`** (Low/Medium/High/Critical)
- **`hhi_within_mp`** and **`top_mp_spend_share`** — directly interpretable concentration metrics
- **`n_distinct_mps`** and **`n_distinct_idas`** — context for interpreting concentration fairly (a vendor serving 1 MP in a remote district with few contractors is very different from one serving 1 MP in a large urban district)
- **`vendor_risk_explanation`** — e.g., "100% of this vendor's disbursed value comes from a single MP. Total: Rs.18.4M across 109 tranches. Works associated with this vendor have elevated cost risk (mean 0.71)."
- **`feature5_vendor_risk.parquet`** — master vendor risk table consumed by Feature 7
- **`fact_work_vendor.parquet`** — bridge table enabling MP-level vendor risk attribution in Feature 7

---

## Feature 7 — MP Composite Risk Scorecard

**Notebook:** `feature7.ipynb`
**Artifacts:** `feature7_artifacts/`

### Why This Feature Was Added

Features 1, 2, and 5 produce work-level and vendor-level risk scores. But the Ministry's auditors need to know **which MPs to investigate**. Feature 7 is the aggregation and prioritization layer: it rolls all signals up to the MP level, applies statistical normalization to ensure fair comparison across MPs with different portfolio sizes and data coverage, and produces the final ranked list that drives audit prioritization. It also adds a cluster-based ML layer to discover natural groupings among MPs by risk profile, and an Isolation Forest layer to flag MPs whose overall profile is anomalous in ways a linear scorecard might underweight.

### What It Does

Produces a per-MP `ml_augmented_composite_risk_score in [0, 1]` and `ml_augmented_risk_tier` (Low/Medium/High/Critical) for all 774 MPs with sufficient data. Also generates a 4-panel diagnostic visualization for monitoring and explainability.

### How It Does It

**Step 1 — Exposure-Aware MP Sub-Score Aggregation:**

For each upstream feature, scores are aggregated to the MP level using a **financial exposure-weighted average** rather than a simple mean:

```
mp_f1_subscore = Sum(disbursement_risk_score x sanction_amount) / Sum(sanction_amount)
```

This weighting means a high-risk Rs.5-crore work contributes proportionally more to an MP's risk profile than a high-risk Rs.50,000 work — financial exposure is the appropriate weight because larger works represent larger public fund risk.

Three sub-scores computed per MP:
- `s_f1` — Feature 1 exposure-weighted disbursement risk
- `s_f2` — Feature 2 exposure-weighted cost risk
- `s_f5` — Feature 5 vendor risk attributed to the MP via the `fact_work_vendor` bridge table

Each sub-score is accompanied by a **coverage rate** — the fraction of the MP's works that contributed to the score. MPs with low coverage rates get `composite_data_quality_tier = "Partial"` or `"Insufficient"`.

**Step 2 — Winsorization & Z-Score Standardization:**

Before combining sub-scores across MPs:
- Each sub-score is **winsorized** at the 1st and 99th percentile — prevents a single extreme outlier MP from compressing all other MPs' scores to a narrow band
- Each winsorized sub-score is **z-score standardized**: `z = (value - mean) / std`

This transforms all three sub-scores to the same scale regardless of their original units.

A **Pearson correlation matrix** is computed across `[z_s_f1, z_s_f2, z_s_f5]` as a validation diagnostic — if all three sub-scores were near-perfectly correlated, the composite would be redundant. The expected outcome is moderate positive correlation (high-disbursement-shortfall MPs also tend to have higher cost anomalies) but not near-collinear.

**Step 3 — Composite Score Assembly (Bias-Safe):**

Key design principle: if an MP has only one or two sub-scores (because their works don't appear in all features), **the composite is computed over only the observed dimensions**, not over a zero-padded full vector. Imputing missing sub-scores as zero would systematically understate risk for MPs whose feature coverage happens to be lower:

```
raw_composite_score = mean(observed z-scores only)
```

An MP with zero observed sub-scores gets `raw_composite_score = NaN`, not 0.

Data quality classification:
- `"Complete"` — all 3 sub-scores observed: **251 MPs**
- `"Partial"` — 1 or 2 sub-scores observed: **326 MPs**
- `"Insufficient"` — 0 sub-scores: **197 MPs** → labeled "Unknown / Insufficient Data"

**Step 4 — ML Layer 1: K-Means Risk Tier Clustering:**
- **Algorithm: K-Means** with `k=4` (corresponding to 4 risk tiers: Low/Medium/High/Critical)
- Input: `[z_s_f1, z_s_f2, z_s_f5]` — NaN values filled with 0.0 for clustering
- `n_init=20`, `random_state=42`
- A **Gaussian Mixture Model (GMM)** is also fitted as a soft-boundary alternative where tier boundaries should be probabilistic rather than hard
- K-Means cluster assignment (`mp_kmeans_tier`) provides data-driven tier cutpoints that do not depend on arbitrary fixed thresholds
- Saved as `feature7_kmeans_model.joblib`

**Step 5 — ML Layer 2: Isolation Forest Outlier Detection:**
- Applied **only to "Complete" MPs** (all 3 sub-scores observed) — partial MPs retain their observed baseline score without ML augmentation that could be distorted by imputed zeros
- Input: `[z_s_f1, z_s_f2, z_s_f5]` (no imputation needed for this subset)
- `n_estimators=100`, `contamination=0.03`, `n_jobs=-1`
- Output: `mp_iforest_score in [0, 1]` (normalized from raw Isolation Forest decision function)
- Purpose: flags MPs who are outliers in ways the linear scorecard underweights — e.g., an MP with moderate scores on all three dimensions, but in a combination that is genuinely unusual compared to other MPs
- Saved as `feature7_isolation_forest.joblib`

**Step 6 — Calibrated Threshold Tiers (v2.0):**

Tier cutpoints calibrated to achieve target audit precision levels on the validation partition:

```
Critical threshold: 0.70   (target precision on audit outcomes: 80%)
High threshold:     0.50   (target precision: 60%)
Medium threshold:   0.30
```

Threshold version: `v2.0_calibrated` / source: `validation_partition_audit_capacity`

**Final MP Tier Distribution:**

| Tier | MP Count |
|---|---|
| Critical | 23 |
| High | 35 |
| Medium | 132 |
| Low | 387 |
| Unknown / Insufficient Data | 197 |

**Natural Language Audit Explanation:**
Each MP row gets a `composite_risk_explanation` string — e.g., "MP is rated HIGH risk. Disbursement shortfall risk (z=2.1) suggests funds may not be fully reaching sanctioned works. Cost anomaly risk (z=1.8) indicates several works priced above comparable peer works in this state. Vendor concentration risk (z=1.4) — primary vendor receives 78% of this MP's disbursements."

**Visual Artifact:**
`feature7_risk_distribution.png` — 4-panel diagnostic figure:
1. Sub-score Pearson correlation matrix heatmap
2. ML-augmented composite risk score distribution by tier
3. K-Means cluster vs. ML-augmented tier cross-tabulation
4. Isolation Forest score distribution for Complete MPs

### What It Provides to Risk Analysis

- **`ml_augmented_composite_risk_score`** and **`ml_augmented_risk_tier`** per MP — the primary output of the entire system; the ranked list that drives audit prioritization
- **`composite_data_quality_tier`** — transparency about how much data backed each MP's score (Complete / Partial / Insufficient)
- **`score_percentile`** — where each MP sits in the national distribution (diagnostic only, not used for tiering)
- **`feature7_mp_composite_risk.parquet`** — the final MP scorecard consumed by the dashboard layer
- **`composite_risk_explanation`** — natural language explanation for every MP's score, ready for display in the audit dashboard

---

## Architecture Execution DAG

```
SharedPreprocessing.ipynb
        │
        ├── produces: dim_mp, fact_work, fact_expenditure,
        │              fact_calamity, vendor_resolution_table
        │
        ▼
feature3.ipynb   ← MUST run BEFORE feature1, feature2, feature5, feature7
        │
        ├── reads:    fact_work (from shared_preprocessing_artifacts)
        │
        ├── produces: fact_work_feature3.parquet (with category_nlp column)
        │              feature3_tfidf_lightgbm_classifier.joblib
        │              feature3_hdbscan.joblib
        │              feature3_umap.joblib
        │              description_embeddings.npy
        │
        ▼
feature1.ipynb AND feature2.ipynb  ← can run in parallel after F3
        │
        ├── reads:    fact_work_feature3.parquet (for category_nlp peer groups)
        │              fact_expenditure (for tranche sums)
        │
        ├── produces: feature1_fact_work_disbursement_risk.parquet
        │              feature1_isolation_forest.joblib
        │              feature2_fact_work_cost_risk.parquet
        │              feature2_lof_model.joblib
        │
        ▼
feature5.ipynb  ← reads from F1 and F2 outputs for risk synergy sub-score
        │
        ├── reads:    fact_expenditure
        │              fact_work_feature2.parquet (for cost_risk + disbursement_risk per work)
        │
        ├── produces: feature5_vendor_risk.parquet
        │              feature5_isolation_forest.joblib
        │              fact_work_vendor.parquet (work-to-vendor bridge table)
        │
        ▼
feature7.ipynb  ← reads from F1, F2, F5 outputs
        │
        ├── reads:    fact_work (with F1 + F2 scores merged in)
        │              feature5_vendor_risk.parquet
        │              fact_work_vendor.parquet (bridge)
        │              dim_mp
        │
        └── produces: feature7_mp_composite_risk.parquet
                        feature7_kmeans_model.joblib
                        feature7_isolation_forest.joblib
```

---

## Features Designed but Not Yet Executed

| Feature | Description | Key ML approach planned |
|---|---|---|
| Feature 4 | Duplicate / Split-Work ("Structuring") Detection | FAISS approximate nearest-neighbor search on embeddings + NetworkX graph connected-components for duplicate cluster identification |
| Feature 6 | Process Delay & Fund-Parking Risk | LightGBM regression on work completion duration; Cox Proportional Hazards survival analysis to handle right-censored (still-open) works |
| Feature 8 | State / District Fund-Utilization Trend & Forecast | Theil-Sen robust linear regression on quarterly cumulative utilization (Prophet/SARIMA deferred until 3+ years of data accumulate) |
| Feature 9 | Calamity-Fund Consent Anomaly Detection | Rule-based engine only (dataset is 20 rows post-deduplication — any ML model would overfit completely) |

---

## Model Artifacts Summary

| Artifact | Location | Description |
|---|---|---|
| `feature3_sentence_transformer/` | `feature3_artifacts/` | Saved `paraphrase-multilingual-MiniLM-L12-v2` weights |
| `feature3_umap.joblib` | `feature3_artifacts/` | Fitted UMAP reducer (384 to 15 dims), 235 MB |
| `feature3_hdbscan.joblib` | `feature3_artifacts/` | Fitted HDBSCAN clusterer (290 clusters) |
| `feature3_tfidf_lightgbm_classifier.joblib` | `feature3_artifacts/` | Production TF-IDF + LightGBM 12-class classifier |
| `description_embeddings.npy` | `feature3_artifacts/` | 384-dim embeddings for all unique work descriptions |
| `feature1_isolation_forest.joblib` | `feature1_artifacts/` | 5-seed ensemble Isolation Forest for disbursement risk |
| `feature2_lof_model.joblib` | `feature2_artifacts/` | Local Outlier Factor model for cost benchmarking |
| `feature5_isolation_forest.joblib` | `feature5_artifacts/` | Isolation Forest for vendor concentration risk |
| `feature7_kmeans_model.joblib` | `feature7_artifacts/` | K-Means (k=4) for MP risk tier clustering |
| `feature7_isolation_forest.joblib` | `feature7_artifacts/` | Isolation Forest for MP-level composite outlier detection |

---

## Six Key Design Principles

**1. No silent failures.**
Every data gap — unlinked works, unknown vendors, missing categories — is explicitly flagged in the output rather than treated as "zero risk." This is why `coverage_flag`, `composite_data_quality_tier`, and `category_nlp_source` exist in the outputs.

**2. Peer-group comparison, not global thresholds.**
Every anomaly score is computed relative to comparable works (same state, same NLP category), not against a single national baseline. This controls for legitimate variation (rural vs. urban construction costs, category-specific patterns) without manually encoding every exception.

**3. Chronological data splitting.**
All model training uses only past data to fit parameters, and all peer-group statistics are computed on the training partition only. This prevents temporal data leakage where future observations influence baseline statistics for past works.

**4. Explainability by default.**
Every scored entity — works, vendors, MPs — gets a natural language explanation string that a non-ML auditor can read and act on. The system is designed to assist human auditors, not replace them.

**5. Match model complexity to data volume.**
Feature 3 uses deep multilingual embeddings because the bilingual text signal genuinely requires it. Feature 9 (20-row calamity dataset) uses purely rule-based logic. Feature 8 uses linear trend extrapolation rather than a full seasonal forecasting model because only 2-3 years of history exist. Each model is sized to what the data can actually support.

**6. The data bus pattern.**
All features share a common Parquet artifact store in `shared_preprocessing_artifacts/`. Each feature reads enriched artifacts from upstream features (particularly `category_nlp` from Feature 3) without re-running those computations. This makes the system maintainable, ensures all features use consistent entity keys and amounts, and means the pipeline can be reproduced by running notebooks in DAG order.
