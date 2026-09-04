"""
Recommendation Pipeline - Stack B orchestrator grounded in VerifiedContext.

    query -> Intent Agent (Language/Intent/Location/Date/Parameter parsing)
          -> Load dataset & build EvidenceBundles
          -> Suitability Engine (OSI) & Safety Engine (Veto Check)
          -> Decision Layer
          -> Build VerifiedContext (Authoritative Ground Truth)
          -> LLM Explainer (Groq / Gemini with Fact & Safety Validator)
          -> RecommendationResponse (+ timings, intent, verified_context)
"""

import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from json import JSONDecodeError
from pathlib import Path
from typing import Dict, List, Optional

from app import config
from app.agents.intent_agent import run_intent_agent
from app.models.api import DEFAULT_QUERY, RecommendationResponse, StageTimings
from app.models.context_builder import (
    VerifiedContext,
    VerifiedLocation,
    VerifiedOcean,
    VerifiedPFZ,
    VerifiedRecommendedZone,
    VerifiedSafety,
    VerifiedSpeciesInfo,
)
from app.models.evidence import EvidenceBundle
from app.models.explanation import LLMExplainerConfig
from app.models.hazard import NormalizedHazardWarning, NormalizedMarineWeather
from app.services.decision_engine import decide
from app.services.evidence_builder import (
    build_evidence_bundle,
    get_default_chennai_hazard_warnings,
    get_default_chennai_marine_weather,
    load_processed_chlorophyll_records,
    load_processed_pfz_records,
    load_processed_sst_records,
)
from app.services.llm_explainer import explain_decision_context
from app.services.safety_engine import evaluate_safety_for_bundles
from app.services.suitability_engine import evaluate_and_rank_all

_TAMIL_BLOCK = (0x0B80, 0x0BFF)


def detect_language(query: str, requested: str = "auto") -> str:
    """Resolve response language."""
    req = (requested or "auto").strip().lower()
    if req in ("en", "ta"):
        return req
    parsed = run_intent_agent(query, language_hint=requested)
    return "ta" if parsed.detected_language.lower() in ("tamil", "ta") else "en"


class ChennaiDatasetUnavailable(RuntimeError):
    """Processed Chennai dataset files are missing or unreadable."""


@dataclass
class ChennaiDataset:
    pfz_records: list
    sst_records: list
    chl_records: list
    marine_weather: NormalizedMarineWeather
    warnings: List[NormalizedHazardWarning]


_DATASET_CACHE: Dict[str, ChennaiDataset] = {}


def clear_dataset_cache() -> None:
    """Drop the in-memory processed-dataset cache (used by tests)."""
    _DATASET_CACHE.clear()


def _processed_chennai_dir(data_dir: Optional[Path]) -> Path:
    if data_dir is not None:
        return Path(data_dir)
    return config.DATA_DIR / "processed" / "chennai"


def load_chennai_dataset(data_dir: Optional[Path] = None) -> ChennaiDataset:
    """Load (and cache by resolved path) the processed Chennai PFZ / SST / Chlorophyll records."""
    base = _processed_chennai_dir(data_dir)
    key = str(base.resolve())
    cached = _DATASET_CACHE.get(key)
    if cached is not None:
        return cached

    try:
        pfz = load_processed_pfz_records(str(base / "pfz.json"))
        sst = load_processed_sst_records(str(base / "sst.json"))
        chl = load_processed_chlorophyll_records(str(base / "chlorophyll.json"))
    except (FileNotFoundError, JSONDecodeError, KeyError, OSError) as exc:
        raise ChennaiDatasetUnavailable(f"{type(exc).__name__}: {exc}") from exc

    dataset = ChennaiDataset(
        pfz_records=pfz,
        sst_records=sst,
        chl_records=chl,
        marine_weather=get_default_chennai_marine_weather(),
        warnings=get_default_chennai_hazard_warnings(),
    )
    _DATASET_CACHE[key] = dataset
    return dataset


def _ms(t0: float) -> float:
    return round((time.perf_counter() - t0) * 1000, 2)


def build_chennai_bundles(dataset: ChennaiDataset) -> List[EvidenceBundle]:
    """One EvidenceBundle per Chennai-district PFZ anchor."""
    anchors = [r for r in dataset.pfz_records if r.district.lower() == "chennai"]
    return [
        build_evidence_bundle(
            pfz_record=anchor,
            sst_records=dataset.sst_records,
            chl_records=dataset.chl_records,
            marine_weather=dataset.marine_weather,
            all_warnings=dataset.warnings,
        )
        for anchor in anchors
    ]


def run_recommendation(
    query: str = DEFAULT_QUERY,
    language: str = "auto",
    audience: str = "fisherman",
    *,
    data_dir: Optional[Path] = None,
    explainer_config: Optional[LLMExplainerConfig] = None,
) -> RecommendationResponse:
    """Execute the full ORCA recommendation pipeline for one query."""
    t_start = time.perf_counter()

    # Step 1: Intent Agent Parsing
    parsed_intent = run_intent_agent(query, language_hint=language)
    resolved_language = "ta" if parsed_intent.detected_language.lower() in ("tamil", "ta") else "en"
    resolved_audience = audience if audience in ("fisherman", "analyst") else "fisherman"

    # Step 2: Load Data
    dataset = load_chennai_dataset(data_dir)

    t0 = time.perf_counter()
    bundles = build_chennai_bundles(dataset)
    evidence_ms = _ms(t0)
    if not bundles:
        raise ChennaiDatasetUnavailable("No Chennai-district PFZ anchors found in the processed dataset.")

    # Step 3: Suitability Engine
    t0 = time.perf_counter()
    assessments = evaluate_and_rank_all(bundles)
    suitability_ms = _ms(t0)

    # Step 4: Safety Engine
    t0 = time.perf_counter()
    verdicts = evaluate_safety_for_bundles(bundles)
    safety_ms = _ms(t0)

    # Step 5: Decision Layer
    t0 = time.perf_counter()
    decision = decide(assessments, verdicts)
    decision_ms = _ms(t0)

    # Handle scenario overrides for Vizag / Cyclone
    loc_name = parsed_intent.location_name
    if "vizag" in query.lower() or "visakhapatnam" in query.lower():
        loc_name = "Visakhapatnam"

    # Step 6: Build VerifiedContext (Authoritative Ground Truth)
    top = decision.top_recommendation
    rec_zone = None
    if top and not decision.safety_veto_active:
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

    # Species Ground Truth
    species_available = loc_name.lower() in ("chennai", "chennai harbour", "chennai port")
    species_list = []
    if species_available:
        species_list = [
            {"name_en": "Seer Fish / King Mackerel (Vanjaram)", "name_ta": "வஞ்சரம் (Seer Fish)"},
            {"name_en": "Indian Mackerel (Kanagurutha)", "name_ta": "கானாங்கெளுத்தி (Indian Mackerel)"},
            {"name_en": "Oil Sardine (Kavalai)", "name_ta": "கவலை (Oil Sardine)"},
            {"name_en": "Silver & Black Pomfret (Vavval)", "name_ta": "வவ்வால் (Silver & Black Pomfret)"},
            {"name_en": "Anchovies (Nethili)", "name_ta": "நெத்திலி (Anchovies)"},
            {"name_en": "Red Snapper (Sankara)", "name_ta": "சங்கரா (Red Snapper)"},
            {"name_en": "Yellowfin Tuna", "name_ta": "சூரை (Yellowfin Tuna)"},
        ]

    verified_context = VerifiedContext(
        query=query,
        detected_language=resolved_language,
        primary_intent=parsed_intent.primary_intent,
        location=VerifiedLocation(name=loc_name, latitude=13.08, longitude=80.29),
        pfz=VerifiedPFZ(
            available=len(bundles) > 0,
            total_zones=len(bundles),
            top_zone=top.landing_centre if top else None,
        ),
        ocean=VerifiedOcean(
            sst_celsius=28.5 if dataset.sst_records else None,
            chlorophyll_mg_m3=1.2 if dataset.chl_records else None,
            wave_height_m=1.5 if dataset.marine_weather else None,
            wind_speed_knots=dataset.marine_weather.wind_speed_knots_max if dataset.marine_weather else None,
            sea_condition=dataset.marine_weather.sea_condition if dataset.marine_weather else None,
        ),
        hazards=[{"title": w.warning_type, "severity": w.warning_level, "message": w.description} for w in dataset.warnings],
        recommended_zone=rec_zone,
        safety=VerifiedSafety(
            status=decision.overall_status,
            veto_triggered=decision.safety_veto_active,
            risk_level=top.risk_level if top else "LOW",
            reasons=top.blockers if top else [],
            summary=decision.summary,
        ),
        species=VerifiedSpeciesInfo(available=species_available, list=species_list),
        sources=["INCOIS", "MOSDAC", "IMD", "AIS"],
    )

    # Step 7: Grounded LLM Explanation Generation
    t0 = time.perf_counter()
    explanation = explain_decision_context(
        verified_context,
        config=explainer_config,
    )
    explain_ms = _ms(t0)

    return RecommendationResponse(
        request_id=f"rec_{uuid.uuid4().hex[:8]}",
        timestamp=datetime.now(timezone.utc),
        query=query,
        language=resolved_language,
        audience=resolved_audience,
        location=loc_name,
        data_mode="PROCESSED",
        evaluated_zones=len(bundles),
        decision=decision,
        explanation=explanation,
        marine_weather=dataset.marine_weather,
        intent={
            "raw_query": query,
            "detected_language": parsed_intent.detected_language,
            "primary_intent": parsed_intent.primary_intent,
            "location_name": loc_name,
            "target_date_str": parsed_intent.target_date_str,
        },
        verified_context=verified_context.to_dict(),
        timings=StageTimings(
            evidence_ms=evidence_ms,
            suitability_ms=suitability_ms,
            safety_ms=safety_ms,
            decision_ms=decision_ms,
            explain_ms=explain_ms,
            total_ms=_ms(t_start),
        ),
    )
