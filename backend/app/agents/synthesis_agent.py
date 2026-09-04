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

    # 1. SPECIES INQUIRY
    if intent.primary_intent == "SPECIES_INQUIRY":
        if is_tamil:
            narrative = (
                f"{intent.location_name} துறைமுகப் பகுதியில் வஞ்சரம் (Seer Fish), கானாங்கெளுத்தி (Mackerel), "
                f"கவலை (Sardine), வவ்வால் (Pomfret), நெத்திலி (Anchovies), சங்கரா (Red Snapper), மற்றும் பாரை (Trevally) "
                f"ஆகிய மீன் வகைகள் அதிகம் கிடைக்கும்."
            )
            full_answer = (
                f"🐟 **{intent.location_name.upper()} துறைமுகப் பகுதியில் கிடைக்கும் முக்கிய மீன் வகைகள்**\n\n"
                f"1. **வஞ்சரம் (Seer Fish / King Mackerel)** — அதிக சந்தை மதிப்பு கொண்ட மீன்\n"
                f"2. **கானாங்கெளுத்தி (Indian Mackerel)** — தினசரி உணவிற்கான பிரதான மீன்\n"
                f"3. **கவலை (Oil Sardine)** — கரையோரங்களில் திரளாக கிடைக்கும்\n"
                f"4. **வவ்வால் (Silver & Black Pomfret)** — உயர்தர ருசியான மீன்\n"
                f"5. **நெத்திலி (Anchovies)** — கரையோர ஆழமற்ற நீரில் கிடைக்கும்\n"
                f"6. **சங்கரா (Red Snapper)** & **பாரை (Trevally)**\n"
                f"7. **சூரை (Yellowfin Tuna)** — ஆழ்கடல் பகுதியில் கிடைக்கும்\n"
            )
        else:
            narrative = (
                f"Common fish species near {intent.location_name} Harbour include Seer Fish (Vanjaram), "
                f"Indian Mackerel (Kanagurutha), Oil Sardines (Kavalai), Silver & Black Pomfret (Vavval), "
                f"Anchovies (Nethili), Red Snapper (Sankara), Trevally (Parai), and Yellowfin Tuna."
            )
            full_answer = (
                f"🐟 **TARGET FISH SPECIES NEAR {intent.location_name.upper()} HARBOUR**\n\n"
                f"1. **Seer Fish / King Mackerel (Vanjaram)** — Highly valued commercial pelagic species\n"
                f"2. **Indian Mackerel (Kanagurutha)** — Abundant in coastal surface waters\n"
                f"3. **Oil Sardine (Kavalai)** — Common schooling fish along INCOIS PFZ belts\n"
                f"4. **Silver & Black Pomfret (Vavval)** — Premium market species in Bay of Bengal\n"
                f"5. **Anchovies (Nethili)** — Plentiful near estuarine river mouths\n"
                f"6. **Red Snapper (Sankara)** & **Trevally (Parai)** — Reef and coastal ledge species\n"
                f"7. **Yellowfin Tuna** — Deeper offshore pelagic waters\n"
            )
        return full_answer, narrative

    # 2. SAFETY VETO
    if safety.veto_triggered:
        if is_tamil:
            narrative = (
                f"எச்சரிக்கை! {intent.location_name} கடற்பகுதியில் அபாயகரமான காலநிலை உள்ளதால் கடலுக்கு செல்ல வேண்டாம். "
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

    # 3. SAFETY INQUIRY
    if intent.primary_intent == "SAFETY_INQUIRY":
        if is_tamil:
            narrative = f"{intent.location_name} கடற்பகுதியில் நிலைமைகள் பாதுகாப்பாக உள்ளன. காற்று வேகம் {weather.wind_speed_knots:.1f} நாட்ஸ்."
            full_answer = f"🛡️ **கடல் பாதுகாப்பு நிலை: பாதுகாப்பானது**\n\n{intent.location_name} பகுதியில் நிலைமைகள் தெளிவாக உள்ளன."
        else:
            narrative = f"Marine weather conditions near {intent.location_name} are currently clear and safe for fishing. Wind is at {weather.wind_speed_knots:.1f} knots."
            full_answer = f"🛡️ **MARINE SAFETY STATUS: SAFE**\n\nWeather near {intent.location_name} is clear with manageable wind ({weather.wind_speed_knots:.1f} knots) and wave height ({weather.wave_height_m:.1f} m)."
        return full_answer, narrative

    # 4. PARAMETER INQUIRY
    if intent.primary_intent == "PARAMETER_INQUIRY":
        if is_tamil:
            narrative = f"{intent.location_name} கடற்பகுதியில் காற்றின் வேகம் {weather.wind_speed_knots:.1f} நாட்ஸ், அலை உயரம் {weather.wave_height_m:.1f} மீட்டர்கள்."
            full_answer = f"🌊 **{intent.location_name.upper()} கடல் அளவுருக்கள்**\n\n- காற்றின் வேகம்: {weather.wind_speed_knots:.1f} knots\n- அலை உயரம்: {weather.wave_height_m:.1f} m\n- பார்வை திறன்: {weather.visibility_km:.1f} km"
        else:
            narrative = f"Verified weather parameters for {intent.location_name}: Wind speed is {weather.wind_speed_knots:.1f} knots, wave height is {weather.wave_height_m:.1f} meters."
            full_answer = f"🌊 **VERIFIED OCEAN PARAMETERS FOR {intent.location_name.upper()}**\n\n- Wind Speed: {weather.wind_speed_knots:.1f} knots\n- Wave Height: {weather.wave_height_m:.1f} m\n- Visibility: {weather.visibility_km:.1f} km"
        return full_answer, narrative

    # 5. FISHING RECOMMENDATION
    if not top_recommendation:
        if is_tamil:
            narrative = f"{intent.location_name} அருகில் மீன்பிடி மண்டலங்கள் எதுவும் கண்டறியப்படவில்லை."
        else:
            narrative = f"No high-confidence fishing zones identified near {intent.location_name} for {intent.target_date_str.lower()}."
        full_answer = f"No valid Potential Fishing Zones (PFZ) were found within range of {intent.location_name}."
        return full_answer, narrative

    rec = top_recommendation
    score_val = suitability.total_score if suitability else rec.strength_score
    if is_tamil:
        narrative = (
            f"{intent.location_name} கடற்பகுதியில் மீன்பிடிக்க பரிந்துரைக்கப்பட்ட இடம் {rec.sector_name}, "
            f"தூரம் {rec.distance_km:.0f} கிலோமீட்டர், திசை {rec.bearing_deg:.0f} டிகிரி ({landing_centre.name} இலிருந்து). "
            f"பொருத்தநிலை மதிப்பெண் {score_val:.0f} சதவீதம். வானிலை பாதுகாப்பானது."
        )
    else:
        narrative = (
            f"Recommended fishing zone for {intent.target_date_str.lower()} is {rec.sector_name}, "
            f"located {rec.distance_km:.1f} kilometers at {rec.bearing_deg:.0f} degrees from {landing_centre.name}. "
            f"Suitability score is {score_val:.0f} percent. Marine weather is clear."
        )

    full_answer = (
        f"🟢 **RECOMMENDED FISHING ZONE FOUND**\n\n"
        f"**Target Zone**: {rec.sector_name}\n"
        f"**Coordinates**: {rec.center_lat:.4f}° N, {rec.center_lon:.4f}° E\n"
        f"**Distance & Bearing**: {rec.distance_km:.1f} km at bearing {rec.bearing_deg:.0f}° from **{landing_centre.name}**\n"
        f"**Expected Depth**: {rec.depth_m:.0f} meters\n"
        f"**Suitability Score**: **{score_val:.1f}%**\n\n"
        f"**Marine Weather Forecast**:\n"
        f"- Wind: {weather.wind_speed_knots:.1f} knots\n"
        f"- Wave Height: {weather.wave_height_m:.1f} m\n"
        f"- Visibility: {weather.visibility_km:.1f} km\n\n"
        f"**Safety Status**: {safety.safety_summary}"
    )

    return full_answer, narrative
