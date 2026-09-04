"""
Fact & Safety Validator Unit Tests
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.models.context_builder import (
    VerifiedContext,
    VerifiedLocation,
    VerifiedOcean,
    VerifiedPFZ,
    VerifiedRecommendedZone,
    VerifiedSafety,
    VerifiedSpeciesInfo,
)
from app.services.llm_explainer import validate_llm_response


def test_validator():
    ctx = VerifiedContext(
        query="Where should I fish?",
        detected_language="en",
        primary_intent="FISHING_RECOMMENDATION",
        location=VerifiedLocation(name="Chennai", latitude=13.08, longitude=80.29),
        pfz=VerifiedPFZ(available=True, total_zones=3, top_zone="Ennorekuppam"),
        ocean=VerifiedOcean(sst_celsius=28.5, chlorophyll_mg_m3=1.2, wind_speed_knots=15.0, wave_height_m=1.5),
        recommended_zone=VerifiedRecommendedZone(
            name="Ennorekuppam",
            distance_km_min=9.0,
            distance_km_max=14.0,
            bearing_deg=87.0,
            depth_m_min=20.0,
            depth_m_max=35.0,
            suitability_score=100.0,
            reasons=["High Chlorophyll"],
            cautions=[],
        ),
        safety=VerifiedSafety(status="GO", veto_triggered=False, risk_level="LOW"),
    )

    # 1. Test Valid Grounded Output
    ok, reason = validate_llm_response(
        headline="Recommended: Ennorekuppam",
        narrative="ORCA recommends fishing near Ennorekuppam, about 9 to 14 km out at bearing 87 degrees.",
        answer="Ennorekuppam is recommended with 100 score.",
        context=ctx,
    )
    print(f"Valid output check: ok={ok}, reason={reason}")

    # 2. Test Hallucinated Number (e.g., distance 99 km)
    ok_num, reason_num = validate_llm_response(
        headline="Recommended: Ennorekuppam",
        narrative="ORCA recommends fishing near Ennorekuppam, 99 km out.",
        answer="Ennorekuppam distance 99 km.",
        context=ctx,
    )
    print(f"Hallucinated number check: ok={ok_num}, reason={reason_num}")

    # 3. Test Hallucinated Location (e.g., Pondicherry)
    ok_loc, reason_loc = validate_llm_response(
        headline="Recommended: Pondicherry",
        narrative="The best spot is Pondicherry, 50 km away.",
        answer="Go to Pondicherry.",
        context=ctx,
    )
    print(f"Hallucinated location check: ok={ok_loc}, reason={reason_loc}")

    # 4. Test Safety Veto Contradiction
    veto_ctx = VerifiedContext(
        query="Can I fish?",
        detected_language="en",
        primary_intent="SAFETY_INQUIRY",
        location=VerifiedLocation(name="Visakhapatnam", latitude=17.68, longitude=83.21),
        pfz=VerifiedPFZ(available=False, total_zones=0),
        ocean=VerifiedOcean(wind_speed_knots=45.0, wave_height_m=4.5),
        safety=VerifiedSafety(status="NO_GO", veto_triggered=True, risk_level="SEVERE", summary="Cyclone Alert"),
    )

    ok_veto, reason_veto = validate_llm_response(
        headline="Weather is clear",
        narrative="It is safe to fish tomorrow near Visakhapatnam.",
        answer="Safe to go.",
        context=veto_ctx,
    )
    print(f"Safety veto contradiction check: ok={ok_veto}, reason={reason_veto}")

    # Assertions
    assert ok is True
    assert ok_num is False
    assert "failed_number_grounding" in reason_num
    assert ok_loc is False
    assert "failed_place_grounding" in reason_loc
    assert ok_veto is False
    assert reason_veto == "failed_safety_veto_contradiction"

    print("\nALL FACT & SAFETY VALIDATOR UNIT TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_validator()
