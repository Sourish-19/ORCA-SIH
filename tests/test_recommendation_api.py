"""
Tests for the ORCA recommendation pipeline + API (Stack B).

The LLM is disabled (ORCA_LLM_ENABLED=off) for every test so the suite stays fast
and never touches Gemini or burns free-tier quota. The single test that exercises
the LLM path elsewhere (test_llm_explainer.py) already mocks the call.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.models.api import DEFAULT_QUERY
from app.services import pipeline as pipeline_mod
from app.services.pipeline import (
    ChennaiDatasetUnavailable,
    clear_dataset_cache,
    detect_language,
    load_chennai_dataset,
    run_recommendation,
)

TAMIL_QUERY = "சென்னையில் நாளை நான் எங்கே மீன்பிடிக்க வேண்டும்?"


@pytest.fixture(autouse=True)
def _no_llm(monkeypatch):
    monkeypatch.setattr("app.config.ORCA_LLM_ENABLED", "off", raising=False)
    monkeypatch.setattr("app.config.GEMINI_API_KEY", None, raising=False)


# ---------------------------------------------------------------------
# Language detection
# ---------------------------------------------------------------------
def test_detect_language_auto_english():
    assert detect_language("Where should I fish tomorrow near Chennai?", "auto") == "en"


def test_detect_language_auto_tamil():
    assert detect_language(TAMIL_QUERY, "auto") == "ta"


def test_detect_language_explicit_overrides_script():
    assert detect_language("சென்னை", "en") == "en"
    assert detect_language("Chennai", "ta") == "ta"


def test_detect_language_unknown_request_treated_as_auto():
    assert detect_language("Chennai only, no tamil here", "francais") == "en"
    assert detect_language(TAMIL_QUERY, "francais") == "ta"


# ---------------------------------------------------------------------
# Full pipeline on real Chennai data
# ---------------------------------------------------------------------
def test_run_recommendation_real_chennai():
    resp = run_recommendation(query=DEFAULT_QUERY)

    assert resp.location == "Chennai"
    assert resp.language == "en"
    assert resp.audience == "fisherman"
    assert resp.data_mode == "PROCESSED"
    assert resp.evaluated_zones >= 20  # ~23 Chennai-district PFZ anchors

    assert resp.decision.overall_status in {"GO", "GO_WITH_CAUTION", "NO_GO"}
    assert resp.decision.recommended_count >= 1
    assert len(resp.decision.all_decisions) == resp.evaluated_zones

    # LLM disabled -> deterministic template narration
    assert resp.explanation.is_fallback is True
    assert resp.explanation.model_used == "template-fallback"
    assert resp.explanation.language == "en"

    # timings populated and coherent
    assert resp.timings.total_ms > 0
    assert resp.timings.total_ms >= resp.timings.decision_ms

    # candidate_id join carried end-to-end
    top = resp.decision.top_recommendation
    assert top.candidate_id == top.suitability.candidate_id == top.safety.candidate_id

    # marine weather context is attached for the UI
    assert resp.marine_weather is not None
    assert resp.marine_weather.wind_speed_knots_max > 0


def test_run_recommendation_tamil_query():
    resp = run_recommendation(query=TAMIL_QUERY)
    assert resp.language == "ta"
    assert resp.explanation.language == "ta"
    assert any("஀" <= ch <= "௿" for ch in resp.explanation.narrative)


def test_run_recommendation_analyst_audience():
    resp = run_recommendation(query=DEFAULT_QUERY, audience="analyst")
    assert resp.audience == "analyst"
    assert resp.explanation.audience == "analyst"


def _decision_signature(decision):
    return (
        decision.overall_status,
        decision.recommended_count,
        decision.suppressed_count,
        [
            (d.candidate_id, d.rank, d.decision, d.safety_status,
             d.orca_suitability_index, d.risk_level)
            for d in decision.all_decisions
        ],
    )


def test_run_recommendation_is_deterministic_without_llm():
    a = run_recommendation(query=DEFAULT_QUERY)
    b = run_recommendation(query=DEFAULT_QUERY)
    assert _decision_signature(a.decision) == _decision_signature(b.decision)
    assert a.explanation.narrative == b.explanation.narrative
    assert a.explanation.headline == b.explanation.headline


# ---------------------------------------------------------------------
# Data loading / caching / errors
# ---------------------------------------------------------------------
def test_missing_dataset_raises(tmp_path):
    with pytest.raises(ChennaiDatasetUnavailable):
        run_recommendation(data_dir=tmp_path)  # empty dir, no json files


def test_dataset_cache_is_reused(monkeypatch):
    clear_dataset_cache()
    calls = {"n": 0}
    real = pipeline_mod.load_processed_pfz_records

    def counting(path):
        calls["n"] += 1
        return real(path)

    monkeypatch.setattr(pipeline_mod, "load_processed_pfz_records", counting)
    load_chennai_dataset()
    load_chennai_dataset()
    assert calls["n"] == 1


# ---------------------------------------------------------------------
# HTTP endpoints
# ---------------------------------------------------------------------
@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


def test_endpoint_recommend_ok(client):
    r = client.post("/api/recommend", json={"query": DEFAULT_QUERY})
    assert r.status_code == 200
    body = r.json()
    assert body["location"] == "Chennai"
    assert body["language"] == "en"
    assert {"decision", "explanation", "timings"} <= body.keys()
    assert body["decision"]["overall_status"] in {"GO", "GO_WITH_CAUTION", "NO_GO"}
    assert body["explanation"]["is_fallback"] is True


def test_endpoint_demo_ok(client):
    r = client.get("/api/recommend/demo")
    assert r.status_code == 200
    assert r.json()["location"] == "Chennai"


def test_endpoint_defaults_when_body_empty(client):
    r = client.post("/api/recommend", json={})
    assert r.status_code == 200
    assert r.json()["query"] == DEFAULT_QUERY


def test_endpoint_503_on_missing_data(client, monkeypatch):
    def boom(*a, **k):
        raise ChennaiDatasetUnavailable("no files")

    monkeypatch.setattr("app.routers.recommend.run_recommendation", boom)
    r = client.post("/api/recommend", json={"query": "x"})
    assert r.status_code == 503
    assert "unavailable" in r.json()["detail"].lower()


def test_endpoint_500_on_unexpected_error(client, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("kaboom")

    monkeypatch.setattr("app.routers.recommend.run_recommendation", boom)
    r = client.post("/api/recommend", json={"query": "x"})
    assert r.status_code == 500
    assert "kaboom" in r.json()["detail"]


def test_legacy_query_route_left_untouched(client):
    # OpenAPI schema lists every operation path regardless of how it is mounted.
    paths = client.get("/openapi.json").json()["paths"]
    assert "/api/query" in paths      # Stack A still registered
    assert "/api/recommend" in paths
    assert "/api/recommend/demo" in paths
    # legacy route still points at the Stack A handler
    assert client.post("/api/query", json={"query": DEFAULT_QUERY}).status_code != 404


def test_response_keeps_decision_and_explanation_separate(client):
    expl = client.post("/api/recommend", json={}).json()["explanation"]
    for forbidden in ("orca_suitability_index", "overall_status", "safety_status", "decision"):
        assert forbidden not in expl
