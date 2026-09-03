"""
Unit Tests for the ORCA Safety Engine Service (app/services/safety_engine.py).

Covers the real normalized-model Safety Engine: tri-state SAFE / CAUTION / NO_GO,
wind & gust vetoes, sea-state text parsing, flag-based cyclone veto (Option A),
the dormant point-radius proximity hook (Option B), data-freshness caution,
the candidate_id join key shared with the Suitability Engine, and safety isolation.

The legacy app/tools/safety_checker.py and tests/test_safety.py are intentionally
left untouched; this is a separate module.
"""

from datetime import datetime, date, timedelta, timezone
import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.models.ocean import CommonMetadata, NormalizedPFZRecord
from app.models.hazard import NormalizedMarineWeather, NormalizedHazardWarning
from app.models.evidence import (
    SpatialMatchMetadata,
    MatchedSST,
    MatchedChlorophyll,
    EvidenceBundle,
)
from app.models.safety import SafetyConfig, SafetyVerdict
from app.services.safety_engine import (
    assess_marine_safety,
    evaluate_safety,
    evaluate_safety_for_bundles,
)
from app.services._identity import make_candidate_id
from app.services.suitability_engine import evaluate_evidence_bundle
from app.services.evidence_builder import (
    build_evidence_bundle,
    load_processed_pfz_records,
    load_processed_sst_records,
    load_processed_chlorophyll_records,
    get_default_chennai_marine_weather,
    get_default_chennai_hazard_warnings,
)

ANCHOR_LAT = 13.0175
ANCHOR_LON = 80.6331
FAR_FUTURE = datetime(2099, 1, 1, tzinfo=timezone.utc)


def _weather(**overrides) -> NormalizedMarineWeather:
    meta = CommonMetadata(
        source="IMD RMC Chennai (ACWC)",
        source_product="Coastal Weather Bulletin for North Tamil Nadu Coast",
        observation_time=datetime(2026, 9, 1, 8, 0, tzinfo=timezone.utc),
        geographic_area="North Tamil Nadu Coast",
        synthetic=False,
    )
    defaults = dict(
        coastal_sector="North Tamil Nadu Coast",
        wind_direction="Southwesterly / Southerly",
        wind_speed_knots_min=8.0,
        wind_speed_knots_max=12.0,
        gust_speed_knots=16.0,
        sea_condition="Slight to Moderate",
        weather_condition="Partly cloudy",
        visibility="Good",
        port_warning="NIL",
        ocean_current_speed_m_s=(0.4, 0.8),
        metadata=meta,
    )
    defaults.update(overrides)
    return NormalizedMarineWeather(**defaults)


def _warning(**overrides) -> NormalizedHazardWarning:
    meta = CommonMetadata(
        source="IMD / INCOIS Joint Advisory",
        source_product="Advisory",
        observation_time=datetime(2026, 9, 1, 8, 0, tzinfo=timezone.utc),
        geographic_area="North Tamil Nadu Coast",
        synthetic=False,
    )
    defaults = dict(
        warning_type="FISHERMEN_WARNING",
        warning_level="NO_WARNING",
        affected_area="North Tamil Nadu Coast",
        fishermen_advised_not_to_venture=False,
        cyclone_active=False,
        cyclone_stage="NIL",
        cyclone_coordinates=None,
        cyclone_warning_active=False,
        seven_day_cyclogenesis_probability="NIL",
        description="No adverse conditions.",
        metadata=meta,
    )
    defaults.update(overrides)
    return NormalizedHazardWarning(**defaults)


# ---------------------------------------------------------------------
# 1. Clear conditions -> SAFE
# ---------------------------------------------------------------------
def test_clear_weather_is_safe():
    verdict = assess_marine_safety(
        ANCHOR_LAT, ANCHOR_LON,
        marine_weather=_weather(),
        warnings=[_warning()],
        advisory_valid_until=FAR_FUTURE,
    )
    assert verdict.status == "SAFE"
    assert verdict.is_safe is True
    assert verdict.veto_triggered is False
    assert verdict.risk_level == "LOW"
    assert verdict.veto_reasons == []
    assert verdict.data_freshness_ok is True


# ---------------------------------------------------------------------
# 2. High sustained wind -> NO_GO
# ---------------------------------------------------------------------
def test_high_wind_triggers_veto():
    verdict = assess_marine_safety(
        ANCHOR_LAT, ANCHOR_LON,
        marine_weather=_weather(wind_speed_knots_max=30.0),
        warnings=[],
        advisory_valid_until=FAR_FUTURE,
    )
    assert verdict.status == "NO_GO"
    assert verdict.is_safe is False
    assert verdict.veto_triggered is True
    assert verdict.risk_level == "HIGH"
    assert any(f.code == "WIND_MAX_EXCEEDED" for f in verdict.findings)
    assert verdict.veto_reasons


# ---------------------------------------------------------------------
# 3. Gust above near-gale threshold -> NO_GO
# ---------------------------------------------------------------------
def test_high_gust_triggers_veto():
    verdict = assess_marine_safety(
        ANCHOR_LAT, ANCHOR_LON,
        marine_weather=_weather(wind_speed_knots_max=18.0, gust_speed_knots=40.0),
        warnings=[],
        advisory_valid_until=FAR_FUTURE,
    )
    assert verdict.status == "NO_GO"
    assert any(f.code == "GUST_EXCEEDED" for f in verdict.findings)


# ---------------------------------------------------------------------
# 4. Elevated-but-sub-threshold wind + gusty rough sea -> CAUTION (is_safe stays True)
# ---------------------------------------------------------------------
def test_moderate_conditions_are_caution_not_veto():
    verdict = assess_marine_safety(
        ANCHOR_LAT, ANCHOR_LON,
        marine_weather=_weather(
            wind_speed_knots_min=15.0,
            wind_speed_knots_max=20.0,
            gust_speed_knots=25.0,
            sea_condition="Generally Moderate, becoming Rough in gust",
        ),
        warnings=[],
        advisory_valid_until=FAR_FUTURE,
    )
    assert verdict.status == "CAUTION"
    assert verdict.is_safe is True
    assert verdict.veto_triggered is False
    assert verdict.risk_level == "MODERATE"
    codes = {f.code for f in verdict.findings}
    assert "WIND_ELEVATED" in codes
    assert "MODERATE_SEA_STATE" in codes


# ---------------------------------------------------------------------
# 5. Flag-based cyclone veto (Option A) -> NO_GO, SEVERE
# ---------------------------------------------------------------------
def test_active_cyclone_flag_triggers_severe_veto():
    verdict = assess_marine_safety(
        ANCHOR_LAT, ANCHOR_LON,
        marine_weather=_weather(),
        warnings=[_warning(
            warning_type="CYCLONE_WARNING",
            warning_level="RED_ALERT",
            affected_area="Southwest Bay of Bengal",
            fishermen_advised_not_to_venture=True,
            cyclone_active=True,
            cyclone_stage="Cyclonic Storm",
            cyclone_warning_active=True,
            description="Severe cyclonic storm approaching the coast.",
        )],
        advisory_valid_until=FAR_FUTURE,
    )
    assert verdict.status == "NO_GO"
    assert verdict.risk_level == "SEVERE"
    codes = {f.code for f in verdict.findings}
    assert "CYCLONE_SYSTEM" in codes
    assert "OFFICIAL_PROHIBITION" in codes
    assert verdict.matched_warnings and "RED_ALERT" in verdict.matched_warnings[0]


# ---------------------------------------------------------------------
# 6. Non-cyclone strict prohibition -> NO_GO, HIGH (not SEVERE)
# ---------------------------------------------------------------------
def test_strict_prohibition_is_high_risk_veto():
    verdict = assess_marine_safety(
        ANCHOR_LAT, ANCHOR_LON,
        marine_weather=_weather(),
        warnings=[_warning(
            warning_level="STRICT_PROHIBITION",
            fishermen_advised_not_to_venture=True,
            description="Squally winds 45-55 kmph. Do not venture.",
        )],
        advisory_valid_until=FAR_FUTURE,
    )
    assert verdict.status == "NO_GO"
    assert verdict.risk_level == "HIGH"
    assert any(f.code == "OFFICIAL_PROHIBITION" for f in verdict.findings)


# ---------------------------------------------------------------------
# 7. Dormant Option B hook: explicit cyclone centre within veto radius
# ---------------------------------------------------------------------
def test_cyclone_proximity_hook_activates_only_with_coordinates():
    near_centre = _warning(
        warning_type="CYCLONE_OUTLOOK",
        warning_level="NO_WARNING",
        cyclone_active=False,
        cyclone_coordinates={"lat": 13.5, "lon": 81.0},  # ~ 60 km from anchor
        description="System centre reported nearby.",
    )
    verdict = assess_marine_safety(
        ANCHOR_LAT, ANCHOR_LON,
        marine_weather=_weather(),
        warnings=[near_centre],
        advisory_valid_until=FAR_FUTURE,
    )
    assert verdict.status == "NO_GO"
    assert any(f.code == "CYCLONE_PROXIMITY" and f.severity == "VETO" for f in verdict.findings)

    # Same warning without coordinates -> hook stays dormant -> SAFE
    verdict_no_coords = assess_marine_safety(
        ANCHOR_LAT, ANCHOR_LON,
        marine_weather=_weather(),
        warnings=[_warning(warning_type="CYCLONE_OUTLOOK", warning_level="NO_WARNING")],
        advisory_valid_until=FAR_FUTURE,
    )
    assert verdict_no_coords.status == "SAFE"
    assert not any(f.code == "CYCLONE_PROXIMITY" for f in verdict_no_coords.findings)


# ---------------------------------------------------------------------
# 8. Missing weather bulletin -> CAUTION, is_safe True
# ---------------------------------------------------------------------
def test_missing_weather_is_caution():
    verdict = assess_marine_safety(
        ANCHOR_LAT, ANCHOR_LON,
        marine_weather=None,
        warnings=[],
        advisory_valid_until=FAR_FUTURE,
    )
    assert verdict.status == "CAUTION"
    assert verdict.is_safe is True
    assert any(f.code == "NO_WEATHER_DATA" for f in verdict.findings)


# ---------------------------------------------------------------------
# 9. Expired advisory -> CAUTION + data_freshness_ok False (never a veto)
# ---------------------------------------------------------------------
def test_stale_advisory_is_caution_only():
    past = datetime.now(timezone.utc) - timedelta(hours=6)
    verdict = assess_marine_safety(
        ANCHOR_LAT, ANCHOR_LON,
        marine_weather=_weather(),
        warnings=[],
        advisory_valid_until=past,
    )
    assert verdict.status == "CAUTION"
    assert verdict.veto_triggered is False
    assert verdict.data_freshness_ok is False
    assert any(f.code == "STALE_ADVISORY" for f in verdict.findings)


# ---------------------------------------------------------------------
# 10. Determinism
# ---------------------------------------------------------------------
def test_deterministic_reproducibility():
    kwargs = dict(
        marine_weather=_weather(wind_speed_knots_max=20.0),
        warnings=[_warning(warning_level="ADVISORY_CAUTION")],
        advisory_valid_until=FAR_FUTURE,
    )
    a = assess_marine_safety(ANCHOR_LAT, ANCHOR_LON, **kwargs)
    b = assess_marine_safety(ANCHOR_LAT, ANCHOR_LON, **kwargs)
    assert a.status == b.status
    assert a.model_dump(exclude={"evaluated_at"}) == b.model_dump(exclude={"evaluated_at"})


# ---------------------------------------------------------------------
# 11. evaluate_safety(bundle): join key matches the Suitability Engine's candidate_id
# ---------------------------------------------------------------------
def _real_chennai_bundle() -> EvidenceBundle:
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


def test_evaluate_safety_join_key_matches_suitability():
    bundle = _real_chennai_bundle()
    verdict = evaluate_safety(bundle)
    assessment = evaluate_evidence_bundle(bundle)

    assert verdict.candidate_id == assessment.candidate_id == make_candidate_id(bundle.pfz)
    assert verdict.bundle_id == bundle.bundle_id
    assert verdict.landing_centre == "Chennai"
    # Default Chennai bulletin is gusty/rough + an ADVISORY_CAUTION current warning,
    # but nothing prohibitive -> CAUTION, never a veto.
    assert verdict.status == "CAUTION"
    assert verdict.veto_triggered is False
    assert verdict.is_safe is True


# ---------------------------------------------------------------------
# 12. Batch wrapper preserves order and count
# ---------------------------------------------------------------------
def test_evaluate_safety_for_bundles_batch():
    bundle = _real_chennai_bundle()
    verdicts = evaluate_safety_for_bundles([bundle, bundle, bundle])
    assert len(verdicts) == 3
    assert all(isinstance(v, SafetyVerdict) for v in verdicts)
    assert {v.status for v in verdicts} == {verdicts[0].status}


# ---------------------------------------------------------------------
# 13. Safety verdict carries no suitability / OSI fields (strict separation)
# ---------------------------------------------------------------------
def test_verdict_has_no_suitability_fields():
    verdict = assess_marine_safety(ANCHOR_LAT, ANCHOR_LON, marine_weather=_weather())
    dumped = verdict.model_dump()
    for forbidden in ("orca_suitability_index", "osi", "suitability_level", "component_evidence"):
        assert forbidden not in dumped


# ---------------------------------------------------------------------
# 14. Custom config thresholds are honoured
# ---------------------------------------------------------------------
def test_custom_config_threshold():
    strict = SafetyConfig(max_safe_wind_knots=15.0)
    verdict = assess_marine_safety(
        ANCHOR_LAT, ANCHOR_LON,
        marine_weather=_weather(wind_speed_knots_max=18.0),
        warnings=[],
        advisory_valid_until=FAR_FUTURE,
        config=strict,
    )
    assert verdict.status == "NO_GO"
    assert any(f.code == "WIND_MAX_EXCEEDED" for f in verdict.findings)
