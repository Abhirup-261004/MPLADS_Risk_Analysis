from fastapi import APIRouter, HTTPException
from mplads_api.schemas.categorize import CategorizeRequest, CategorizeResponse, AlternativeCategory
from mplads_api.core.feature_store import FeatureStore

router = APIRouter(prefix="/nlp", tags=["NLP Categorization"])

@router.post("/categorize-work", response_model=CategorizeResponse)
def categorize_work(req: CategorizeRequest):
    store = FeatureStore.get_instance()

    if not req.description or not req.description.strip():
        raise HTTPException(status_code=400, detail="Description text cannot be empty.")

    clf_pipeline = store.nlp_classifier
    predicted_label = "Community Infrastructure"
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
    desc_lower = description.lower()
    if any(w in desc_lower for w in ["water", "pipe", "borewell", "ro plant", "tank", "drinking"]):
        label = "Drinking Water Infrastructure"
    elif any(w in desc_lower for w in ["road", "drain", "cc road", "pathway", "bridge", "culvert"]):
        label = "Roads, Bridges & Pathways"
    elif any(w in desc_lower for w in ["school", "college", "library", "class", "classroom", "education"]):
        label = "Education & Skill Development"
    elif any(w in desc_lower for w in ["hospital", "health", "sanitation", "ambulance", "toilet", "phc"]):
        label = "Public Health & Sanitation"
    elif any(w in desc_lower for w in ["light", "solar", "electrification", "power", "energy"]):
        label = "Energy & Electrification"
    elif any(w in desc_lower for w in ["community", "hall", "crematorium", "shed", "boundary"]):
        label = "Community Infrastructure"
    else:
        label = "Infrastructure Development"
    return label, 0.80, []
