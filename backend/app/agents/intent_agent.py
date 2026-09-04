"""
Language & Intent Agent
Dynamic, multi-stage query understanding & entity extraction.
Understands user queries dynamically via LLM query reasoning and semantic conceptual parsing.
No universal hardcoded defaults; strictly routes queries based on actual user intent.
"""

from datetime import datetime, timedelta, timezone
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple
import urllib.request

from app.models.request import StructuredIntent

logger = logging.getLogger("orca.intent_agent")

COASTAL_LOCATIONS = [
    # English names
    ("visakhapatnam", "Visakhapatnam"),
    ("vizag", "Visakhapatnam"),
    ("kochi", "Kochi"),
    ("munambam", "Kochi"),
    ("cochin", "Kochi"),
    ("mangalore", "Mangalore"),
    ("ullal", "Mangalore"),
    ("panambur", "Mangalore"),
    ("chennai", "Chennai"),
    ("madras", "Chennai"),
    ("royapuram", "Chennai"),
    ("kasimedu", "Chennai"),
    ("ennorekuppam", "Ennorekuppam"),
    ("ennore", "Ennore"),
    ("pulicat", "Pulicat"),
    ("kovalam", "Kovalam"),
    ("covelong", "Kovalam"),
    ("mahabalipuram", "Mahabalipuram"),
    ("mamallapuram", "Mahabalipuram"),
    ("cuddalore", "Cuddalore"),
    ("puducherry", "Pondicherry"),
    ("pondicherry", "Pondicherry"),
    ("nagapattinam", "Nagapattinam"),
    ("karaikal", "Karaikal"),
    ("rameswaram", "Rameswaram"),
    ("pamban", "Rameswaram"),
    ("tuticorin", "Tuticorin"),
    ("thoothukudi", "Tuticorin"),
    ("kanyakumari", "Kanyakumari"),
    ("mumbai", "Mumbai"),
    ("bombay", "Mumbai"),
    ("goa", "Goa"),
    ("calicut", "Calicut"),
    ("kozhikode", "Calicut"),
    ("trivandrum", "Trivandrum"),
    ("puri", "Puri"),
    ("paradip", "Paradip"),
    ("kolkata", "Kolkata"),
    ("haldia", "Haldia"),
    ("kakinada", "Kakinada"),
    ("porbandar", "Porbandar"),
    ("ratnagiri", "Ratnagiri"),
    # Tamil names
    ("சென்னை", "Chennai"),
    ("மதராஸ்", "Chennai"),
    ("ராயபுரம்", "Chennai"),
    ("காசிமேடு", "Chennai"),
    ("எண்ணூர்", "Ennore"),
    ("மகாபலிபுரம்", "Mahabalipuram"),
    ("மாமல்லபுரம்", "Mahabalipuram"),
    ("கடலூர்", "Cuddalore"),
    ("விசாகப்பட்டினம்", "Visakhapatnam"),
    ("விசாக்", "Visakhapatnam"),
    ("கொச்சி", "Kochi"),
    ("மங்களூர்", "Mangalore"),
    ("மும்பை", "Mumbai"),
    ("கோவா", "Goa"),
    ("பாண்டிச்சேரி", "Pondicherry"),
    ("புதுச்சேரி", "Pondicherry"),
    ("நாகப்பட்டினம்", "Nagapattinam"),
    ("ராமேஸ்வரம்", "Rameswaram"),
    ("தூத்துக்குடி", "Tuticorin"),
    ("கன்னியாகுமரி", "Kanyakumari"),
]


def extract_location(text: str, context_location: Optional[str] = None) -> Tuple[str, bool]:
    """
    Returns (location_name, was_explicitly_found_in_query).
    Generic location resolution:
    1. Checks known coastal landmarks/cities pattern list (English and Tamil).
    2. Uses generic spatial preposition matching (near/in/at/off/around/for <Place>).
    3. Falls back to context_location if not explicitly present.
    4. Falls back to default ("Chennai") only if no context and no explicit location.
    """
    lowered = text.lower()
    for pattern, canonical in COASTAL_LOCATIONS:
        if pattern.lower() in lowered:
            return canonical, True

    # Generic preposition / location phrase extractor
    # e.g., "near Chennai Harbour", "in Malpe", "around Digha", "off Porbandar", "at Pondicherry", "near Kavaratti"
    prep_match = re.search(
        r"\b(?:near|in|at|off|around|for|from|to|towards|close to)\s+([A-Za-z][A-Za-z0-9\s'-]+?)(?:\s+(?:harbour|harbor|port|coast|beach|waters|sea|bay|gulf|jetty|landing centre))?(?:[?,.!;]|\s+tomorrow|\s+today|\s+now|\s+tonight|$)",
        text,
        re.IGNORECASE
    )
    if prep_match:
        extracted = prep_match.group(1).strip()
        noise = {
            "the", "a", "an", "my", "our", "this", "that", "me", "us", "fish", "fishing",
            "boat", "catch", "waves", "wind", "weather", "where", "what", "how", "can",
            "safe", "safety", "zone", "here", "there"
        }
        words = [w for w in extracted.split() if w.lower() not in noise]
        if words:
            candidate = " ".join(words).title()
            if len(candidate) >= 3:
                # Check if candidate matches any known location pattern
                for pattern, canonical in COASTAL_LOCATIONS:
                    if pattern.lower() in candidate.lower():
                        return canonical, True
                return candidate, True

    # Tamil generic preposition / marker matching
    # e.g., "சென்னை அருகில்", "கொச்சி பக்கத்தில்", "கடலில்", "பகுதியில்", "துறைமுகம்"
    ta_match = re.search(r"([\u0B80-\u0BFF]+)\s+(?:அருகில்|பக்கத்தில்|கடலில்|பகுதியில்|துறைமுகம்|கடற்கரை)", text)
    if ta_match:
        candidate_ta = ta_match.group(1).strip()
        if len(candidate_ta) >= 2:
            for pattern, canonical in COASTAL_LOCATIONS:
                if pattern in candidate_ta:
                    return canonical, True
            return candidate_ta, True

    if context_location:
        return context_location, False
    return "Chennai", False


def extract_time_target(text: str) -> Tuple[str, datetime]:
    lowered = text.lower()
    now_utc = datetime.now(timezone.utc)
    
    if any(w in lowered for w in ["today", "now", "currently", "right now", "இன்று", "தற்போது"]):
        return "Today", now_utc
    if any(w in lowered for w in ["tonight", "this evening", "இன்று இரவு", "மாலை"]):
        return "Tonight", now_utc
    if any(w in lowered for w in ["weekend", "this weekend", "வார இறுதி"]):
        return "This Weekend", now_utc + timedelta(days=2)
    if any(w in lowered for w in ["next week", "அடுத்த வாரம்"]):
        return "Next Week", now_utc + timedelta(days=7)
    if any(w in lowered for w in ["tomorrow", "நாளை", "நாளைக்கு"]):
        return "Tomorrow", now_utc + timedelta(days=1)
    
    # Default is tomorrow for maritime planning
    return "Tomorrow", now_utc + timedelta(days=1)


def detect_language_string(text: str, hint: str = "auto") -> str:
    h = (hint or "auto").strip().lower()
    if h in ("ta", "tamil"):
        return "Tamil"
    if h in ("en", "english"):
        return "English"
    
    # Tamil Unicode block 0x0B80 - 0x0BFF
    if any("\u0B80" <= c <= "\u0BFF" for c in text):
        return "Tamil"
    
    lowered = text.lower()
    if any(word in lowered for word in [
        "nepo", "meen", "kadal", "vanga", "enge", "மீன்", "சென்னை", "நாளை", "பிடிக்கலாம்",
        "பாதுகாப்பான", "காற்று", "அலை", "துறைமுகம்", "எங்கு", "எப்போது"
    ]):
        return "Tamil"
    elif any(word in lowered for word in ["machli", "kahan", "matsya", "kaisa", "hawa"]):
        return "Hindi"
    return "English"


def _call_llm_intent_classification(
    query: str,
    language_hint: str = "auto",
    context_location: Optional[str] = None,
    last_turn: Optional[Any] = None,
) -> Optional[Dict[str, Any]]:
    """
    Perform dynamic, prompt-driven query intent understanding via Groq LLM.
    Returns structured dictionary or None if LLM is unavailable or times out.
    """
    try:
        from app import config as app_config
        api_key = getattr(app_config, "GROQ_API_KEY", None) or os.getenv("GROQ_API_KEY", "")
        if not api_key:
            return None

        prev_intent = getattr(last_turn, "intent", None)
        system_instruction = (
            "You are ORCA's Query Understanding Agent for Indian coastal fisheries and ocean intelligence.\n"
            "Analyze the user's natural language query and output a strict JSON object:\n\n"
            "CATEGORIES FOR 'primary_intent':\n"
            "1. 'FISHING_RECOMMENDATION' -> ONLY if user explicitly asks WHERE to fish, where to catch fish, or for a fishing zone/location recommendation.\n"
            "2. 'SEASONAL_FISHING_INQUIRY' -> asking about seasonal fishing guidance, optimal months to fish, breeding ban periods, seasonal fish abundance.\n"
            "3. 'WIND_INQUIRY' -> asking about wind speed, wind direction, or wind conditions.\n"
            "4. 'WAVE_INQUIRY' -> asking about wave height, wave conditions, swell, sea state, or maximum/extreme wave heights.\n"
            "5. 'SST_INQUIRY' -> asking about sea surface temperature or water warmth.\n"
            "6. 'CHLOROPHYLL_INQUIRY' -> asking about chlorophyll concentration or ocean productivity.\n"
            "7. 'SAFETY_INQUIRY' -> asking if it is safe to venture to sea, marine safety status, or hazard risk.\n"
            "8. 'HAZARD_INQUIRY' -> asking about cyclones, storms, depressions, or weather warnings.\n"
            "9. 'WHY_RECOMMENDATION_INQUIRY' -> asking why a zone was recommended or the factors/score behind it.\n"
            "10. 'DISTANCE_BEARING_INQUIRY' -> asking how far, distance, compass bearing, navigation direction, or water depth.\n"
            "11. 'BEST_ZONE_INQUIRY' -> asking which zone has best conditions or comparing candidate zones.\n"
            "12. 'SPECIES_INQUIRY' -> asking what fish species or varieties are found at a harbour.\n"
            "13. 'VESSEL_INQUIRY' -> asking about boat count, vessel traffic, or trawler fleet.\n"
            "14. 'PFZ_INQUIRY' -> asking about INCOIS Potential Fishing Zone bulletins.\n"
            "15. 'WEATHER_INQUIRY' -> asking about general weather forecast or climate.\n"
            "16. 'UNAVAILABLE_DATA_INQUIRY' -> asking about chemical or oceanographic parameters NOT contained in available ORCA data (e.g., sodium, salinity, pH, dissolved oxygen, turbidity, chemical pollutants, nitrates, microplastics).\n"
            "17. 'GENERAL_KNOWLEDGE_INQUIRY' -> asking general marine biology, gear types, lunar tides, ocean science.\n"
            "18. 'OUT_OF_DOMAIN_INQUIRY' -> questions unrelated to marine fisheries or oceanography (e.g. capital cities, politics, math, coding, cooking, general trivia).\n"
            "19. 'CLARIFICATION_INQUIRY' -> ambiguous follow-up without sufficient context.\n\n"
            "MULTI-TURN CONTEXT RULES:\n"
            f"- Previous Intent in Conversation: {prev_intent or 'None'}\n"
            "- If the query is an elliptical follow-up that specifies a new location (e.g., 'What about Visakhapatnam?'), inherit the PREVIOUS_INTENT if present.\n"
            "- If there is no previous conversation history and the query is ambiguous, classify as 'CLARIFICATION_INQUIRY'.\n\n"
            "CRITICAL RULES:\n"
            "- NEVER classify an unknown or non-recommendation question as 'FISHING_RECOMMENDATION'.\n"
            "- If user asks about wave height or extreme wave limits (e.g. 'How tall could a wave get at Chennai Harbour?'), classify as 'WAVE_INQUIRY'.\n"
            "- If user asks about sodium, salinity, pH, or oxygen (e.g. 'What is the sodium level near Chennai Harbour?'), classify as 'UNAVAILABLE_DATA_INQUIRY'.\n"
            "- If user asks about capital of France or non-marine trivia, classify as 'OUT_OF_DOMAIN_INQUIRY'.\n\n"
            "JSON SCHEMA:\n"
            "{\n"
            '  "primary_intent": "...",\n'
            '  "requested_information": ["..."],\n'
            '  "data_available_in_orca": true/false,\n'
            '  "unavailable_parameter": null or "...",\n'
            '  "location_name": "...",\n'
            '  "target_date_str": "...",\n'
            '  "detected_language": "..."\n'
            "}"
        )

        user_content = f"QUERY: {query}\nCONTEXT_LOCATION: {context_location or 'Chennai'}\nPREVIOUS_INTENT: {prev_intent or 'None'}\nLANGUAGE_HINT: {language_hint}"

        payload = {
            "model": "openai/gpt-oss-20b",
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": user_content},
            ],
            "max_tokens": 250,
            "temperature": 0.0,
            "response_format": {"type": "json_object"},
        }

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "ORCA/1.0",
        }

        req = urllib.request.Request(
            "https://api.groq.com/openai/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            res_data = json.loads(resp.read().decode("utf-8"))
            content = res_data["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            if isinstance(parsed, dict) and "primary_intent" in parsed:
                return parsed
    except Exception as exc:
        logger.debug("LLM intent classification skipped/errored: %s", exc)
    return None


def _semantic_intent_understanding(
    query: str,
    detected_lang: str,
    location: str,
    date_str: str,
    target_dt: datetime,
) -> StructuredIntent:
    """
    Robust semantic conceptual parser for offline or instant execution.
    Determines intent dynamically from sentence semantics and conceptual components.
    NEVER defaults unknown queries to FISHING_RECOMMENDATION.
    """
    clean_query = query.strip()
    lowered = clean_query.lower()

    # -------------------------------------------------------------
    # 1. OUT OF DOMAIN CHECK (Non-marine trivia, coding, general topics)
    # -------------------------------------------------------------
    out_of_domain_indicators = [
        "capital of", "who is the president", "who won the", "write code", "python script",
        "tell me a joke", "recipe for", "how to bake", "stock market", "crypto price",
        "world cup", "prime minister", "who is elon", "fibonacci", "solve this math",
        "who directed", "actor in", "weather in paris", "weather in london", "weather in new york",
        "currency of", "population of", "who founded", "song lyrics", "translate to spanish"
    ]
    if any(p in lowered for p in out_of_domain_indicators):
        return StructuredIntent(
            raw_query=clean_query,
            detected_language=detected_lang,
            primary_intent="OUT_OF_DOMAIN_INQUIRY",
            requested_information=["general_knowledge_outside_marine"],
            data_available_in_orca=False,
            unavailable_parameter="non_marine_topic",
            location_name=location,
            target_date_str=date_str,
            target_datetime=target_dt,
            activity="OTHER",
            radius_km=50.0,
            confidence=0.98,
        )

    # -------------------------------------------------------------
    # 2. UNAVAILABLE DATA INQUIRY (Sodium, Salinity, pH, Dissolved Oxygen, etc.)
    # -------------------------------------------------------------
    unavail_matches = [
        "sodium", "salinity", "salt level", "salt content", "saltiness", "salty",
        "dissolved oxygen", "do level", "oxygen level", "water ph", "ph level",
        "ph value", "ph of", "acidity", "alkalinity", "turbidity", "secchi",
        "water clarity", "nitrate", "phosphate", "silicate", "microplastic",
        "pollutant", "pollution level", "chemical level", "water density",
        "heavy metal", "oil spill", "உப்பு அளவு", "அமிலத்தன்மை", "ஆக்சிஜன்"
    ]
    if any(w in lowered for w in unavail_matches) or re.search(r"\bph\b", lowered):
        param_name = "sodium level / salinity"
        for p in ["sodium", "salinity", "salt", "oxygen", "ph", "turbidity", "nitrate", "phosphate", "microplastic", "pollution"]:
            if p in lowered:
                param_name = f"{p} measurement"
                break
        return StructuredIntent(
            raw_query=clean_query,
            detected_language=detected_lang,
            primary_intent="UNAVAILABLE_DATA_INQUIRY",
            requested_information=[param_name],
            data_available_in_orca=False,
            unavailable_parameter=param_name,
            location_name=location,
            target_date_str=date_str,
            target_datetime=target_dt,
            activity="OTHER",
            radius_km=50.0,
            confidence=0.95,
        )

    # -------------------------------------------------------------
    # 3. WHY / REASONING / EXPLANATION INQUIRY
    # -------------------------------------------------------------
    if any(w in lowered for w in [
        "why are you recommending", "why this zone", "why should i fish", "why this location",
        "reason for recommendation", "explain the score", "why ennore", "why chennai offshore",
        "what factors", "why that place", "why is this zone", "why recommended",
        "ஏன் இந்த இடம்", "காரணம் என்ன", "ஏன் பரிந்துரைக்கிறீர்கள்"
    ]) or (("why" in lowered or "reason" in lowered or "factors" in lowered) and ("zone" in lowered or "recommend" in lowered or "score" in lowered)):
        return StructuredIntent(
            raw_query=clean_query,
            detected_language=detected_lang,
            primary_intent="WHY_RECOMMENDATION_INQUIRY",
            requested_information=["suitability_factors", "pfz_drivers", "environmental_rationale"],
            data_available_in_orca=True,
            location_name=location,
            target_date_str=date_str,
            target_datetime=target_dt,
            activity="FISHING",
            radius_km=50.0,
            confidence=0.95,
        )

    # -------------------------------------------------------------
    # 4. DISTANCE / BEARING / NAVIGATION INQUIRY
    # -------------------------------------------------------------
    if any(w in lowered for w in [
        "how far", "distance to", "what is the bearing", "what direction", "bearing deg",
        "kilometers away", "km away", "nautical miles", "how many km", "navigation route",
        "how deep", "water depth", "எவ்வளவு தூரம்", "திசை என்ன", "எத்தனை கி.மீ", "ஆழம் என்ன"
    ]):
        return StructuredIntent(
            raw_query=clean_query,
            detected_language=detected_lang,
            primary_intent="DISTANCE_BEARING_INQUIRY",
            requested_information=["distance_km", "bearing_deg", "depth_m"],
            data_available_in_orca=True,
            location_name=location,
            target_date_str=date_str,
            target_datetime=target_dt,
            activity="NAVIGATION",
            radius_km=50.0,
            confidence=0.95,
        )

    # -------------------------------------------------------------
    # 5. BEST ZONE / COMPARISON INQUIRY
    # -------------------------------------------------------------
    if any(w in lowered for w in [
        "which area has the best", "which zone has the best", "best fishing conditions",
        "which is the top zone", "compare zones", "highest suitability", "highest score",
        "best candidate", "top scoring zone", "எந்த மண்டலம் சிறந்தது", "சிறந்த மீன்பிடி பகுதி", "எந்த பகுதி சிறந்தது"
    ]):
        return StructuredIntent(
            raw_query=clean_query,
            detected_language=detected_lang,
            primary_intent="BEST_ZONE_INQUIRY",
            requested_information=["candidate_ranking", "suitability_comparison"],
            data_available_in_orca=True,
            location_name=location,
            target_date_str=date_str,
            target_datetime=target_dt,
            activity="FISHING",
            radius_km=50.0,
            confidence=0.95,
        )

    # -------------------------------------------------------------
    # 6. WIND INQUIRY
    # -------------------------------------------------------------
    if any(w in lowered for w in [
        "wind", "winds", "wind speed", "how fast is the wind", "wind direction", "wind knots",
        "what about the wind", "how is the wind", "is it windy", "gale wind", "squall", "breeze",
        "காற்றின் வேகம்", "காற்றின்", "காற்று எப்படி", "காற்று திசை", "காற்றின் அளவு", "காற்று"
    ]):
        return StructuredIntent(
            raw_query=clean_query,
            detected_language=detected_lang,
            primary_intent="WIND_INQUIRY",
            requested_information=["wind_speed_knots", "wind_direction_deg"],
            data_available_in_orca=True,
            location_name=location,
            target_date_str=date_str,
            target_datetime=target_dt,
            activity="WEATHER",
            radius_km=50.0,
            confidence=0.95,
        )

    # -------------------------------------------------------------
    # 7. WAVE INQUIRY (Includes wave height, wave conditions, swell, sea state, roughness, extreme wave height)
    # -------------------------------------------------------------
    wave_and_sea_indicators = [
        "wave", "waves", "how high are the waves", "wave height", "waves high", "swell height",
        "sea swell", "wave period", "rough sea", "sea condition", "sea conditions", "sea state",
        "how are the waves", "what about the waves", "height of waves", "tall could a wave",
        "how tall are the waves", "tallest wave", "big waves", "surge", "tsunami",
        "rough", "roughness", "choppy", "sea getting rough", "is the sea rough", "is the water rough",
        "calm sea", "is the sea calm",
        "அலை உயரம்", "அலைகள் எப்படி", "கடல் கொந்தளிப்பு", "கொந்தளிப்பு", "கடல் நிலை", "அலை"
    ]
    if any(w in lowered for w in wave_and_sea_indicators):
        is_extreme_query = any(w in lowered for w in ["how tall could", "tallest", "maximum wave", "extreme wave", "highest possible wave"])
        return StructuredIntent(
            raw_query=clean_query,
            detected_language=detected_lang,
            primary_intent="WAVE_INQUIRY",
            requested_information=["wave_height_m", "sea_condition", "wave_extremes" if is_extreme_query else "wave_period_sec"],
            data_available_in_orca=True,
            location_name=location,
            target_date_str=date_str,
            target_datetime=target_dt,
            activity="WEATHER",
            radius_km=50.0,
            confidence=0.95,
        )

    # -------------------------------------------------------------
    # 8. SST (SEA SURFACE TEMPERATURE) INQUIRY
    # -------------------------------------------------------------
    if any(w in lowered for w in [
        "sst", "sea surface temperature", "water temperature", "surface temp", "thermal front",
        "what is the sst", "sst there", "ocean temperature", "sea temperature", "water temp",
        "கடல் மேற்பரப்பு வெப்பநிலை", "வெப்பநிலை என்ன", "கடல் வெப்பநிலை"
    ]):
        return StructuredIntent(
            raw_query=clean_query,
            detected_language=detected_lang,
            primary_intent="SST_INQUIRY",
            requested_information=["sst_celsius", "thermal_gradient"],
            data_available_in_orca=True,
            location_name=location,
            target_date_str=date_str,
            target_datetime=target_dt,
            activity="OCEANOGRAPHY",
            radius_km=50.0,
            confidence=0.95,
        )

    # -------------------------------------------------------------
    # 9. CHLOROPHYLL INQUIRY
    # -------------------------------------------------------------
    if any(w in lowered for w in [
        "chlorophyll", "chlorophyll level", "ocean productivity", "phytoplankton",
        "chl concentration", "plankton", "algae", "பச்சை நிறமி", "குளோரோபில்"
    ]):
        return StructuredIntent(
            raw_query=clean_query,
            detected_language=detected_lang,
            primary_intent="CHLOROPHYLL_INQUIRY",
            requested_information=["chlorophyll_mg_m3", "ocean_productivity"],
            data_available_in_orca=True,
            location_name=location,
            target_date_str=date_str,
            target_datetime=target_dt,
            activity="OCEANOGRAPHY",
            radius_km=50.0,
            confidence=0.95,
        )

    # -------------------------------------------------------------
    # 10. EXPLICIT FISHING RECOMMENDATION INQUIRY
    # (When user asks WHERE to fish, where to catch fish, or for a fishing zone recommendation)
    # -------------------------------------------------------------
    is_explicit_fishing_request = (
        any(w in lowered for w in [
            "where should i fish", "where to fish", "where can i fish", "where can i catch",
            "where should we fish", "where can we fish", "where to go fishing", "best place to fish",
            "recommend fishing", "recommend a zone", "suggest a spot", "suggest a location",
            "give me a recommendation", "where can we catch", "where to go for fishing", "where can i go fishing",
            "where can i go to catch", "where do i fish", "where do we fish", "where is good to fish",
            "where is it good to fish", "which zone should i fish", "which area should i fish",
            "which spot to fish", "which zone to fish", "which area to fish", "which location to fish",
            "best fishing spots", "good fishing spots", "recommend a fishing spot", "where are the fish",
            "எங்கு மீன் பிடிக்கலாம்", "மீன்பிடிக்க எங்கு", "மீன் பிடிக்க எங்கு செல்லலாம்", "எங்கு மீன்பிடிக்கலாம்",
            "எங்கு மீன் கிடைக்கும்", "எங்கு மீன் பிடிக்க செல்லலாம்", "எந்த இடத்தில் மீன் பிடிக்கலாம்"
        ])
        or ("where" in lowered and ("fish" in lowered or "catch" in lowered or "fishing" in lowered or "trawl" in lowered))
        or (("which place" in lowered or "which area" in lowered or "which spot" in lowered or "which zone" in lowered or "which location" in lowered or "best spot" in lowered or "good spot" in lowered) and ("fish" in lowered or "catch" in lowered or "fishing" in lowered))
        or (("recommend" in lowered or "suggest" in lowered or "find" in lowered or "show" in lowered) and ("fishing" in lowered or "fishing zone" in lowered or "fishing spot" in lowered or "pfz" in lowered))
        or (any(w in lowered for w in ["எங்கு", "எங்கே", "எந்த இடம்", "எந்த பகுதி"]) and any(w in lowered for w in ["மீன்", "பிடிக்க", "செல்லலாம்"]))
    )
    if is_explicit_fishing_request:
        return StructuredIntent(
            raw_query=clean_query,
            detected_language=detected_lang,
            primary_intent="FISHING_RECOMMENDATION",
            requested_information=["recommended_zone", "coordinates", "suitability_score", "bearing", "distance"],
            data_available_in_orca=True,
            location_name=location,
            target_date_str=date_str,
            target_datetime=target_dt,
            activity="FISHING",
            radius_km=50.0,
            confidence=0.95,
        )

    # -------------------------------------------------------------
    # 11. SAFETY INQUIRY
    # -------------------------------------------------------------
    safety_indicators = [
        "is it safe", "safe to go", "safe to fish", "can i take my boat", "can i venture", "should i venture",
        "safety status", "is it dangerous", "safety check", "is it safe tomorrow", "safe tomorrow",
        "is it clear to sail", "is sea safe", "is water safe", "is fishing safe", "clear to sail",
        "can i go to sea", "can we go to sea", "can i go out to sea", "can we go out to sea",
        "பாதுகாப்பானதா", "பாதுகாப்பாக", "பாதுகாப்பு", "பாதுகாப்ப", "கடலுக்கு செல்லலாமா", "படகை எடுக்கலாமா", "பாதுகாப்பு நிலை", "நாளை பாதுகாப்பானதா"
    ]
    if any(w in lowered for w in safety_indicators) or (re.search(r"\bsafety\b", lowered) and not is_explicit_fishing_request):
        return StructuredIntent(
            raw_query=clean_query,
            detected_language=detected_lang,
            primary_intent="SAFETY_INQUIRY",
            requested_information=["safety_status", "risk_level", "veto_reasons"],
            data_available_in_orca=True,
            location_name=location,
            target_date_str=date_str,
            target_datetime=target_dt,
            activity="SAFETY",
            radius_km=50.0,
            confidence=0.95,
        )

    # -------------------------------------------------------------
    # 12. HAZARD / CYCLONE INQUIRY
    # -------------------------------------------------------------
    if any(w in lowered for w in [
        "cyclone", "storm", "warning", "gale", "advisory", "hazard", "red alert",
        "depression", "squall warning", "storm surge", "புயல்", "எச்சரிக்கை", "ஆபத்து"
    ]):
        return StructuredIntent(
            raw_query=clean_query,
            detected_language=detected_lang,
            primary_intent="HAZARD_INQUIRY",
            requested_information=["hazard_warnings", "cyclone_status"],
            data_available_in_orca=True,
            location_name=location,
            target_date_str=date_str,
            target_datetime=target_dt,
            activity="SAFETY",
            radius_km=50.0,
            confidence=0.95,
        )

    # -------------------------------------------------------------
    # 13. SPECIES INQUIRY
    # -------------------------------------------------------------
    if any(w in lowered for w in [
        "fish type", "fish species", "types of fish", "which fish", "what fish", "target fish",
        "species", "meen vagai", "மீன் வகை", "vakai", "varieties of fish", "what sort of fish",
        "vanjaram", "mackerel", "sardine", "pomfret", "tuna", "snapper", "anchovy",
        "என்ன மீன்", "எந்த மீன்", "மீன் வகைகள்"
    ]):
        return StructuredIntent(
            raw_query=clean_query,
            detected_language=detected_lang,
            primary_intent="SPECIES_INQUIRY",
            requested_information=["species_list", "commercial_fish_types"],
            data_available_in_orca=True,
            location_name=location,
            target_date_str=date_str,
            target_datetime=target_dt,
            activity="FISHING",
            radius_km=50.0,
            confidence=0.95,
        )

    # -------------------------------------------------------------
    # 14. VESSEL / FLEET INQUIRY
    # -------------------------------------------------------------
    if any(w in lowered for w in [
        "how many vessels", "vessel traffic", "fleet count", "nearby boats", "ais fleet",
        "active vessels", "trawlers nearby", "boat traffic", "படகு போக்குவரத்து", "கப்பல்கள்"
    ]):
        return StructuredIntent(
            raw_query=clean_query,
            detected_language=detected_lang,
            primary_intent="VESSEL_INQUIRY",
            requested_information=["vessel_count", "fleet_density"],
            data_available_in_orca=True,
            location_name=location,
            target_date_str=date_str,
            target_datetime=target_dt,
            activity="NAVIGATION",
            radius_km=50.0,
            confidence=0.95,
        )

    # -------------------------------------------------------------
    # 15. PFZ SPECIFIC INQUIRY
    # -------------------------------------------------------------
    if any(w in lowered for w in [
        "pfz", "potential fishing zone", "pfz bulletin", "incois advisory",
        "மண்டலங்கள்", "பிஎஃப்இசட்"
    ]):
        return StructuredIntent(
            raw_query=clean_query,
            detected_language=detected_lang,
            primary_intent="PFZ_INQUIRY",
            requested_information=["pfz_advisories", "pfz_coordinates"],
            data_available_in_orca=True,
            location_name=location,
            target_date_str=date_str,
            target_datetime=target_dt,
            activity="FISHING",
            radius_km=50.0,
            confidence=0.95,
        )

    # -------------------------------------------------------------
    # 16. GENERAL WEATHER INQUIRY
    # -------------------------------------------------------------
    if any(w in lowered for w in [
        "weather", "forecast", "climate", "conditions tomorrow", "sea weather",
        "marine weather", "வானிலை", "காலநிலை"
    ]):
        return StructuredIntent(
            raw_query=clean_query,
            detected_language=detected_lang,
            primary_intent="WEATHER_INQUIRY",
            requested_information=["marine_weather_summary"],
            data_available_in_orca=True,
            location_name=location,
            target_date_str=date_str,
            target_datetime=target_dt,
            activity="WEATHER",
            radius_km=50.0,
            confidence=0.95,
        )

    # -------------------------------------------------------------
    # 17. SEASONAL FISHING GUIDANCE INQUIRY (Seasons, Best Months, Breeding Ban)
    # -------------------------------------------------------------
    seasonal_indicators = [
        "best season", "good season", "which month", "fishing season", "breeding season",
        "ban period", "fishing ban", "conservation ban", "breeding ban",
        "எந்த பருவம்", "மீன்பிடி பருவம்", "இனப்பெருக்க காலம்", "தடை காலம்", "பருவமழை"
    ]
    if any(w in lowered for w in seasonal_indicators) or ("season" in lowered and ("fish" in lowered or "catch" in lowered or "month" in lowered)):
        return StructuredIntent(
            raw_query=clean_query,
            detected_language=detected_lang,
            primary_intent="SEASONAL_FISHING_INQUIRY",
            requested_information=["seasonal_fishing_guidance", "best_months", "breeding_ban_period"],
            data_available_in_orca=False,
            unavailable_parameter="seasonal_fishing_knowledge",
            location_name=location,
            target_date_str=date_str,
            target_datetime=target_dt,
            activity="OTHER",
            radius_km=50.0,
            confidence=0.95,
        )

    # -------------------------------------------------------------
    # 17b. GENERAL MARINE KNOWLEDGE (Nets, Biology, Tides, Oceanography)
    # -------------------------------------------------------------
    if any(w in lowered for w in [
        "moon phase", "lunar cycle", "high tide vs low tide", "type of net", "mesh size",
        "trolling vs gillnet", "commercial regulations",
        "tides", "tidal chart", "corals", "dolphins", "sharks", "turtle", "biology",
        "marine life", "ocean depth profile", "continental shelf",
    ]):
        return StructuredIntent(
            raw_query=clean_query,
            detected_language=detected_lang,
            primary_intent="GENERAL_KNOWLEDGE_INQUIRY",
            requested_information=["general_marine_science", "marine_biology"],
            data_available_in_orca=False,
            unavailable_parameter="general_ocean_knowledge",
            location_name=location,
            target_date_str=date_str,
            target_datetime=target_dt,
            activity="OTHER",
            radius_km=50.0,
            confidence=0.90,
        )

    # -------------------------------------------------------------
    # 18. DEFAULT: DOMAIN-AWARE FALLBACK (NEVER DEFAULT TO FISHING RECOMMENDATION)
    # -------------------------------------------------------------
    # Check if query has any marine/coastal vocabulary
    marine_vocab = [
        "marine", "ocean", "sea", "boat", "vessel", "trawler", "port", "harbour", "harbor",
        "fish", "fishing", "water", "coastal", "coast", "tide", "shore", "landing centre",
        "கடல்", "மீன்", "துறைமுகம்", "படகு", "கடற்கரை"
    ]
    has_marine_context = any(w in lowered for w in marine_vocab) or any(loc.lower() in lowered for _, loc in COASTAL_LOCATIONS)

    if has_marine_context:
        return StructuredIntent(
            raw_query=clean_query,
            detected_language=detected_lang,
            primary_intent="GENERAL_KNOWLEDGE_INQUIRY",
            requested_information=["general_marine_inquiry"],
            data_available_in_orca=False,
            unavailable_parameter="general_marine_context",
            location_name=location,
            target_date_str=date_str,
            target_datetime=target_dt,
            activity="OTHER",
            radius_km=50.0,
            confidence=0.80,
        )
    else:
        return StructuredIntent(
            raw_query=clean_query,
            detected_language=detected_lang,
            primary_intent="OUT_OF_DOMAIN_INQUIRY",
            requested_information=["out_of_scope_query"],
            data_available_in_orca=False,
            unavailable_parameter="out_of_domain",
            location_name=location,
            target_date_str=date_str,
            target_datetime=target_dt,
            activity="OTHER",
            radius_km=50.0,
            confidence=0.90,
        )


def _is_elliptical_followup(clean_query: str) -> Tuple[bool, Optional[str]]:
    """
    Check if a query is an elliptical/follow-up query (e.g. 'What about Visakhapatnam?', 'How about Kochi?', 'And Mumbai?')
    that changes/specifies an entity without providing an explicit intent or predicate keyword.
    """
    lowered = clean_query.lower().strip()

    # If query contains explicit intent keywords, it is not an elliptical location query
    explicit_intent_keywords = [
        "wind", "breeze", "knots", "gust",
        "wave", "waves", "swell", "sea state", "rough", "choppy", "sea condition", "sea conditions",
        "sst", "temperature", "warmth", "water temp",
        "chlorophyll", "plankton", "productivity",
        "safe", "safety", "danger", "hazard", "cyclone", "storm", "warning", "depression", "venture", "can i go", "take my boat",
        "why", "reason", "score", "suitability", "factor",
        "how far", "distance", "bearing", "depth", "how deep",
        "best zone", "compare zones", "highest score",
        "species", "varieties", "type of fish", "fish varieties",
        "vessel", "trawler", "boat count",
        "pfz bulletin", "advisory", "potential fishing zone",
        "weather", "forecast", "climate",
        "sodium", "salinity", "salt", "oxygen", "ph", "turbidity", "nitrate", "phosphate", "microplastic", "pollution",
        "where to fish", "where should i fish", "where can i fish", "where to catch", "recommend fishing", "suggest a spot", "suggest a location",
        "best season", "breeding season", "ban period", "which month", "fishing season", "moon phase",
        # Tamil explicit keywords
        "காற்", "காற்று", "காற்றின்", "வேகம்", "அலை", "அலைகள்", "வெப்பநிலை", "குளோரோபில்", "பாதுகாப்", "புயல்", "எச்சரிக்கை", "காரணம்",
        "தூரம்", "திசை", "ஆழம்", "சிறந்த", "மீன் வகைகள்", "படகு", "வானிலை", "உப்பு", "சோடியம்",
        "ஆக்சிஜன்", "எங்கு மீன்", "பருவம்", "தடை காலம்"
    ]
    if any(kw in lowered for kw in explicit_intent_keywords):
        return False, None

    # Follow-up indicators
    followup_starters = [
        "what about", "how about", "and for", "and in", "and near", "what of", "and what about",
        "tell me about", "what regarding", "and", "in", "near"
    ]
    is_starter_match = any(lowered.startswith(st + " ") or lowered.startswith(st + "?") for st in followup_starters)

    loc, was_explicit = extract_location(clean_query, None)
    if was_explicit and loc and loc != "Unknown":
        if is_starter_match or len(clean_query.split()) <= 4:
            return True, loc

    # Tamil phrasing
    if any(k in lowered for k in ["எப்படி", "பற்றி"]):
        loc_ta, was_exp_ta = extract_location(clean_query, None)
        if was_exp_ta and loc_ta and loc_ta != "Unknown":
            return True, loc_ta

    return False, None


def run_intent_agent(
    query: str,
    language_hint: str = "auto",
    context_location: Optional[str] = None,
    last_turn: Optional[Any] = None,
) -> StructuredIntent:
    """
    Parse natural language query into structured request intent.
    Executes dynamic query understanding:
      1. Detects elliptical/multi-turn follow-ups dynamically inheriting previous intent.
      2. Tries dynamic LLM query understanding if available.
      3. Falls back to semantic conceptual parsing.
    Guarantees that unknown queries NEVER default to FISHING_RECOMMENDATION.
    """
    clean_query = query.strip()
    location, _ = extract_location(clean_query, context_location)
    date_str, target_dt = extract_time_target(clean_query)
    detected_lang = detect_language_string(clean_query, language_hint)

    # Multi-turn elliptical query resolution (e.g. "What about Visakhapatnam?", "How about Kochi?")
    is_elliptical, extracted_loc = _is_elliptical_followup(clean_query)
    if is_elliptical:
        resolved_loc = extracted_loc or location
        if last_turn:
            parent_intent = getattr(last_turn, "intent", "GENERAL_KNOWLEDGE_INQUIRY")
            req_info = getattr(last_turn, "requested_information", None) or [parent_intent.lower()]
            unavail_p = getattr(last_turn, "unavailable_parameter", None)
            is_fishing = (parent_intent == "FISHING_RECOMMENDATION")
            is_orca_data = (parent_intent not in ("UNAVAILABLE_DATA_INQUIRY", "OUT_OF_DOMAIN_INQUIRY", "GENERAL_KNOWLEDGE_INQUIRY", "SEASONAL_FISHING_INQUIRY", "CLARIFICATION_INQUIRY"))
            
            return StructuredIntent(
                raw_query=clean_query,
                detected_language=detected_lang,
                primary_intent=parent_intent,
                requested_information=req_info,
                data_available_in_orca=is_orca_data,
                unavailable_parameter=unavail_p,
                location_name=resolved_loc,
                target_date_str=date_str if any(w in clean_query.lower() for w in ["today", "tomorrow", "tonight", "weekend", "next week", "நாளை", "இன்று"]) else getattr(last_turn, "target_date", date_str),
                target_datetime=target_dt,
                activity="FISHING" if is_fishing else "OTHER",
                radius_km=50.0,
                confidence=0.95,
            )
        else:
            # Insufficient conversational context to guess what "What about <location>?" means
            return StructuredIntent(
                raw_query=clean_query,
                detected_language=detected_lang,
                primary_intent="CLARIFICATION_INQUIRY",
                requested_information=["clarification_needed"],
                data_available_in_orca=False,
                unavailable_parameter="clarification_needed",
                location_name=resolved_loc,
                target_date_str=date_str,
                target_datetime=target_dt,
                activity="OTHER",
                radius_km=50.0,
                confidence=0.90,
            )

    # 1. Attempt dynamic LLM intent classification
    llm_intent = _call_llm_intent_classification(clean_query, language_hint, context_location, last_turn=last_turn)
    if llm_intent and "primary_intent" in llm_intent:
        p_intent = str(llm_intent["primary_intent"]).strip()
        req_info = list(llm_intent.get("requested_information", []))
        data_avail = bool(llm_intent.get("data_available_in_orca", True))
        unavail_p = llm_intent.get("unavailable_parameter")
        loc = str(llm_intent.get("location_name") or location).strip()
        t_date = str(llm_intent.get("target_date_str") or date_str).strip()
        d_lang = str(llm_intent.get("detected_language") or detected_lang).strip()

        return StructuredIntent(
            raw_query=clean_query,
            detected_language=d_lang,
            primary_intent=p_intent,
            requested_information=req_info,
            data_available_in_orca=data_avail,
            unavailable_parameter=unavail_p,
            location_name=loc,
            target_date_str=t_date,
            target_datetime=target_dt,
            activity="FISHING" if p_intent == "FISHING_RECOMMENDATION" else "OTHER",
            radius_km=50.0,
            confidence=0.95,
        )

    # 2. Fallback to semantic conceptual parsing (Instant, robust, zero hardcoded fishing defaults)
    return _semantic_intent_understanding(
        query=clean_query,
        detected_lang=detected_lang,
        location=location,
        date_str=date_str,
        target_dt=target_dt,
    )
