"""
Decision Layer Service - Deterministic fusion of Suitability + Safety for ORCA.

Joins a ranked List[SuitabilityAssessment] with a List[SafetyVerdict] by
candidate_id and produces the final ranked recommendation set.

Filtering rule:
- safety NO_GO   -> NOT_RECOMMENDED, suppressed regardless of OSI (safety has final veto)
- safety CAUTION -> RECOMMENDED_WITH_CAUTION (kept, flagged)
- safety SAFE    -> RECOMMENDED (passes through)
- no matching SafetyVerdict -> NOT_RECOMMENDED, safety_status "UNKNOWN"
- (optional) OSI below config.min_osi_to_recommend -> NOT_RECOMMENDED

Ranking (recommendation set only):
- safety_first_ordering (default): SAFE tier entirely above CAUTION tier, then
  OSI desc, then nearer distance, then candidate_id.
- otherwise: OSI desc, then nearer distance, then candidate_id.

Nothing here recomputes OSI or re-evaluates safety.
"""

from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.models.decision import DecisionConfig, LocationDecision, DecisionResult
from app.models.evidence import EvidenceBundle
from app.models.safety import SafetyConfig, SafetyVerdict
from app.models.suitability import SuitabilityAssessment, SuitabilityConfig
from app.services.safety_engine import evaluate_safety_for_bundles
from app.services.suitability_engine import evaluate_and_rank_all


_LEVEL_PHRASE = {
    "HIGH": "strong",
    "MODERATE": "moderate",
    "BASELINE_PFZ": "baseline",
    "LOW": "weak",
}


def _distance_mid(distance_km_range) -> float:
    return (distance_km_range[0] + distance_km_range[1]) / 2.0


def _build_location_decision(
    assessment: SuitabilityAssessment,
    verdict: Optional[SafetyVerdict],
    config: DecisionConfig,
) -> LocationDecision:
    osi = assessment.orca_suitability_index
    level = assessment.suitability_level
    level_phrase = _LEVEL_PHRASE.get(level, level.lower())

    safety_status = verdict.status if verdict is not None else "UNKNOWN"
    risk_level = verdict.risk_level if verdict is not None else "UNKNOWN"
    data_freshness_ok = verdict.data_freshness_ok if verdict is not None else False
    cautions = list(verdict.caution_reasons) if verdict is not None else []

    blockers: List[str] = []
    if verdict is None:
        decision = "NOT_RECOMMENDED"
        blockers = ["No safety evaluation available for this location."]
    elif verdict.status == "NO_GO":
        decision = "NOT_RECOMMENDED"
        blockers = list(verdict.veto_reasons)
    elif osi < config.min_osi_to_recommend:
        decision = "NOT_RECOMMENDED"
        blockers = [
            f"ORCA Suitability Index {osi:.1f} is below the usable threshold "
            f"of {config.min_osi_to_recommend:.1f}."
        ]
    elif verdict.status == "CAUTION":
        decision = "RECOMMENDED_WITH_CAUTION"
    else:  # SAFE
        decision = "RECOMMENDED"

    is_recommended = decision != "NOT_RECOMMENDED"

    why_recommended = list(assessment.supporting_factors)
    if verdict is not None and verdict.status == "SAFE":
        why_recommended.append(
            "Safety check passed — marine conditions are within safe operating thresholds."
        )

    if decision == "RECOMMENDED":
        headline = f"Recommended — {level_phrase} suitability, conditions safe."
    elif decision == "RECOMMENDED_WITH_CAUTION":
        headline = (
            f"Recommended with caution — {level_phrase} suitability, "
            f"{len(cautions)} advisory condition(s) in effect."
        )
    elif verdict is None:
        headline = "Not recommended — no safety evaluation available."
    elif verdict.status == "NO_GO":
        headline = f"Not recommended — safety veto ({verdict.risk_level} risk)."
    else:
        headline = "Not recommended — suitability below usable threshold."

    return LocationDecision(
        candidate_id=assessment.candidate_id,
        landing_centre=assessment.landing_centre,
        latitude=assessment.latitude,
        longitude=assessment.longitude,
        bearing_deg=assessment.bearing_deg,
        distance_km_range=assessment.distance_km_range,
        depth_m_range=assessment.depth_m_range,
        decision=decision,
        is_recommended=is_recommended,
        rank=None,
        safety_status=safety_status,
        orca_suitability_index=osi,
        suitability_level=level,
        risk_level=risk_level,
        headline=headline,
        why_recommended=why_recommended,
        cautions=cautions,
        blockers=blockers,
        limiting_factors=list(assessment.limiting_factors),
        data_freshness_ok=data_freshness_ok,
        suitability=assessment,
        safety=verdict,
    )


def decide(
    assessments: List[SuitabilityAssessment],
    verdicts: List[SafetyVerdict],
    config: Optional[DecisionConfig] = None,
) -> DecisionResult:
    """
    Combine ranked suitability assessments with safety verdicts into the final
    ranked recommendation set. Deterministic; joins by candidate_id.
    """
    if config is None:
        config = DecisionConfig()

    verdict_by_id: Dict[str, SafetyVerdict] = {v.candidate_id: v for v in verdicts}
    assessment_ids = {a.candidate_id for a in assessments}

    unmatched: List[str] = []
    decisions: List[LocationDecision] = []
    for a in assessments:
        v = verdict_by_id.get(a.candidate_id)
        if v is None:
            unmatched.append(a.candidate_id)
        decisions.append(_build_location_decision(a, v, config))

    # Safety verdicts with no matching assessment: recorded for transparency,
    # but cannot be ranked or recommended without an OSI.
    for v in verdicts:
        if v.candidate_id not in assessment_ids:
            unmatched.append(v.candidate_id)

    seen = set()
    unmatched_unique = [x for x in unmatched if not (x in seen or seen.add(x))]

    recommended = [d for d in decisions if d.is_recommended]
    suppressed = [d for d in decisions if not d.is_recommended]

    if config.safety_first_ordering:
        def _key(d: LocationDecision):
            return (
                0 if d.safety_status == "SAFE" else 1,
                -d.orca_suitability_index,
                _distance_mid(d.distance_km_range),
                d.candidate_id,
            )
    else:
        def _key(d: LocationDecision):
            return (
                -d.orca_suitability_index,
                _distance_mid(d.distance_km_range),
                d.candidate_id,
            )

    recommended.sort(key=_key)
    for i, d in enumerate(recommended, start=1):
        d.rank = i

    suppressed.sort(key=lambda d: (-d.orca_suitability_index, d.candidate_id))

    all_decisions = recommended + suppressed
    top = recommended[0] if recommended else None

    evaluated_count = len(decisions)
    recommended_count = len(recommended)
    suppressed_count = len(suppressed)
    any_stale_data = any(not d.data_freshness_ok for d in decisions)

    if recommended_count == 0:
        overall_status = "NO_GO"
    elif top.safety_status == "SAFE":
        overall_status = "GO"
    else:
        overall_status = "GO_WITH_CAUTION"

    safety_veto_active = evaluated_count > 0 and recommended_count == 0

    if overall_status == "NO_GO":
        if evaluated_count == 0:
            summary = "No candidate fishing zones were available to evaluate."
        else:
            summary = (
                f"Do not venture out — all {evaluated_count} candidate zone(s) "
                f"are blocked by safety conditions."
            )
    elif overall_status == "GO":
        summary = (
            f"Recommended: {top.landing_centre} (OSI {top.orca_suitability_index:.0f}, "
            f"{top.distance_km_range[0]:.0f}-{top.distance_km_range[1]:.0f} km). "
            f"Marine conditions are safe."
        )
    else:  # GO_WITH_CAUTION
        first_caution = top.cautions[0] if top.cautions else "advisory conditions in effect"
        summary = (
            f"Best available: {top.landing_centre} (OSI {top.orca_suitability_index:.0f}). "
            f"Proceed with caution — {first_caution}"
        )

    return DecisionResult(
        overall_status=overall_status,
        safety_veto_active=safety_veto_active,
        summary=summary,
        recommendations=recommended,
        top_recommendation=top,
        all_decisions=all_decisions,
        suppressed=suppressed,
        evaluated_count=evaluated_count,
        recommended_count=recommended_count,
        suppressed_count=suppressed_count,
        unmatched_candidate_ids=unmatched_unique,
        any_stale_data=any_stale_data,
        methodology_name=config.methodology_name,
        methodology_version=config.methodology_version,
        is_synthetic=False,
    )


def decide_from_bundles(
    bundles: List[EvidenceBundle],
    suitability_config: Optional[SuitabilityConfig] = None,
    safety_config: Optional[SafetyConfig] = None,
    decision_config: Optional[DecisionConfig] = None,
) -> DecisionResult:
    """
    Convenience: run the full downstream chain for a set of EvidenceBundles
    (suitability -> safety -> decision). The Backend API can call this directly.
    """
    assessments = evaluate_and_rank_all(bundles, suitability_config)
    verdicts = evaluate_safety_for_bundles(bundles, safety_config)
    return decide(assessments, verdicts, decision_config)
