"""
VerifiedContext Model & Builder
Authoritative ground truth object passed to the LLM Language Generation Layer.
No LLM is allowed to introduce numerical or factual claims outside of VerifiedContext.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class VerifiedLocation:
    name: str
    latitude: float
    longitude: float


@dataclass
class VerifiedPFZ:
    available: bool
    total_zones: int
    top_zone: Optional[str] = None


@dataclass
class VerifiedOcean:
    sst_celsius: Optional[float] = None
    chlorophyll_mg_m3: Optional[float] = None
    wave_height_m: Optional[float] = None
    wind_speed_knots: Optional[float] = None
    wind_direction_deg: Optional[float] = None
    visibility_km: Optional[float] = None
    sea_condition: Optional[str] = None


@dataclass
class VerifiedRecommendedZone:
    name: str
    distance_km_min: float
    distance_km_max: float
    bearing_deg: float
    depth_m_min: float
    depth_m_max: float
    suitability_score: float
    reasons: List[str] = field(default_factory=list)
    cautions: List[str] = field(default_factory=list)


@dataclass
class VerifiedSafety:
    status: str  # "GO", "GO_WITH_CAUTION", "NO_GO"
    veto_triggered: bool
    risk_level: str
    reasons: List[str] = field(default_factory=list)
    summary: str = ""


@dataclass
class VerifiedSpeciesInfo:
    available: bool
    list: List[Dict[str, str]] = field(default_factory=list)


@dataclass
class VerifiedContext:
    query: str
    detected_language: str  # "en" or "ta"
    primary_intent: str  # "FISHING_RECOMMENDATION", "SPECIES_INQUIRY", "SAFETY_INQUIRY", "PARAMETER_INQUIRY", "HAZARD_INQUIRY"
    location: VerifiedLocation
    pfz: VerifiedPFZ
    ocean: VerifiedOcean
    hazards: List[Dict[str, str]] = field(default_factory=list)
    vessels: List[Dict[str, Any]] = field(default_factory=list)
    recommended_zone: Optional[VerifiedRecommendedZone] = None
    safety: VerifiedSafety = field(default_factory=lambda: VerifiedSafety(status="GO", veto_triggered=False, risk_level="LOW"))
    species: VerifiedSpeciesInfo = field(default_factory=lambda: VerifiedSpeciesInfo(available=False, list=[]))
    sources: List[str] = field(default_factory=lambda: ["INCOIS", "MOSDAC", "IMD", "AIS"])

    def to_dict(self) -> Dict[str, Any]:
        """Convert to a JSON-serializable dictionary for LLM briefing."""
        return {
            "query": self.query,
            "detected_language": self.detected_language,
            "primary_intent": self.primary_intent,
            "location": {
                "name": self.location.name,
                "latitude": self.location.latitude,
                "longitude": self.location.longitude,
            },
            "pfz": {
                "available": self.pfz.available,
                "total_zones": self.pfz.total_zones,
                "top_zone": self.pfz.top_zone,
            },
            "ocean": {
                "sst_celsius": self.ocean.sst_celsius,
                "chlorophyll_mg_m3": self.ocean.chlorophyll_mg_m3,
                "wave_height_m": self.ocean.wave_height_m,
                "wind_speed_knots": self.ocean.wind_speed_knots,
                "wind_direction_deg": self.ocean.wind_direction_deg,
                "visibility_km": self.ocean.visibility_km,
                "sea_condition": self.ocean.sea_condition,
            },
            "hazards": self.hazards,
            "vessels": self.vessels,
            "recommended_zone": {
                "name": self.recommended_zone.name,
                "distance_km_min": round(self.recommended_zone.distance_km_min, 1),
                "distance_km_max": round(self.recommended_zone.distance_km_max, 1),
                "bearing_deg": round(self.recommended_zone.bearing_deg, 0),
                "depth_m_min": round(self.recommended_zone.depth_m_min, 0),
                "depth_m_max": round(self.recommended_zone.depth_m_max, 0),
                "suitability_score": round(self.recommended_zone.suitability_score, 0),
                "reasons": self.recommended_zone.reasons,
                "cautions": self.recommended_zone.cautions,
            } if self.recommended_zone else None,
            "safety": {
                "status": self.safety.status,
                "veto_triggered": self.safety.veto_triggered,
                "risk_level": self.safety.risk_level,
                "reasons": self.safety.reasons,
                "summary": self.safety.summary,
            },
            "species": {
                "available": self.species.available,
                "list": self.species.list,
            },
            "sources": self.sources,
        }
