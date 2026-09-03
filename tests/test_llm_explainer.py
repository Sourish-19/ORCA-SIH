"""
Unit Tests for the ORCA LLM Explainer (app/services/llm_explainer.py).

No real Gemini calls: tests either force the template path (config.enabled=False)
or monkeypatch `_call_gemini` with canned output. Covers the briefing slice,
all three template statuses (English + Tamil), the LLM-accepted path, each of the
three guardrail rejections (number / contradiction / place), API-error fallback,
and config.from_env() resolution.
"""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.models.suitability import ComponentEvidence, SuitabilityAssessment
from app.models.safety import SafetyVerdict
from app.models.explanation import DecisionExplanation, LLMExplainerConfig
from app.services.decision_engine import decide
import app.services.llm_explainer as mod
from app.services.llm_explainer import build_briefing, explain_decision, _validate


# ---------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------

def _assessment(cid="PFZ-SEC007-Chennai-107deg", osi=84.0, level="HIGH", lc="Chennai",
                dist=(36.0, 41.0), supporting=None):
    return SuitabilityAssessment(
        candidate_id=cid, landing_centre=lc, latitude=13.0175, longitude=80.6331,
        bearing_deg=107.0, distance_km_range=dist, depth_m_range=(214.0, 219.0),
        orca_suitability_index=osi, suitability_level=level,
        component_evidence=ComponentEvidence(
            pfz_base_score=50.0, chlorophyll_score=15.0, chlorophyll_raw_score=15.0,
            sst_score=15.0, sst_raw_score=15.0, accessibility_score=4.0, distance_km=38.5,
        ),
        supporting_factors=supporting or ["Official INCOIS SEC007 Potential Fishing Zone advisory active."],
        limiting_factors=[],
    )


def _verdict(cid="PFZ-SEC007-Chennai-107deg", status="SAFE", lc="Chennai", risk="LOW",
             cautions=None, vetoes=None):
    return SafetyVerdict(
        candidate_id=cid, bundle_id="evidence_chennai_107deg", landing_centre=lc,
        latitude=13.0175, longitude=80.6331, status=status,
        is_safe=(status != "NO_GO"), veto_triggered=(status == "NO_GO"), risk_level=risk,
        caution_reasons=cautions or [], veto_reasons=vetoes or [],
        data_freshness_ok=True, safety_summary=f"{status} test",
    )


def _go():
    return decide([_assessment()], [_verdict(status="SAFE")])


def _caution():
    return decide(
        [_assessment()],
        [_verdict(status="CAUTION", risk="MODERATE",
                  cautions=["Forecast wind up to 20.0 kt is elevated (caution at/above 20.0 kt)."])],
    )


def _no_go():
    return decide(
        [_assessment(osi=90.0)],
        [_verdict(status="NO_GO", risk="SEVERE",
                  vetoes=["Official CYCLONE_WARNING for Southwest Bay of Bengal (RED_ALERT)."])],
    )


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    """Belt-and-suspenders: default config.from_env() to disabled so no test can
    accidentally hit the network even if it forgets to pass a config."""
    monkeypatch.setattr("app.config.GEMINI_API_KEY", None, raising=False)
    monkeypatch.setattr("app.config.ORCA_LLM_ENABLED", "auto", raising=False)


DISABLED = LLMExplainerConfig(enabled=False)
ENABLED = LLMExplainerConfig(model="gemini-flash-latest", enabled=True)


# ---------------------------------------------------------------------
# Briefing slice
# ---------------------------------------------------------------------
def test_build_briefing_shape_and_no_leakage():
    b = build_briefing(_caution())
    assert set(b.keys()) == {
        "overall_status", "deterministic_summary", "any_stale_data",
        "recommended", "not_recommended",
    }
    assert b["overall_status"] == "GO_WITH_CAUTION"
    assert len(b["recommended"]) == 1
    row = b["recommended"][0]
    assert row["place"] == "Chennai"
    assert row["suitability_score"] == "84 out of 100"
    assert "latitude" not in row and "longitude" not in row
    assert "component_evidence" not in row and "methodology_name" not in row
    blob = json.dumps(b)
    assert "80.6331" not in blob            # raw coordinates never reach the model
    assert "component_evidence" not in blob  # no OSI sub-score breakdown
    assert "evaluated_at" not in blob        # no internal timestamps


def test_build_briefing_caps_recommended_at_three():
    a = [_assessment(cid=f"PFZ-SEC007-Z{i}-100deg", osi=80.0 - i, lc=f"Z{i}") for i in range(4)]
    v = [_verdict(cid=f"PFZ-SEC007-Z{i}-100deg", status="SAFE", lc=f"Z{i}") for i in range(4)]
    b = build_briefing(decide(a, v))
    assert len(b["recommended"]) == 3


# ---------------------------------------------------------------------
# Template fallback (English)
# ---------------------------------------------------------------------
def test_template_go():
    exp = explain_decision(_go(), config=DISABLED)
    assert isinstance(exp, DecisionExplanation)
    assert exp.is_fallback is True
    assert exp.model_used == "template-fallback"
    assert exp.fallback_reason == "llm_disabled"
    assert exp.grounding_ok is True
    assert "Chennai" in exp.headline
    assert "84" in exp.narrative and "36" in exp.narrative and "41" in exp.narrative


def test_template_caution():
    exp = explain_decision(_caution(), config=DISABLED)
    assert exp.is_fallback is True
    assert "caution" in exp.headline.lower()
    assert "84" in exp.narrative
    assert "not fully safe" in exp.narrative.lower()


def test_template_no_go():
    exp = explain_decision(_no_go(), config=DISABLED)
    assert exp.headline == "Do not go to sea"
    assert "does not recommend" in exp.narrative.lower()
    assert "RED_ALERT" in exp.narrative


# ---------------------------------------------------------------------
# Template fallback (Tamil)
# ---------------------------------------------------------------------
def test_template_tamil():
    exp = explain_decision(_go(), audience="fisherman", language="ta", config=DISABLED)
    assert exp.language == "ta"
    assert exp.model_used == "template-fallback"
    assert any("஀" <= ch <= "௿" for ch in exp.narrative)  # contains Tamil script
    assert "84" in exp.narrative


# ---------------------------------------------------------------------
# LLM accepted
# ---------------------------------------------------------------------
def test_llm_accepted_grounded_output(monkeypatch):
    headline = "Fish with caution near Chennai"
    narrative = (
        "ORCA's best option is Chennai, about 36 to 41 km out at bearing 107 degrees, "
        "with a suitability score of 84 out of 100. Winds up to 20 kt are elevated, so take care."
    )
    monkeypatch.setattr(mod, "_call_gemini", lambda *a, **k: (headline, narrative, None))

    exp = explain_decision(_caution(), config=ENABLED)
    assert exp.is_fallback is False
    assert exp.model_used == "gemini-flash-latest"
    assert exp.grounding_ok is True
    assert exp.fallback_reason is None
    assert exp.narrative == narrative


# ---------------------------------------------------------------------
# Guardrail: number check
# ---------------------------------------------------------------------
def test_llm_rejected_invented_number(monkeypatch):
    bad = ("Go to Chennai",
           "ORCA recommends fishing near Chennai, 250 km out, with a suitability score of 999 out of 100.")
    monkeypatch.setattr(mod, "_call_gemini", lambda *a, **k: (*bad, None))

    exp = explain_decision(_go(), config=ENABLED)
    assert exp.is_fallback is True
    assert exp.fallback_reason == "failed_number_check"
    assert exp.grounding_ok is False
    assert "250" not in exp.narrative and "999" not in exp.narrative  # template text now


# ---------------------------------------------------------------------
# Guardrail: contradiction check
# ---------------------------------------------------------------------
def test_llm_rejected_contradiction(monkeypatch):
    bad = ("Good news", "Conditions are safe and you can fish near the coast tomorrow.")
    monkeypatch.setattr(mod, "_call_gemini", lambda *a, **k: (*bad, None))

    exp = explain_decision(_no_go(), config=ENABLED)
    assert exp.is_fallback is True
    assert exp.fallback_reason == "failed_contradiction_check"
    assert exp.grounding_ok is False
    assert exp.headline == "Do not go to sea"


# ---------------------------------------------------------------------
# Guardrail: place check
# ---------------------------------------------------------------------
def test_llm_rejected_foreign_place(monkeypatch):
    bad = ("Head out",
           "ORCA recommends fishing near Pondicherry, 36 to 41 km out at bearing 107, score 84 out of 100.")
    monkeypatch.setattr(mod, "_call_gemini", lambda *a, **k: (*bad, None))

    exp = explain_decision(_go(), config=ENABLED)
    assert exp.is_fallback is True
    assert exp.fallback_reason == "failed_place_check"
    assert "Pondicherry" not in exp.narrative


# ---------------------------------------------------------------------
# API error -> fallback, but grounding_ok stays True (nothing was rejected)
# ---------------------------------------------------------------------
def test_llm_api_error_falls_back(monkeypatch):
    monkeypatch.setattr(mod, "_call_gemini", lambda *a, **k: (None, None, "api_error:TimeoutError"))

    exp = explain_decision(_go(), config=ENABLED)
    assert exp.is_fallback is True
    assert exp.fallback_reason == "api_error:TimeoutError"
    assert exp.grounding_ok is True
    assert exp.model_used == "template-fallback"


# ---------------------------------------------------------------------
# _validate accepts well-grounded text directly
# ---------------------------------------------------------------------
def test_validate_accepts_grounded_text():
    result = _go()
    briefing = build_briefing(result)
    ok, reason = _validate(
        "Recommended: Chennai",
        "ORCA recommends Chennai, about 36 to 41 km out at bearing 107 degrees, "
        "suitability 84 out of 100. The safety check is clear.",
        briefing, result,
    )
    assert ok is True and reason is None


# ---------------------------------------------------------------------
# Config resolution
# ---------------------------------------------------------------------
def test_config_from_env_auto_without_key(monkeypatch):
    monkeypatch.setattr("app.config.GEMINI_API_KEY", None, raising=False)
    monkeypatch.setattr("app.config.ORCA_LLM_ENABLED", "auto", raising=False)
    assert LLMExplainerConfig.from_env().enabled is False


def test_config_from_env_auto_with_key(monkeypatch):
    monkeypatch.setattr("app.config.GEMINI_API_KEY", "AIzaFAKEKEY", raising=False)
    monkeypatch.setattr("app.config.ORCA_LLM_ENABLED", "auto", raising=False)
    assert LLMExplainerConfig.from_env().enabled is True


def test_config_from_env_off_overrides_key(monkeypatch):
    monkeypatch.setattr("app.config.GEMINI_API_KEY", "AIzaFAKEKEY", raising=False)
    monkeypatch.setattr("app.config.ORCA_LLM_ENABLED", "off", raising=False)
    assert LLMExplainerConfig.from_env().enabled is False


# ---------------------------------------------------------------------
# The explanation object carries narration only - no scores/statuses of its own
# ---------------------------------------------------------------------
def test_explanation_has_no_score_fields():
    exp = explain_decision(_go(), config=DISABLED)
    dumped = exp.model_dump()
    for forbidden in ("orca_suitability_index", "osi", "overall_status", "safety_status", "decision"):
        assert forbidden not in dumped
