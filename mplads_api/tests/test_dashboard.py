from fastapi.testclient import TestClient
from mplads_api.main import app

client = TestClient(app)

def test_health_check():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert "works_indexed" in data
    assert "mps_indexed" in data

def test_dashboard_summary():
    res = client.get("/dashboard/summary?level=mp")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)

def test_root():
    res = client.get("/")
    assert res.status_code == 200
    data = res.json()
    assert "docs_url" in data
