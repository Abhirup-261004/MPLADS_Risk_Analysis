from pydantic import BaseModel, Field
from typing import List, Optional

class CategorizeRequest(BaseModel):
    description: str = Field(..., json_schema_extra={"example": "Installing community drinking water plants and RO systems in rural villages"})
    declared_category: Optional[str] = Field("Normal/Others", json_schema_extra={"example": "Normal/Others"})

class AlternativeCategory(BaseModel):
    label: str
    score: float

class CategorizeResponse(BaseModel):
    category_nlp: str = Field(..., json_schema_extra={"example": "Drinking Water Infrastructure"})
    confidence: float = Field(..., json_schema_extra={"example": 0.9421})
    declared_category: str = Field(..., json_schema_extra={"example": "Normal/Others"})
    category_mismatch_flag: bool = Field(..., json_schema_extra={"example": False})
    top_alternatives: List[AlternativeCategory] = []
