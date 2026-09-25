from fastapi.testclient import TestClient

from mplads_api.main import app
from mplads_api.core.feature_store import FeatureStore
from mplads_api.routers.disbursement import _resolve_disbursement_tier
from mplads_api.routers.cost import _resolve_cost_tier
from mplads_api.routers.vendor import _resolve_vendor_tier
from mplads_api.routers.mp_risk import _resolve_mp_tier

client = TestClient(app)


def test_disbursement_unknown_coverage_forces_unknown():
    assert _resolve_disbursement_tier(0.9, "Critical", "disbursement_unknown") == "Unknown"


def test_disbursement_null_score_forces_unknown():
    assert _resolve_disbursement_tier(None, "Critical", "linked_final") == "Unknown"


def test_disbursement_valid_zero_score_keeps_tier():
    assert _resolve_disbursement_tier(0.0, "Low", "linked_final") == "Low"


def test_cost_null_score_forces_unknown():
    assert _resolve_cost_tier(None, "Critical", 500) == "Unknown"


def test_cost_zero_peer_size_forces_unknown():
    assert _resolve_cost_tier(0.5, "High", 0) == "Unknown"


def test_cost_valid_zero_score_keeps_tier():
    assert _resolve_cost_tier(0.0, "Low", 100) == "Low"


def test_vendor_null_score_forces_unknown():
    assert _resolve_vendor_tier(None, "Critical") == "Unknown"


def test_vendor_valid_zero_score_keeps_tier():
    assert _resolve_vendor_tier(0.0, "Low") == "Low"


def test_mp_insufficient_all_null_forces_unknown():
    record = {"composite_data_quality_tier": "Insufficient", "s_f1": None, "s_f2": None, "s_f5": None}
    tier, score = _resolve_mp_tier(record)
    assert tier == "Unknown / Insufficient Data"
    assert score == 0.0


def test_mp_valid_zero_ml_score_keeps_real_tier():
    record = {
        "ml_augmented_composite_risk_score": 0.0,
        "composite_risk_score": 0.9,
        "ml_augmented_risk_tier": "Low",
        "composite_risk_tier": "Critical",
        "s_f1": 0.0,
        "s_f2": 0.0,
        "s_f5": 0.0,
    }
    tier, score = _resolve_mp_tier(record)
    assert tier == "Low"
    assert score == 0.0


def test_mp_falls_back_when_ml_columns_absent():
    record = {
        "composite_risk_score": 0.75,
        "composite_risk_tier": "High",
        "s_f1": 0.1,
    }
    tier, score = _resolve_mp_tier(record)
    assert tier == "High"
    assert score == 0.75


def test_disbursement_endpoint_fails_closed_without_coverage_flag():
    store = FeatureStore.get_instance()
    synthetic_id = "SYNTHETIC_NO_COVERAGE_FLAG_001"
    store.work_index[synthetic_id] = {
        "work_id": synthetic_id,
        "disbursement_risk_score": 0.42,
        "disbursement_risk_tier": "Medium",
    }
    try:
        res = client.post("/score/disbursement-risk", json={"work_id": synthetic_id})
        assert res.status_code == 200
        data = res.json()
        assert data["coverage_flag"] == "disbursement_unknown"
        assert data["risk_tier"] == "Unknown"
        assert data["disbursement_risk_score"] == 0.0
    finally:
        store.work_index.pop(synthetic_id, None)


def test_dashboard_summary_uses_precomputed_top20():
    store = FeatureStore.get_instance()
    if not store.mp_top20:
        return
    res = client.get("/dashboard/summary?level=mp")
    assert res.status_code == 200
    data = res.json()
    assert [d.get("mp_key") for d in data] == [d.get("mp_key") for d in store.mp_top20]