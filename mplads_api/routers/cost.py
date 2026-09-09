from fastapi import APIRouter, HTTPException
from mplads_api.schemas.cost import CostAnomalyRequest, CostAnomalyResponse
from mplads_api.core.feature_store import FeatureStore

router = APIRouter(prefix="/score", tags=["Cost Risk"])

@router.post("/cost-anomaly", response_model=CostAnomalyResponse)
def get_cost_anomaly(req: CostAnomalyRequest):
    store = FeatureStore.get_instance()
    work_record = store.work_index.get(req.work_id)

    if not work_record:
        raise HTTPException(status_code=404, detail=f"Work ID '{req.work_id}' not found in portfolio index.")

    amount = float(work_record.get("sanction_amount") or 0.0)
    peer_median = float(work_record.get("peer_median_amount") or work_record.get("effective_peer_median_amount") or 1.0)
    cost_ratio = float(work_record.get("sanction_peer_ratio") or (amount / peer_median if peer_median > 0 else 1.0))
    peer_size = int(work_record.get("peer_group_size") or work_record.get("peer_count") or 0)
    zscore = float(work_record.get("peer_cost_zscore") or 0.0)
    cost_score = float(work_record.get("cost_risk_score") or 0.0)
    risk_tier = str(work_record.get("cost_risk_tier") or "Low")
    explanation = work_record.get("cost_risk_explanation")

    return CostAnomalyResponse(
        work_id=str(work_record.get("work_id", req.work_id)),
        category_nlp=str(work_record.get("category_nlp") or "Normal/Others"),
        peer_group_size=peer_size,
        amount=amount,
        peer_median_amount=peer_median,
        cost_ratio_to_peer_median=cost_ratio,
        cost_zscore=zscore,
        cost_risk_score=cost_score,
        risk_tier=risk_tier,
        explanation=explanation
    )
