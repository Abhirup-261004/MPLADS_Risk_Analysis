from fastapi import APIRouter, HTTPException
from mplads_api.schemas.disbursement import DisbursementRiskRequest, DisbursementRiskResponse, PeerGroupContext
from mplads_api.core.feature_store import FeatureStore

router = APIRouter(prefix="/score", tags=["Disbursement Risk"])

@router.post("/disbursement-risk", response_model=DisbursementRiskResponse)
def get_disbursement_risk(req: DisbursementRiskRequest):
    store = FeatureStore.get_instance()
    work_record = store.work_index.get(req.work_id)

    if not work_record:
        raise HTTPException(status_code=404, detail=f"Work ID '{req.work_id}' not found in portfolio index.")

    sanction_amt = float(work_record.get("sanction_amount") or 0.0)
    disbursed = float(work_record.get("effective_disbursed") or work_record.get("total_fund_disbursed") or 0.0)
    shortfall = float(work_record.get("shortfall_pct") or 0.0)
    zscore = float(work_record.get("peer_shortfall_zscore") or 0.0)
    risk_score = float(work_record.get("disbursement_risk_score") or 0.0)
    risk_tier = str(work_record.get("disbursement_risk_tier") or "Low")
    coverage = str(work_record.get("coverage_flag") or "disbursement_known")
    explanation = work_record.get("disbursement_risk_explanation")

    return DisbursementRiskResponse(
        work_id=str(work_record.get("work_id", req.work_id)),
        sanction_amount=sanction_amt,
        tranche_sum_disbursed=disbursed,
        shortfall_pct=shortfall,
        peer_group=PeerGroupContext(
            state=str(work_record.get("state") or "Unknown"),
            category=str(work_record.get("category_nlp") or "Normal/Others")
        ),
        peer_zscore=zscore,
        disbursement_risk_score=risk_score,
        risk_tier=risk_tier,
        coverage_flag=coverage,
        explanation=explanation
    )
