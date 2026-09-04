/**
 * Wire types for POST /api/recommend (ORCA Stack B).
 * Mirrors backend/app/models/api.py + the embedded DecisionResult / SafetyVerdict /
 * SuitabilityAssessment. Only the fields the adapter reads are typed precisely.
 */

export type OverallStatus = 'GO' | 'GO_WITH_CAUTION' | 'NO_GO';
export type LocationDecisionKind = 'RECOMMENDED' | 'RECOMMENDED_WITH_CAUTION' | 'NOT_RECOMMENDED';
export type SafetyStatus = 'SAFE' | 'CAUTION' | 'NO_GO' | 'UNKNOWN';
export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE' | 'UNKNOWN';

export interface RecSafetyFinding {
  code: string;
  severity: 'CAUTION' | 'VETO';
  category: string;
  message: string;
  source: string;
  observed_value: string | null;
  threshold: string | null;
}

export interface RecSafetyVerdict {
  candidate_id: string;
  bundle_id: string;
  landing_centre: string;
  latitude: number;
  longitude: number;
  status: SafetyStatus;
  is_safe: boolean;
  veto_triggered: boolean;
  risk_level: RiskLevel;
  findings: RecSafetyFinding[];
  veto_reasons: string[];
  caution_reasons: string[];
  matched_warnings: string[];
  data_freshness_ok: boolean;
  safety_summary: string;
}

export interface RecComponentEvidence {
  pfz_base_score: number;
  chlorophyll_score: number;
  chlorophyll_raw_score: number;
  chlorophyll_value: number | null;
  chlorophyll_distance_km: number | null;
  sst_score: number;
  sst_raw_score: number;
  sst_value_celsius: number | null;
  sst_distance_km: number | null;
  accessibility_score: number;
  distance_km: number;
}

export interface RecSuitabilityAssessment {
  candidate_id: string;
  landing_centre: string;
  latitude: number;
  longitude: number;
  bearing_deg: number;
  distance_km_range: [number, number];
  depth_m_range: [number, number];
  orca_suitability_index: number;
  suitability_level: string;
  component_evidence: RecComponentEvidence;
  supporting_factors: string[];
  limiting_factors: string[];
  explanation_facts: string[];
  methodology_name: string;
  methodology_version: string;
  data_freshness: Record<string, string>;
  limitations: string[];
}

export interface RecLocationDecision {
  candidate_id: string;
  landing_centre: string;
  latitude: number;
  longitude: number;
  bearing_deg: number;
  distance_km_range: [number, number];
  depth_m_range: [number, number];
  decision: LocationDecisionKind;
  is_recommended: boolean;
  rank: number | null;
  safety_status: SafetyStatus;
  orca_suitability_index: number;
  suitability_level: string;
  risk_level: RiskLevel;
  headline: string;
  why_recommended: string[];
  cautions: string[];
  blockers: string[];
  limiting_factors: string[];
  data_freshness_ok: boolean;
  suitability: RecSuitabilityAssessment;
  safety: RecSafetyVerdict | null;
}

export interface RecDecisionResult {
  overall_status: OverallStatus;
  safety_veto_active: boolean;
  summary: string;
  recommendations: RecLocationDecision[];
  top_recommendation: RecLocationDecision | null;
  all_decisions: RecLocationDecision[];
  suppressed: RecLocationDecision[];
  evaluated_count: number;
  recommended_count: number;
  suppressed_count: number;
  unmatched_candidate_ids: string[];
  any_stale_data: boolean;
  methodology_name: string;
  methodology_version: string;
  decided_at: string;
}

export interface RecDecisionExplanation {
  headline: string;
  narrative: string;
  language: 'en' | 'ta';
  audience: 'fisherman' | 'analyst';
  model_used: string;
  is_fallback: boolean;
  grounding_ok: boolean;
  fallback_reason: string | null;
}

export interface RecStageTimings {
  evidence_ms: number;
  suitability_ms: number;
  safety_ms: number;
  decision_ms: number;
  explain_ms: number;
  total_ms: number;
}

export interface RecMarineWeather {
  coastal_sector: string;
  wind_direction: string;
  wind_speed_knots_min: number;
  wind_speed_knots_max: number;
  gust_speed_knots: number;
  sea_condition: string;
  weather_condition: string;
  visibility: string;
  port_warning: string;
  ocean_current_speed_m_s: [number, number] | null;
}

export interface RecommendationResponse {
  request_id: string;
  timestamp: string;
  query: string;
  language: 'en' | 'ta';
  audience: 'fisherman' | 'analyst';
  location: string;
  data_mode: string;
  evaluated_zones: number;
  decision: RecDecisionResult;
  explanation: RecDecisionExplanation;
  timings: RecStageTimings;
  marine_weather: RecMarineWeather | null;
  intent?: { primary_intent?: string; detected_language?: string; location_name?: string };
  verified_context?: Record<string, any>;
}
