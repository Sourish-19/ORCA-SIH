"""
Shared deterministic identity helpers for ORCA downstream engines.

The Suitability Engine and the Safety Engine each evaluate the same PFZ anchor
independently. They must agree on a single candidate identifier so the Decision
Layer can join a SuitabilityAssessment to its SafetyVerdict without guessing.
"""

from app.models.ocean import NormalizedPFZRecord


def make_candidate_id(pfz: NormalizedPFZRecord) -> str:
    """
    Deterministic identifier for a candidate PFZ location.

    Format: PFZ-<sector_id>-<landing_centre>-<bearing>deg
    Example: PFZ-SEC007-Chennai-107deg

    Both the Suitability Engine and the Safety Engine call this so their
    outputs share a join key.
    """
    return f"PFZ-{pfz.sector_id}-{pfz.landing_centre}-{int(pfz.bearing_deg)}deg"
