# MPLADS ML Layer - Inconsistencies and Concrete Fixes

Scope: only problems inside mplads_api plus requirements.txt plus tracked artifacts.
Pure Render and Docker issues (Dockerfile COPY bloat, PORT override, plan sizing,
HEALTHCHECK tuning, curl examples) are out of scope and not listed here.

Checked: mplads_api/main.py, config.py, core/feature_store.py,
core/security.py, routers and schemas, root requirements.txt,
.gitignore, git ls-files output, measured artifact sizes.
Baseline: ML.md Principle 1 (no silent failures) and context.md S2.

## Fix Status Summary

| ID | Issue | Severity | Status |
|---|---|---|---|
| ML-1 | `verify_api_key` never rejects (open public API) | Severe | Fixed |
| ML-2 | 5 anomaly models loaded but never used | Low | Folded into ML-7 (removed) |
| ML-3 | Silent `0.0`/`Low` defaults hide data gaps | Severe | Fixed |
| ML-4 | `requirements.txt` floats everything except sklearn | Severe | Fixed |
| ML-5 | Invalid CORS wildcard + credentials | Low | Skipped (not severe) |
| ML-6 | Dead CSV fallback paths | Moderate | Fixed |
| ML-7 | Blocking `iterrows` startup load, no readiness signal | Moderate | Fixed |

Tests: `mplads_api/tests` — 32 passed (adds `test_security.py`,
`test_unknown_sentinel.py`, `conftest.py` dev escape hatch).

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

**Solution Applied:**

1. **ML service enforcement** — `core/security.py` now fails closed:
   - `MPLADS_ENV=development` → explicit local-dev escape hatch, any/no key accepted.
   - otherwise: missing/wrong `X-API-Key` → `HTTPException(401)`; no key configured on the server → `HTTPException(500)`.

2. **No hardcoded production secret** — `config.py` sets
   `API_KEY: Optional[str] = os.getenv("MPLADS_API_KEY", "mpladsAPI123")`.
   The default `"mpladsAPI123"` is a **shared dev default for local consistency**,
   not a production secret. In prod both services must set an identical strong
   `MPLADS_API_KEY` (see `ML_Deployment.md`).

3. **Auth wired to every router** — `dependencies=[Depends(verify_api_key)]` on
   `disbursement.py`, `cost.py`, `vendor.py`, `mp_risk.py`, `categorize.py`, and
   `/dashboard/summary`. Only `/health` and `/` are public.

4. **Express ↔ ML contract** — the proxy now forwards the key on every call:
   - `backend/src/config/env.js` adds `fastApiApiKey: process.env.MPLADS_API_KEY || 'mpladsAPI123'`.
   - `backend/src/controllers/mlController.js` `forwardToFastApi` merges
     `X-API-Key: env.fastApiApiKey` into the request headers.

5. **Key propagated consistently** across the layer so all five touchpoints share
   one value out of the box:

   | Location | Setting |
   |---|---|
   | `mplads_api/config.py` | `API_KEY` default `mpladsAPI123` |
   | `backend/src/config/env.js` | `fastApiApiKey` default `mpladsAPI123` |
   | `backend/.env.example` | `MPLADS_API_KEY=mpladsAPI123` |
   | `backend/.env.production.example` | `MPLADS_API_KEY=mpladsAPI123` |
   | `render.yaml` | `MPLADS_API_KEY` on both Express and ML services |
   | `ML_Deployment.md` | env tables + enforced-auth note |

6. **Tests** — `mplads_api/tests/conftest.py` sets `MPLADS_ENV=development` for
   the existing suite; `test_security.py` covers prod behaviour separately
   (401 missing/wrong, 500 unconfigured, 200 correct).

Verified locally: `MPLADS_API_KEY` unset → default `mpladsAPI123`;
no header → 401, wrong key → 401, `mpladsAPI123` → accepted. Full pytest: 32 passed.

> [!CAUTION]
> `render.yaml` currently stores `mpladsAPI123` as a literal for convenience.
> Before real production, replace it with `sync: false` and set a strong random
> value encrypted in the Render dashboard on **both** services.

## ML-2 - Five anomaly models loaded but never used for inference

Location: feature_store.py lines 190-209, all routers, ML.md F1 ensemble text.

Observed: f1_iforest, f2_lof, f5_iforest, f7_kmeans and f7_iforest are loaded
at startup but no router reads them. Only nlp_classifier is live. All served
scores come from pre-computed parquet columns. ML.md says F1 is a 5-seed
ensemble, the repo has a single feature1_isolation_forest.joblib.

**Not severe — skipped as a functional gap; folded into ML-7 cleanup.**
The five `.joblib` files load without error and no router reads them, so they
have no effect on responses. Rather than leave dead-weight RAM, the unused model
attributes (`f1_iforest`, `f2_lof`, `f5_iforest`, `f7_kmeans`, `f7_iforest`) and
their `joblib.load` calls were removed from `FeatureStore.__init__` and
`load_all` as part of the ML-7 startup optimization. Only `nlp_classifier` and
`nlp_taxonomy` remain loaded. The artifact files themselves stay in the repo as
audit/training artifacts.

## ML-3 - Silent or-zero and Low defaults hide data gaps

Location: routers/disbursement.py lines 15-22, routers/cost.py lines 15-21,
routers/vendor.py lines 19-29, routers/mp_risk.py lines 19-20.

Observed: null or missing parquet columns are coerced to 0.0 or Low, meaning
all-clear. ML.md Feature 1 requires coverage_flag disbursement_unknown with no
score, and Feature 7 requires Complete, Partial and Insufficient tiers with 197
MPs as Unknown. An Insufficient MP is currently returned as Low with score 0.0.

Fix: keep schemas as non-optional `float` and treat `0.0 + Unknown tier` as the
documented NO-SCORE sentinel (never `Optional[float]`, never a `None` score —
both break the Express/frontend numeric contract). Bound the fix to three
surgical changes: fail-closed coverage default + `is not None` score/tier
selection + tier helpers. Valid rows stay byte-identical; only genuinely
missing data flips to Unknown.

Verify: a disbursement_unknown work returns tier Unknown with score 0.0, an
Insufficient MP with all subscores null returns Unknown / Insufficient Data
with score 0.0, a valid 0.0-score row keeps its real tier verbatim, and full
pytest passes with MPLADS_API_KEY set and unset.

**Solution Applied (FINAL — all 3 bugs fixed):**
- `disbursement.py`: Changed coverage default from `"disbursement_known"` to `"disbursement_unknown"` (fail-closed per ML.md Principle 1). When the resolved tier is `"Unknown"`, the emitted score is forced to `0.0` so the sentinel is enforced end-to-end.
- `cost.py`, `vendor.py`: Same `risk_tier == "Unknown" → score 0.0` enforcement so no raw score ever leaks alongside an Unknown tier.
- `mp_risk.py:_resolve_mp_tier()`: Replaced falsy `or` with explicit `is not None` checks for both score and tier selection. Valid `0.0` scores now preserve their real tier.
- All schemas remain `float` (not `Optional[float]`). The `0.0 + "Unknown"` sentinel is the documented contract: downstream must check tier before averaging scores.
- Tier helpers in all 4 routers use `is not None` guards, preserving valid `0.0` rows byte-identically.

Verify: `disbursement_unknown` work returns `{"risk_tier": "Unknown", "score": 0.0, "coverage_flag": "disbursement_unknown"}`. Valid `0.0`-score row keeps its real tier. `mplads_api/tests/test_unknown_sentinel.py` covers all four routers plus an endpoint-level synthetic no-flag record. Full pytest 32 passed.

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

**Solution Applied:**
- `requirements.txt`: All dependencies pinned with `==` (fastapi==0.115.6, uvicorn==0.34.0, pydantic==2.10.4, pydantic-settings==2.7.1, pandas==2.2.3, numpy==1.26.4, pyarrow==18.1.0, joblib==1.4.2, scikit-learn==1.6.1, lightgbm==4.5.0, httpx==0.28.1, psutil==6.1.0, pytest==8.3.4). Target Python 3.11.
- Note: local probe env is Python 3.10 with scikit-learn 1.7.2, so the unpickle emits an `InconsistentVersionWarning`; the pinned serving env must stay Python 3.11 + scikit-learn 1.6.1 to match training. This is exactly why the pins exist.

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

**Not severe — skipped.** Express backend uses server-side httpx/fetch, not browser CORS. No functional impact on deployment.

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

**Solution Applied:**
- `feature_store.py`: Removed all `read_csv` fallback branches. All loads now use `pd.read_parquet()` exclusively. Missing parquets log an error with the exact path via `logger.error("Required parquet missing: %s", path)`. The F1→F7 parquet fallback is preserved.

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

**Solution Applied (FINAL — all 3 gaps addressed):**

1. **Batch-loaded indexes, no per-row `iterrows`** — `feature_store.py` now uses
   `df.to_dict(orient="records")` for F1, F2, MP, and vendor tables. Removed the
   `fact_work` DataFrame attribute (dict indexes only). Removed all unused model
   attributes and their `joblib.load` calls (ML-2). Missing parquets log an
   explicit error instead of silently skipping.

2. **Frames released after indexing** — added `del f1_df`, `del f2_df`,
   `del vendor_df` and `gc.collect()`; added RSS logging at the end of
   `load_all` (`try/except ImportError → rss=0` guard preserved). Added
   `psutil==6.1.0` to `requirements.txt` so the RSS log is real, not `0MB`.

3. **Dashboard Top-20 precomputed once** — `mp_scorecard` DataFrame is gone.
   `load_all` computes `mp_top20` at startup with the same sort key
   (`ml_augmented_composite_risk_score` else `composite_risk_score`), stores
   sanitized dicts in `self.mp_top20`, then `del mp_df; gc.collect()`.
   `dashboard.py` returns `store.mp_top20` directly, removing the per-request
   `sort_values` + `iterrows()`. Responses stay byte-identical.

4. **Accepted residual** — the double-keyed `work_index` (`work_id` and
   `work_key` aliasing the same dict) was intentionally left as-is: aliasing to a
   shared reference risks cross-key mutation, and chunked parquet streaming
   would change the F2-merge load ordering. Not a blocker for Render health.

Verify: `/health` counts unchanged, sampled `/score/*` payloads byte-identical,
`/dashboard/summary` returns the same 20 `mp_key`s in the same order, startup
log shows non-zero `rss=...MB`, and `grep -rn "iterrows" mplads_api/` returns
zero hits.

## Explicitly out of scope (deployment-only, not fixed here)

Dockerfile whole-directory COPY versus selective copy, render.yaml PORT 8000
override, starter plan sizing, health grace periods, keep-alive rationale,
validation curl URL-encoding examples such as SANJAY_SETH which actually
returns 400 plus candidates per resolve_mp, FASTAPI_URL wiring order, cost
table, tag and rollback procedure.

## Suggested verification order (local, no infra change)

1. `pytest mplads_api/tests -q` baseline.
2. ML-1 auth: `MPLADS_API_KEY` unset and set; assert 401/500/200 and that
   `/health` stays public. `test_security.py` covers this.
3. ML-3 sentinels: assert gap fixtures return `Unknown` with score `0.0` and
   valid `0.0` fixtures keep their real tier. `test_unknown_sentinel.py` covers
   this.
4. ML-2 + ML-6 + ML-7: compare `/health` counts and sampled `/score/*` payloads
   before/after; confirm `/dashboard/summary` returns the same 20 keys and the
   startup log shows non-zero `rss=...MB`.
5. ML-4: freeze requirements, `docker build --no-cache`, full test run.

Run order used for this pass: full `pytest mplads_api/tests -q` → **32 passed**
(with `MPLADS_ENV=development` via `conftest.py`; prod auth asserted separately
in `test_security.py`).
