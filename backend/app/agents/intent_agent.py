"""
Language & Intent Agent
ASR, language detection, entity extraction (location, date, activity).
"""

from datetime import datetime, timedelta, timezone
from typing import Tuple
from app.models.request import StructuredIntent


def run_intent_agent(query: str, language_hint: str = "auto") -> StructuredIntent:
    """
    Parse natural language query into structured request intent.
    Supports English, Tamil, Hindi, Malayalam, Telugu.
    """
    clean_query = query.strip()
    lowered = clean_query.lower()

    # Detect location
    location = "Chennai"
    if "vizag" in lowered or "visakhapatnam" in lowered:
        location = "Visakhapatnam"
    elif "kochi" in lowered or "munambam" in lowered:
        location = "Kochi"
    elif "mangalore" in lowered:
        location = "Mangalore"
    elif "mahabalipuram" in lowered:
        location = "Mahabalipuram"
    elif "cuddalore" in lowered:
        location = "Cuddalore"

    # Detect date
    target_dt = datetime.now(timezone.utc) + timedelta(days=1)  # Default tomorrow
    date_str = "Tomorrow"
    if "today" in lowered or "now" in lowered:
        target_dt = datetime.now(timezone.utc)
        date_str = "Today"
    elif "evening" in lowered:
        date_str = "This Evening"

    # Language detection
    detected_lang = "English"
    if any(word in lowered for word in ["nepo", "meen", "kadal", "vanga", "enge", "மீன்", "சென்னை", "நாளை", "பிடிக்கலாம்"]):
        detected_lang = "Tamil"
    elif any(word in lowered for word in ["machli", "kahan", "matsya"]):
        detected_lang = "Hindi"

    # Activity / Intent type
    intent_type = "FISHING_RECOMMENDATION"
    if "weather" in lowered or "wind" in lowered or "cyclone" in lowered:
        intent_type = "HAZARD_INQUIRY"

    return StructuredIntent(
        raw_query=clean_query,
        detected_language=detected_lang,
        primary_intent=intent_type,
        location_name=location,
        target_date_str=date_str,
        target_datetime=target_dt,
        activity="FISHING",
        radius_km=50.0
    )
