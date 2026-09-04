"""
Synthesis Specialist Agent
Synthesizes evidence-grounded user explanation and audio narrative text.
Formats response tailored for both Fisherman Mode (simple, direct action) and Analyst Mode (full provenance).
"""

from typing import List, Optional, Tuple
from app.models.ocean import PFZCandidateZone, LandingCentre
from app.models.hazard import MarineWeather
from app.models.request import SafetyEvaluation, SuitabilityBreakdown, StructuredIntent
from app.models.trace import EvidenceRecord


def run_synthesis_agent(
    intent: StructuredIntent,
    safety: SafetyEvaluation,
    top_recommendation: Optional[PFZCandidateZone],
    suitability: Optional[SuitabilityBreakdown],
    landing_centre: LandingCentre,
    weather: MarineWeather,
    evidence_list: List[EvidenceRecord]
) -> Tuple[str, str]:
    """
    Generate (synthesized_text_answer, audio_narrative_text).
    Supports English and Tamil language detection.
    """
    is_tamil = intent.detected_language.lower() in ("tamil", "ta")

    if safety.veto_triggered:
        # Veto Response
        if is_tamil:
            narrative = (
                f"எச்சரிக்கை! {intent.location_name} கடற்பகுதியில் புயல் மற்றும் ஆபத்தான கடல் நிலைமை உள்ளதால் கடலுக்கு செல்ல வேண்டாம். "
                f"காரணம்: {safety.safety_summary}. உங்கள் படகை {landing_centre.name} துறைமுகத்தில் பாதுகாப்பாக நிறுத்தவும்."
            )
        else:
            narrative = (
                f"ALERT: Fishing is NOT RECOMMENDED near {intent.location_name} {intent.target_date_str.lower()}. "
                f"A Safety Veto has been issued by ORCA due to severe weather hazards: {safety.safety_summary}. "
                f"Please keep boats docked at {landing_centre.name}."
            )

        full_answer = (
            f"⛔ **SAFETY VETO ACTIVE — DO NOT VENTURE TO SEA**\n\n"
            f"**Location**: Coastal {intent.location_name} (Reference Port: {landing_centre.name})\n"
            f"**Risk Level**: {safety.risk_level}\n\n"
            f"**Veto Reasons**:\n" + "\n".join([f"- {r}" for r in safety.veto_reasons]) + "\n\n"
            f"**Current Conditions**: Wind {weather.wind_speed_knots:.1f} knots, Wave height {weather.wave_height_m:.1f}m.\n"
            f"Stay updated with official IMD / INCOIS advisories before planning future trips."
        )
        return full_answer, narrative

    if not top_recommendation:
        if is_tamil:
            narrative = f"{intent.location_name} அருகில் மீன்பிடி மண்டலங்கள் எதுவும் கண்டறியப்படவில்லை."
        else:
            narrative = f"No high-confidence fishing zones identified near {intent.location_name} for {intent.target_date_str.lower()}."
        full_answer = f"No valid Potential Fishing Zones (PFZ) were found within range of {intent.location_name}."
        return full_answer, narrative

    # Safe / Moderate Fishing Recommendation Response
    rec = top_recommendation
    if is_tamil:
        narrative = (
            f"{intent.location_name} கடற்பகுதியில் மீன்பிடிக்க பரிந்துரைக்கப்பட்ட இடம் {rec.sector_name}, "
            f"தூரம் {rec.distance_km:.0f} கிலோமீட்டர், திசை {rec.bearing_deg:.0f} டிகிரி ({landing_centre.name} இலிருந்து). "
            f"பொருத்தநிலை மதிப்பெண் {suitability.total_score:.0f} சதவீதம். வானிலை பாதுகாப்பானது, காற்று வேகம் {weather.wind_speed_knots:.1f} நாட்ஸ்."
        )
    else:
        narrative = (
            f"Recommended fishing zone for {intent.target_date_str.lower()} is {rec.sector_name}, "
            f"located {rec.distance_km:.1f} kilometers at {rec.bearing_deg:.0f} degrees from {landing_centre.name}. "
            f"Suitability score is {suitability.total_score:.0f} percent. Marine weather is clear with wind at {weather.wind_speed_knots:.1f} knots."
        )

    full_answer = (
        f"🟢 **RECOMMENDED FISHING ZONE FOUND**\n\n"
        f"**Target Zone**: {rec.sector_name}\n"
        f"**Coordinates**: {rec.center_lat:.4f}° N, {rec.center_lon:.4f}° E\n"
        f"**Distance & Bearing**: {rec.distance_km:.1f} km at bearing {rec.bearing_deg:.0f}° from **{landing_centre.name}**\n"
        f"**Expected Depth**: {rec.depth_m:.0f} meters\n"
        f"**Suitability Score**: **{suitability.total_score:.1f}%** ({suitability.formula_explanation})\n\n"
        f"**Marine Weather Forecast**:\n"
        f"- Wind: {weather.wind_speed_knots:.1f} knots\n"
        f"- Wave Height: {weather.wave_height_m:.1f} m\n"
        f"- Visibility: {weather.visibility_km:.1f} km\n\n"
        f"**Safety Status**: {safety.safety_summary}"
    )

    return full_answer, narrative

