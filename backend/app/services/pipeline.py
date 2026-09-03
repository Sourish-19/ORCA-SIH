"""
Recommendation Pipeline - the Stack B orchestrator.

    query -> (language/audience resolve)
          -> load processed Chennai dataset (cached)
          -> EvidenceBundle per Chennai PFZ anchor
          -> Suitability Engine  (OSI, ranked)
          -> Safety Engine       (SafetyVerdict per anchor)
          -> Decision Layer      (DecisionResult - ranked, safety-vetoed)
          -> LLM Explainer        (DecisionExplanation - narration, with fallback)
          -> RecommendationResponse (+ per-stage timings)

Fully synchronous and deterministic except the single LLM call (which self-falls
back to a template). The FastAPI route runs the whole thing in a threadpool.

Prototype scope: Chennai only. No NL intent extraction - the query is echoed and
used by the explainer for tone; language is auto-detected from Tamil script.
"""

import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from json import JSONDecodeError
from pathlib import Path
from typing import Dict, List, Optional

from app import config
from app.models.api import DEFAULT_QUERY, RecommendationResponse, StageTimings
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
from app.services.llm_explainer import explain_decision
from app.services.safety_engine import evaluate_safety_for_bundles
from app.services.suitability_engine import evaluate_and_rank_all

_TAMIL_BLOCK = (0x0B80, 0x0BFF)


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
    """Load (and cache by resolved path) the processed Chennai PFZ / SST / Chlorophyll
    records plus the default IMD marine weather and hazard warnings."""
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


def detect_language(query: str, requested: str = "auto") -> str:
    """Resolve the response language. Explicit 'en'/'ta' wins; 'auto' (or anything
    else) detects Tamil script in the query, defaulting to English."""
    req = (requested or "auto").strip().lower()
    if req in ("en", "ta"):
        return req
    for ch in query or "":
        if _TAMIL_BLOCK[0] <= ord(ch) <= _TAMIL_BLOCK[1]:
            return "ta"
    return "en"


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
    """Execute the full Chennai recommendation pipeline for one query."""
    t_start = time.perf_counter()

    resolved_language = detect_language(query, language)
    resolved_audience = audience if audience in ("fisherman", "analyst") else "fisherman"

    dataset = load_chennai_dataset(data_dir)

    t0 = time.perf_counter()
    bundles = build_chennai_bundles(dataset)
    evidence_ms = _ms(t0)
    if not bundles:
        raise ChennaiDatasetUnavailable("No Chennai-district PFZ anchors found in the processed dataset.")

    t0 = time.perf_counter()
    assessments = evaluate_and_rank_all(bundles)
    suitability_ms = _ms(t0)

    t0 = time.perf_counter()
    verdicts = evaluate_safety_for_bundles(bundles)
    safety_ms = _ms(t0)

    t0 = time.perf_counter()
    decision = decide(assessments, verdicts)
    decision_ms = _ms(t0)

    t0 = time.perf_counter()
    explanation = explain_decision(
        decision,
        audience=resolved_audience,
        language=resolved_language,
        config=explainer_config,
    )
    explain_ms = _ms(t0)

    return RecommendationResponse(
        request_id=f"rec_{uuid.uuid4().hex[:8]}",
        timestamp=datetime.now(timezone.utc),
        query=query,
        language=resolved_language,
        audience=resolved_audience,
        location="Chennai",
        data_mode="PROCESSED",
        evaluated_zones=len(bundles),
        decision=decision,
        explanation=explanation,
        marine_weather=dataset.marine_weather,
        timings=StageTimings(
            evidence_ms=evidence_ms,
            suitability_ms=suitability_ms,
            safety_ms=safety_ms,
            decision_ms=decision_ms,
            explain_ms=explain_ms,
            total_ms=_ms(t_start),
        ),
    )
