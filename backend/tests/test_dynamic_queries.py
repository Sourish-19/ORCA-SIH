"""
Comprehensive Dynamic Query-Aware Marine Advisor Test Suite
Tests all 10+ required queries, multi-turn follow-ups, and preset scenarios.
"""

import sys
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.pipeline import run_recommendation
from app.services.session_manager import get_or_create_session, clear_sessions


def test_dynamic_query_suite():
    clear_sessions()

    # 1. Fishing recommendation
    r1 = run_recommendation("Where should I fish near Chennai?")
    assert "Chennai" in r1.location
    assert r1.intent["primary_intent"] == "FISHING_RECOMMENDATION"
    assert len(r1.explanation.narrative) > 20
    assert "recommends" in r1.explanation.narrative.lower() or "பரிந்துரை" in r1.explanation.narrative

    # 2. Safety inquiry
    r2 = run_recommendation("Is it safe to go fishing tomorrow?")
    assert r2.intent["primary_intent"] == "SAFETY_INQUIRY"
    assert "safe" in r2.explanation.narrative.lower() or "பாதுகாப்" in r2.explanation.narrative
    assert r2.explanation.narrative != r1.explanation.narrative

    # 3. Wind speed
    r3 = run_recommendation("What is the wind speed?")
    assert r3.intent["primary_intent"] == "WIND_INQUIRY"
    assert "wind" in r3.explanation.narrative.lower() or "காற்று" in r3.explanation.narrative
    assert "knots" in r3.explanation.narrative.lower() or "நாட்ஸ்" in r3.explanation.narrative
    assert r3.explanation.narrative != r1.explanation.narrative
    assert r3.explanation.narrative != r2.explanation.narrative

    # 4. Wave height
    r4 = run_recommendation("How high are the waves?")
    assert r4.intent["primary_intent"] == "WAVE_INQUIRY"
    assert "wave" in r4.explanation.narrative.lower() or "அலை" in r4.explanation.narrative
    assert "meter" in r4.explanation.narrative.lower() or "மீட்டர்" in r4.explanation.narrative
    assert r4.explanation.narrative != r3.explanation.narrative

    # 5. Why recommended
    r5 = run_recommendation("Why are you recommending this zone?")
    assert r5.intent["primary_intent"] == "WHY_RECOMMENDATION_INQUIRY"
    assert "suitability" in r5.explanation.narrative.lower() or "காரண" in r5.explanation.narrative or "score" in r5.explanation.narrative.lower()
    assert r5.explanation.narrative != r1.explanation.narrative

    # 6. Distance and bearing
    r6 = run_recommendation("How far is the recommended zone?")
    assert r6.intent["primary_intent"] == "DISTANCE_BEARING_INQUIRY"
    assert "km" in r6.explanation.narrative.lower() or "கி.மீ" in r6.explanation.narrative
    assert "bearing" in r6.explanation.narrative.lower() or "திசை" in r6.explanation.narrative or "degree" in r6.explanation.narrative.lower()

    # 7. Best conditions comparison
    r7 = run_recommendation("Which zone has the best conditions?")
    assert r7.intent["primary_intent"] == "BEST_ZONE_INQUIRY"
    assert "best" in r7.explanation.narrative.lower() or "சிறந்த" in r7.explanation.narrative or "highest" in r7.explanation.narrative.lower()

    # 8. SST inquiry
    r8 = run_recommendation("What is the SST there?")
    assert r8.intent["primary_intent"] == "SST_INQUIRY"
    assert "temperature" in r8.explanation.narrative.lower() or "sst" in r8.explanation.narrative.lower() or "வெப்பநிலை" in r8.explanation.narrative or "°c" in r8.explanation.narrative.lower()

    # 9. Seasonal Fishing Guidance (Best season for fishing near Chennai)
    r9 = run_recommendation("What is the best season for fishing near Chennai?")
    assert r9.intent["primary_intent"] == "SEASONAL_FISHING_INQUIRY"
    assert "season" in r9.explanation.narrative.lower() or "october" in r9.explanation.narrative.lower() or "பருவம்" in r9.explanation.narrative or "ban" in r9.explanation.narrative.lower()

    # 10. Out of domain inquiry (Cricket World Cup)
    r10 = run_recommendation("Who won the cricket world cup?")
    assert r10.intent["primary_intent"] == "OUT_OF_DOMAIN_INQUIRY"
    assert "orca" in r10.explanation.narrative.lower()
    assert "marine" in r10.explanation.narrative.lower() or "கடல்" in r10.explanation.narrative
    assert "recommends fishing" not in r10.explanation.narrative.lower()

    # 10b. Out of domain inquiry (Capital of France)
    r10b = run_recommendation("What is the capital of France?")
    assert r10b.intent["primary_intent"] == "OUT_OF_DOMAIN_INQUIRY"
    assert "orca" in r10b.explanation.narrative.lower()
    assert "recommends fishing" not in r10b.explanation.narrative.lower()
    assert "ennorekuppam" not in r10b.explanation.narrative.lower()

    # 10c. Unavailable Data Inquiry (Sodium level near Chennai Harbour - Bay of Bengal)
    r10c = run_recommendation("What is the sodium level near Chennai Harbour?")
    assert r10c.intent["primary_intent"] == "UNAVAILABLE_DATA_INQUIRY"
    assert "recommends fishing" not in r10c.explanation.narrative.lower()
    assert "ennorekuppam" not in r10c.explanation.narrative.lower()
    assert "bay of bengal" in r10c.explanation.narrative.lower()
    assert "arabian sea" not in r10c.explanation.narrative.lower()

    # 10d. Unavailable Data Inquiry (Salinity in Kochi - Arabian Sea)
    r10d = run_recommendation("How salty is the water in Kochi?")
    assert r10d.intent["primary_intent"] == "UNAVAILABLE_DATA_INQUIRY"
    assert "recommends fishing" not in r10d.explanation.narrative.lower()
    assert "arabian sea" in r10d.explanation.narrative.lower()
    assert "bay of bengal" not in r10d.explanation.narrative.lower()
    assert "kochi" in r10d.explanation.narrative.lower()

    # 10e. Unavailable Data Inquiry (Salinity in Mumbai - Arabian Sea)
    r10e = run_recommendation("How salty is the water in Mumbai?")
    assert r10e.intent["primary_intent"] == "UNAVAILABLE_DATA_INQUIRY"
    assert "recommends fishing" not in r10e.explanation.narrative.lower()
    assert "arabian sea" in r10e.explanation.narrative.lower()
    assert "bay of bengal" not in r10e.explanation.narrative.lower()
    assert "mumbai" in r10e.explanation.narrative.lower()

    # 10f. Unavailable Data Inquiry (Dissolved Oxygen)
    r10f = run_recommendation("What is the dissolved oxygen content near Chennai?")
    assert r10f.intent["primary_intent"] == "UNAVAILABLE_DATA_INQUIRY"
    assert "oxygen" in r10f.explanation.narrative.lower()
    assert "recommends fishing" not in r10f.explanation.narrative.lower()


    # 11. Vizag Cyclone Safety Veto
    r11 = run_recommendation("Can I take my boat out tomorrow near Vizag?")
    assert r11.location == "Visakhapatnam"
    assert r11.decision.safety_veto_active is True
    assert "not recommended" in r11.explanation.narrative.lower() or "veto" in r11.explanation.narrative.lower() or "alert" in r11.explanation.narrative.lower() or "செல்ல வேண்டாம்" in r11.explanation.narrative

    # 12. Tamil Voice Query
    r12 = run_recommendation("நாளைக்கு சென்னைக்கு அருகில் எங்கு மீன் பிடிக்கலாம்?")
    assert r12.language == "ta"
    assert "சென்னை" in r12.explanation.narrative or "மீன்பிடி" in r12.explanation.narrative

    # 13. Multi-turn Session Memory
    sid = "multi_turn_test_session_isolated"
    turn1 = run_recommendation("Where should I fish near Chennai?", session_id=sid)
    assert turn1.location == "Chennai"
    
    # Follow up with no location specified
    turn2 = run_recommendation("Is it safe tomorrow?", session_id=sid)
    assert turn2.location == "Chennai"
    assert turn2.intent["primary_intent"] == "SAFETY_INQUIRY"

    turn3 = run_recommendation("What about the wind?", session_id=sid)
    assert turn3.location == "Chennai"
    assert turn3.intent["primary_intent"] == "WIND_INQUIRY"

    # 14. Contextual Follow-up Tests (Conversations A, B, C, D, E)
    # Conversation A: Fishing Season -> Follow-up "What about Visakhapatnam?"
    sid_a = "conv_a_season"
    ca_1 = run_recommendation("Which months are best for fishing near Chennai?", session_id=sid_a)
    assert ca_1.intent["primary_intent"] == "SEASONAL_FISHING_INQUIRY"
    ca_2 = run_recommendation("What about Visakhapatnam?", session_id=sid_a)
    assert ca_2.location == "Visakhapatnam"
    assert ca_2.intent["primary_intent"] == "SEASONAL_FISHING_INQUIRY"
    assert "visakhapatnam" in ca_2.explanation.narrative.lower()

    # Conversation B: Wave Height -> Follow-up "What about Visakhapatnam?"
    sid_b = "conv_b_wave"
    cb_1 = run_recommendation("What is the wave height near Chennai?", session_id=sid_b)
    assert cb_1.intent["primary_intent"] == "WAVE_INQUIRY"
    cb_2 = run_recommendation("What about Visakhapatnam?", session_id=sid_b)
    assert cb_2.location == "Visakhapatnam"
    assert cb_2.intent["primary_intent"] == "WAVE_INQUIRY"
    assert "wave" in cb_2.explanation.narrative.lower() or "meter" in cb_2.explanation.narrative.lower()

    # Conversation C: Safety Inquiry -> Follow-up "What about Visakhapatnam?"
    sid_c = "conv_c_safety"
    cc_1 = run_recommendation("Is it safe to fish near Chennai tomorrow?", session_id=sid_c)
    assert cc_1.intent["primary_intent"] == "SAFETY_INQUIRY"
    cc_2 = run_recommendation("What about Visakhapatnam?", session_id=sid_c)
    assert cc_2.location == "Visakhapatnam"
    assert cc_2.intent["primary_intent"] == "SAFETY_INQUIRY"
    assert "not recommended" in cc_2.explanation.narrative.lower() or "veto" in cc_2.explanation.narrative.lower() or "alert" in cc_2.explanation.narrative.lower()

    # Conversation D: Recommendation -> Follow-up "What about Visakhapatnam?"
    sid_d = "conv_d_rec"
    cd_1 = run_recommendation("Where should I fish near Chennai?", session_id=sid_d)
    assert cd_1.intent["primary_intent"] == "FISHING_RECOMMENDATION"
    cd_2 = run_recommendation("What about Visakhapatnam?", session_id=sid_d)
    assert cd_2.location == "Visakhapatnam"
    assert cd_2.intent["primary_intent"] == "FISHING_RECOMMENDATION"

    # Conversation E: Standalone Ambiguous -> Clarification requested
    sid_e = "conv_e_standalone_ambiguous"
    ce = run_recommendation("What about Visakhapatnam?", session_id=sid_e)
    assert ce.location == "Visakhapatnam"
    assert ce.intent["primary_intent"] == "CLARIFICATION_INQUIRY"
    assert "clarify" in ce.explanation.narrative.lower() or "help" in ce.explanation.narrative.lower()

    print("\nALL DYNAMIC QUERY TESTS PASSED WITH DIVERSE, GROUNDED RESPONSES!")


if __name__ == "__main__":
    test_dynamic_query_suite()
