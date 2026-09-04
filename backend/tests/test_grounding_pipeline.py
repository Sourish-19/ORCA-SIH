"""
Grounding Pipeline Test Suite
Tests intent detection, VerifiedContext building, LLM Explainer, Fact Validator, and Grounded Output.
Paced to stay within Groq API rate limits (8000 TPM).
"""

import sys
import time
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.pipeline import run_recommendation
from app.agents.intent_agent import run_intent_agent


def safe_print(text: str):
    try:
        sys.stdout.buffer.write((text + "\n").encode("utf-8", errors="replace"))
        sys.stdout.buffer.flush()
    except Exception:
        pass


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
    safe_print("RUNNING ORCA GROUNDING & GROQ LLM PIPELINE TESTS")
    safe_print("======================================================================\n")

    all_passed = True

    for i, (code, q) in enumerate(queries):
        if i > 0:
            time.sleep(2.0)  # Rate limit pacing for Groq free-tier 8,000 TPM limit

        safe_print(f"--- TEST QUERY {code}: '{q}' ---")
        intent = run_intent_agent(q)
        safe_print(f"  Detected Intent: {intent.primary_intent}")
        safe_print(f"  Detected Language: {intent.detected_language}")
        safe_print(f"  Detected Location: {intent.location_name}")

        response = run_recommendation(query=q)
        exp = response.explanation

        llm_success = not exp.is_fallback
        model_used = exp.model_used
        fallback_used = exp.is_fallback
        llm_error = exp.fallback_reason

        safe_print(f"  LLM_CALL_SUCCESS: {llm_success}")
        safe_print(f"  MODEL_USED: {model_used}")
        safe_print(f"  FALLBACK_USED: {fallback_used}")
        safe_print(f"  LLM_ERROR: {llm_error}")
        safe_print(f"  GROUNDING_OK: {exp.grounding_ok}")
        safe_print(f"  Headline: {exp.headline}")
        safe_print(f"  Narrative: {exp.narrative}")

        if fallback_used:
            safe_print(f"  WARNING: Query {code} fell back to template! Reason: {llm_error}")
            all_passed = False
        else:
            safe_print(f"  SUCCESS: Query {code} answered directly by Groq model ({model_used}).")

        safe_print("----------------------------------------------------------------------\n")

    if all_passed:
        safe_print("ALL TESTS PASSED WITH GROQ API GENERATING 100% OF RESPONSES!")
    else:
        safe_print("TESTS COMPLETED WITH SOME FALLBACKS.")

if __name__ == "__main__":
    test_queries()
