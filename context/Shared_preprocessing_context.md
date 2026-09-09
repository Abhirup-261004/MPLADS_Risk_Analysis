# Shared Preprocessing Context

This document is a continuation of [ML_Architecture.md](./ML_Architecture.md).
Its purpose is to serve as handoff context for the next session so the agent can quickly understand the shared preprocessing layer, the artifacts it produces, the issues we fixed, and the remaining rules to follow when working on MPLADS preprocessing.

## 1. What Shared Preprocessing Is For

The shared preprocessing layer is the foundation of the MPLADS ML architecture. It sits before every downstream feature and model and turns the raw portal CSVs into clean, validated, entity-resolved tables.

Its role is to:

- ingest the raw CSVs from `Datasets/`
- remove footer and artifact rows
- normalize text, dates, amounts, and headers
- resolve MP, state, IDA, vendor, and work identities
- build canonical fact tables
- validate the rows before downstream ML use
- export clean CSV and Parquet artifacts for later stages

The architecture explicitly depends on this layer because all later risk features consume the cleaned fact tables instead of the raw source files.

## 2. What We Did in This Session

We built and iteratively repaired the shared preprocessing notebook and the generated artifacts.

Main work completed:

- created the cell-wise preprocessing notebook in markdown form for Colab use
- added generic cleaning helpers for whitespace, text, amounts, dates, and column names
- added entity-resolution helpers for MPs, works, IDAs, vendors, states, and synthetic IDs
- built table-specific prep functions for allocation, calamity, expenditure, and work-stage files
- assembled the shared fact tables
- added Pydantic validation for the cleaned rows
- exported the cleaned artifacts to `shared_preprocessing_artifacts/`

We then debugged several issues from the generated CSVs and fixed them in the preprocessing notebook:

- nullable string fields failing Pydantic validation
- raw `Elected/Nominated` leaking into `dim_mp`
- non-ASCII state-wise headers
- calamity provenance mismatch
- vendor helper columns leaking into final outputs
- malformed work rows without parseable `work_id`
- source-system `NA-` prefixes leaking into work titles and work keys

## 3. Current Artifact State

The cleaned outputs in `shared_preprocessing_artifacts/` are now the intended canonical set:

- `dim_mp.csv`
- `fact_calamity.csv`
- `fact_expenditure.csv`
- `fact_expenditure_rollup.csv`
- `fact_work.csv`
- `fact_work_quarantine.csv`
- `state_wise_summary.csv`
- `vendor_resolution_table.csv`

Current important behavior:

- `dim_mp` keeps RS `elected_nominated` values and no longer leaks the raw source column
- `state_wise_summary` uses ASCII-safe header names
- `fact_calamity` is deduplicated and marked with `source_tag = DEDUPED`
- `fact_expenditure` has no internal vendor helper columns in the final export
- `fact_work` is now canonical and contains only rows with parseable `work_id`
- rows without a parseable `work_id` are preserved separately in `fact_work_quarantine`

That quarantine split is intentional and matches the architecture, because `work_id` is the primary key for the work-level fact table.

## 4. Important Design Decisions

These are the key decisions that future sessions should preserve:

- Canonical `fact_work` must remain at real `work_id` grain.
- Rows that do not produce a parseable `work_id` do not belong in the canonical work fact table.
- Quarantined work rows should stay in `fact_work_quarantine` for auditability.
- Optional text fields should be converted to Python `None` before Pydantic validation.
- The calamity source files are identical and must be deduplicated.
- State headers should remain ASCII-safe and normalized.
- Vendor matching remains fuzzy and state-scoped because the source data has no master vendor ID.

## 5. Key Files Produced

- `shared_preprocessing_explanation.md` - detailed explanation of the preprocessing notebook, the functions, and the issues/fixes
- `shared_preprocessing_artifacts/` - generated clean CSV and Parquet artifacts

## 6. What The Next Agent Should Know

If the next session is debugging shared preprocessing, start with these assumptions:

- the architecture source of truth is still [ML_Architecture.md](./ML_Architecture.md)
- the explanation file contains the function-by-function rationale
- the artifact directory should be treated as the ground truth for the current preprocessing output
- any future changes should preserve the canonical work grain and keep malformed rows quarantined

If a new issue appears, check whether it belongs in:

- the canonical tables
- the quarantine table
- the explanation document
- or the preprocessing notebook itself

The main goal of this context file is to let the next agent continue from the exact state reached in this session without re-discovering the full preprocessing history.

