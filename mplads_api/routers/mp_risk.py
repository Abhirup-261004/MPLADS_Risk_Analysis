from fastapi import APIRouter, HTTPException, Query, status, Depends
from fastapi.responses import JSONResponse
from typing import Optional
from mplads_api.schemas.mp_risk import MPRiskResponse, StateRiskResponse, SubscoreBreakdown, SubscoreDetail, VendorSubscoreDetail, ScorecardWeights
from mplads_api.core.feature_store import FeatureStore
from mplads_api.core.security import verify_api_key

router = APIRouter(prefix="/score", tags=["MP Composite Risk"], dependencies=[Depends(verify_api_key)])

def _resolve_mp_tier(record):
    quality = str(record.get("composite_data_quality_tier") or "")
    ml_score = record.get("ml_augmented_composite_risk_score")
    score_raw = ml_score if ml_score is not None else record.get("composite_risk_score")
    if quality == "Insufficient" or score_raw is None:
        s_f1 = record.get("s_f1")
        s_f2 = record.get("s_f2")
        s_f5 = record.get("s_f5")
        if s_f1 is None and s_f2 is None and s_f5 is None:
            return "Unknown / Insufficient Data", 0.0
    ml_tier = record.get("ml_augmented_risk_tier")
    tier_raw = ml_tier if ml_tier is not None else record.get("composite_risk_tier")
    return str(tier_raw) if tier_raw else "Unknown", float(score_raw) if score_raw is not None else 0.0

@router.get("/mp-risk/{mp_identifier}", response_model=MPRiskResponse)
def get_mp_risk(
    mp_identifier: str,
    house: Optional[str] = Query(None, description="Optional House filter ('LS' or 'RS')"),
    state: Optional[str] = Query(None, description="Optional State filter (e.g. 'Jharkhand', 'Uttar Pradesh')")
):
    store = FeatureStore.get_instance()
    record, candidates = store.resolve_mp(mp_identifier, house=house, state=state)

    if record:
        risk_tier, comp_score = _resolve_mp_tier(record)

        return MPRiskResponse(
            mp_key=str(record.get("mp_key", mp_identifier)),
            mp_name_clean=str(record.get("mp_name_clean") or mp_identifier),
            house=str(record.get("house") or "LS"),
            state=str(record.get("state") or "Unknown"),
            constituency=record.get("constituency"),
            allocated_amount=float(record.get("allocated_amount") or 0.0),
            total_sanctioned_amount=float(record.get("total_sanctioned_amount") or 0.0),
            composite_risk_score=comp_score,
            risk_tier=risk_tier,
            allocation_utilization_pct=float(record.get("allocation_utilization_pct") or 0.0),
            scorecard_weights=ScorecardWeights(),
            subscore_breakdown=SubscoreBreakdown(
                disbursement_risk=SubscoreDetail(
                    mean=float(record.get("s_f1") or 0.0),
                    z_score=float(record.get("z_s_f1") or 0.0)
                ),
                cost_risk=SubscoreDetail(
                    mean=float(record.get("s_f2") or 0.0),
                    z_score=float(record.get("z_s_f2") or 0.0)
                ),
                vendor_risk=VendorSubscoreDetail(
                    top3_vendors_mean=float(record.get("s_f5") or 0.0),
                    z_score=float(record.get("z_s_f5") or 0.0)
                )
            ),
            explanation=str(record.get("composite_risk_explanation") or "")
        )

    if candidates:
        candidate_summary = [
            {
                "mp_key": c.get("mp_key"),
                "mp_name": c.get("mp_name_clean"),
                "house": c.get("house"),
                "state": c.get("state"),
                "constituency": c.get("constituency")
            }
            for c in candidates
        ]
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "detail": f"Multiple MPs match '{mp_identifier}'. Please specify house ('LS' or 'RS') or state to disambiguate.",
                "candidates": candidate_summary
            }
        )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"MP '{mp_identifier}' not found in scorecard master index."
    )

@router.get("/state-risk/{state}", response_model=StateRiskResponse)
def get_state_risk(state: str):
    store = FeatureStore.get_instance()
    state_upper = state.upper().strip()
    record = store.state_index.get(state_upper)

    if not record:
        raise HTTPException(status_code=404, detail=f"State '{state}' not found in state summary index.")

    return StateRiskResponse(**record)
