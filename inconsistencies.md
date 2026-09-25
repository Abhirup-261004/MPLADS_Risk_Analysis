# MPLADS ML Layer - Inconsistencies and Concrete Fixes

Scope: only problems inside mplads_api plus requirements.txt plus tracked artifacts.
Pure Render and Docker issues (Dockerfile COPY bloat, PORT override, plan sizing,
HEALTHCHECK tuning, curl examples) are out of scope and not listed here.

Checked: mplads_api/main.py, config.py, core/feature_store.py,
core/security.py, routers and schemas, root requirements.txt,
.gitignore, git ls-files output, measured artifact sizes.
Baseline: ML.md Principle 1 (no silent failures) and context.md S2.

## ML-1 - verify_api_key never rejects (open public API)

Location: mplads_api/core/security.py lines 7-14, config.py line 18, all routers.

Observed: the mismatch branch is a silent pass, no router depends on
verify_api_key, and config.py defaults API_KEY to a hardcoded string so the
secret ships inside any image. The plan calls the service internal, but a Render
web service gets a public URL, so anyone can call score and nlp endpoints
bypassing Express JWT.

Fix:
1. Enforce fail-closed in security.py, keep an explicit local-dev escape hatch.
2. config.py must default API_KEY to None (no hardcoded secret).
3. Attach Depends(verify_api_key) to every router except /health and /.
4. Express mlController.js forwards X-API-Key (backend contract change).
5. Update plan S8 and S14: image contains no secret, key required in prod.

Verify: request without header returns 401, with correct header returns 200,
/health returns 200 without a key.

## ML-2 - Five anomaly models loaded but never used for inference

Location: feature_store.py lines 190-209, all routers, ML.md F1 ensemble text.

Observed: f1_iforest, f2_lof, f5_iforest, f7_kmeans and f7_iforest are loaded
at startup but no router reads them. Only nlp_classifier is live. All served
scores come from pre-computed parquet columns. ML.md says F1 is a 5-seed
ensemble, the repo has a single feature1_isolation_forest.joblib.

## ML-3 - Silent or-zero and Low defaults hide data gaps

Location: routers/disbursement.py lines 15-22, routers/cost.py lines 15-21,
routers/vendor.py lines 19-29, routers/mp_risk.py lines 19-20.

Observed: null or missing parquet columns are coerced to 0.0 or Low, meaning
all-clear. ML.md Feature 1 requires coverage_flag disbursement_unknown with no
score, and Feature 7 requires Complete, Partial and Insufficient tiers with 197
MPs as Unknown. An Insufficient MP is currently returned as Low with score 0.0.

Fix: keep schemas, add explicit unknown signalling. Disbursement rows with null
score or disbursement_unknown coverage return tier Unknown, not Low. Cost rows
with peer_group_size 0 or null score return Unknown. MP rows with all subscores
null or quality Insufficient return Unknown / Insufficient Data. Use small
mapping helpers per router so valid rows stay byte-identical.

Verify: a disbursement_unknown work and an Insufficient MP return Unknown tier.

## ML-4 - requirements.txt floats everything except sklearn

Location: repo-root requirements.txt; plan S2 and S14 claim deterministic builds.

Observed: only scikit-learn is pinned to 1.6.1. lightgbm, pandas, numpy,
pyarrow, fastapi, pydantic, joblib, httpx and pytest all float. LightGBM 4.x
cannot reliably unpickle a 3.x pipeline, and pandas 3.x or numpy 2.x can break
parquet reads. Training env was python 3.11, local probe here is python 3.13.

Fix: freeze serving deps with == from a green local run that passes
mplads_api/tests, keep scikit-learn==1.6.1 untouched, document python 3.11.
Policy: never bump requirements without re-exporting ALL joblibs. No retrain
is needed for this fix, only exact upper bounds.

Verify: fresh docker build with no cache plus pytest is green, and
joblib.load of feature3_tfidf_lightgbm_classifier.joblib plus predict works.

## ML-5 - Invalid CORS wildcard plus credentials

Location: mplads_api/main.py lines 27-33. Plan S14 rates CORS Very Low.

Observed: allow_origins star plus allow_credentials True is rejected by
browsers. Harmless today because Express uses server-side fetch, but any direct
browser call to FastAPI docs or debug endpoints fails opaquely.

Fix: restrict to no browser origins since the Express proxy is the only caller,
set allow_credentials False, allow only GET and POST, allow only X-API-Key and
Content-Type. Or list the exact frontend origin if docs UI needs browser access.
Express proxy path is unchanged.

Verify: preflight from a disallowed origin is blocked, Express fetch works.

## ML-6 - Dead CSV fallback paths that can never trigger

Location: feature_store.py lines 82, 96, 112-113 and 159-160.

Observed: code falls back to read_csv or feature7_mp_composite_risk.csv and
feature5_vendor_risk.csv when parquet is missing. But .gitignore line 22 has a
global star-csv rule, and git ls-files confirms only parquet, joblib and json
are tracked. No CSV can exist in Docker.

Fix: remove read_csv branches, require parquet explicitly, log the exact
missing file. Keep the one legitimate fallback that exists:
feature1 parquet to shared_preprocessing_artifacts/fact_work_feature7.parquet.
Update the plan so it stops claiming CSV exclusion matters.

Verify: with parquet present behavior is identical, with parquet deleted the
log names the missing file instead of trying an impossible CSV.

## ML-7 - Blocking iterrows startup load with no readiness signal

Location: main.py lifespan lines 13-16, feature_store.py lines 83-106, 118-171.

Observed: synchronous per-row iterrows plus sanitize_record, double-keyed
work_index (both work_id and work_key point at full duplicated dicts), and the
DataFrames are kept plus the dict indexes. That explains the 120MB versus 30MB
versus 200MB confusion across context.md and the plan. Render may restart the
container as unhealthy before load finishes.

Fix short-term without changing responses: skip audit-model loads by default
(see ML-2), delete f1_df and f2_df plus gc.collect after indexing, log indexed
counts plus RSS MB at the end of load_all. Medium-term: replace iterrows with
to_dict records batch loop and store one dict per work with work_key as a
string alias to work_id. Do not switch to lazy per-request disk reads here
because that would create a latency regression.

Verify: /health counts unchanged, sampled score payloads byte-identical,
startup seconds and RSS drop.

## Explicitly out of scope (deployment-only, not fixed here)

Dockerfile whole-directory COPY versus selective copy, render.yaml PORT 8000
override, starter plan sizing, health grace periods, keep-alive rationale,
validation curl URL-encoding examples such as SANJAY_SETH which actually
returns 400 plus candidates per resolve_mp, FASTAPI_URL wiring order, cost
table, tag and rollback procedure.

## Suggested verification order (local, no infra change)

1. pytest mplads_api/tests -q baseline.
2. Apply ML-1 plus ML-5, re-run tests with MPLADS_API_KEY unset and set.
3. Apply ML-3, assert gap fixtures return Unknown and valid fixtures identical.
4. Apply ML-2 plus ML-6 plus ML-7 short-term, compare health and samples.
5. Freeze requirements (ML-4), docker build with no cache, full test run.
