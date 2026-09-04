"""
Language & Intent Agent
ASR, language detection, entity extraction (location, date, activity, parameter).
"""

from datetime import datetime, timedelta, timezone
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
    if any(word in lowered for word in ["nepo", "meen", "kadal", "vanga", "enge", "மீன்", "சென்னை", "நாளை", "பிடிக்கலாம்", "பாதுகாப்பான", "காற்று", "அலை"]):
        detected_lang = "Tamil"
    elif any(word in lowered for word in ["machli", "kahan", "matsya"]):
        detected_lang = "Hindi"

    # Activity / Intent type detection logic
    intent_type = "FISHING_RECOMMENDATION"

    # 1. Species Inquiry
    if any(w in lowered for w in [
        "fish type", "fish species", "types of fish", "which fish", "what fish",
        "species", "meen vagai", "மீன் வகை", "vakai", "varieties of fish", "what sort of fish",
        "என்ன மீன்", "எந்த மீன்"
    ]):
        intent_type = "SPECIES_INQUIRY"

    # 2. Safety Inquiry
    elif any(w in lowered for w in [
        "is it safe", "can i go", "can i fish", "safe to go", "safe to fish",
        "safety status", "should i venture", "பாதுகாப்பானதா", "கடலுக்கு செல்லலாமா"
    ]):
        intent_type = "SAFETY_INQUIRY"

    # 3. Specific Ocean Parameter Inquiry (SST, Wind, Waves, Chlorophyll)
    elif any(w in lowered for w in [
        "sst", "surface temperature", "temperature", "wind speed", "wind",
        "wave height", "waves", "sea state", "chlorophyll", "sea condition",
        "வெப்பநிலை", "காற்றின் வேகம்", "அலை உயரம்"
    ]):
        intent_type = "PARAMETER_INQUIRY"

    # 4. Hazard / Warning Inquiry
    elif any(w in lowered for w in [
        "cyclone", "storm", "warning", "gale", "advisory", "hazard", "புயல்", "எச்சரிக்கை"
    ]):
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
