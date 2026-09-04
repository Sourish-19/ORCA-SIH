"""
Canonical Data Model - End-to-End Query & Agent Pipeline Request/Response
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.models.ocean import PFZCandidateZone, LandingCentre
from app.models.hazard import MarineWeather, HazardWarning
from app.models.trace import EvidenceRecord, AgentStepTrace


class UserQueryRequest(BaseModel):
    query: str = Field(..., description="Natural language query (e.g. 'Where should I fish tomorrow near Chennai?')")
    language: Optional[str] = "auto"
    user_id: Optional[str] = "demo_fisherman"
    preferred_landing_centre: Optional[str] = None
    input_type: str = "text"  # "text" or "voice"


class StructuredIntent(BaseModel):
    raw_query: str
    detected_language: str
    primary_intent: str  # "FISHING_RECOMMENDATION", "WIND_INQUIRY", "WAVE_INQUIRY", "SAFETY_INQUIRY", "UNAVAILABLE_DATA_INQUIRY", "OUT_OF_DOMAIN_INQUIRY", etc.
    requested_information: List[str] = Field(default_factory=list)
    data_available_in_orca: bool = True
    unavailable_parameter: Optional[str] = None
    location_name: str
    target_date_str: str
    target_datetime: datetime
    activity: str = "FISHING"
    radius_km: float = 50.0
    confidence: float = 0.95


class SuitabilityBreakdown(BaseModel):
    zone_id: str
    total_score: float = Field(..., ge=0.0, le=100.0)
    pfz_contribution: float
    chlorophyll_contribution: float
    sst_contribution: float
    wind_contribution: float
    wave_contribution: float
    accessibility_contribution: float
    formula_explanation: str


class SafetyEvaluation(BaseModel):
    is_safe: bool
    veto_triggered: bool
    risk_level: str  # "LOW", "MODERATE", "HIGH", "SEVERE"
    veto_reasons: List[str] = []
    warnings_found: List[HazardWarning] = []
    freshness_acceptable: bool = True
    safety_summary: str


class ORCAResponse(BaseModel):
    request_id: str
    timestamp: datetime
    query: str
    intent: StructuredIntent
    data_mode: str  # "LIVE", "FAILOVER", "CACHED"
    overall_confidence: float
    safety: SafetyEvaluation
    top_recommendation: Optional[PFZCandidateZone] = None
    suitability_breakdown: Optional[SuitabilityBreakdown] = None
    candidate_zones: List[PFZCandidateZone] = []
    nearest_landing_centre: Optional[LandingCentre] = None
    weather_summary: Optional[MarineWeather] = None
    synthesized_answer: str
    audio_narrative_text: str
    evidence_trail: List[EvidenceRecord] = []
    agent_traces: List[AgentStepTrace] = []
