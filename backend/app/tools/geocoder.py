"""
Geocoding & Location Resolution Tool
Resolves coastal place names, landing centers, and coordinates.
"""

from typing import Dict, List, Optional, Tuple
from app.models.ocean import GeoLocation

COASTAL_LOCATIONS: Dict[str, Dict[str, float]] = {
    "chennai": {"lat": 13.0827, "lon": 80.2707, "district": "Chennai", "state": "Tamil Nadu"},
    "kasimedu": {"lat": 13.1258, "lon": 80.2974, "district": "Chennai", "state": "Tamil Nadu"},
    "royapuram": {"lat": 13.1110, "lon": 80.2960, "district": "Chennai", "state": "Tamil Nadu"},
    "ennore": {"lat": 13.2140, "lon": 80.3270, "district": "Tiruvallur", "state": "Tamil Nadu"},
    "ennorekuppam": {"lat": 13.2140, "lon": 80.3270, "district": "Tiruvallur", "state": "Tamil Nadu"},
    "pulicat": {"lat": 13.4180, "lon": 80.3190, "district": "Tiruvallur", "state": "Tamil Nadu"},
    "mahabalipuram": {"lat": 12.6269, "lon": 80.1927, "district": "Chengalpattu", "state": "Tamil Nadu"},
    "kovalam": {"lat": 12.7880, "lon": 80.2490, "district": "Chengalpattu", "state": "Tamil Nadu"},
    "cuddalore": {"lat": 11.7478, "lon": 79.7744, "district": "Cuddalore", "state": "Tamil Nadu"},
    "puducherry": {"lat": 11.9416, "lon": 79.8083, "district": "Puducherry", "state": "Puducherry"},
    "pondicherry": {"lat": 11.9416, "lon": 79.8083, "district": "Puducherry", "state": "Puducherry"},
    "nagapattinam": {"lat": 10.7670, "lon": 79.8420, "district": "Nagapattinam", "state": "Tamil Nadu"},
    "rameswaram": {"lat": 9.2876, "lon": 79.3129, "district": "Ramanathapuram", "state": "Tamil Nadu"},
    "tuticorin": {"lat": 8.7642, "lon": 78.1348, "district": "Thoothukudi", "state": "Tamil Nadu"},
    "thoothukudi": {"lat": 8.7642, "lon": 78.1348, "district": "Thoothukudi", "state": "Tamil Nadu"},
    "kanyakumari": {"lat": 8.0883, "lon": 77.5385, "district": "Kanyakumari", "state": "Tamil Nadu"},
    "kochi": {"lat": 9.9312, "lon": 76.2673, "district": "Ernakulam", "state": "Kerala"},
    "cochin": {"lat": 9.9312, "lon": 76.2673, "district": "Ernakulam", "state": "Kerala"},
    "munambam": {"lat": 10.1812, "lon": 76.1683, "district": "Ernakulam", "state": "Kerala"},
    "calicut": {"lat": 11.2588, "lon": 75.7804, "district": "Kozhikode", "state": "Kerala"},
    "kozhikode": {"lat": 11.2588, "lon": 75.7804, "district": "Kozhikode", "state": "Kerala"},
    "trivandrum": {"lat": 8.5241, "lon": 76.9366, "district": "Thiruvananthapuram", "state": "Kerala"},
    "mangalore": {"lat": 12.8550, "lon": 74.8320, "district": "Dakshina Kannada", "state": "Karnataka"},
    "ullal": {"lat": 12.8020, "lon": 74.8560, "district": "Dakshina Kannada", "state": "Karnataka"},
    "panambur": {"lat": 12.9460, "lon": 74.8090, "district": "Dakshina Kannada", "state": "Karnataka"},
    "goa": {"lat": 15.4909, "lon": 73.8278, "district": "North Goa", "state": "Goa"},
    "mumbai": {"lat": 18.9220, "lon": 72.8347, "district": "Mumbai", "state": "Maharashtra"},
    "bombay": {"lat": 18.9220, "lon": 72.8347, "district": "Mumbai", "state": "Maharashtra"},
    "ratnagiri": {"lat": 16.9902, "lon": 73.3120, "district": "Ratnagiri", "state": "Maharashtra"},
    "porbandar": {"lat": 21.6417, "lon": 69.6293, "district": "Porbandar", "state": "Gujarat"},
    "vizag": {"lat": 17.6974, "lon": 83.3032, "district": "Visakhapatnam", "state": "Andhra Pradesh"},
    "visakhapatnam": {"lat": 17.6974, "lon": 83.3032, "district": "Visakhapatnam", "state": "Andhra Pradesh"},
    "kakinada": {"lat": 16.9891, "lon": 82.2475, "district": "East Godavari", "state": "Andhra Pradesh"},
    "puri": {"lat": 19.8135, "lon": 85.8312, "district": "Puri", "state": "Odisha"},
    "paradip": {"lat": 20.3167, "lon": 86.6114, "district": "Jagatsinghpur", "state": "Odisha"},
    "kolkata": {"lat": 22.5726, "lon": 88.3639, "district": "Kolkata", "state": "West Bengal"},
    "haldia": {"lat": 22.0667, "lon": 88.0698, "district": "Purba Medinipur", "state": "West Bengal"},
}


def geocode_location(place_name: str) -> GeoLocation:
    """
    Geocode a coastal location name into canonical latitude/longitude coordinates.
    """
    clean_name = place_name.strip().lower()
    for key, data in COASTAL_LOCATIONS.items():
        if key in clean_name or clean_name in key:
            return GeoLocation(
                latitude=data["lat"],
                longitude=data["lon"],
                name=place_name.title(),
                district=data["district"],
                state=data["state"]
            )
    
    # Default fallback to Chennai if unrecognized
    return GeoLocation(
        latitude=13.0827,
        longitude=80.2707,
        name=place_name.title(),
        district="Chennai",
        state="Tamil Nadu"
    )


def get_bounding_box(lat: float, lon: float, radius_km: float = 50.0) -> List[float]:
    """
    Calculate bounding box [min_lat, min_lon, max_lat, max_lon] for a given radius in km.
    1 degree latitude ~ 111 km
    1 degree longitude ~ 111 * cos(lat) km
    """
    import math
    lat_delta = radius_km / 111.0
    lon_delta = radius_km / (111.0 * math.cos(math.radians(lat)))
    return [
        round(lat - lat_delta, 4),
        round(lon - lon_delta, 4),
        round(lat + lat_delta, 4),
        round(lon + lon_delta, 4)
    ]
