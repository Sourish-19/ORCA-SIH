"""
Safety Engine Service - Deterministic veto authority for ORCA.

Consumes the REAL normalized pipeline models carried in an EvidenceBundle:
- NormalizedMarineWeather  (wind/gust in knots, sea state + visibility as text,
                             optional surface-current range)
- NormalizedHazardWarning  (IMD Fishermen / RSMC Cyclone advisories, already
                             geographically filtered to the Chennai sector by the
                             Evidence Builder)

Design:
- Tri-state outcome: SAFE / CAUTION / NO_GO.
- `is_safe == (not veto_triggered)` -> a CAUTION verdict still reports is_safe=True;
  the Decision Layer decides whether to surface it with a caution flag.
- Cyclone handling is Option A (flag / attribute based). A dormant Option B hook
  (point-radius proximity) activates only when a warning carries an explicit
  `cyclone_coordinates` point. Forecast-track polyline intersection is deliberately
  not implemented for the prototype (no track data is ingested).
- Fully deterministic. No LLM. No suitability / OSI input of any kind.
"""

import re
from datetime import datetime, timezone
from typing import List, Optional

from app.models.evidence import EvidenceBundle
from app.models.hazard import NormalizedMarineWeather, NormalizedHazardWarning
from app.models.safety import SafetyConfig, SafetyFinding, SafetyVerdict
from app.services._identity import make_candidate_id
from app.services.evidence_builder import haversine_distance


# =====================================================================
# Keyword matching helper
# =====================================================================

def _keyword_present(text: str, keyword: str) -> bool:
    """
    True if `keyword` occurs in `text` (already lowercased).
    Multi-word keywords match as a substring; single words match on a token
    boundary so 'high' does not fire inside 'highly' etc.
    """
    if " " in keyword:
        return keyword in text
    return re.search(rf"\b{re.escape(keyword)}\b", text) is not None


# =====================================================================
# Marine weather findings
# =====================================================================

def _weather_findings(
    weather: NormalizedMarineWeather,
    config: SafetyConfig,
) -> List[SafetyFinding]:
    findings: List[SafetyFinding] = []
    source = weather.metadata.source if weather.metadata else "IMD"

    # --- Sustained wind (upper bound) ---
    wind_max = weather.wind_speed_knots_max
    if wind_max > config.max_safe_wind_knots:
        findings.append(SafetyFinding(
            code="WIND_MAX_EXCEEDED", severity="VETO", category="WEATHER",
            message=(
                f"Forecast wind up to {wind_max:.1f} kt exceeds the safe operating "
                f"limit of {config.max_safe_wind_knots:.1f} kt."
            ),
            source=source,
            observed_value=f"{wind_max:.1f} kt",
            threshold=f"{config.max_safe_wind_knots:.1f} kt",
        ))
    elif wind_max >= config.caution_wind_knots:
        findings.append(SafetyFinding(
            code="WIND_ELEVATED", severity="CAUTION", category="WEATHER",
            message=(
                f"Forecast wind up to {wind_max:.1f} kt is elevated "
                f"(caution at/above {config.caution_wind_knots:.1f} kt)."
            ),
            source=source,
            observed_value=f"{wind_max:.1f} kt",
            threshold=f"{config.caution_wind_knots:.1f} kt",
        ))

    # --- Gusts ---
    gust = weather.gust_speed_knots
    if gust > config.max_safe_gust_knots:
        findings.append(SafetyFinding(
            code="GUST_EXCEEDED", severity="VETO", category="WEATHER",
            message=(
                f"Gusts to {gust:.1f} kt exceed the near-gale veto threshold of "
                f"{config.max_safe_gust_knots:.1f} kt."
            ),
            source=source,
            observed_value=f"{gust:.1f} kt",
            threshold=f"{config.max_safe_gust_knots:.1f} kt",
        ))
    elif gust >= config.max_safe_wind_knots:
        findings.append(SafetyFinding(
            code="GUST_ELEVATED", severity="CAUTION", category="WEATHER",
            message=(
                f"Gusts to {gust:.1f} kt at/above {config.max_safe_wind_knots:.1f} kt; "
                f"conditions can deteriorate quickly."
            ),
            source=source,
            observed_value=f"{gust:.1f} kt",
            threshold=f"{config.max_safe_wind_knots:.1f} kt",
        ))

    # --- Sea state (text) ---
    sea = (weather.sea_condition or "").lower()
    sea_finding: Optional[SafetyFinding] = None
    for kw in config.veto_sea_keywords:
        if _keyword_present(sea, kw):
            sea_finding = SafetyFinding(
                code="ROUGH_SEA_STATE", severity="VETO", category="SEA_STATE",
                message=f"Sea state reported as '{weather.sea_condition}'.",
                source=source, observed_value=weather.sea_condition, threshold=kw,
            )
            break
    if sea_finding is None:
        for kw in config.caution_sea_keywords:
            if _keyword_present(sea, kw):
                sea_finding = SafetyFinding(
                    code="MODERATE_SEA_STATE", severity="CAUTION", category="SEA_STATE",
                    message=f"Sea state reported as '{weather.sea_condition}'.",
                    source=source, observed_value=weather.sea_condition, threshold=kw,
                )
                break
    if sea_finding is not None:
        findings.append(sea_finding)

    # --- Visibility (text): only flag when currently poor, not "becoming poor" ---
    vis = (weather.visibility or "").strip().lower()
    if vis.startswith("poor"):
        findings.append(SafetyFinding(
            code="REDUCED_VISIBILITY", severity="CAUTION", category="VISIBILITY",
            message=f"Visibility reported as '{weather.visibility}'.",
            source=source, observed_value=weather.visibility,
        ))

    # --- Surface current ---
    if weather.ocean_current_speed_m_s is not None:
        current_max = weather.ocean_current_speed_m_s[1]
        if current_max > config.caution_current_m_s:
            findings.append(SafetyFinding(
                code="STRONG_CURRENT", severity="CAUTION", category="CURRENT",
                message=(
                    f"Surface current up to {current_max:.2f} m/s exceeds "
                    f"{config.caution_current_m_s:.2f} m/s; expect drift and harder steaming."
                ),
                source=source,
                observed_value=f"{current_max:.2f} m/s",
                threshold=f"{config.caution_current_m_s:.2f} m/s",
            ))

    # --- Port signal hoisted ---
    port = (weather.port_warning or "").strip()
    if port.upper() not in {"", "NIL", "NO", "NONE", "NO WARNING"}:
        findings.append(SafetyFinding(
            code="PORT_SIGNAL_HOISTED", severity="CAUTION", category="PORT",
            message=f"Port warning signal in force: '{port}'.",
            source=source, observed_value=port,
        ))

    return findings


# =====================================================================
# Hazard warning findings
# =====================================================================

def _cyclone_proximity_finding(
    anchor_lat: float,
    anchor_lon: float,
    warning: NormalizedHazardWarning,
    config: SafetyConfig,
) -> Optional[SafetyFinding]:
    """
    Dormant Option B hook: point-radius proximity to an explicit cyclone centre.
    Returns None unless the warning carries usable `cyclone_coordinates`.
    """
    coords = warning.cyclone_coordinates
    if not coords:
        return None

    lat = coords.get("lat", coords.get("latitude"))
    lon = coords.get("lon", coords.get("longitude"))
    if lat is None or lon is None:
        return None

    dist_km = haversine_distance(anchor_lat, anchor_lon, float(lat), float(lon))
    source = warning.metadata.source if warning.metadata else "RSMC / IMD"

    if dist_km < config.cyclone_proximity_veto_km:
        return SafetyFinding(
            code="CYCLONE_PROXIMITY", severity="VETO", category="CYCLONE",
            message=(
                f"Cyclonic system centre is ~{dist_km:.0f} km away "
                f"(within {config.cyclone_proximity_veto_km:.0f} km veto radius)."
            ),
            source=source,
            observed_value=f"{dist_km:.0f} km",
            threshold=f"{config.cyclone_proximity_veto_km:.0f} km",
        )
    if dist_km < config.cyclone_proximity_caution_km:
        return SafetyFinding(
            code="CYCLONE_PROXIMITY", severity="CAUTION", category="CYCLONE",
            message=(
                f"Cyclonic system centre is ~{dist_km:.0f} km away "
                f"(within {config.cyclone_proximity_caution_km:.0f} km caution radius)."
            ),
            source=source,
            observed_value=f"{dist_km:.0f} km",
            threshold=f"{config.cyclone_proximity_caution_km:.0f} km",
        )
    return None


def _warning_findings(
    anchor_lat: float,
    anchor_lon: float,
    warning: NormalizedHazardWarning,
    config: SafetyConfig,
) -> List[SafetyFinding]:
    findings: List[SafetyFinding] = []
    source = warning.metadata.source if warning.metadata else "IMD / INCOIS"
    level = (warning.warning_level or "").upper()
    stage = (warning.cyclone_stage or "").strip().lower()

    # --- Official prohibition (fishermen advised not to venture / severe level) ---
    if warning.fishermen_advised_not_to_venture or level in config.veto_warning_levels:
        findings.append(SafetyFinding(
            code="OFFICIAL_PROHIBITION", severity="VETO", category="OFFICIAL_WARNING",
            message=(
                f"Official {warning.warning_type} for '{warning.affected_area}' "
                f"({level or 'PROHIBITION'}): {warning.description}"
            ),
            source=source, observed_value=level or None,
        ))

    # --- Active cyclonic system (flag-based; Option A) ---
    cyclone_veto = (
        warning.cyclone_active
        or warning.cyclone_warning_active
        or stage in config.veto_cyclone_stages
    )
    if cyclone_veto:
        findings.append(SafetyFinding(
            code="CYCLONE_SYSTEM", severity="VETO", category="CYCLONE",
            message=(
                f"Active cyclonic system reported for '{warning.affected_area}'"
                + (f" (stage: {warning.cyclone_stage})" if warning.cyclone_stage else "")
                + f": {warning.description}"
            ),
            source=source,
            observed_value=warning.cyclone_stage or "active",
        ))
    elif level in config.caution_warning_levels:
        findings.append(SafetyFinding(
            code="ADVISORY_WARNING", severity="CAUTION", category="OFFICIAL_WARNING",
            message=(
                f"Advisory {warning.warning_type} for '{warning.affected_area}' "
                f"({level}): {warning.description}"
            ),
            source=source, observed_value=level,
        ))

    # --- Cyclogenesis watch ---
    if (warning.seven_day_cyclogenesis_probability or "").strip().lower() not in config.benign_cyclogenesis:
        findings.append(SafetyFinding(
            code="CYCLOGENESIS_WATCH", severity="CAUTION", category="CYCLONE",
            message=(
                f"7-day cyclogenesis probability is "
                f"'{warning.seven_day_cyclogenesis_probability}' for '{warning.affected_area}'."
            ),
            source=source,
            observed_value=warning.seven_day_cyclogenesis_probability,
        ))

    # --- Dormant Option B: explicit centre proximity ---
    proximity = _cyclone_proximity_finding(anchor_lat, anchor_lon, warning, config)
    if proximity is not None:
        findings.append(proximity)

    return findings


# =====================================================================
# Freshness
# =====================================================================

def _freshness_finding(advisory_valid_until: Optional[datetime]) -> Optional[SafetyFinding]:
    if advisory_valid_until is None:
        return None

    valid_until = advisory_valid_until
    if valid_until.tzinfo is None:
        valid_until = valid_until.replace(tzinfo=timezone.utc)

    now_utc = datetime.now(timezone.utc)
    if now_utc > valid_until:
        return SafetyFinding(
            code="STALE_ADVISORY", severity="CAUTION", category="DATA_FRESHNESS",
            message=(
                f"Advisory validity window ended at "
                f"{valid_until.strftime('%Y-%m-%d %H:%M UTC')}; conditions may have changed."
            ),
            source="INCOIS / IMD",
            observed_value=valid_until.strftime("%Y-%m-%d %H:%M UTC"),
        )
    return None


# =====================================================================
# Core assessment
# =====================================================================

def assess_marine_safety(
    anchor_lat: float,
    anchor_lon: float,
    marine_weather: Optional[NormalizedMarineWeather] = None,
    warnings: Optional[List[NormalizedHazardWarning]] = None,
    advisory_valid_until: Optional[datetime] = None,
    config: Optional[SafetyConfig] = None,
    *,
    candidate_id: str = "",
    bundle_id: str = "",
    landing_centre: str = "",
) -> SafetyVerdict:
    """
    Deterministically assess marine safety for one candidate location.

    Lower-level entry point (mirrors the legacy `check_safety` separation): takes
    loose inputs so it can be unit-tested without constructing a full EvidenceBundle.
    `evaluate_safety(bundle)` is the pipeline-facing wrapper.
    """
    if config is None:
        config = SafetyConfig()
    warnings = warnings or []

    findings: List[SafetyFinding] = []
    matched_warnings: List[str] = []
    red_alert_seen = False

    # 1. Marine weather
    if marine_weather is not None:
        findings.extend(_weather_findings(marine_weather, config))
    else:
        findings.append(SafetyFinding(
            code="NO_WEATHER_DATA", severity="CAUTION", category="WEATHER",
            message="No marine weather bulletin was available for this location; verify conditions independently.",
            source="ORCA Safety Engine",
        ))

    # 2. Hazard warnings (already geo-filtered upstream by the Evidence Builder)
    for w in warnings:
        matched_warnings.append(
            f"{w.warning_type} @ {w.affected_area} ({w.warning_level})"
        )
        if (w.warning_level or "").upper() == "RED_ALERT":
            red_alert_seen = True
        findings.extend(_warning_findings(anchor_lat, anchor_lon, w, config))

    # 3. Data freshness
    freshness = _freshness_finding(advisory_valid_until)
    data_freshness_ok = freshness is None
    if freshness is not None:
        findings.append(freshness)

    # 4. Resolve verdict
    veto_findings = [f for f in findings if f.severity == "VETO"]
    caution_findings = [f for f in findings if f.severity == "CAUTION"]
    veto_triggered = len(veto_findings) > 0

    if veto_triggered:
        status = "NO_GO"
        cyclone_veto = any(f.category == "CYCLONE" for f in veto_findings)
        risk_level = "SEVERE" if (cyclone_veto or red_alert_seen) else "HIGH"
    elif caution_findings:
        status = "CAUTION"
        risk_level = "MODERATE"
    else:
        status = "SAFE"
        risk_level = "LOW"

    is_safe = not veto_triggered

    if status == "NO_GO":
        summary = (
            f"NO-GO: {len(veto_findings)} critical safety factor(s). "
            f"{veto_findings[0].message}"
        )
    elif status == "CAUTION":
        summary = f"CAUTION: proceed with care. {caution_findings[0].message}"
    else:
        summary = "Marine conditions are within safe operating thresholds for coastal craft."

    return SafetyVerdict(
        candidate_id=candidate_id,
        bundle_id=bundle_id,
        landing_centre=landing_centre,
        latitude=anchor_lat,
        longitude=anchor_lon,
        status=status,
        is_safe=is_safe,
        veto_triggered=veto_triggered,
        risk_level=risk_level,
        findings=findings,
        veto_reasons=[f.message for f in veto_findings],
        caution_reasons=[f.message for f in caution_findings],
        matched_warnings=matched_warnings,
        data_freshness_ok=data_freshness_ok,
        safety_summary=summary,
        methodology_name=config.methodology_name,
        methodology_version=config.methodology_version,
        is_synthetic=False,
    )


# =====================================================================
# Pipeline-facing wrappers
# =====================================================================

def evaluate_safety(
    bundle: EvidenceBundle,
    config: Optional[SafetyConfig] = None,
) -> SafetyVerdict:
    """
    Evaluate marine safety for a single EvidenceBundle.
    Unpacks the PFZ anchor, marine weather and (already geo-filtered) hazard
    warnings and delegates to `assess_marine_safety`. Emits a `candidate_id`
    identical to the one the Suitability Engine puts on its SuitabilityAssessment,
    so the Decision Layer can join the two.
    """
    pfz = bundle.pfz
    return assess_marine_safety(
        anchor_lat=pfz.latitude_dd,
        anchor_lon=pfz.longitude_dd,
        marine_weather=bundle.marine_weather,
        warnings=bundle.applicable_warnings,
        advisory_valid_until=pfz.metadata.validity_end if pfz.metadata else None,
        config=config,
        candidate_id=make_candidate_id(pfz),
        bundle_id=bundle.bundle_id,
        landing_centre=pfz.landing_centre,
    )


def evaluate_safety_for_bundles(
    bundles: List[EvidenceBundle],
    config: Optional[SafetyConfig] = None,
) -> List[SafetyVerdict]:
    """Evaluate marine safety for many EvidenceBundles, preserving input order."""
    return [evaluate_safety(b, config) for b in bundles]
