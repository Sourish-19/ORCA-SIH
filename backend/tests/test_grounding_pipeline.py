"""
Grounding Pipeline Test Suite
Tests intent detection, VerifiedContext building, LLM Explainer, Fact Validator, and Grounded Output.
"""

import os
import sys
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.pipeline import run_recommendation
from app.agents.intent_agent import run_intent_agent


def safe_print(text: str):
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode("ascii", errors="replace").decode("ascii"))


def test_queries():
    queries = [
        ("A", "Where should I fish tomorrow near Chennai?"),
        ("B", "What sort of fish types do I find near Chennai Harbour?"),
        ("C", "Is it safe to go fishing tomorrow?"),
        ("D", "What's the SST near Chennai?"),
        ("E", "What is the wind speed?"),
        ("F", "Tell me the best fishing zone and distance."),
        ("G", "சென்னை துறைமுகத்தில் என்ன மீன் கிடைக்கும்?"),
    ]

    safe_print("======================================================================")
    safe_print("RUNNING ORCA GROUNDING & ZERO-HALLUCINATION PIPELINE TESTS")
    safe_print("======================================================================\n")

    for code, q in queries:
        safe_print(f"--- TEST QUERY {code}: '{q}' ---")
        intent = run_intent_agent(q)
        safe_print(f"  Detected Intent: {intent.primary_intent}")
        safe_print(f"  Detected Language: {intent.detected_language}")
        safe_print(f"  Detected Location: {intent.location_name}")

        response = run_recommendation(query=q)
        exp = response.explanation

        safe_print(f"  Model Used: {exp.model_used}")
        safe_print(f"  Grounding OK: {exp.grounding_ok}")
        safe_print(f"  Is Fallback: {exp.is_fallback} (Reason: {exp.fallback_reason})")
        safe_print(f"  Headline: {exp.headline}")
        safe_print(f"  Narrative: {exp.narrative}")
        safe_print("----------------------------------------------------------------------\n")

if __name__ == "__main__":
    test_queries()
