from fastapi.testclient import TestClient
from mplads_api.main import app
from mplads_api.core.feature_store import FeatureStore

client = TestClient(app)

def test_disbursement_risk_known_and_unknown():
    store = FeatureStore.get_instance()
    sample_id = next(iter(store.work_index.keys())) if store.work_index else "WS/UNKNOWN/001"

    if store.work_index:
        res = client.post("/score/disbursement-risk", json={"work_id": sample_id})
        assert res.status_code == 200
        data = res.json()
        assert "disbursement_risk_score" in data
        assert "risk_tier" in data

    res_404 = client.post("/score/disbursement-risk", json={"work_id": "INVALID_WORK_ID_99999"})
    assert res_404.status_code == 404

def test_cost_anomaly_known_and_unknown():
    store = FeatureStore.get_instance()
    sample_id = next(iter(store.work_index.keys())) if store.work_index else "WS/UNKNOWN/001"

    if store.work_index:
        res = client.post("/score/cost-anomaly", json={"work_id": sample_id})
        assert res.status_code == 200
        data = res.json()
        assert "cost_risk_score" in data
        assert "cost_zscore" in data

    res_404 = client.post("/score/cost-anomaly", json={"work_id": "INVALID_WORK_ID_99999"})
    assert res_404.status_code == 404

def test_vendor_risk_endpoint():
    store = FeatureStore.get_instance()
    sample_v = next(iter(store.vendor_index.keys())) if store.vendor_index else "VEND_001"

    if store.vendor_index:
        res = client.get(f"/score/vendor-risk/{sample_v}")
        assert res.status_code == 200
        data = res.json()
        assert "vendor_risk_score" in data

    res_404 = client.get("/score/vendor-risk/INVALID_VENDOR_9999")
    assert res_404.status_code == 404

def test_mp_risk_endpoint():
    store = FeatureStore.get_instance()
    sample_mp = next(iter(store.mp_index.keys())) if store.mp_index else "MP_001"

    if store.mp_index:
        res = client.get(f"/score/mp-risk/{sample_mp}")
        assert res.status_code == 200
        data = res.json()
        assert "composite_risk_score" in data
        assert "subscore_breakdown" in data

    res_404 = client.get("/score/mp-risk/INVALID_MP_9999")
    assert res_404.status_code == 404

def test_mp_risk_flexible_name_resolution():
    with TestClient(app) as test_client:
        # 1. Plain Name without LS_/RS_ prefix
        res_plain = test_client.get("/score/mp-risk/Kartikeya Sharma")
        assert res_plain.status_code == 200
        assert res_plain.json()["mp_key"] == "RS_KARTIKEYA SHARMA"

        # 2. Case-insensitive with spaces
        res_lower = test_client.get("/score/mp-risk/derek o brien")
        assert res_lower.status_code == 200
        assert res_lower.json()["mp_key"] == "RS_DEREK O BRIEN"

        # 3. Ambiguous MP clean name (Sanjay Seth exists in RS and LS)
        res_ambiguous = test_client.get("/score/mp-risk/Sanjay Seth")
        assert res_ambiguous.status_code == 400
        data = res_ambiguous.json()
        assert "candidates" in data
        assert len(data["candidates"]) >= 2

        # 4. Disambiguating using house query parameter
        res_disambiguated = test_client.get("/score/mp-risk/Sanjay Seth?house=LS")
        assert res_disambiguated.status_code == 200
        assert res_disambiguated.json()["mp_key"] == "LS_SANJAY SETH"

def test_state_risk_endpoint():
    store = FeatureStore.get_instance()
    sample_state = next(iter(store.state_index.keys())) if store.state_index else "DELHI"

    if store.state_index:
        res = client.get(f"/score/state-risk/{sample_state}")
        assert res.status_code == 200
        data = res.json()
        assert "mean_composite_risk_score" in data

    res_404 = client.get("/score/state-risk/NON_EXISTENT_STATE")
    assert res_404.status_code == 404
