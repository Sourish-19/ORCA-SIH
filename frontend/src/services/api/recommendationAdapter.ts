/**
 * Adapter: POST /api/recommend (RecommendationResponse, Stack B)
 *       -> ORCAResponse (Stack A shape the existing components already render)
 *
 * `decision` stays the source of truth; this only reshapes it. Fields with no
 * Stack B equivalent (intent, nearest_landing_centre, evidence_trail, agent_traces)
 * are synthesised from real pipeline data and are presentation shims, not outputs.
 */

import {
  ORCAResponse,
  PFZCandidateZone,
  SuitabilityBreakdown,
  SafetyEvaluation,
  EvidenceRecord,
  AgentStepTrace,
  MarineWeather,
  LandingCentre,
  StructuredIntent,
} from '../../types';
import {
  RecommendationResponse,
  RecDecisionResult,
  RecLocationDecision,
  RecSafetyVerdict,
  RecMarineWeather,
  RiskLevel,
} from '../../types/recommendation';

const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const mid = ([a, b]: [number, number]): number => Math.round(((a + b) / 2) * 10) / 10;

const RISK_MAP: Record<RiskLevel, SafetyEvaluation['risk_level']> = {
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  SEVERE: 'SEVERE',
  UNKNOWN: 'MODERATE',
};

function mapZone(d: RecLocationDecision, ts: string): PFZCandidateZone {
  const validUntil = new Date(new Date(ts).getTime() + 24 * 3600 * 1000).toISOString();
  return {
    zone_id: d.candidate_id,
    sector_name: d.landing_centre,
    center_lat: d.latitude,
    center_lon: d.longitude,
    depth_m: mid(d.depth_m_range),
    bearing_deg: d.bearing_deg,
    distance_km: mid(d.distance_km_range),
    nearest_landing_centre: d.landing_centre,
    valid_from: ts,
    valid_until: validUntil,
    strength_score: d.orca_suitability_index,
    source: 'INCOIS',
    fetched_at: ts,
  };
}

function pickPrimary(dec: RecDecisionResult): RecLocationDecision | null {
  return dec.top_recommendation ?? dec.all_decisions[0] ?? dec.suppressed[0] ?? null;
}

function mapSafety(dec: RecDecisionResult): SafetyEvaluation {
  const src = pickPrimary(dec);
  const sv: RecSafetyVerdict | null = src?.safety ?? null;
  const vetoed = dec.safety_veto_active || Boolean(sv?.veto_triggered);
  const vetoReasons =
    sv && sv.veto_reasons.length > 0 ? sv.veto_reasons : src?.blockers ?? [];
  return {
    is_safe: !vetoed,
    veto_triggered: vetoed,
    risk_level: RISK_MAP[sv?.risk_level ?? 'MODERATE'] ?? 'MODERATE',
    veto_reasons: vetoReasons,
    warnings_found: [],
    freshness_acceptable: sv?.data_freshness_ok ?? true,
    safety_summary: sv?.safety_summary ?? dec.summary,
  };
}

function mapSuitability(top: RecLocationDecision | null): SuitabilityBreakdown | undefined {
  if (!top) return undefined;
  const ce = top.suitability.component_evidence;
  return {
    zone_id: top.candidate_id,
    total_score: top.orca_suitability_index,
    pfz_contribution: ce.pfz_base_score,
    chlorophyll_contribution: ce.chlorophyll_score,
    sst_contribution: ce.sst_score,
    accessibility_contribution: ce.accessibility_score,
    // wind_contribution / wave_contribution intentionally omitted - OSI has no such term.
    formula_explanation:
      'OSI = PFZ baseline (50) + Chlorophyll (0-25) + SST (0-15) + Accessibility (0-10)',
  };
}

const SEA_STATE_METRES: Array<[string, number]> = [
  ['phenomenal', 6.0],
  ['very rough', 3.5],
  ['high', 4.5],
  ['moderate to rough', 2.0],
  ['rough', 2.6],
  ['slight to moderate', 1.1],
  ['moderate', 1.4],
  ['slight', 0.8],
];

function mapWeather(w: RecMarineWeather | null): MarineWeather | undefined {
  if (!w) return undefined;
  const sea = (w.sea_condition || '').toLowerCase();
  const waveEntry = SEA_STATE_METRES.find(([k]) => sea.includes(k));
  return {
    timestamp: new Date().toISOString(),
    location_name: w.coastal_sector,
    latitude: 13.08,
    longitude: 80.29,
    wind_speed_knots:
      Math.round(((w.wind_speed_knots_min + w.wind_speed_knots_max) / 2) * 10) / 10,
    wind_direction_deg: 0,
    wave_height_m: waveEntry ? waveEntry[1] : 1.5,
    wave_period_sec: 7,
    visibility_km: /poor/i.test(w.visibility) ? 4 : 10,
    valid_until: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
    source: 'IMD',
  };
}

function mapEvidence(src: RecLocationDecision | null, ts: string): EvidenceRecord[] {
  if (!src) return [];
  const out: EvidenceRecord[] = [];
  let i = 0;
  const push = (agent: string, source: string, type: string, claim: string, conf: number) =>
    out.push({
      id: `ev-${i++}`,
      agent_name: agent,
      source_name: source,
      record_type: type,
      claim,
      timestamp: ts,
      freshness_hours: 0,
      data_mode: 'CACHED',
      confidence_score: conf,
    });

  src.suitability.explanation_facts.forEach((f) =>
    push('Suitability Engine', src.suitability.methodology_name, 'SUITABILITY_FACT', f, 0.9),
  );
  src.suitability.supporting_factors.forEach((f) =>
    push('Suitability Engine', 'INCOIS / Copernicus', 'SUPPORTING_FACTOR', f, 0.85),
  );
  (src.safety?.findings ?? []).forEach((fnd) =>
    push('Safety Engine', fnd.source, `SAFETY_${fnd.severity}`, fnd.message, 0.9),
  );
  return out;
}

function mapTraces(rec: RecommendationResponse): AgentStepTrace[] {
  const t = rec.timings;
  const ts = rec.timestamp;
  const vetoed = rec.decision.safety_veto_active;
  const top = rec.decision.top_recommendation;
  return [
    {
      step_id: 1,
      agent_name: 'Evidence Builder',
      action: 'Fuse INCOIS PFZ + Copernicus SST/Chlorophyll + IMD weather & warnings',
      status: 'SUCCESS',
      duration_ms: t.evidence_ms,
      timestamp: ts,
      summary: `Built ${rec.evaluated_zones} evidence bundles for Chennai PFZ anchors.`,
    },
    {
      step_id: 2,
      agent_name: 'Suitability Engine',
      action: 'Compute the ORCA Suitability Index (OSI)',
      status: 'SUCCESS',
      duration_ms: t.suitability_ms,
      timestamp: ts,
      summary: top
        ? `Top OSI ${top.orca_suitability_index.toFixed(0)}/100 at ${top.landing_centre}.`
        : 'Scored all candidate zones.',
    },
    {
      step_id: 3,
      agent_name: 'Safety Engine',
      action: 'Deterministic veto check (wind, sea state, warnings, cyclone, freshness)',
      status: vetoed ? 'VETO' : 'SUCCESS',
      duration_ms: t.safety_ms,
      timestamp: ts,
      summary: mapSafety(rec.decision).safety_summary,
    },
    {
      step_id: 4,
      agent_name: 'Decision Layer',
      action: 'Merge suitability + safety, apply safety veto, rank',
      status: vetoed ? 'VETO' : 'SUCCESS',
      duration_ms: t.decision_ms,
      timestamp: ts,
      summary: rec.decision.summary,
    },
    {
      step_id: 5,
      agent_name: 'LLM Explainer',
      action: 'Generate the plain-language explanation',
      status: 'SUCCESS',
      duration_ms: t.explain_ms,
      timestamp: ts,
      summary: `${rec.explanation.model_used}${rec.explanation.is_fallback ? ' (template fallback)' : ''}`,
    },
  ];
}

export function adaptToORCAResponse(rec: RecommendationResponse): ORCAResponse {
  const dec = rec.decision;
  const isVeto = dec.overall_status === 'NO_GO' || dec.safety_veto_active;
  const top = isVeto ? null : dec.top_recommendation;
  const ts = rec.timestamp;

  const intent: StructuredIntent = {
    raw_query: rec.query,
    detected_language: rec.language,
    primary_intent: 'FISHING_RECOMMENDATION',
    location_name: rec.location,
    target_date_str: 'tomorrow',
    target_datetime: ts,
    activity: 'FISHING',
    radius_km: 50,
  };

  const nearest: LandingCentre | undefined = top
    ? {
        id: slug(top.landing_centre),
        name: top.landing_centre,
        district: 'Chennai',
        state: 'Tamil Nadu',
        latitude: top.latitude,
        longitude: top.longitude,
        facilities: [],
      }
    : undefined;

  return {
    request_id: rec.request_id,
    timestamp: ts,
    query: rec.query,
    intent,
    data_mode: 'CACHED', // pre-processed static datasets, not real-time
    overall_confidence: isVeto ? 0.95 : dec.overall_status === 'GO' ? 0.9 : 0.82,
    safety: mapSafety(dec),
    top_recommendation: top ? mapZone(top, ts) : undefined,
    suitability_breakdown: mapSuitability(top),
    candidate_zones: isVeto ? [] : dec.recommendations.map((d) => mapZone(d, ts)),
    nearest_landing_centre: nearest,
    weather_summary: mapWeather(rec.marine_weather),
    synthesized_answer: `${rec.explanation.headline}\n\n${rec.explanation.narrative}`,
    audio_narrative_text: rec.explanation.narrative,
    evidence_trail: mapEvidence(pickPrimary(dec), ts),
    agent_traces: mapTraces(rec),
  };
}
