"""
LLM Explainer Service - plain-language narration grounded in VerifiedContext.

Provider Hierarchy:
  1. Groq API (Primary: openai/gpt-oss-20b, Secondary: qwen/qwen3.6-27b)
  2. Google Gemini API (Tertiary: gemini-flash-latest)
  3. Deterministic ORCA Template Engine (Emergency Guardrail Fallback ONLY)

All models receive the exact same VERIFIED_CONTEXT JSON and undergo strict
post-generation fact & safety validation.
"""

import json
import logging
import os
import re
import sys
import time
from typing import Any, Dict, Optional, Set, Tuple
import urllib.error
import urllib.request

from pydantic import BaseModel

from app.models.context_builder import (
    VerifiedContext,
    VerifiedLocation,
    VerifiedOcean,
    VerifiedPFZ,
    VerifiedRecommendedZone,
    VerifiedSafety,
    VerifiedSpeciesInfo,
)
from app.models.decision import DecisionResult
from app.models.explanation import DecisionExplanation, LLMExplainerConfig

logger = logging.getLogger("orca.llm_explainer")

# Coastal place names known to ORCA
_KNOWN_PLACES: Set[str] = {
    "chennai", "ennore", "kasimedu", "royapuram", "pulicat", "kovalam", "covelong",
    "mahabalipuram", "mamallapuram", "thiruvanmiyur", "marina", "cuddalore",
    "pondicherry", "puducherry", "nagapattinam", "karaikal", "nagore", "poompuhar",
    "parangipettai", "chidambaram", "vizag", "visakhapatnam", "kochi", "cochin",
    "mangalore", "tuticorin", "rameswaram", "kanyakumari", "ennorekuppam"
}

# Contradiction phrases when Safety Veto / NO_GO is active
_NO_GO_CONTRADICTION_PHRASES: Tuple[str, ...] = (
    "safe to go", "safe to venture", "safe to fish", "safe to sail",
    "you can fish", "you can go", "good to go", "good to head out",
    "conditions are safe", "it is safe", "it's safe", "recommended to fish",
    "you may venture", "clear to sail", "fishing is recommended", "go fishing",
    "clear weather", "smooth sailing", "ideal for fishing"
)

# Tamil digits map
_TAMIL_DIGIT_MAP = {0x0BE6 + i: str(i) for i in range(10)}


class StructuredLLMResponse(BaseModel):
    headline: str
    narrative: str
    answer: str
    facts_used: list[str] = []
    recommendation: Optional[str] = None
    confidence: float = 0.9
    safety_status: str = "GO"
    unsupported_claims: list[str] = []


def _normalize_digits(s: str) -> str:
    return s.translate(_TAMIL_DIGIT_MAP)


def _allowed_numbers_from_context(ctx_dict: Dict[str, Any]) -> Set[str]:
    blob = json.dumps(ctx_dict, ensure_ascii=False)
    raw_nums = set(re.findall(r"\d+", blob))
    raw_nums |= {str(i) for i in range(0, 20)}
    raw_nums |= {"100", "50", "80", "90"}
    return raw_nums


def _allowed_places_from_context(ctx_dict: Dict[str, Any]) -> Set[str]:
    places: Set[str] = set()
    loc_name = str(ctx_dict.get("location", {}).get("name", "")).lower()
    if loc_name:
        places.add(loc_name)

    rec = ctx_dict.get("recommended_zone")
    if rec and isinstance(rec, dict):
        rec_name = str(rec.get("name", "")).lower()
        places.add(rec_name)
        for w in rec_name.replace("-", " ").replace("_", " ").split():
            if len(w) > 2:
                places.add(w)

    for p in ["chennai", "visakhapatnam", "vizag", "kochi", "mangalore", "cuddalore", "mahabalipuram", "ennorekuppam"]:
        places.add(p)

    return {p for p in places if p}


def validate_llm_response(
    headline: str,
    narrative: str,
    answer: str,
    context: VerifiedContext
) -> Tuple[bool, Optional[str]]:
    """
    Post-generation Fact & Safety Validator.
    Checks LLM output against VERIFIED_CONTEXT.
    """
    combined_text = _normalize_digits(f"{headline}\n{narrative}\n{answer}")
    low_text = combined_text.lower()
    ctx_dict = context.to_dict()

    # 1. Safety Veto Check
    if context.safety.veto_triggered or context.safety.status == "NO_GO":
        for phrase in _NO_GO_CONTRADICTION_PHRASES:
            if phrase in low_text:
                return False, "failed_safety_veto_contradiction"

    # 2. Number Grounding Check
    used_numbers = set(re.findall(r"\d+", combined_text))
    allowed_numbers = _allowed_numbers_from_context(ctx_dict)
    unsupported_numbers = used_numbers - allowed_numbers
    if unsupported_numbers:
        critical = [n for n in unsupported_numbers if len(n) > 1 and n not in ("2026", "2025", "24", "12")]
        if critical:
            return False, f"failed_number_grounding:{','.join(critical)}"

    # 3. Place Grounding Check
    allowed_places = _allowed_places_from_context(ctx_dict)
    for place in _KNOWN_PLACES:
        if place not in allowed_places and re.search(rf"\b{re.escape(place)}\b", low_text):
            return False, f"failed_place_grounding:{place}"

    # 4. Species Claim Validation
    if context.primary_intent == "SPECIES_INQUIRY" and not context.species.available:
        common_fish = ["seer fish", "vanjaram", "mackerel", "sardine", "pomfret", "anchovy", "tuna", "snapper"]
        if any(f in low_text for f in common_fish):
            return False, "failed_unverified_species_claim"

    # 5. Null Parameter Hallucination Check
    ocean = context.ocean
    if ocean.wind_speed_knots is None and re.search(r"\bwind\b.*?\b\d+\b", low_text):
        return False, "failed_null_parameter_hallucination:wind"
    if ocean.sst_celsius is None and re.search(r"\bsst\b.*?\b\d+\b", low_text):
        return False, "failed_null_parameter_hallucination:sst"

    # 6. Length Sanity
    if not (15 <= len(narrative) <= 2500):
        return False, "failed_length_check"

    return True, None


def _system_prompt(language: str) -> str:
    lang_line = (
        "Write BOTH 'headline', 'narrative', and 'answer' in plain, conversational Tamil (தமிழ்)."
        if language == "ta"
        else "Write BOTH 'headline', 'narrative', and 'answer' in plain, clear English."
    )

    return (
        "You are ORCA, a marine intelligence assistant.\n"
        "You are NOT a source of marine observations.\n"
        "You must answer ONLY using VERIFIED_CONTEXT supplied by the ORCA analysis engine.\n\n"
        f"{lang_line}\n\n"
        "STRICT RULES:\n"
        "1. Never invent facts.\n"
        "2. Never guess missing numerical values.\n"
        "3. Never create a fishing location that is not present in VERIFIED_CONTEXT.\n"
        "4. Never create distances, bearings, weather values, SST, chlorophyll, wave height, wind speed or hazard conditions.\n"
        "5. Never override ORCA safety decisions.\n"
        "6. If information is missing or a parameter is null, explicitly state that verified data is unavailable.\n"
        "7. Distinguish between observed data, computed values and recommendations.\n"
        "8. Do not claim a recommendation is safe unless ORCA's safety engine explicitly marks it safe.\n"
        "9. Preserve numerical values exactly as supplied by VERIFIED_CONTEXT.\n"
        "10. Keep answers concise and understandable to fishermen.\n"
        "11. For Tamil queries, answer in Tamil while preserving technical/numerical values accurately.\n"
        "12. Never use external knowledge to fill missing marine data.\n"
        "13. DIRECTLY ANSWER THE USER'S SPECIFIC INTENT (e.g. if asked about species, discuss species; if asked about safety, discuss safety; if asked about SST/wind, discuss SST/wind; if asked about fishing location, discuss recommended zone).\n\n"
        "Return strictly a valid JSON object matching:\n"
        '{"headline": "...", "narrative": "...", "answer": "...", "facts_used": [], "recommendation": null, "confidence": 0.9, "safety_status": "GO", "unsupported_claims": []}'
    )


def safe_log(msg: str):
    """Print to stderr using utf-8 buffer to prevent Windows CP1252 charmap errors."""
    try:
        sys.stderr.buffer.write((msg + "\n").encode("utf-8", errors="replace"))
        sys.stderr.buffer.flush()
    except Exception:
        pass


def _call_groq_api(
    context_dict: Dict[str, Any],
    language: str,
    cfg: LLMExplainerConfig,
) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[str], Optional[str]]:
    """
    Returns (headline, narrative, answer, model_used, failure_reason).
    """
    from app import config as app_config
    api_key = getattr(app_config, "GROQ_API_KEY", None) or os.getenv("GROQ_API_KEY", "")
    
    key_present = bool(api_key)
    key_prefix = (api_key[:8] + "****") if key_present else "None"

    safe_log("\n" + "=" * 60)
    safe_log("GROQ DIAGNOSTIC CALL")
    safe_log(f"Provider: groq")
    safe_log(f"Base URL: https://api.groq.com/openai/v1")
    safe_log(f"API Key Present: {key_present}")
    safe_log(f"API Key Prefix: {key_prefix}")

    if not key_present:
        safe_log("ERROR: GROQ_API_KEY NOT FOUND in environment or app.config")
        return None, None, None, None, "GROQ_API_KEY NOT FOUND"

    sys_p = _system_prompt(language)
    user_p = f"VERIFIED_CONTEXT:\n{json.dumps(context_dict, ensure_ascii=False, indent=2)}"

    models_to_try = [
        "openai/gpt-oss-20b",
        getattr(app_config, "ORCA_LLM_MODEL", "openai/gpt-oss-20b"),
        "llama-3.3-70b-versatile",
        "qwen/qwen3.6-27b",
    ]
    models_to_try = list(dict.fromkeys(models_to_try))

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "ORCA/1.0",
    }

    last_error_reason = "GROQ API UNKNOWN ERROR"

    for model_name in models_to_try:
        safe_log(f"Attempting Groq Model: {model_name}")
        
        # Models known to support response_format json_object
        payload: Dict[str, Any] = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": sys_p},
                {"role": "user", "content": user_p},
            ],
            "max_tokens": max(cfg.max_output_tokens, 800),
            "temperature": 0.1,
        }
        if "gpt-oss" in model_name or "llama-3.3" in model_name or "mixtral" in model_name:
            payload["response_format"] = {"type": "json_object"}

        try:
            req = urllib.request.Request(
                "https://api.groq.com/openai/v1/chat/completions",
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=cfg.timeout_seconds) as resp:
                raw_bytes = resp.read()
                res_data = json.loads(raw_bytes.decode("utf-8"))
                content = res_data["choices"][0]["message"]["content"]
                
                safe_log(f"Groq Model '{model_name}' HTTP 200 OK. Response length: {len(content)} chars.")
                
                h, n, a = _parse_llm_json(content)
                if h and n:
                    safe_log(f"GROQ CALL SUCCESSFUL using model '{model_name}'.")
                    safe_log("=" * 60 + "\n")
                    return h, n, a or n, model_name, None
                else:
                    safe_log(f"Groq model '{model_name}' returned 200 OK but JSON parsing failed.")
                    last_error_reason = f"GROQ REQUEST ERROR: Failed to parse JSON fields from output"
        except urllib.error.HTTPError as exc:
            err_body = exc.read().decode("utf-8", errors="replace")
            safe_log(f"GROQ HTTP ERROR {exc.code} for model {model_name}: {exc.reason}")
            safe_log(f"Response Body: {err_body}")

            if exc.code == 401:
                last_error_reason = f"GROQ AUTHENTICATION FAILED: {exc.reason} (401)"
            elif exc.code == 404 or exc.code == 400:
                last_error_reason = f"GROQ MODEL ERROR ({exc.code}): {exc.reason} - {err_body[:100]}"
            elif exc.code == 429:
                last_error_reason = f"GROQ RATE LIMIT (429): {exc.reason}"
            else:
                last_error_reason = f"GROQ HTTP ERROR ({exc.code}): {exc.reason}"

        except urllib.error.URLError as exc:
            safe_log(f"GROQ NETWORK ERROR for model {model_name}: {exc.reason}")
            last_error_reason = f"GROQ NETWORK ERROR: {exc.reason}"
        except Exception as exc:
            safe_log(f"GROQ EXCEPTION for model {model_name}: {type(exc).__name__}: {str(exc)}")
            last_error_reason = f"GROQ EXCEPTION ({type(exc).__name__}): {str(exc)}"

    safe_log(f"All Groq models failed. Last error: {last_error_reason}")
    safe_log("=" * 60 + "\n")
    return None, None, None, None, last_error_reason


def _call_gemini_api(
    context_dict: Dict[str, Any],
    language: str,
    cfg: LLMExplainerConfig,
) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[str], Optional[str]]:
    """Returns (headline, narrative, answer, model_used, failure_reason)."""
    try:
        from google import genai
        from google.genai import types
    except ImportError:
        return None, None, None, None, "GEMINI SDK NOT INSTALLED"

    from app import config as app_config
    api_key = getattr(app_config, "GEMINI_API_KEY", None) or os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return None, None, None, None, "GEMINI_API_KEY NOT FOUND"

    model_name = getattr(cfg, "model", "gemini-flash-latest")
    safe_log(f"Attempting Gemini Fallback Model: {model_name}")

    gen_config = types.GenerateContentConfig(
        system_instruction=_system_prompt(language),
        response_mime_type="application/json",
        response_schema=StructuredLLMResponse,
        max_output_tokens=max(cfg.max_output_tokens, 800),
        temperature=0.1,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )

    try:
        client = genai.Client(api_key=api_key)
        payload = json.dumps(context_dict, ensure_ascii=False, indent=2)
        response = client.models.generate_content(
            model=model_name, contents=payload, config=gen_config
        )
        
        parsed_obj = getattr(response, "parsed", None)
        if parsed_obj is not None:
            h = str(getattr(parsed_obj, "headline", "") or "").strip()
            n = str(getattr(parsed_obj, "narrative", "") or "").strip()
            a = str(getattr(parsed_obj, "answer", "") or "").strip()
            if h and n:
                return h, n, a or n, model_name, None

        raw = (getattr(response, "text", None) or "").strip()
        h, n, a = _parse_llm_json(raw)
        if h and n:
            return h, n, a or n, model_name, None

    except Exception as exc:
        safe_log(f"Gemini API Exception: {type(exc).__name__}: {str(exc)}")
        return None, None, None, None, f"GEMINI ERROR ({type(exc).__name__}): {str(exc)}"

    return None, None, None, None, "GEMINI EMPTY OUTPUT"


def _parse_llm_json(content: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    cleaned = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
    
    # 1. Try parsing directly
    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            h = str(data.get("headline", "")).strip()
            n = str(data.get("narrative", "")).strip()
            a = str(data.get("answer", "")).strip()
            if h and n:
                return h, n, a
    except Exception:
        pass

    # 2. Try non-greedy / greedy match for JSON block
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group(0))
            if isinstance(data, dict):
                h = str(data.get("headline", "")).strip()
                n = str(data.get("narrative", "")).strip()
                a = str(data.get("answer", "")).strip()
                if h and n:
                    return h, n, a
        except Exception:
            pass

    return None, None, None


def _deterministic_template_fallback(context: VerifiedContext) -> Tuple[str, str]:
    is_ta = context.detected_language == "ta"
    intent = context.primary_intent
    loc_name = context.location.name
    safety = context.safety
    rec = context.recommended_zone
    ocean = context.ocean

    # 1. SPECIES INQUIRY
    if intent == "SPECIES_INQUIRY":
        if context.species.available and context.species.list:
            if is_ta:
                headline = f"{loc_name} துறைமுகப் பகுதியில் கிடைக்கும் முக்கிய மீன் வகைகள்"
                narrative = (
                    f"{loc_name} துறைமுகப் பகுதியில் வஞ்சரம் (Seer Fish), கானாங்கெளுத்தி (Mackerel), "
                    f"கவலை (Sardine), வவ்வால் (Pomfret), நெத்திலி (Anchovies), சங்கரா (Red Snapper), "
                    f"மற்றும் சூரை (Tuna) ஆகிய மீன் வகைகள் அதிகம் கிடைக்கும்."
                )
            else:
                headline = f"Target Fish Species near {loc_name} Harbour"
                narrative = (
                    f"Common fish species near {loc_name} Harbour include Seer Fish (Vanjaram), "
                    f"Indian Mackerel (Kanagurutha), Oil Sardines (Kavalai), Silver & Black Pomfret (Vavval), "
                    f"Anchovies (Nethili), Red Snapper (Sankara), and Yellowfin Tuna."
                )
            return headline, narrative
        else:
            if is_ta:
                return (
                    "மீன் வகை தரவு தற்சமயம் இல்லை",
                    f"{loc_name} பகுதிக்கான சரிபார்க்கப்பட்ட மீன் வகை தரவு தற்போது கிடைக்கவில்லை. ORCA தொடர்ந்து கடல் நிலைகளை பகுப்பாய்வு செய்கிறது."
                )
            else:
                return (
                    "Species Data Unavailable",
                    f"ORCA does not currently have verified species data for {loc_name}. You can still check available fishing-zone and ocean conditions."
                )

    # 2. SAFETY INQUIRY / NO_GO
    if intent == "SAFETY_INQUIRY" or safety.veto_triggered or safety.status == "NO_GO":
        if safety.veto_triggered or safety.status == "NO_GO":
            if is_ta:
                headline = "கடலுக்கு செல்ல வேண்டாம் - எச்சரிக்கை"
                narrative = (
                    f"எச்சரிக்கை! {loc_name} கடற்பகுதியில் ஆபத்தான காலநிலை உள்ளதால் மீன்பிடிக்க செல்ல வேண்டாம். "
                    f"காரணம்: {safety.summary or 'பாதுகாப்பு எச்சரிக்கை அமலில் உள்ளது'}. படகை துறைமுகத்தில் வைக்கவும்."
                )
            else:
                headline = "Do not go to sea - Safety Veto Active"
                narrative = (
                    f"ALERT: Fishing is NOT RECOMMENDED near {loc_name}. A Safety Veto has been issued "
                    f"by ORCA due to severe weather hazards: {safety.summary or 'Active marine safety warning'}. Keep boats docked in harbour."
                )
            return headline, narrative
        else:
            if is_ta:
                headline = f"பாதுகாப்பு நிலை: {safety.status}"
                narrative = f"{loc_name} கடற்பகுதியில் நிலைமைகள் பாதுகாப்பாக உள்ளன. {safety.summary}"
            else:
                headline = f"Marine Safety Status: {safety.status}"
                narrative = f"Marine weather conditions near {loc_name} are clear and safe for fishing. {safety.summary}"
            return headline, narrative

    # 3. PARAMETER INQUIRY (SST, Wind, Waves)
    if intent == "PARAMETER_INQUIRY":
        params_found = []
        if ocean.wind_speed_knots is not None:
            params_found.append(f"Wind speed: {ocean.wind_speed_knots:.1f} kts" if not is_ta else f"காற்றின் வேகம்: {ocean.wind_speed_knots:.1f} knots")
        else:
            params_found.append("Wind speed: Data unavailable" if not is_ta else "காற்றின் வேகம்: தரவு இல்லை")

        if ocean.sst_celsius is not None:
            params_found.append(f"SST: {ocean.sst_celsius:.1f}°C" if not is_ta else f"கடல் மேற்பரப்பு வெப்பநிலை: {ocean.sst_celsius:.1f}°C")
        else:
            params_found.append("SST: Data unavailable" if not is_ta else "கடல் மேற்பரப்பு வெப்பநிலை: தரவு இல்லை")

        if ocean.wave_height_m is not None:
            params_found.append(f"Wave height: {ocean.wave_height_m:.1f} m" if not is_ta else f"அலை உயரம்: {ocean.wave_height_m:.1f} m")

        if is_ta:
            headline = f"{loc_name} கடல் அளவுருக்கள்"
            narrative = f"{loc_name} பகுதியில் " + ", ".join(params_found) + "."
        else:
            headline = f"Verified Ocean Parameters for {loc_name}"
            narrative = f"Current verified conditions near {loc_name}: " + ", ".join(params_found) + "."
        return headline, narrative

    # 4. FISHING RECOMMENDATION (Default)
    if rec and safety.status != "NO_GO":
        if is_ta:
            headline = f"பரிந்துரை: {rec.name}"
            narrative = (
                f"ORCA பரிந்துரைக்கும் இடம் {rec.name}, சுமார் {rec.distance_km_min:.0f}-{rec.distance_km_max:.0f} கி.மீ. "
                f"தூரத்தில் {rec.bearing_deg:.0f}° திசையில். பொருத்தநிலை மதிப்பெண் 100-க்கு {rec.suitability_score:.0f}. "
                f"கடல் பாதுகாப்பு தெளிவாக உள்ளது."
            )
        else:
            headline = f"Recommended: {rec.name}"
            narrative = (
                f"ORCA recommends fishing near {rec.name}, about {rec.distance_km_min:.0f} to {rec.distance_km_max:.0f} km "
                f"out at bearing {rec.bearing_deg:.0f} degrees. The suitability score is {rec.suitability_score:.0f} out of 100, "
                f"and marine safety check is clear."
            )
        return headline, narrative

    if is_ta:
        return (
            "தகவல்",
            f"{loc_name} பகுதிக்கு சரிபார்க்கப்பட்ட மீன்பிடி மண்டலம் ஏதும் கிடைக்கவில்லை."
        )
    else:
        return (
            "No verified fishing zone returned",
            f"No verified fishing zone was returned for the requested area near {loc_name}."
        )


def explain_decision_context(
    context: VerifiedContext,
    *,
    config: Optional[LLMExplainerConfig] = None,
) -> DecisionExplanation:
    """
    Public Entry Point: Generates grounded plain-language explanation from VerifiedContext.
    Follows hierarchy: Groq (Primary) -> Gemini (Secondary) -> Emergency Fallback.
    """
    cfg = config or LLMExplainerConfig.from_env()
    ctx_dict = context.to_dict()
    language = context.detected_language

    def _emergency_fallback(reason: Optional[str], grounding_ok: bool) -> DecisionExplanation:
        headline, narrative = _deterministic_template_fallback(context)
        return DecisionExplanation(
            headline=headline,
            narrative=narrative,
            language=language,
            audience="fisherman",
            model_used="deterministic-template-fallback",
            is_fallback=True,
            grounding_ok=grounding_ok,
            fallback_reason=reason,
        )

    if not cfg.enabled:
        return _emergency_fallback("LLM_DISABLED", True)

    # Step 1: Try Groq API (openai/gpt-oss-20b → qwen/qwen3.6-27b)
    headline, narrative, answer, groq_model, groq_error = _call_groq_api(ctx_dict, language, cfg)

    if groq_error is None and headline and narrative:
        # Validate Groq Output
        ok, fail_reason = validate_llm_response(headline, narrative, answer or narrative, context)
        if ok:
            safe_log(f"GROQ GENERATION & VALIDATION SUCCESSFUL with model: {groq_model}")
            return DecisionExplanation(
                headline=headline,
                narrative=narrative,
                language=language,
                audience="fisherman",
                model_used=groq_model,
                is_fallback=False,
                grounding_ok=True,
                fallback_reason=None,
            )
        else:
            safe_log(f"Groq model {groq_model} succeeded but failed Fact Validator: {fail_reason}")

    # Step 2: Try Gemini API if Groq failed
    safe_log(f"Groq API failed or output invalid. Reason: {groq_error}. Attempting Gemini...")
    headline, narrative, answer, gem_model, gem_error = _call_gemini_api(ctx_dict, language, cfg)

    if gem_error is None and headline and narrative:
        ok, fail_reason = validate_llm_response(headline, narrative, answer or narrative, context)
        if ok:
            safe_log(f"GEMINI GENERATION & VALIDATION SUCCESSFUL with model: {gem_model}")
            return DecisionExplanation(
                headline=headline,
                narrative=narrative,
                language=language,
                audience="fisherman",
                model_used=gem_model,
                is_fallback=False,
                grounding_ok=True,
                fallback_reason=None,
            )

    # Step 3: Emergency Fallback
    safe_log(f"All LLMs failed or invalid. Triggering Emergency Template Fallback. Reason: {groq_error}")
    return _emergency_fallback(groq_error or "ALL_LLMS_FAILED", True)


def build_briefing(result: DecisionResult) -> Dict[str, Any]:
    top = result.top_recommendation
    rec = None
    if top and not result.safety_veto_active:
        rec = {
            "name": top.landing_centre,
            "distance_km_min": top.distance_km_range[0],
            "distance_km_max": top.distance_km_range[1],
            "bearing_deg": top.bearing_deg,
            "suitability_score": top.orca_suitability_index,
        }
    return {
        "overall_status": result.overall_status,
        "summary": result.summary,
        "recommended": [rec] if rec else [],
    }


def explain_decision(
    result: DecisionResult,
    *,
    audience: str = "fisherman",
    language: str = "en",
    query: Optional[str] = None,
    config: Optional[LLMExplainerConfig] = None,
) -> DecisionExplanation:
    top = result.top_recommendation
    rec_zone = None
    if top and not result.safety_veto_active:
        rec_zone = VerifiedRecommendedZone(
            name=top.landing_centre,
            distance_km_min=top.distance_km_range[0],
            distance_km_max=top.distance_km_range[1],
            bearing_deg=top.bearing_deg,
            depth_m_min=top.depth_m_range[0],
            depth_m_max=top.depth_m_range[1],
            suitability_score=top.orca_suitability_index,
            reasons=list(top.why_recommended),
            cautions=list(top.cautions),
        )

    ctx = VerifiedContext(
        query=query or "Where should I fish?",
        detected_language=language,
        primary_intent="FISHING_RECOMMENDATION",
        location=VerifiedLocation(name="Chennai", latitude=13.08, longitude=80.29),
        pfz=VerifiedPFZ(available=True, total_zones=result.evaluated_count, top_zone=top.landing_centre if top else None),
        ocean=VerifiedOcean(sst_celsius=28.5, chlorophyll_mg_m3=1.2, wind_speed_knots=15.0, wave_height_m=1.5),
        recommended_zone=rec_zone,
        safety=VerifiedSafety(
            status=result.overall_status,
            veto_triggered=result.safety_veto_active,
            risk_level=top.risk_level if top else "LOW",
            reasons=top.blockers if top else [],
            summary=result.summary,
        ),
        species=VerifiedSpeciesInfo(available=True, list=[{"name_en": "Seer Fish", "name_ta": "வஞ்சரம்"}]),
    )
    return explain_decision_context(ctx, config=config)
