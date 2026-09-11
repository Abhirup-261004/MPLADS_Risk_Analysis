from pydantic import BaseModel
from typing import Optional

class SubscoreDetail(BaseModel):
    mean: float
    z_score: float

class VendorSubscoreDetail(BaseModel):
    top3_vendors_mean: float
    z_score: float

class SubscoreBreakdown(BaseModel):
    disbursement_risk: SubscoreDetail
    cost_risk: SubscoreDetail
    vendor_risk: VendorSubscoreDetail

class ScorecardWeights(BaseModel):
    disbursement_weight: float = 0.333
    cost_weight: float = 0.333
    vendor_weight: float = 0.333

class MPRiskResponse(BaseModel):
    mp_key: str
    mp_name_clean: str
    house: str
    state: str
    constituency: Optional[str] = None
    allocated_amount: float
    total_sanctioned_amount: float
    total_expenditure_amount: Optional[float] = 0.0
    expenditure_amount: Optional[float] = 0.0
    expenditure: Optional[float] = 0.0
    composite_risk_score: float
    risk_tier: str
    allocation_utilization_pct: float
    scorecard_weights: ScorecardWeights = ScorecardWeights()
    subscore_breakdown: SubscoreBreakdown
    explanation: Optional[str] = None

class StateRiskResponse(BaseModel):
    state: str
    mp_count: int
    mean_composite_risk_score: float
    mean_allocation_utilization_pct: float
    critical_mp_count: int
    high_mp_count: int
    medium_mp_count: int
    low_mp_count: int
