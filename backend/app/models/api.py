"""
Backend API Models - request / response schemas for the ORCA recommendation endpoint.

The response deliberately keeps two separate top-level objects:
- `decision`     : the DecisionResult - authoritative. Every number, status, rank,
                   veto and score the UI shows comes from here.
- `explanation`  : the DecisionExplanation - plain-language narration only. Never
                   parsed back into logic.
"""

from datetime import datetime
from pydantic import BaseModel, Field

from typing import Optional

from app.models.decision import DecisionResult
from app.models.explanation import DecisionExplanation
from app.models.hazard import NormalizedMarineWeather


DEFAULT_QUERY = "Where should I fish tomorrow near Chennai?"


class RecommendationRequest(BaseModel):
    query: str = Field(default=DEFAULT_QUERY, description="Natural-language question (echoed; not parsed for the prototype)")
    language: str = Field(default="auto", description="'auto' | 'en' | 'ta' ('auto' detects Tamil script in the query)")
    audience: str = Field(default="fisherman", description="'fisherman' | 'analyst'")


class StageTimings(BaseModel):
    """Wall-clock milliseconds per pipeline stage (useful for the analyst view)."""
    evidence_ms: float
    suitability_ms: float
    safety_ms: float
    decision_ms: float
    explain_ms: float
    total_ms: float


class RecommendationResponse(BaseModel):
    request_id: str
    timestamp: datetime
    query: str
    language: str = Field(..., description="Resolved: 'en' | 'ta'")
    audience: str
    location: str = Field("Chennai", description="Fixed for the prototype")
    data_mode: str = Field(..., description="'PROCESSED' (static files) | 'LIVE' (future)")
    evaluated_zones: int

    decision: DecisionResult
    explanation: DecisionExplanation
    timings: StageTimings
    marine_weather: Optional[NormalizedMarineWeather] = Field(
        None, description="IMD coastal bulletin applied to the evaluated zones (context for the UI)"
    )
