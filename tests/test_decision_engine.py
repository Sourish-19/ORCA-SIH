"""
Unit Tests for the ORCA Decision Layer (app/services/decision_engine.py).

Covers the join of SuitabilityAssessment + SafetyVerdict into the final ranked
recommendation set: RECOMMENDED / RECOMMENDED_WITH_CAUTION / NOT_RECOMMENDED,
NO_GO suppression regardless of OSI, safety-tiered ranking (SAFE > CAUTION),
the unmatched-join edge case, the optional OSI floor, embedded sub-objects,
determinism, and the trip-level GO / GO_WITH_CAUTION / NO_GO logic.
"""

from datetime import datetime, timezone
import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.models.suitability import ComponentEvidence, SuitabilityAssessment
from app.models.safety import SafetyVerdict
from app.models.decision import DecisionConfig, LocationDecision, DecisionResult
from app.services.decision_engine import decide, decide_from_bundles
from app.services.evidence_builder import (
    build_evidence_bundle,
    load_processed_pfz_records,
    load_processed_sst_records,
    load_processed_chlorophyll_records,
    get_default_chennai_marine_weather,
    get_default_chennai_hazard_warnings,
)


# ---------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------

def _assessment(
    candidate_id: str = "PFZ-SEC007-Chennai-107deg",
    osi: float = 84.0,
    level: str = "HIGH",
    landing_centre: str = "Chennai",
    distance=(36.0, 41.0),
    lat: float = 13.0175,
    lon: float = 80.6331,
    supporting=None,
    limiting=None,
) -> SuitabilityAssessment:
    return SuitabilityAssessment(
        candidate_id=candidate_id,
        landing_centre=landing_centre,
        latitude=lat,
        longitude=lon,
        bearing_deg=107.0,
        distance_km_range=distance,
        depth_m_range=(214.0, 219.0),
        orca_suitability_index=osi,
        suitability_level=level,
        component_evidence=ComponentEvidence(
            pfz_base_score=50.0,
            chlorophyll_score=15.0,
            chlorophyll_raw_score=15.0,
            sst_score=15.0,
            sst_raw_score=15.0,
            accessibility_score=4.0,
            distance_km=(distance[0] + distance[1]) / 2.0,
        ),
        supporting_factors=supporting if supporting is not None else ["Official INCOIS PFZ advisory active."],
        limiting_factors=limiting if limiting is not None else [],
    )


def _verdict(
    candidate_id: str = "PFZ-SEC007-Chennai-107deg",
    status: str = "SAFE",
    landing_centre: str = "Chennai",
    lat: float = 13.0175,
    lon: float = 80.6331,
    risk: str = "LOW",
    cautions=None,
    vetoes=None,
    fresh: bool = True,
) -> SafetyVerdict:
    return SafetyVerdict(
        candidate_id=candidate_id,
        bundle_id="evidence_chennai_107deg",
        landing_centre=landing_centre,
        latitude=lat,
        longitude=lon,
        status=status,
        is_safe=(status != "NO_GO"),
        veto_triggered=(status == "NO_GO"),
        risk_level=risk,
        caution_reasons=cautions if cautions is not None else [],
        veto_reasons=vetoes if vetoes is not None else [],
        data_freshness_ok=fresh,
        safety_summary=f"{status} test verdict",
    )


def _real_chennai_bundle():
    base = Path(__file__).resolve().parent.parent / "data" / "processed" / "chennai"
    pfz_records = load_processed_pfz_records(str(base / "pfz.json"))
    sst_records = load_processed_sst_records(str(base / "sst.json"))
    chl_records = load_processed_chlorophyll_records(str(base / "chlorophyll.json"))
    chennai = [r for r in pfz_records if r.landing_centre.lower() == "chennai"][0]
    return build_evidence_bundle(
        pfz_record=chennai,
        sst_records=sst_records,
        chl_records=chl_records,
        marine_weather=get_default_chennai_marine_weather(),
        all_warnings=get_default_chennai_hazard_warnings(),
    )


# ---------------------------------------------------------------------
# 1. Clean RECOMMENDED
# ---------------------------------------------------------------------
def test_clean_recommended():
    result = decide([_assessment(osi=84.0)], [_verdict(status="SAFE")])

    assert result.overall_status == "GO"
    assert result.safety_veto_active is False
    assert result.recommended_count == 1
    assert result.suppressed_count == 0

    top = result.top_recommendation
    assert top is not None
    assert top.decision == "RECOMMENDED"
    assert top.is_recommended is True
    assert top.rank == 1
    assert top.safety_status == "SAFE"
    assert top.blockers == []
    assert top.cautions == []
    assert any("Safety check passed" in w for w in top.why_recommended)


# ---------------------------------------------------------------------
# 2. RECOMMENDED_WITH_CAUTION  (confirms cautions <- SafetyVerdict.caution_reasons)
# ---------------------------------------------------------------------
def test_recommended_with_caution():
    caution_msgs = [
        "Forecast wind up to 20.0 kt is elevated (caution at/above 20.0 kt).",
        "Sea state reported as 'Generally Moderate, becoming Rough in gust'.",
    ]
    result = decide(
        [_assessment(osi=84.0)],
        [_verdict(status="CAUTION", risk="MODERATE", cautions=caution_msgs)],
    )

    top = result.top_recommendation
    assert result.overall_status == "GO_WITH_CAUTION"
    assert top.decision == "RECOMMENDED_WITH_CAUTION"
    assert top.is_recommended is True
    assert top.rank == 1
    assert top.safety_status == "CAUTION"
    assert top.cautions == caution_msgs          # verbatim passthrough from caution_reasons
    assert top.blockers == []
    assert "caution" in result.summary.lower()


# ---------------------------------------------------------------------
# 3. NOT_RECOMMENDED via safety veto
# ---------------------------------------------------------------------
def test_not_recommended_via_veto():
    veto_msgs = ["Official CYCLONE_WARNING for 'Southwest Bay of Bengal' (RED_ALERT): ..."]
    result = decide(
        [_assessment(osi=90.0)],
        [_verdict(status="NO_GO", risk="SEVERE", vetoes=veto_msgs)],
    )

    assert result.overall_status == "NO_GO"
    assert result.safety_veto_active is True
    assert result.recommendations == []
    assert result.top_recommendation is None
    assert result.recommended_count == 0
    assert result.suppressed_count == 1

    d = result.suppressed[0]
    assert d.decision == "NOT_RECOMMENDED"
    assert d.is_recommended is False
    assert d.rank is None
    assert d.safety_status == "NO_GO"
    assert d.risk_level == "SEVERE"
    assert d.blockers == veto_msgs
    assert d in result.all_decisions


# ---------------------------------------------------------------------
# 4. NO_GO suppresses a high-OSI location; a lower-OSI SAFE one wins
# ---------------------------------------------------------------------
def test_no_go_suppresses_high_osi():
    great_but_unsafe = _assessment(candidate_id="PFZ-SEC007-A-100deg", osi=95.0, landing_centre="A")
    ok_and_safe = _assessment(candidate_id="PFZ-SEC007-B-100deg", osi=60.0, landing_centre="B", level="BASELINE_PFZ")

    result = decide(
        [great_but_unsafe, ok_and_safe],
        [
            _verdict(candidate_id="PFZ-SEC007-A-100deg", status="NO_GO", risk="SEVERE",
                     vetoes=["Active cyclonic system reported."], landing_centre="A"),
            _verdict(candidate_id="PFZ-SEC007-B-100deg", status="SAFE", landing_centre="B"),
        ],
    )

    assert result.overall_status == "GO"
    assert [d.candidate_id for d in result.recommendations] == ["PFZ-SEC007-B-100deg"]
    assert result.top_recommendation.orca_suitability_index == 60.0
    assert result.suppressed[0].candidate_id == "PFZ-SEC007-A-100deg"


# ---------------------------------------------------------------------
# 5. Safety-tiered ranking: SAFE outranks CAUTION regardless of OSI
# ---------------------------------------------------------------------
def test_safety_tiered_ranking():
    safe_lower = _assessment(candidate_id="PFZ-SEC007-SAFE-90deg", osi=70.0, landing_centre="SafeSpot")
    caution_higher = _assessment(candidate_id="PFZ-SEC007-CAUT-90deg", osi=88.0, landing_centre="RiskySpot")

    result = decide(
        [caution_higher, safe_lower],  # deliberately OSI-first order in the input
        [
            _verdict(candidate_id="PFZ-SEC007-CAUT-90deg", status="CAUTION", risk="MODERATE",
                     cautions=["Gusts to 25 kt."], landing_centre="RiskySpot"),
            _verdict(candidate_id="PFZ-SEC007-SAFE-90deg", status="SAFE", landing_centre="SafeSpot"),
        ],
    )

    assert [d.candidate_id for d in result.recommendations] == [
        "PFZ-SEC007-SAFE-90deg",
        "PFZ-SEC007-CAUT-90deg",
    ]
    assert [d.rank for d in result.recommendations] == [1, 2]
    assert result.top_recommendation.landing_centre == "SafeSpot"
    assert result.overall_status == "GO"

    # With safety_first_ordering disabled, pure OSI wins
    result_osi = decide(
        [caution_higher, safe_lower],
        [
            _verdict(candidate_id="PFZ-SEC007-CAUT-90deg", status="CAUTION", risk="MODERATE",
                     cautions=["Gusts to 25 kt."], landing_centre="RiskySpot"),
            _verdict(candidate_id="PFZ-SEC007-SAFE-90deg", status="SAFE", landing_centre="SafeSpot"),
        ],
        DecisionConfig(safety_first_ordering=False),
    )
    assert result_osi.recommendations[0].candidate_id == "PFZ-SEC007-CAUT-90deg"
    assert result_osi.overall_status == "GO_WITH_CAUTION"


# ---------------------------------------------------------------------
# 6. Unmatched join (both directions)
# ---------------------------------------------------------------------
def test_unmatched_join():
    result = decide(
        [_assessment(candidate_id="PFZ-SEC007-Chennai-107deg")],
        [_verdict(candidate_id="PFZ-SEC007-Somewhere-Else-42deg", status="SAFE")],
    )

    assert result.overall_status == "NO_GO"
    assert result.safety_veto_active is True
    assert result.recommendations == []

    d = result.all_decisions[0]
    assert d.decision == "NOT_RECOMMENDED"
    assert d.safety_status == "UNKNOWN"
    assert d.risk_level == "UNKNOWN"
    assert d.safety is None
    assert d.data_freshness_ok is False
    assert any("No safety evaluation available" in b for b in d.blockers)

    assert "PFZ-SEC007-Chennai-107deg" in result.unmatched_candidate_ids
    assert "PFZ-SEC007-Somewhere-Else-42deg" in result.unmatched_candidate_ids
    assert result.any_stale_data is True


# ---------------------------------------------------------------------
# 7. Trip-level: every location blocked -> NO_GO
# ---------------------------------------------------------------------
def test_trip_status_no_go_all_blocked():
    result = decide(
        [
            _assessment(candidate_id="PFZ-SEC007-A-1deg", osi=80.0, landing_centre="A"),
            _assessment(candidate_id="PFZ-SEC007-B-2deg", osi=75.0, landing_centre="B"),
        ],
        [
            _verdict(candidate_id="PFZ-SEC007-A-1deg", status="NO_GO", risk="HIGH",
                     vetoes=["Wind exceeded."], landing_centre="A"),
            _verdict(candidate_id="PFZ-SEC007-B-2deg", status="NO_GO", risk="SEVERE",
                     vetoes=["Cyclone."], landing_centre="B"),
        ],
    )
    assert result.overall_status == "NO_GO"
    assert result.safety_veto_active is True
    assert "all 2 candidate zone(s)" in result.summary


# ---------------------------------------------------------------------
# 8. Trip-level: best available is CAUTION -> GO_WITH_CAUTION
# ---------------------------------------------------------------------
def test_trip_status_go_with_caution():
    result = decide(
        [_assessment(osi=84.0)],
        [_verdict(status="CAUTION", risk="MODERATE", cautions=["Elevated wind."])],
    )
    assert result.overall_status == "GO_WITH_CAUTION"
    assert result.top_recommendation.decision == "RECOMMENDED_WITH_CAUTION"


# ---------------------------------------------------------------------
# 9. Empty input -> NO_GO but not a safety veto
# ---------------------------------------------------------------------
def test_empty_input():
    result = decide([], [])
    assert result.overall_status == "NO_GO"
    assert result.safety_veto_active is False
    assert result.evaluated_count == 0
    assert "No candidate fishing zones" in result.summary


# ---------------------------------------------------------------------
# 10. Optional OSI floor
# ---------------------------------------------------------------------
def test_min_osi_floor():
    cfg = DecisionConfig(min_osi_to_recommend=75.0)

    low = decide([_assessment(osi=60.0)], [_verdict(status="SAFE")], cfg)
    assert low.overall_status == "NO_GO"
    d = low.suppressed[0]
    assert d.decision == "NOT_RECOMMENDED"
    assert any("below the usable threshold" in b for b in d.blockers)

    high = decide([_assessment(osi=80.0)], [_verdict(status="SAFE")], cfg)
    assert high.overall_status == "GO"
    assert high.top_recommendation.decision == "RECOMMENDED"


# ---------------------------------------------------------------------
# 11. Embedded sub-objects are the originals
# ---------------------------------------------------------------------
def test_embedded_subobjects():
    a = _assessment(osi=84.0)
    v = _verdict(status="SAFE")
    result = decide([a], [v])
    top = result.top_recommendation

    assert isinstance(top.suitability, SuitabilityAssessment)
    assert isinstance(top.safety, SafetyVerdict)
    assert top.suitability.candidate_id == a.candidate_id
    assert top.safety.candidate_id == v.candidate_id
    assert top.orca_suitability_index == a.orca_suitability_index
    assert top.suitability.component_evidence.pfz_base_score == 50.0


# ---------------------------------------------------------------------
# 12. Determinism
# ---------------------------------------------------------------------
def test_deterministic_reproducibility():
    assessments = [
        _assessment(candidate_id="PFZ-SEC007-A-1deg", osi=88.0, landing_centre="A"),
        _assessment(candidate_id="PFZ-SEC007-B-2deg", osi=70.0, landing_centre="B"),
    ]
    verdicts = [
        _verdict(candidate_id="PFZ-SEC007-A-1deg", status="CAUTION", risk="MODERATE",
                 cautions=["x"], landing_centre="A"),
        _verdict(candidate_id="PFZ-SEC007-B-2deg", status="SAFE", landing_centre="B"),
    ]
    r1 = decide(assessments, verdicts)
    r2 = decide(assessments, verdicts)
    assert r1.model_dump(exclude={"decided_at"}) == r2.model_dump(exclude={"decided_at"})


# ---------------------------------------------------------------------
# 13. decide_from_bundles integration on the real Chennai data
# ---------------------------------------------------------------------
def test_decide_from_bundles_integration():
    bundle = _real_chennai_bundle()
    result = decide_from_bundles([bundle])

    assert result.evaluated_count == 1
    assert result.recommended_count == 1
    # Default Chennai bulletin is gusty/rough + an ADVISORY_CAUTION current warning
    # -> CAUTION, never a veto.
    assert result.overall_status == "GO_WITH_CAUTION"
    top = result.top_recommendation
    assert top.candidate_id == "PFZ-SEC007-Chennai-107deg"
    assert top.decision == "RECOMMENDED_WITH_CAUTION"
    assert top.suitability.orca_suitability_index == 84.0
    assert top.safety.status == "CAUTION"
