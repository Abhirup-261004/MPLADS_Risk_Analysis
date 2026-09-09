from pydantic import BaseModel, Field
from typing import Optional

class DisbursementRiskRequest(BaseModel):
    work_id: str = Field(..., json_schema_extra={"example": "WS/MP418/2024-2025/133409"})

class PeerGroupContext(BaseModel):
    state: Optional[str] = "Unknown"
    category: Optional[str] = "Normal/Others"

class DisbursementRiskResponse(BaseModel):
    work_id: str
    sanction_amount: float
    tranche_sum_disbursed: float
    shortfall_pct: float
    peer_group: PeerGroupContext
    peer_zscore: float
    disbursement_risk_score: float
    risk_tier: str
    coverage_flag: str
    explanation: Optional[str] = None
