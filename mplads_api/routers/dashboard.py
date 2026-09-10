from fastapi import APIRouter, Query, HTTPException
from typing import Optional
from mplads_api.core.feature_store import FeatureStore, sanitize_record
from mplads_api.schemas.dashboard import HealthResponse

router = APIRouter(tags=["Dashboard & Operations"])

@router.get("/health", response_model=HealthResponse)
def health_check():
    store = FeatureStore.get_instance()
    return HealthResponse(
        status="healthy",
        works_indexed=len(store.work_index),
        mps_indexed=len(store.mp_index),
        vendors_indexed=len(store.vendor_index),
        classifier_loaded=store.nlp_classifier is not None
    )

@router.get("/dashboard/summary")
def get_dashboard_summary(level: str = Query("mp", enum=["mp", "state"]), id: Optional[str] = None):
    store = FeatureStore.get_instance()

    if level == "state":
        if id:
            st_upper = id.upper().strip()
            if st_upper in store.state_index:
                return store.state_index[st_upper]
            raise HTTPException(status_code=404, detail=f"State '{id}' not found in summary index.")
        return list(store.state_index.values())

    else:  # MP level
        if id:
            if id in store.mp_index:
                return store.mp_index[id]
            raise HTTPException(status_code=404, detail=f"MP Key '{id}' not found in scorecard index.")

        if store.mp_scorecard is not None and not store.mp_scorecard.empty:
            sort_col = "ml_augmented_composite_risk_score" if "ml_augmented_composite_risk_score" in store.mp_scorecard.columns else "composite_risk_score"
            sorted_mps = store.mp_scorecard.sort_values(by=sort_col, ascending=False).head(20)
            return [sanitize_record(row) for row in sorted_mps.to_dict(orient="records")]
        return list(store.mp_index.values())[:20]
