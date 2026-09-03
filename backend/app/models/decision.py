"""
Decision Layer Models - Strongly-typed schemas for the ORCA Decision Layer.

The Decision Layer joins a ranked List[SuitabilityAssessment] (environmental
corroboration / OSI) with a List[SafetyVerdict] (deterministic veto authority)
by candidate_id, and produces the final ranked recommendation set.

Rules:
- SafetyVerdict.status == "NO_GO"   -> location is suppressed regardless of OSI.
- SafetyVerdict.status == "CAUTION" -> location is kept but flagged.
- SafetyVerdict.status == "SAFE"    -> location passes through normally.
- No matching SafetyVerdict         -> location is NOT_RECOMMENDED / safety UNKNOWN.

The Decision Layer never recomputes OSI and never re-runs safety logic; it only
combines, filters and ranks. Its output is the self-sufficient source of truth
that the downstream explainer LLM narrates.
"""

from datetime import datetime, timezone
from typing import List, Optional, Tuple
from pydantic import BaseModel, Field

from app.models.suitability import SuitabilityAssessment
from app.models.safety import SafetyVerdict


# =====================================================================
# 1. Configuration
# =====================================================================

class DecisionConfig(BaseModel):
    """Configuration for the ORCA Decision Layer ('Decision Layer v1')."""
    methodology_name: str = "ORCA Prototype Decision Layer v1"
    methodology_version: str = "v1.0-deterministic"

    # Ranking mode:
    #   True  -> the SAFE tier ranks entirely above the CAUTION tier
    #            (a safe mediocre spot outranks a risky excellent one).
    #   False -> rank purely by OSI; CAUTION is only a badge.
    safety_first_ordering: bool = Field(
        True, description="SAFE-tier-before-CAUTION-tier ordering of the recommendation set"
    )

    # Optional OSI floor. 0.0 = disabled -> safety is the ONLY thing that suppresses.
    # Above 0.0, a SAFE/CAUTION location below the floor becomes NOT_RECOMMENDED.
    min_osi_to_recommend: float = Field(
        0.0, ge=0.0, le=100.0,
        description="Minimum ORCA Suitability Index to appear in the recommendation set"
    )


# =====================================================================
# 2. Per-location decision
# =====================================================================

class LocationDecision(BaseModel):
    """The combined suitability + safety verdict for a single candidate location."""

    # --- identity / geometry (passthrough from SuitabilityAssessment) ---
    candidate_id: str
    landing_centre: str
    latitude: float
    longitude: float
    bearing_deg: float
    distance_km_range: Tuple[float, float]
    depth_m_range: Tuple[float, float]

    # --- verdict ---
    decision: str = Field(
        ..., description="'RECOMMENDED' | 'RECOMMENDED_WITH_CAUTION' | 'NOT_RECOMMENDED'"
    )
    is_recommended: bool = Field(..., description="decision != 'NOT_RECOMMENDED'")
    rank: Optional[int] = Field(
        None, description="1-based rank within the recommendation set; None if not recommended"
    )
    safety_status: str = Field(
        ..., description="Passthrough SafetyVerdict.status: 'SAFE' | 'CAUTION' | 'NO_GO' | 'UNKNOWN'"
    )

    # --- scores (passthrough, never recomputed) ---
    orca_suitability_index: float
    suitability_level: str = Field(..., description="'HIGH' | 'MODERATE' | 'BASELINE_PFZ' | 'LOW'")
    risk_level: str = Field(..., description="'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE' | 'UNKNOWN'")

    # --- merged human-readable explainability (deterministic) ---
    headline: str
    why_recommended: List[str] = Field(default_factory=list)
    cautions: List[str] = Field(default_factory=list, description="From SafetyVerdict.caution_reasons")
    blockers: List[str] = Field(default_factory=list, description="From SafetyVerdict.veto_reasons (or join gap)")
    limiting_factors: List[str] = Field(default_factory=list, description="From SuitabilityAssessment.limiting_factors")
    data_freshness_ok: bool = True

    # --- drill-down handles ---
    suitability: SuitabilityAssessment
    safety: Optional[SafetyVerdict] = Field(
        None, description="None only in the unmatched-join edge case"
    )


# =====================================================================
# 3. Trip-level result
# =====================================================================

class DecisionResult(BaseModel):
    """Final output of the Decision Layer for one user query."""

    # --- trip-level verdict ---
    overall_status: str = Field(..., description="'GO' | 'GO_WITH_CAUTION' | 'NO_GO'")
    safety_veto_active: bool = Field(
        ..., description="True when candidates existed but safety suppressed every one"
    )
    summary: str

    # --- the ranked recommendation set (NO_GO / unmatched excluded), best first ---
    recommendations: List[LocationDecision] = Field(default_factory=list)
    top_recommendation: Optional[LocationDecision] = None

    # --- transparency: every evaluated location ---
    all_decisions: List[LocationDecision] = Field(default_factory=list)
    suppressed: List[LocationDecision] = Field(default_factory=list)

    # --- meta ---
    evaluated_count: int = 0
    recommended_count: int = 0
    suppressed_count: int = 0
    unmatched_candidate_ids: List[str] = Field(default_factory=list)
    any_stale_data: bool = False

    methodology_name: str = "ORCA Prototype Decision Layer v1"
    methodology_version: str = "v1.0-deterministic"
    decided_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_synthetic: bool = False
