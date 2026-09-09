from fastapi.testclient import TestClient
from mplads_api.main import app

client = TestClient(app)

def test_categorize_work_success():
    payload = {
        "description": "Installation of deep solar hand pump and drinking water storage tank",
        "declared_category": "Normal/Others"
    }
    response = client.post("/nlp/categorize-work", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "category_nlp" in data
    assert "confidence" in data
    assert data["declared_category"] == "Normal/Others"
    assert isinstance(data["category_mismatch_flag"], bool)

def test_categorize_work_empty_description():
    payload = {"description": "   ", "declared_category": "Normal/Others"}
    response = client.post("/nlp/categorize-work", json=payload)
    assert response.status_code == 400
