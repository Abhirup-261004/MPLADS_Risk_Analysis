from fastapi import APIRouter, HTTPException
from mplads_api.schemas.vendor import VendorRiskResponse
from mplads_api.core.feature_store import FeatureStore

router = APIRouter(prefix="/score", tags=["Vendor Risk"])

@router.get("/vendor-risk/{vendor_id}", response_model=VendorRiskResponse)
def get_vendor_risk(vendor_id: str):
    store = FeatureStore.get_instance()
    vendor_record = store.vendor_index.get(vendor_id)

    if not vendor_record:
        raise HTTPException(status_code=404, detail=f"Vendor ID '{vendor_id}' not found in vendor master index.")

    return VendorRiskResponse(
        vendor_id=str(vendor_record.get("vendor_id", vendor_id)),
        vendor_name_raw=str(vendor_record.get("vendor_name_raw") or "Unknown Vendor"),
        primary_state=str(vendor_record.get("primary_state") or "Unknown"),
        n_tranches=int(vendor_record.get("n_tranches") or 0),
        total_disbursed=float(vendor_record.get("total_disbursed") or 0.0),
        n_distinct_works=int(vendor_record.get("n_distinct_works") or 0),
        n_distinct_mps=int(vendor_record.get("n_distinct_mps") or 0),
        n_distinct_idas=int(vendor_record.get("n_distinct_idas") or 0),
        top_mp_key=str(vendor_record.get("top_mp_key") or "None"),
        top_mp_spend_share=float(vendor_record.get("top_mp_spend_share") or 0.0),
        hhi_within_mp=float(vendor_record.get("hhi_within_mp") or 0.0),
        high_risk_work_ratio=float(vendor_record.get("high_risk_work_ratio") or 0.0),
        vendor_risk_score=float(vendor_record.get("vendor_risk_score") or 0.0),
        risk_tier=str(vendor_record.get("vendor_risk_tier") or "Low Volume / Unrated"),
        explanation=str(vendor_record.get("vendor_risk_explanation") or "")
    )
