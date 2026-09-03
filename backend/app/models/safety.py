"""
Safety Models - Strongly-typed schemas for the ORCA deterministic Safety Engine.

The Safety Engine consumes the REAL normalized pipeline models
(NormalizedMarineWeather, NormalizedHazardWarning) carried inside an
EvidenceBundle. It is strictly separate from the Suitability Engine:

- Suitability answers "how good is this location environmentally?" (OSI).
- Safety answers "is it survivable to go there?" and holds the final veto.

Tri-state outcome (per the ORCA prototype brief): SAFE / CAUTION / NO_GO.
`is_safe` follows the legacy SafetyEvaluation convention: is_safe == (not veto_triggered),
so a CAUTION verdict still reports is_safe=True and the Decision Layer decides
whether to surface it with a caution flag.
"""

from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field


# =====================================================================
# 1. Configurable Safety Thresholds & Heuristics
# =====================================================================

class SafetyConfig(BaseModel):
    """
    Configuration for the ORCA deterministic Safety Engine.
    All thresholds are 'ORCA Prototype Safety Heuristic v1' for small / motorized
    craft on the North Tamil Nadu (Chennai) coast.
    """
    methodology_name: str = "ORCA Prototype Safety Heuristic v1"
    methodology_version: str = "v1.0-deterministic"

    # --- Wind & gust (knots); compared against NormalizedMarineWeather ---
    caution_wind_knots: float = Field(20.0, description="Sustained wind (upper bound) at/above this -> CAUTION")
    max_safe_wind_knots: float = Field(25.0, description="Sustained wind (upper bound) above this -> VETO")
    max_safe_gust_knots: float = Field(33.0, description="Gust above this (near-gale) -> VETO")

    # --- Sea state; substring match on NormalizedMarineWeather.sea_condition ---
    caution_sea_keywords: List[str] = Field(
        default_factory=lambda: ["rough", "moderate to rough"],
        description="Sea-state terms that warrant CAUTION"
    )
    veto_sea_keywords: List[str] = Field(
        default_factory=lambda: ["very rough", "high", "phenomenal"],
        description="IMD sea-state terms that warrant a VETO"
    )

    # --- Surface current (m/s); upper bound of ocean_current_speed_m_s ---
    caution_current_m_s: float = Field(1.5, description="Surface current above this -> CAUTION")

    # --- Official IMD / INCOIS warnings (Option A: flag / attribute based) ---
    veto_warning_levels: List[str] = Field(
        default_factory=lambda: ["STRICT_PROHIBITION", "RED_ALERT"]
    )
    caution_warning_levels: List[str] = Field(
        default_factory=lambda: ["ADVISORY_CAUTION"]
    )
    veto_cyclone_stages: List[str] = Field(
        default_factory=lambda: [
            "depression", "deep depression",
            "cyclonic storm", "severe cyclonic storm",
        ],
        description="cyclone_stage values (lowercased) that force a VETO"
    )
    benign_cyclogenesis: List[str] = Field(
        default_factory=lambda: ["nil", "low", "none", ""],
        description="seven_day_cyclogenesis_probability values (lowercased) that are NOT a concern"
    )

    # --- Cyclone proximity (Option B: dormant hook) ---
    # Only used when a warning carries an explicit cyclone_coordinates point.
    cyclone_proximity_veto_km: float = 300.0
    cyclone_proximity_caution_km: float = 500.0

    # --- Data freshness ---
    stale_after_hours: float = 48.0


# =====================================================================
# 2. Individual Safety Finding
# =====================================================================

class SafetyFinding(BaseModel):
    """A single deterministic reason contributing to the safety verdict."""
    code: str = Field(..., description="Stable machine code, e.g. 'WIND_MAX_EXCEEDED', 'CYCLONE_SYSTEM'")
    severity: str = Field(..., description="'CAUTION' | 'VETO'")
    category: str = Field(
        ...,
        description="'WEATHER' | 'SEA_STATE' | 'OFFICIAL_WARNING' | 'CYCLONE' | 'CURRENT' | 'VISIBILITY' | 'PORT' | 'DATA_FRESHNESS'"
    )
    message: str = Field(..., description="Human-readable explanation (for UI and the explainer LLM)")
    source: str = Field("ORCA Safety Engine", description="Originating agency/product, from record metadata where available")
    observed_value: Optional[str] = Field(None, description="Observed quantity as a string, e.g. '30.0 kt'")
    threshold: Optional[str] = Field(None, description="Threshold breached as a string, e.g. '25.0 kt'")


# =====================================================================
# 3. Comprehensive Safety Verdict
# =====================================================================

class SafetyVerdict(BaseModel):
    """
    Deterministic safety evaluation of a single candidate PFZ location.
    Mirrors the spirit of the legacy SafetyEvaluation but consumes the real
    normalized models and carries a join key to the SuitabilityAssessment.
    """
    # --- Join keys (shared with SuitabilityAssessment via make_candidate_id) ---
    candidate_id: str = Field("", description="PFZ-<sector>-<landing_centre>-<bearing>deg")
    bundle_id: str = Field("", description="Originating EvidenceBundle id")
    landing_centre: str = ""
    latitude: float
    longitude: float

    # --- Verdict ---
    status: str = Field(..., description="'SAFE' | 'CAUTION' | 'NO_GO'")
    is_safe: bool = Field(..., description="== (not veto_triggered); CAUTION still reports True")
    veto_triggered: bool = False
    risk_level: str = Field(..., description="'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE'")

    # --- Explainability ---
    findings: List[SafetyFinding] = Field(default_factory=list)
    veto_reasons: List[str] = Field(default_factory=list)
    caution_reasons: List[str] = Field(default_factory=list)
    matched_warnings: List[str] = Field(
        default_factory=list,
        description="Summaries of every hazard warning considered, e.g. 'CYCLONE_WARNING @ Southwest Bay of Bengal (RED_ALERT)'"
    )

    # --- Provenance ---
    data_freshness_ok: bool = True
    safety_summary: str = Field(..., description="One-line summary for UI / narration")
    methodology_name: str = "ORCA Prototype Safety Heuristic v1"
    methodology_version: str = "v1.0-deterministic"
    evaluated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_synthetic: bool = False
