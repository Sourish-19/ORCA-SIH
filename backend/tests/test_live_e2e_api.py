"""
End-to-End API Test for running FastAPI endpoints (/api/recommend and /api/query).
Validates exact behavior across all required queries to ensure no silent default leaks.
"""

import sys
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_api_recommend_dynamic_queries(client):
    """
    Test POST /api/recommend (the endpoint called by frontend marineApi.processQuery).
    """
    test_cases = [
        {
            "query": "is the sea getting rough",
            "expected_intent": "WAVE_INQUIRY",
            "forbidden_strings": ["ORCA recommends fishing near Ennorekuppam"],
            "required_keywords": ["wave", "sea condition", "meters", "wind", "rough"]
        },
        {
            "query": "what is the wind speed",
            "expected_intent": "WIND_INQUIRY",
            "forbidden_strings": ["ORCA recommends fishing near Ennorekuppam"],
            "required_keywords": ["wind", "knots", "speed"]
        },
        {
            "query": "how high are the waves",
            "expected_intent": "WAVE_INQUIRY",
            "forbidden_strings": ["ORCA recommends fishing near Ennorekuppam"],
            "required_keywords": ["wave", "height", "meters"]
        },
        {
            "query": "where should I fish near Chennai",
            "expected_intent": "FISHING_RECOMMENDATION",
            "forbidden_strings": [],
            "required_keywords": ["recommends", "ennorekuppam", "suitability", "bearing"]
        },
        {
            "query": "why is this zone recommended",
            "expected_intent": "WHY_RECOMMENDATION_INQUIRY",
            "forbidden_strings": ["ORCA recommends fishing near Ennorekuppam, about"],
            "required_keywords": ["suitability", "score", "recommends", "chlorophyll", "factors"]
        },
        {
            "query": "what is the sodium level near Chennai Harbour",
            "expected_intent": "UNAVAILABLE_DATA_INQUIRY",
            "forbidden_strings": ["ORCA recommends fishing near Ennorekuppam"],
            "required_keywords": ["sodium", "orca", "salinity", "bay of bengal"]
        },
        {
            "query": "what is the capital of France",
            "expected_intent": "OUT_OF_DOMAIN_INQUIRY",
            "forbidden_strings": ["ORCA recommends fishing near Ennorekuppam", "ennorekuppam"],
            "required_keywords": ["orca", "marine", "fisheries"]
        }
    ]

    for tc in test_cases:
        resp = client.post("/api/recommend", json={"query": tc["query"]})
        assert resp.status_code == 200, f"Failed with {resp.status_code}: {resp.text}"
        data = resp.json()
        
        intent = data.get("intent", {}).get("primary_intent")
        narrative = data.get("explanation", {}).get("narrative", "")
        headline = data.get("explanation", {}).get("headline", "")
        full_text = f"{headline} {narrative}".lower()
        
        print(f"\n[E2E API] Query: '{tc['query']}'")
        print(f"  -> Intent:    {intent}")
        print(f"  -> Headline:  {headline}")
        print(f"  -> Narrative: {narrative}")

        assert intent == tc["expected_intent"], (
            f"Query '{tc['query']}': expected intent '{tc['expected_intent']}', got '{intent}'"
        )
        
        for forbidden in tc["forbidden_strings"]:
            assert forbidden.lower() not in full_text, (
                f"Query '{tc['query']}': found forbidden text '{forbidden}' in response: {narrative}"
            )
        
        has_any_required = any(kw.lower() in full_text for kw in tc["required_keywords"])
        assert has_any_required, (
            f"Query '{tc['query']}': response did not contain any expected keywords {tc['required_keywords']}. Response: {narrative}"
        )


def test_api_query_legacy_endpoint(client):
    """
    Test POST /api/query (Stack A multi-agent endpoint).
    """
    resp = client.post("/api/query", json={"query": "is the sea getting rough"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["intent"]["primary_intent"] == "WAVE_INQUIRY"
    assert "wave" in data["synthesized_answer"].lower() or "sea" in data["synthesized_answer"].lower()
