"""
ORCA Services Package
"""

from app.services.evidence_builder import (
    haversine_distance,
    find_nearest_valid_sst,
    find_nearest_valid_chlorophyll,
    is_warning_geographically_relevant,
    build_evidence_bundle,
    load_processed_pfz_records,
    load_processed_sst_records,
    load_processed_chlorophyll_records,
    get_default_chennai_marine_weather,
    get_default_chennai_hazard_warnings
)

from app.services.suitability_engine import (
    evaluate_evidence_bundle,
    rank_suitability_assessments,
    evaluate_and_rank_all
)

from app.services.safety_engine import (
    assess_marine_safety,
    evaluate_safety,
    evaluate_safety_for_bundles
)

from app.services.decision_engine import (
    decide,
    decide_from_bundles
)

from app.services.llm_explainer import (
    explain_decision,
    build_briefing
)

from app.services.pipeline import (
    run_recommendation,
    load_chennai_dataset,
    build_chennai_bundles,
    detect_language,
    clear_dataset_cache,
    ChennaiDatasetUnavailable
)

from app.services._identity import make_candidate_id

__all__ = [
    "haversine_distance",
    "find_nearest_valid_sst",
    "find_nearest_valid_chlorophyll",
    "is_warning_geographically_relevant",
    "build_evidence_bundle",
    "load_processed_pfz_records",
    "load_processed_sst_records",
    "load_processed_chlorophyll_records",
    "get_default_chennai_marine_weather",
    "get_default_chennai_hazard_warnings",
    "evaluate_evidence_bundle",
    "rank_suitability_assessments",
    "evaluate_and_rank_all",
    "assess_marine_safety",
    "evaluate_safety",
    "evaluate_safety_for_bundles",
    "decide",
    "decide_from_bundles",
    "explain_decision",
    "build_briefing",
    "run_recommendation",
    "load_chennai_dataset",
    "build_chennai_bundles",
    "detect_language",
    "clear_dataset_cache",
    "ChennaiDatasetUnavailable",
    "make_candidate_id"
]
