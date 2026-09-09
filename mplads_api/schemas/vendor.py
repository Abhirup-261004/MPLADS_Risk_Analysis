from pydantic import BaseModel
from typing import Optional

class VendorRiskResponse(BaseModel):
    vendor_id: str
    vendor_name_raw: str
    primary_state: Optional[str] = "Unknown"
    n_tranches: int
    total_disbursed: float
    n_distinct_works: int
    n_distinct_mps: int
    n_distinct_idas: int
    top_mp_key: Optional[str] = "None"
    top_mp_spend_share: float
    hhi_within_mp: float
    high_risk_work_ratio: float
    vendor_risk_score: float
    risk_tier: str
    explanation: Optional[str] = None
