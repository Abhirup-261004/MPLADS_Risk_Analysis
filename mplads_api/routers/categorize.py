from fastapi import APIRouter, HTTPException, Depends
from mplads_api.schemas.categorize import CategorizeRequest, CategorizeResponse, AlternativeCategory
from mplads_api.core.feature_store import FeatureStore
from mplads_api.core.security import verify_api_key

router = APIRouter(prefix="/nlp", tags=["NLP Categorization"], dependencies=[Depends(verify_api_key)])

@router.post("/categorize-work", response_model=CategorizeResponse)
def categorize_work(req: CategorizeRequest):
    store = FeatureStore.get_instance()

    if not req.description or not req.description.strip():
        raise HTTPException(status_code=400, detail="Description text cannot be empty.")

    clf_pipeline = store.nlp_classifier
    predicted_label = "Other Public Infrastructure"
    confidence = 0.85
    alternatives = []

    if clf_pipeline is not None:
        try:
            probs = clf_pipeline.predict_proba([req.description])[0]
            classes = clf_pipeline.classes_

            top_idx = probs.argmax()
            predicted_label = str(classes[top_idx])
            confidence = float(probs[top_idx])

            # Get top 2 alternative categories
            sorted_indices = probs.argsort()[::-1]
            for idx in sorted_indices[1:3]:
                alternatives.append(AlternativeCategory(
                    label=str(classes[idx]),
                    score=round(float(probs[idx]), 4)
                ))
        except Exception:
            # Fallback to rule engine if pipeline model fails on edge input
            predicted_label, confidence, alternatives = _rule_engine_fallback(req.description)
    else:
        predicted_label, confidence, alternatives = _rule_engine_fallback(req.description)

    declared = req.declared_category or "Normal/Others"
    mismatch_flag = (declared != "Normal/Others") and (predicted_label.lower() not in declared.lower())

    return CategorizeResponse(
        category_nlp=predicted_label,
        confidence=round(confidence, 4),
        declared_category=declared,
        category_mismatch_flag=mismatch_flag,
        top_alternatives=alternatives
    )

def _rule_engine_fallback(description: str):
    store = FeatureStore.get_instance()
    labels = None
    if store.nlp_taxonomy and isinstance(store.nlp_taxonomy.get("taxonomy"), dict):
        labels = list(store.nlp_taxonomy["taxonomy"].keys())
    if not labels:
        labels = [
            "Road & Pathway Infrastructure", "Street Lighting & Solar Energy",
            "Drinking Water Infrastructure", "Sanitation & Drainage",
            "School & Education Infrastructure", "Healthcare & Ambulance Services",
            "Community & Public Buildings", "Agriculture & Irrigation",
            "Sports & Recreation", "Religious & Cultural Infrastructure",
            "Other Public Infrastructure",
        ]
    keyword_map = {
        "Drinking Water Infrastructure": ["water", "pipe", "borewell", "hand pump", "drinking", "tank"],
        "Road & Pathway Infrastructure": ["road", "pathway", "paver", "culvert", "bridge", "cc road"],
        "Street Lighting & Solar Energy": ["light", "solar", "led", "high mast", "street lamp"],
        "Sanitation & Drainage": ["drain", "sewer", "toilet", "sanitation", "waste"],
        "School & Education Infrastructure": ["school", "classroom", "college", "library", "laboratory"],
        "Healthcare & Ambulance Services": ["hospital", "health", "medical", "ambulance", "clinic"],
        "Community & Public Buildings": ["community hall", "community center", "building", "shelter", "anganwadi"],
        "Agriculture & Irrigation": ["irrigation", "agriculture", "farm", "canal", "check dam"],
        "Sports & Recreation": ["sport", "playground", "stadium", "gym", "recreation"],
        "Religious & Cultural Infrastructure": ["temple", "mandir", "mosque", "church", "cultural"],
    }
    low = description.lower()
    best, score = "Other Public Infrastructure", 0
    for label, kws in keyword_map.items():
        hits = sum(1 for kw in kws if kw in low)
        if hits > score:
            best, score = label, hits
    confidence = min(0.50 + 0.05 * score, 0.80)
    return best, confidence, []
