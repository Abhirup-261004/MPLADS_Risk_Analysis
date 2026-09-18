import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
NOTEBOOK = ROOT / "notebooks" / "SharedPreprocessing.ipynb"


def _notebook_source():
    nb = json.loads(NOTEBOOK.read_text(encoding="utf-8-sig"))
    return "\n".join("".join(cell.get("source", [])) for cell in nb["cells"])


def test_shared_preprocessing_uses_stage_preserving_work_join():
    source = _notebook_source()

    assert "# Build canonical fact_work at true work_id grain" in source
    assert "fact_work = pd.concat([completed_all, sanctioned_all, recommended_all]" not in source
    assert 'sanctioned_all[["work_key", "sanction_amount", "sanction_date", "work_status"]]' in source
    assert 'completed_all[["work_key", "completion_date", "amount_disbursed"]]' in source
    assert 'recommended_all[["work_key", "recommended_amount", "recommended_date"]]' in source
    assert 'fact_work["is_recommended"]' in source
    assert 'fact_work["is_sanctioned"]' in source
    assert 'fact_work["is_completed"]' in source
    assert 'assert len(fact_work) == 43150' in source
    assert '== 19655, "stage join lost sanctioned+completed overlaps"' in source
    assert 'completed rows lost sanctioned amounts' in source


def test_shared_preprocessing_rollup_status_matches_portal_values():
    source = _notebook_source()

    assert 's.str.contains("Success", na=False).any()' in source
    assert 's.str.contains("In-Progress", na=False).any()' in source
    assert '(s == "Success").any()' not in source
    assert '(s == "In Progress").any()' not in source
    assert 'fact_expenditure_rollup["any_success"].sum() > 10000' in source
    assert 'fact_expenditure_rollup["any_in_progress"].sum() > 2500' in source
    assert 'fact_work["any_success"] = fact_work["any_success"].astype("boolean")' in source
    assert 'fact_work["any_in_progress"] = fact_work["any_in_progress"].astype("boolean")' in source
    assert 'str(fact_work["any_success"].dtype) == "boolean"' in source
    assert 'str(fact_work["any_in_progress"].dtype) == "boolean"' in source


def test_shared_preprocessing_quarantines_before_chronological_split():
    source = _notebook_source()

    quarantine_pos = source.index("Quarantine is split off BEFORE chronological partitioning")
    split_pos = source.index("# Construct Chronological Date Split")
    assert quarantine_pos < split_pos
    assert 'obs_date = c_date.fillna(s_date).fillna(r_date)' in source
    assert 'last_expenditure_date", pd.Series(np.nan, index=fact_work.index)' not in source



