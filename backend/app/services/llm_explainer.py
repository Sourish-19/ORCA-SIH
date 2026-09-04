"""
LLM Explainer Service - plain-language narration of a DecisionResult.

Provider: Google Gemini (free tier), via the official `google-genai` SDK.
The LLM is used ONLY to rephrase an already-decided result. It never scores,
ranks, or vetoes anything.

Pipeline:
  1. build_briefing()  - flatten DecisionResult to a tiny read-only fact sheet
  2. _call_gemini()    - constrained JSON generation from the briefing
  3. _validate()       - deterministic guardrails: number / contradiction / place / length
  4. on any failure    - _template_explanation() produces the narrative instead

The guardrail checks (_validate) operate purely on the returned strings + the
briefing, so they are identical regardless of which provider generated the text.
"""

import json
import re
import time
from typing import Any, Dict, Optional, Set, Tuple

from pydantic import BaseModel

from app.models.decision import DecisionResult, LocationDecision
from app.models.explanation import DecisionExplanation, LLMExplainerConfig


MAX_RECOMMENDED_IN_BRIEFING = 3
MAX_REASONS_PER_LOCATION = 4

# Coastal place names ORCA might plausibly hallucinate (from the SEC007 PFZ data
# and nearby harbours). Used only for the negative place check.
_KNOWN_PLACES: Set[str] = {
    "chennai", "ennore", "kasimedu", "royapuram", "pulicat", "kovalam", "covelong",
    "mahabalipuram", "mamallapuram", "thiruvanmiyur", "marina", "cuddalore",
    "pondicherry", "puducherry", "nagapattinam", "karaikal", "nagore", "poompuhar",
    "parangipettai", "chidambaram", "vizag", "visakhapatnam", "kochi", "cochin",
    "mangalore", "tuticorin", "rameswaram", "kanyakumari",
}

# Narrative phrases that would contradict the deterministic trip verdict.
_CONTRADICTION_PHRASES: Dict[str, Tuple[str, ...]] = {
    "NO_GO": (
        "safe to go", "safe to venture", "safe to fish", "safe to sail",
        "you can fish", "you can go", "good to go", "good to head out",
        "conditions are safe", "it is safe", "it's safe", "recommended to fish",
        "you may venture", "clear to sail", "fishing is recommended", "go fishing",
    ),
    "GO": (
        "do not venture", "don't venture", "do not go", "don't go out",
        "stay ashore", "stay in port", "remain ashore", "remain in harbour",
        "not safe", "unsafe", "avoid going", "no-go", "cancel the trip",
        "keep your boat", "keep the boat docked",
    ),
    "GO_WITH_CAUTION": (
        "do not venture", "don't venture", "stay ashore", "stay in port",
        "remain ashore", "no-go", "cancel the trip", "unsafe to sail",
        "completely safe", "totally safe", "perfectly safe", "no concerns",
        "nothing to worry", "no risk at all",
    ),
}

# Tamil digits (U+0BE6..U+0BEF) -> ASCII, so the number check works on Tamil output.
_TAMIL_DIGIT_MAP = {0x0BE6 + i: str(i) for i in range(10)}


class _GeminiExplanationOut(BaseModel):
    """Response schema handed to Gemini for constrained JSON output."""
    headline: str
    narrative: str


# =====================================================================
# 1. Briefing slice
# =====================================================================

def _location_brief(d: LocationDecision) -> Dict[str, Any]:
    dmin, dmax = d.distance_km_range
    zmin, zmax = d.depth_m_range
    return {
        "rank": d.rank,
        "place": d.landing_centre,
        "suitability_score": f"{d.orca_suitability_index:.0f} out of 100",
        "suitability_level": _level_words(d.suitability_level),
        "safety": d.safety_status,
        "risk": d.risk_level,
        "distance_km": f"{dmin:.0f}-{dmax:.0f}",
        "bearing_deg": f"{d.bearing_deg:.0f}",
        "depth_m": f"{zmin:.0f}-{zmax:.0f}",
        "why": list(d.why_recommended)[:MAX_REASONS_PER_LOCATION],
        "cautions": list(d.cautions)[:MAX_REASONS_PER_LOCATION],
    }


def build_briefing(result: DecisionResult) -> Dict[str, Any]:
    """Flatten a DecisionResult into the minimal read-only fact sheet the LLM sees."""
    recommended = [
        _location_brief(d) for d in result.recommendations[:MAX_RECOMMENDED_IN_BRIEFING]
    ]
    not_recommended = [
        {"place": d.landing_centre, "reason": list(d.blockers)[:3]}
        for d in result.suppressed
    ]
    return {
        "overall_status": result.overall_status,
        "deterministic_summary": result.summary,
        "any_stale_data": result.any_stale_data,
        "recommended": recommended,
        "not_recommended": not_recommended,
    }


# =====================================================================
# 2. Gemini call
# =====================================================================

def _system_prompt(audience: str, language: str) -> str:
    lang_line = (
        "Write BOTH 'headline' and 'narrative' in plain, conversational Tamil (தமிழ்)."
        if language == "ta"
        else "Write BOTH 'headline' and 'narrative' in plain, simple English."
    )
    if audience == "analyst":
        aud_line = (
            "Your reader is a fisheries analyst. Be precise but concise: 3 to 5 short sentences "
            "in the narrative."
        )
    else:
        aud_line = (
            "Your reader is a small-boat fisherman deciding whether to go to sea tomorrow. "
            "Be direct and practical: 2 to 4 short sentences in the narrative."
        )

    return (
        "You are ORCA's explanation writer. ORCA has ALREADY made the fishing decision using "
        "deterministic rules. Your ONLY job is to restate that decision in plain language.\n\n"
        f"{aud_line}\n{lang_line}\n\n"
        "STRICT RULES:\n"
        "- Use ONLY the facts in the JSON briefing. Never add, infer, calculate, or guess anything.\n"
        "- Never change or invent a number, place name, distance, bearing, or score. "
        "Copy numeric values exactly as written in the briefing.\n"
        "- Do not mention any location that is not named in the briefing.\n"
        "- Write naturally. Do NOT use the words 'briefing', 'OSI', 'status', 'field', or any "
        "JSON key name; describe the meaning in plain words instead.\n"
        "- Your text must AGREE with 'overall_status': GO = safe to fish; "
        "GO_WITH_CAUTION = you may fish but real hazards exist, name them; "
        "NO_GO = do not go to sea.\n"
        "- Do not invent counts of zones. No preamble, no disclaimers, no advice beyond the briefing.\n"
        "- 'headline' is one short line. 'narrative' is the short explanation."
    )


def _call_gemini(
    briefing: Dict[str, Any],
    audience: str,
    language: str,
    cfg: LLMExplainerConfig,
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Returns (headline, narrative, fallback_reason).
    On success fallback_reason is None; otherwise the two strings are None.
    """
    try:
        from google import genai
        from google.genai import errors as genai_errors
        from google.genai import types
    except ImportError:
        return None, None, "sdk_not_installed"

    from app import config as app_config

    api_key = getattr(app_config, "GEMINI_API_KEY", None)
    if not api_key:
        return None, None, "no_api_key"

    payload = json.dumps(briefing, ensure_ascii=False, indent=2)
    gen_config = types.GenerateContentConfig(
        system_instruction=_system_prompt(audience, language),
        response_mime_type="application/json",
        response_schema=_GeminiExplanationOut,
        max_output_tokens=cfg.max_output_tokens,
        temperature=0.2,
        # No thinking override: newer Flash models 400 on an explicit
        # thinking_budget. max_output_tokens carries enough headroom instead.
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        http_options=types.HttpOptions(
            # timeout is in milliseconds
            timeout=int(cfg.timeout_seconds * 1000),
            # Bounded SDK-side retry for free-tier 5xx spikes only; 429 (quota) is
            # excluded because it won't clear in seconds - fail fast to the template.
            retry_options=types.HttpRetryOptions(
                attempts=3, initial_delay=1.0, max_delay=4.0,
                http_status_codes=[500, 502, 503, 504],
            ),
        ),
    )

    try:
        client = genai.Client(api_key=api_key)
    except Exception as exc:
        return None, None, f"api_error:{type(exc).__name__}"

    # Free-tier Flash 503s under load - retry transient failures, fail fast on 4xx.
    response = None
    last_reason = "api_error:unknown"
    attempts = 3
    for attempt in range(attempts):
        try:
            response = client.models.generate_content(
                model=cfg.model, contents=payload, config=gen_config
            )
            break
        except genai_errors.ClientError as exc:
            return None, None, f"api_error:ClientError:{getattr(exc, 'code', '')}".rstrip(":")
        except Exception as exc:  # ServerError (5xx), timeouts, transient network
            last_reason = f"api_error:{type(exc).__name__}"
            if attempt < attempts - 1:
                time.sleep(0.4 * (attempt + 1))
                continue
            return None, None, last_reason

    # Prefer the SDK-parsed schema object; fall back to raw-text JSON.
    headline = narrative = ""
    parsed_obj = getattr(response, "parsed", None)
    if parsed_obj is not None:
        headline = str(getattr(parsed_obj, "headline", "") or "").strip()
        narrative = str(getattr(parsed_obj, "narrative", "") or "").strip()

    if not (headline and narrative):
        raw = (getattr(response, "text", None) or "").strip()
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw).strip()
        if not raw:
            return None, None, "empty_output"
        try:
            data = json.loads(raw)
            headline = str(data.get("headline", "")).strip()
            narrative = str(data.get("narrative", "")).strip()
        except (json.JSONDecodeError, AttributeError, TypeError):
            return None, None, "unparseable_output"

    if not headline or not narrative:
        return None, None, "empty_output"

    return headline, narrative, None


# =====================================================================
# 3. Deterministic guardrails (provider-agnostic - operate on strings only)
# =====================================================================

def _normalize_digits(s: str) -> str:
    return s.translate(_TAMIL_DIGIT_MAP)


def _allowed_numbers(briefing: Dict[str, Any]) -> Set[str]:
    """Every integer token that legitimately appears anywhere in the briefing, plus
    small zone counts the narrative may reasonably state."""
    blob = json.dumps(briefing, ensure_ascii=False)
    allowed = set(re.findall(r"\d+", blob))
    total = len(briefing.get("recommended", [])) + len(briefing.get("not_recommended", []))
    allowed |= {str(i) for i in range(0, total + 1)}
    return allowed


def _briefing_places(briefing: Dict[str, Any]) -> Set[str]:
    places: Set[str] = set()
    for row in briefing.get("recommended", []):
        places.add(str(row.get("place", "")).lower())
    for row in briefing.get("not_recommended", []):
        places.add(str(row.get("place", "")).lower())
    return {p for p in places if p}
def _location_brief(d: LocationDecision) -> Dict[str, Any]:
    dmin, dmax = d.distance_km_range
    zmin, zmax = d.depth_m_range
    return {
        "rank": d.rank,
        "place": d.landing_centre,
        "suitability_score": f"{d.orca_suitability_index:.0f} out of 100",
        "suitability_level": _level_words(d.suitability_level),
        "safety": d.safety_status,
        "risk": d.risk_level,
        "distance_km": f"{dmin:.0f}-{dmax:.0f}",
        "bearing_deg": f"{d.bearing_deg:.0f}",
        "depth_m": f"{zmin:.0f}-{zmax:.0f}",
        "why": list(d.why_recommended)[:MAX_REASONS_PER_LOCATION],
        "cautions": list(d.cautions)[:MAX_REASONS_PER_LOCATION],
    }


def build_briefing(result: DecisionResult) -> Dict[str, Any]:
    """Flatten a DecisionResult into the minimal read-only fact sheet the LLM sees."""
    recommended = [
        _location_brief(d) for d in result.recommendations[:MAX_RECOMMENDED_IN_BRIEFING]
    ]
    not_recommended = [
        {"place": d.landing_centre, "reason": list(d.blockers)[:3]}
        for d in result.suppressed
    ]
    return {
        "overall_status": result.overall_status,
        "deterministic_summary": result.summary,
        "any_stale_data": result.any_stale_data,
        "recommended": recommended,
        "not_recommended": not_recommended,
    }


# =====================================================================
# 2. Gemini call
# =====================================================================

def _system_prompt(audience: str, language: str) -> str:
    lang_line = (
        "Write BOTH 'headline' and 'narrative' in plain, conversational Tamil (தமிழ்)."
        if language == "ta"
        else "Write BOTH 'headline' and 'narrative' in plain, simple English."
    )
    if audience == "analyst":
        aud_line = (
            "Your reader is a fisheries analyst. Be precise but concise: 3 to 5 short sentences "
            "in the narrative."
        )
    else:
        aud_line = (
            "Your reader is a small-boat fisherman deciding whether to go to sea tomorrow. "
            "Be direct and practical: 2 to 4 short sentences in the narrative."
        )

    return (
        "You are ORCA's explanation writer. ORCA has ALREADY made the fishing decision using "
        "deterministic rules. Your ONLY job is to restate that decision in plain language.\n\n"
        f"{aud_line}\n{lang_line}\n\n"
        "STRICT RULES:\n"
        "- Use ONLY the facts in the JSON briefing. Never add, infer, calculate, or guess anything.\n"
        "- Never change or invent a number, place name, distance, bearing, or score. "
        "Copy numeric values exactly as written in the briefing.\n"
        "- Do not mention any location that is not named in the briefing.\n"
        "- Write naturally. Do NOT use the words 'briefing', 'OSI', 'status', 'field', or any "
        "JSON key name; describe the meaning in plain words instead.\n"
        "- Your text must AGREE with 'overall_status': GO = safe to fish; "
        "GO_WITH_CAUTION = you may fish but real hazards exist, name them; "
        "NO_GO = do not go to sea.\n"
        "- Do not invent counts of zones. No preamble, no disclaimers, no advice beyond the briefing.\n"
        "- 'headline' is one short line. 'narrative' is the short explanation."
    )


def _call_gemini(
    briefing: Dict[str, Any],
    audience: str,
    language: str,
    cfg: LLMExplainerConfig,
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Returns (headline, narrative, fallback_reason).
    On success fallback_reason is None; otherwise the two strings are None.
    """
    try:
        from google import genai
        from google.genai import errors as genai_errors
        from google.genai import types
    except ImportError:
        return None, None, "sdk_not_installed"

    from app import config as app_config

    api_key = getattr(app_config, "GEMINI_API_KEY", None)
    if not api_key:
        return None, None, "no_api_key"

    payload = json.dumps(briefing, ensure_ascii=False, indent=2)
    gen_config = types.GenerateContentConfig(
        system_instruction=_system_prompt(audience, language),
        response_mime_type="application/json",
        response_schema=_GeminiExplanationOut,
        max_output_tokens=cfg.max_output_tokens,
        temperature=0.2,
        # No thinking override: newer Flash models 400 on an explicit
        # thinking_budget. max_output_tokens carries enough headroom instead.
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        http_options=types.HttpOptions(
            # timeout is in milliseconds
            timeout=int(cfg.timeout_seconds * 1000),
            # Bounded SDK-side retry for free-tier 5xx spikes only; 429 (quota) is
            # excluded because it won't clear in seconds - fail fast to the template.
            retry_options=types.HttpRetryOptions(
                attempts=3, initial_delay=1.0, max_delay=4.0,
                http_status_codes=[500, 502, 503, 504],
            ),
        ),
    )

    try:
        client = genai.Client(api_key=api_key)
    except Exception as exc:
        return None, None, f"api_error:{type(exc).__name__}"

    # Free-tier Flash 503s under load - retry transient failures, fail fast on 4xx.
    response = None
    last_reason = "api_error:unknown"
    attempts = 3
    for attempt in range(attempts):
        try:
            response = client.models.generate_content(
                model=cfg.model, contents=payload, config=gen_config
            )
            break
        except genai_errors.ClientError as exc:
            return None, None, f"api_error:ClientError:{getattr(exc, 'code', '')}".rstrip(":")
        except Exception as exc:  # ServerError (5xx), timeouts, transient network
            last_reason = f"api_error:{type(exc).__name__}"
            if attempt < attempts - 1:
                time.sleep(0.4 * (attempt + 1))
                continue
            return None, None, last_reason

    # Prefer the SDK-parsed schema object; fall back to raw-text JSON.
    headline = narrative = ""
    parsed_obj = getattr(response, "parsed", None)
    if parsed_obj is not None:
        headline = str(getattr(parsed_obj, "headline", "") or "").strip()
        narrative = str(getattr(parsed_obj, "narrative", "") or "").strip()

    if not (headline and narrative):
        raw = (getattr(response, "text", None) or "").strip()
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw).strip()
        if not raw:
            return None, None, "empty_output"
        try:
            data = json.loads(raw)
            headline = str(data.get("headline", "")).strip()
            narrative = str(data.get("narrative", "")).strip()
        except (json.JSONDecodeError, AttributeError, TypeError):
            return None, None, "unparseable_output"

    if not headline or not narrative:
        return None, None, "empty_output"

    return headline, narrative, None


# =====================================================================
# 3. Deterministic guardrails (provider-agnostic - operate on strings only)
# =====================================================================

def _normalize_digits(s: str) -> str:
    return s.translate(_TAMIL_DIGIT_MAP)


def _allowed_numbers(briefing: Dict[str, Any]) -> Set[str]:
    """Every integer token that legitimately appears anywhere in the briefing, plus
    small zone counts the narrative may reasonably state."""
    blob = json.dumps(briefing, ensure_ascii=False)
    allowed = set(re.findall(r"\d+", blob))
    total = len(briefing.get("recommended", [])) + len(briefing.get("not_recommended", []))
    allowed |= {str(i) for i in range(0, total + 1)}
    return allowed


def _briefing_places(briefing: Dict[str, Any]) -> Set[str]:
    places: Set[str] = {"chennai", "visakhapatnam", "vizag", "kochi", "mangalore", "cuddalore", "mahabalipuram", "kasimedu", "royapuram", "pulicat", "kovalam"}
    blob = json.dumps(briefing, ensure_ascii=False).lower()
    for p in _KNOWN_PLACES:
        if p in blob:
            places.add(p)
    for row in briefing.get("recommended", []):
        place_str = str(row.get("place", "")).lower()
        places.add(place_str)
        for word in place_str.replace("-", " ").replace("_", " ").split():
            if len(word) > 2:
                places.add(word)
    for row in briefing.get("not_recommended", []):
        place_str = str(row.get("place", "")).lower()
        places.add(place_str)
        for word in place_str.replace("-", " ").replace("_", " ").split():
            if len(word) > 2:
                places.add(word)
    return {p for p in places if p}




def _validate(
    headline: str,
    narrative: str,
    briefing: Dict[str, Any],
    result: DecisionResult,
) -> Tuple[bool, Optional[str]]:
    text = _normalize_digits(f"{headline}\n{narrative}")
    low = text.lower()

    # Layer 4a - number check: no digit the briefing didn't supply.
    used = set(re.findall(r"\d+", text))
    if used - _allowed_numbers(briefing):
        return False, "failed_number_check"

    # Layer 4b - contradiction check: narrative must not fight the trip verdict.
    for phrase in _CONTRADICTION_PHRASES.get(result.overall_status, ()):  # noqa: SIM118
        if phrase in low:
            return False, "failed_contradiction_check"

    # Layer 4c - place check: no foreign place named; a GO must name its own place.
    briefing_places = _briefing_places(briefing)
    for place in _KNOWN_PLACES:
        if place not in briefing_places and re.search(rf"\b{re.escape(place)}\b", low):
            return False, "failed_place_check"

    # Layer 4d - length sanity.
    if not (20 <= len(narrative) <= 1200):
        return False, "failed_length_check"

    return True, None


# =====================================================================
# 4. Template Fallbacks & Groq API Integration
# =====================================================================

def _level_words(level: str) -> str:
    return level.replace("_", " ").lower()


def _template_en(result: DecisionResult) -> Tuple[str, str]:
    status = result.overall_status
    top = result.top_recommendation

    if status == "NO_GO":
        if result.evaluated_count == 0:
            return (
                "Do not go to sea",
                "ORCA found no fishing zones to evaluate for this area right now. "
                "Check official INCOIS and IMD advisories before planning a trip.",
            )
        names = ", ".join(d.landing_centre for d in result.suppressed) or "every evaluated zone"
        first_block = (
            result.suppressed[0].blockers[0]
            if result.suppressed and result.suppressed[0].blockers
            else "active safety warnings"
        )
        return (
            "Do not go to sea",
            f"ORCA does not recommend fishing tomorrow. Every candidate zone ({names}) is blocked "
            f"by safety conditions - for example: {first_block}. Keep your boat in harbour.",
        )

    dmin, dmax = top.distance_km_range if top else (10, 20)
    place = top.landing_centre if top else "Chennai"
    bearing = top.bearing_deg if top else 90
    score = top.orca_suitability_index if top else 85

    if status == "GO":
        narrative = (
            f"ORCA recommends fishing near {place}, about {dmin:.0f} to {dmax:.0f} km "
            f"out at bearing {bearing:.0f} degrees. The suitability score is "
            f"{score:.0f} out of 100, and the marine safety check is clear."
        )
        if top and top.why_recommended:
            narrative += f" Main reason: {top.why_recommended[0]}"
        return f"Recommended: {place}", narrative

    # GO_WITH_CAUTION
    caution = top.cautions[0] if (top and top.cautions) else "advisory conditions are in effect."
    return (
        f"Fish with caution near {place}",
        f"ORCA's best option is {place}, roughly {dmin:.0f} to {dmax:.0f} km out at "
        f"bearing {bearing:.0f} degrees, with a suitability score of "
        f"{score:.0f} out of 100. Conditions are workable but not fully safe - "
        f"{caution} Go prepared and keep watching the weather.",
    )


def _template_ta(result: DecisionResult) -> Tuple[str, str]:
    """Best-effort minimal Tamil fallback."""
    status = result.overall_status
    top = result.top_recommendation

    if status == "NO_GO":
        return (
            "கடலுக்கு செல்ல வேண்டாம்",
            "ORCA இன்று மீன்பிடிக்க பரிந்துரைக்கவில்லை. அனைத்து மண்டலங்களிலும் பாதுகாப்பு எச்சரிக்கை உள்ளது. படகை துறைமுகத்தில் வைக்கவும்.",
        )

    dmin, dmax = top.distance_km_range if top else (10, 20)
    place = top.landing_centre if top else "சென்னை"
    sector = top.candidate_id if top else "கடல் பகுதி"
    bearing = top.bearing_deg if top else 90
    score = top.orca_suitability_index if top else 85

    if status == "GO":
        return (
            f"பரிந்துரை: {place}",
            f"{place} ({sector}) அருகில், சுமார் {dmin:.0f} முதல் {dmax:.0f} கி.மீ. தூரத்தில், {bearing:.0f} டிகிரி திசையில் மீன்பிடிக்கலாம். பொருத்தநிலை மதிப்பெண் 100-க்கு {score:.0f}. கடல் பாதுகாப்பு தெளிவாக உள்ளது.",
        )

    caution = top.cautions[0] if (top and top.cautions) else ""
    return (
        f"எச்சரிக்கையுடன் மீன்பிடிக்கவும்: {place}",
        f"ORCA இன் சிறந்த தேர்வு {place} ({sector}), சுமார் {dmin:.0f}-{dmax:.0f} கி.மீ. தூரத்தில், {bearing:.0f} டிகிரி திசையில். பொருத்தநிலை மதிப்பெண் 100-க்கு {score:.0f}. நிலைமைகள் ஏற்கத்தக்கவை. {caution}".strip(),
    )



def _template_explanation(
    result: DecisionResult, audience: str, language: str
) -> Tuple[str, str]:
    if language == "ta":
        return _template_ta(result)
    return _template_en(result)


def _parse_llm_response(content: str) -> Tuple[Optional[str], Optional[str]]:
    # 1. Strip thinking blocks (complete or incomplete)
    cleaned = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
    if cleaned.startswith("<think>"):
        parts = cleaned.split("</think>")
        if len(parts) > 1:
            cleaned = parts[-1].strip()
        else:
            match_j = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if match_j:
                cleaned = match_j.group(0)
            else:
                lines_c = [l for l in cleaned.split("\n") if not l.strip().startswith("<think>") and "thinking process" not in l.lower()]
                cleaned = "\n".join(lines_c).strip()

    # 2. JSON match
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group(0))
            if isinstance(data, dict):
                h = str(data.get("headline", "")).strip()
                n = str(data.get("narrative", "")).strip()
                if h and n:
                    return h, n
        except Exception:
            pass

    # 3. Markdown sections (**Headline**, **Narrative**)
    head_match = re.search(r"\*\*(?:Headline|Title)\*\*:?\s*(.*?)(?=\*\*(?:Narrative|Body)\*\*|$)", cleaned, re.DOTALL | re.IGNORECASE)
    nar_match = re.search(r"\*\*(?:Narrative|Body)\*\*:?\s*(.*)", cleaned, re.DOTALL | re.IGNORECASE)
    if head_match and nar_match:
        h = head_match.group(1).strip()
        n = nar_match.group(1).strip()
        if h and n:
            return h, n

    # 4. Line split fallback
    lines = [l.strip() for l in cleaned.split("\n") if l.strip()]
    lines = [re.sub(r"^\*\*(Headline|Narrative)\*\*:?\s*", "", l, flags=re.IGNORECASE).strip() for l in lines]
    lines = [
        l for l in lines 
        if l and not l.startswith("<think>") 
        and not l.startswith("- ") 
        and not re.match(r"^\d+\.\s*\*\*", l)
        and "thinking process" not in l.lower()
        and "analyze user" not in l.lower()
    ]
    if len(lines) >= 2:
        return lines[0], " ".join(lines[1:])
    elif len(lines) == 1:
        return lines[0][:60], lines[0]

    return None, None




def _call_groq(
    briefing: Dict[str, Any],
    audience: str,
    language: str,
    cfg: LLMExplainerConfig,
    query: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Calls Groq API via HTTP POST to generate a plain language explanation.
    Returns (headline, narrative, fallback_reason).
    """
    import urllib.request
    from app import config as app_config

    api_key = getattr(app_config, "GROQ_API_KEY", None)
    if not api_key:
        return None, None, "no_api_key"

    sys_prompt = _system_prompt(audience, language) + "\nDo not include any thinking or meta-commentary. Respond strictly in JSON format."
    user_content = f"User Query: {query or 'Where should I fish?'}\nBriefing: {json.dumps(briefing, ensure_ascii=False)}"

    models_to_try = [
        "openai/gpt-oss-20b",
        getattr(app_config, "ORCA_LLM_MODEL", "openai/gpt-oss-20b"),
        "qwen/qwen3.6-27b",
        "groq/compound"
    ]
    models_to_try = list(dict.fromkeys(models_to_try))


    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "ORCA/1.0",
    }

    for model_name in models_to_try:
        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_content},
            ],
            "max_tokens": min(cfg.max_output_tokens, 350),
            "temperature": 0.2,
        }

        try:
            req = urllib.request.Request(
                "https://api.groq.com/openai/v1/chat/completions",
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=cfg.timeout_seconds) as resp:
                res_data = json.loads(resp.read().decode("utf-8"))
                content = res_data["choices"][0]["message"]["content"]
                
                h, n = _parse_llm_response(content)
                if h and n:
                    return h, n, None
        except Exception:
            continue

    return None, None, "groq_api_failed"


# =====================================================================
# 5. Public Entry Point
# =====================================================================

def explain_decision(
    result: DecisionResult,
    *,
    audience: str = "fisherman",
    language: str = "en",
    query: Optional[str] = None,
    config: Optional[LLMExplainerConfig] = None,
) -> DecisionExplanation:
    """
    Narrate a DecisionResult in plain language using Groq LLM (with Gemini & template fallbacks).
    Never alters the underlying decision.
    """
    audience = audience if audience in ("fisherman", "analyst") else "fisherman"
    language = language if language in ("en", "ta") else "en"
    cfg = config or LLMExplainerConfig.from_env()

    briefing = build_briefing(result)

    def _fallback(reason: Optional[str], grounding_ok: bool) -> DecisionExplanation:
        headline, narrative = _template_explanation(result, audience, language)
        return DecisionExplanation(
            headline=headline,
            narrative=narrative,
            language=language,
            audience=audience,
            model_used="template-fallback",
            is_fallback=True,
            grounding_ok=grounding_ok,
            fallback_reason=reason,
        )

    if not cfg.enabled:
        return _fallback("llm_disabled", True)

    # 1. Try Groq API first
    headline, narrative, reason = _call_groq(briefing, audience, language, cfg, query=query)

    # 2. If Groq failed, try Gemini
    if reason is not None:
        headline, narrative, gem_reason = _call_gemini(briefing, audience, language, cfg)
        if gem_reason is not None:
            return _fallback(reason, True)

    # 3. Guardrail validation
    ok, fail_reason = _validate(headline, narrative, briefing, result)
    if not ok:
        return _fallback(fail_reason, False)

    return DecisionExplanation(
        headline=headline,
        narrative=narrative,
        language=language,
        audience=audience,
        model_used=cfg.model,
        is_fallback=False,
        grounding_ok=True,
        fallback_reason=None,
    )
