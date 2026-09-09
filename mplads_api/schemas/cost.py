from pydantic import BaseModel, Field
from typing import Optional

class CostAnomalyRequest(BaseModel):
    work_id: str = Field(..., json_schema_extra={"example": "WS/MP18296/2026-2027/230173"})

class CostAnomalyResponse(BaseModel):
    work_id: str
    category_nlp: str
    peer_group_size: int
    amount: float
    peer_median_amount: float
    cost_ratio_to_peer_median: float
    cost_zscore: float
    cost_risk_score: float
    risk_tier: str
    explanation: Optional[str] = None
