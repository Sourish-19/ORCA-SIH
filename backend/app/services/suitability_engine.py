"""
Suitability Engine Service - Deterministic evaluation and ranking for ORCA.

Implements the ORCA Suitability Index (OSI):
OSI = PFZ_baseline (50) + Chlorophyll (0-25) + SST (0-15) + Accessibility (0-10) - spatial penalties.

Strict separation of concerns:
- OSI measures environmental corroboration + operational accessibility.
- It does NOT predict fish abundance, biomass, or catch probability.
- It does NOT consume safety scores, warnings, or make safety decisions.
"""

from datetime import datetime, date
from typing import List, Optional, Tuple, Dict, Any

from app.models.evidence import EvidenceBundle
from app.models.suitability import (
    SuitabilityConfig,
    ComponentEvidence,
    SuitabilityAssessment
)
from app.services._identity import make_candidate_id


def evaluate_evidence_bundle(
    bundle: EvidenceBundle,
    config: Optional[SuitabilityConfig] = None
) -> SuitabilityAssessment:
    """
    Deterministically evaluate an EvidenceBundle to compute the ORCA Suitability Index (OSI).
    """
    if config is None:
        config = SuitabilityConfig()

    supporting_factors: List[str] = []
    limiting_factors: List[str] = []
    explanation_facts: List[str] = []

    # -----------------------------------------------------------------
    # 1. Base INCOIS PFZ Component (50.0 pts)
    # -----------------------------------------------------------------
    s_pfz = config.pfz_base_score
    supporting_factors.append(
        f"Official INCOIS {bundle.pfz.sector_id} Potential Fishing Zone advisory active."
    )
    explanation_facts.append(
        f"INCOIS PFZ advisory valid from {bundle.pfz.metadata.validity_start.strftime('%Y-%m-%d %H:%M UTC') if bundle.pfz.metadata.validity_start else 'N/A'} "
        f"to {bundle.pfz.metadata.validity_end.strftime('%Y-%m-%d %H:%M UTC') if bundle.pfz.metadata.validity_end else 'N/A'}."
    )
    explanation_facts.append(
        f"Zone parameters: Bearing {bundle.pfz.bearing_deg}°, Distance {bundle.pfz.distance_range_km[0]}-{bundle.pfz.distance_range_km[1]} km, "
        f"Depth {bundle.pfz.depth_range_m[0]}-{bundle.pfz.depth_range_m[1]} m."
    )

    # -----------------------------------------------------------------
    # 2. Chlorophyll-a Component (0 - 25.0 pts)
    # -----------------------------------------------------------------
    chl_val: Optional[float] = None
    chl_dist_km: Optional[float] = None
    chl_raw_score = 0.0
    s_chl = 0.0

    if bundle.chlorophyll.record is not None and not bundle.chlorophyll.record.is_land_masked:
        chl_val = bundle.chlorophyll.record.chlorophyll_value
        if chl_val is not None:
            if config.chl_optimal_min <= chl_val <= config.chl_optimal_max:
                chl_raw_score = config.chl_optimal_score
                supporting_factors.append(
                    f"Optimal chlorophyll-a concentration ({chl_val:.4f} mg/m3) indicating favorable phytoplankton productivity."
                )
            elif (config.chl_moderate_low_min <= chl_val < config.chl_optimal_min) or (config.chl_optimal_max < chl_val <= config.chl_moderate_high_max):
                chl_raw_score = config.chl_moderate_score
                supporting_factors.append(
                    f"Moderate chlorophyll-a concentration ({chl_val:.4f} mg/m3)."
                )
            else:
                chl_raw_score = config.chl_marginal_score
                limiting_factors.append(
                    f"Chlorophyll-a concentration ({chl_val:.4f} mg/m3) outside optimal pelagic range."
                )

            # Spatial match distance scaling
            if bundle.chlorophyll.spatial_match is not None:
                chl_dist_km = bundle.chlorophyll.spatial_match.distance_km
                if chl_dist_km <= config.chl_penalty_distance_threshold_km:
                    chl_mult = 1.0
                else:
                    excess = chl_dist_km - config.chl_penalty_distance_threshold_km
                    chl_mult = max(0.5, 1.0 - (excess / 25.0))
            else:
                chl_mult = 1.0

            s_chl = round(chl_raw_score * chl_mult, 2)
            explanation_facts.append(
                f"Matched Chlorophyll-a: {chl_val:.4f} mg/m3 at {chl_dist_km if chl_dist_km is not None else 0.0:.2f} km distance."
            )
        else:
            limiting_factors.append("Chlorophyll measurement is null/masked.")
    else:
        limiting_factors.append("Satellite Chlorophyll-a observation unavailable within search radius.")

    # -----------------------------------------------------------------
    # 3. Sea Surface Temperature Component (0 - 15.0 pts)
    # -----------------------------------------------------------------
    sst_val: Optional[float] = None
    sst_dist_km: Optional[float] = None
    sst_raw_score = 0.0
    s_sst = 0.0

    if bundle.sst.record is not None and not bundle.sst.record.is_land_masked:
        sst_val = bundle.sst.record.sst_celsius
        if sst_val is not None:
            if config.sst_optimal_min <= sst_val <= config.sst_optimal_max:
                sst_raw_score = config.sst_optimal_score
                supporting_factors.append(
                    f"Optimal sea surface temperature ({sst_val:.2f} °C) matching pelagic thermal preference."
                )
            elif (config.sst_acceptable_min <= sst_val < config.sst_optimal_min) or (config.sst_optimal_max < sst_val <= config.sst_acceptable_max):
                sst_raw_score = config.sst_acceptable_score
                supporting_factors.append(
                    f"Acceptable sea surface temperature ({sst_val:.2f} °C)."
                )
            else:
                sst_raw_score = config.sst_marginal_score
                limiting_factors.append(
                    f"Sea surface temperature ({sst_val:.2f} °C) deviates from optimal coastal band."
                )

            # Spatial match distance scaling
            if bundle.sst.spatial_match is not None:
                sst_dist_km = bundle.sst.spatial_match.distance_km
                if sst_dist_km <= config.sst_penalty_distance_threshold_km:
                    sst_mult = 1.0
                else:
                    excess = sst_dist_km - config.sst_penalty_distance_threshold_km
                    sst_mult = max(0.5, 1.0 - (excess / 45.0))
            else:
                sst_mult = 1.0

            s_sst = round(sst_raw_score * sst_mult, 2)
            explanation_facts.append(
                f"Matched SST: {sst_val:.2f} °C at {sst_dist_km if sst_dist_km is not None else 0.0:.2f} km distance."
            )
        else:
            limiting_factors.append("SST measurement is null/masked.")
    else:
        limiting_factors.append("Satellite SST observation unavailable within search radius.")

    # -----------------------------------------------------------------
    # 4. Operational Accessibility Component (0 - 10.0 pts)
    # -----------------------------------------------------------------
    d_min, d_max = bundle.pfz.distance_range_km
    d_avg = round((d_min + d_max) / 2.0, 2)

    if d_avg <= config.access_near_max_km:
        s_access = config.access_near_score
        supporting_factors.append(
            f"Inshore location ({d_avg:.1f} km from landing centre) highly accessible for small/artisanal craft."
        )
    elif d_avg <= config.access_mid_max_km:
        s_access = config.access_mid_score
        supporting_factors.append(
            f"Moderate offshore distance ({d_avg:.1f} km from landing centre) suitable for motorized craft."
        )
    else:
        s_access = config.access_far_score
        limiting_factors.append(
            f"Offshore distance ({d_avg:.1f} km from landing centre) requires mechanized craft or extended steaming."
        )

    # -----------------------------------------------------------------
    # 5. Total ORCA Suitability Index (OSI) & Categorization
    # -----------------------------------------------------------------
    raw_osi = round(s_pfz + s_chl + s_sst + s_access, 1)
    osi = min(100.0, max(0.0, raw_osi))

    if osi >= 80.0:
        level = "HIGH"
    elif osi >= 65.0:
        level = "MODERATE"
    elif osi >= 50.0:
        level = "BASELINE_PFZ"
    else:
        level = "LOW"

    # Explicit limitations statement
    limitations = [
        "ORCA Suitability Index (OSI) represents environmental corroboration and accessibility, NOT fish abundance or guaranteed catch.",
        "SST represents satellite skin temperature, not subsurface mixed-layer depth.",
        "Thresholds are based on ORCA Prototype Environmental Heuristics v1 for the Coromandel Coast."
    ]

    component_evidence = ComponentEvidence(
        pfz_base_score=s_pfz,
        chlorophyll_score=s_chl,
        chlorophyll_raw_score=chl_raw_score,
        chlorophyll_value=chl_val,
        chlorophyll_distance_km=chl_dist_km,
        sst_score=s_sst,
        sst_raw_score=sst_raw_score,
        sst_value_celsius=sst_val,
        sst_distance_km=sst_dist_km,
        accessibility_score=s_access,
        distance_km=d_avg
    )

    candidate_id = make_candidate_id(bundle.pfz)

    return SuitabilityAssessment(
        candidate_id=candidate_id,
        landing_centre=bundle.pfz.landing_centre,
        latitude=bundle.pfz.latitude_dd,
        longitude=bundle.pfz.longitude_dd,
        bearing_deg=bundle.pfz.bearing_deg,
        distance_km_range=bundle.pfz.distance_range_km,
        depth_m_range=bundle.pfz.depth_range_m,
        orca_suitability_index=osi,
        suitability_level=level,
        component_evidence=component_evidence,
        supporting_factors=supporting_factors,
        limiting_factors=limiting_factors,
        explanation_facts=explanation_facts,
        methodology_name=config.methodology_name,
        methodology_version=config.methodology_version,
        data_freshness=bundle.freshness_summary,
        limitations=limitations,
        is_synthetic=False
    )


def rank_suitability_assessments(
    assessments: List[SuitabilityAssessment]
) -> List[SuitabilityAssessment]:
    """
    Deterministically rank a list of SuitabilityAssessments.
    Primary sort: orca_suitability_index (Descending)
    Secondary sort: distance_km midpoint (Ascending - closer preferred)
    Tertiary sort: candidate_id (Ascending - deterministic tie-breaker)
    """
    return sorted(
        assessments,
        key=lambda a: (
            -a.orca_suitability_index,
            (a.distance_km_range[0] + a.distance_km_range[1]) / 2.0,
            a.candidate_id
        )
    )


def evaluate_and_rank_all(
    bundles: List[EvidenceBundle],
    config: Optional[SuitabilityConfig] = None
) -> List[SuitabilityAssessment]:
    """
    Evaluate all EvidenceBundles and return deterministically ranked assessments.
    """
    assessments = [evaluate_evidence_bundle(b, config) for b in bundles]
    return rank_suitability_assessments(assessments)
