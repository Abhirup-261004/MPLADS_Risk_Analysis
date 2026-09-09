from pydantic import BaseModel
from typing import Dict, Any, List, Optional

class HealthResponse(BaseModel):
    status: str
    works_indexed: int
    mps_indexed: int
    vendors_indexed: int
    classifier_loaded: bool

class DashboardSummaryResponse(BaseModel):
    total_works: int
    total_mps: int
    total_vendors: int
    high_risk_works: int
    critical_mps: int
