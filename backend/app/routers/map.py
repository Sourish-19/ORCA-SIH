"""
Map Layers and GIS GeoJSON Router
Serves live and demo GIS GeoJSON layers directly to the frontend MapLibre GL engine.
Ensures frontend and backend spatial layers remain in perfect sync.
Provides Map API configuration, basemap tile endpoints, and sector-specific maps.
"""

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Query

from app.config import DEMO_DATA_DIR, MAPTILER_API_KEY, CARTO_API_KEY

router = APIRouter(prefix="/api/map", tags=["map"])

HARBOUR_COORDS: Dict[str, List[float]] = {
    "Royapuram Fishing Harbour (Kasimedu)": [80.2974, 13.1258],
    "Kasimedu Fishing Harbour": [80.2974, 13.1258],
    "Chennai": [80.2974, 13.1258],
    "Visakhapatnam Fishing Harbour": [83.3032, 17.6974],
    "Visakhapatnam": [83.3032, 17.6974],
    "Vizag": [83.3032, 17.6974],
    "Munambam Fishing Harbour": [76.1683, 10.1812],
    "Kochi": [76.1683, 10.1812],
    "Old Mangalore Port Jetty": [74.8320, 12.8550],
    "Mangalore": [74.8320, 12.8550],
    "Srinivasapuram": [80.2800, 13.0100],
    "Ennorekuppam": [80.3250, 13.2200],
    "Cuddalore Port": [79.7700, 11.7400]
}

SECTOR_PRESETS: Dict[str, Dict[str, Any]] = {
    "chennai": {
        "sector_id": "chennai",
        "name": "Chennai Offshore East Sector",
        "center": [80.4200, 13.1500],
        "zoom": 8.5,
        "primary_harbour": "Royapuram Fishing Harbour (Kasimedu)",
        "harbour_coords": [80.2974, 13.1258],
        "target_zone": [80.4200, 13.1500],
        "zone_name": "Chennai Offshore East (PFZ #101)",
        "state": "Tamil Nadu",
        "status": "CLEAR_FISHING_ACTIVE"
    },
    "visakhapatnam": {
        "sector_id": "visakhapatnam",
        "name": "Visakhapatnam Coastal Sector",
        "center": [83.3032, 17.6974],
        "zoom": 7.5,
        "primary_harbour": "Visakhapatnam Fishing Harbour",
        "harbour_coords": [83.3032, 17.6974],
        "target_zone": [83.5800, 17.5200],
        "zone_name": "Visakhapatnam Outer Shelf (PFZ #401)",
        "state": "Andhra Pradesh",
        "status": "CYCLONE_HAZARD_ACTIVE"
    },
    "kochi": {
        "sector_id": "kochi",
        "name": "Kochi & Munambam Deep Sea",
        "center": [76.1683, 10.1812],
        "zoom": 8.5,
        "primary_harbour": "Munambam Fishing Harbour",
        "harbour_coords": [76.1683, 10.1812],
        "target_zone": [75.8540, 10.2110],
        "zone_name": "Munambam West (PFZ #201)",
        "state": "Kerala",
        "status": "HIGH_PRODUCTIVITY"
    },
    "mangalore": {
        "sector_id": "mangalore",
        "name": "Old Mangalore Coast & Shelf",
        "center": [74.8320, 12.8550],
        "zoom": 8.5,
        "primary_harbour": "Old Mangalore Port Jetty",
        "harbour_coords": [74.8320, 12.8550],
        "target_zone": [74.5000, 12.7500],
        "zone_name": "Mangalore South-West (PFZ #301)",
        "state": "Karnataka",
        "status": "SWELL_ADVISORY"
    }
}


def _create_circle_polygon(lon: float, lat: float, radius_km: float, num_points: int = 16) -> List[List[List[float]]]:
    coords = []
    lat_rad = math.radians(lat)
    d_lat = radius_km / 111.0
    d_lon = radius_km / (111.0 * max(0.01, math.cos(lat_rad)))
    for i in range(num_points + 1):
        angle = (2 * math.pi * i) / num_points
        p_lat = lat + d_lat * math.sin(angle)
        p_lon = lon + d_lon * math.cos(angle)
        coords.append([round(p_lon, 5), round(p_lat, 5)])
    return [coords]


def _destination_point(lon: float, lat: float, distance_km: float, bearing_deg: float) -> List[float]:
    r = 6371.0
    brng = math.radians(bearing_deg)
    d_r = distance_km / r
    lat1 = math.radians(lat)
    lon1 = math.radians(lon)
    lat2 = math.asin(math.sin(lat1) * math.cos(d_r) + math.cos(lat1) * math.sin(d_r) * math.cos(brng))
    lon2 = lon1 + math.atan2(math.sin(brng) * math.sin(d_r) * math.cos(lat1), math.cos(d_r) - math.sin(lat1) * math.sin(lat2))
    return [round(math.degrees(lon2), 5), round(math.degrees(lat2), 5)]


def _resolve_sector_key(location: Optional[str] = None, query: Optional[str] = None, harbour: Optional[str] = None) -> str:
    combined = f"{location or ''} {query or ''} {harbour or ''}".lower()
    if any(k in combined for k in ["vizag", "visakhapatnam", "cyclone", "andhra", "விசாகப்பட்டினம்"]):
        return "visakhapatnam"
    if any(k in combined for k in ["kochi", "cochin", "munambam", "kerala", "கொச்சி"]):
        return "kochi"
    if any(k in combined for k in ["mangalore", "mangaluru", "karnataka", "swell", "மங்களூரு"]):
        return "mangalore"
    if any(k in combined for k in ["chennai", "kasimedu", "royapuram", "சென்னை"]):
        return "chennai"
    return "chennai"


@router.get("/config")
def get_map_config() -> Dict[str, Any]:
    """
    Returns Map API metadata, active basemap providers, available sectors, and key statuses.
    Enables frontend to choose optimal vector or raster styles seamlessly.
    """
    return {
        "status": "OPERATIONAL",
        "api_version": "1.2.0",
        "sync_mode": "REALTIME_GEOJSON",
        "active_basemaps": {
            "dark": {
                "id": "esri-dark",
                "name": "Esri World Dark Gray Canvas (High-Res Marine GIS)",
                "type": "raster",
                "tile_urls": [
                    "https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
                ],
                "attribution": "&copy; Esri, HERE, Garmin, FAO, NOAA, USGS",
                "has_api_key": False
            },
            "ocean": {
                "id": "esri-ocean",
                "name": "Esri Ocean Basemap (Depth Bathymetry)",
                "type": "raster",
                "tile_urls": [
                    "https://services.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}"
                ],
                "attribution": "&copy; Esri, GEBCO, NOAA, National Geographic",
                "has_api_key": False
            },
            "satellite": {
                "id": "esri-satellite",
                "name": "Esri World Imagery (Satellite)",
                "type": "raster",
                "tile_urls": [
                    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                ],
                "attribution": "&copy; Esri, Maxar, Earthstar Geographics",
                "has_api_key": False
            },
            "coastal": {
                "id": "osm-streets",
                "name": "OpenStreetMap Coastal",
                "type": "raster",
                "tile_urls": [
                    "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                ],
                "attribution": "&copy; OpenStreetMap contributors",
                "has_api_key": False
            }
        },
        "maptiler": {
            "is_configured": bool(MAPTILER_API_KEY and len(MAPTILER_API_KEY) > 5),
            "key": MAPTILER_API_KEY if (MAPTILER_API_KEY and len(MAPTILER_API_KEY) > 5) else None
        },
        "carto": {
            "is_configured": bool(CARTO_API_KEY and len(CARTO_API_KEY) > 5),
            "key": CARTO_API_KEY if (CARTO_API_KEY and len(CARTO_API_KEY) > 5) else None
        },
        "default_sector": "chennai",
        "available_sectors": list(SECTOR_PRESETS.keys())
    }


@router.get("/sectors")
def get_map_sectors() -> Dict[str, Any]:
    """
    Returns pre-configured coastal sectors with bounding coordinates and active harbour anchors.
    """
    return {
        "count": len(SECTOR_PRESETS),
        "sectors": SECTOR_PRESETS
    }


@router.get("/layers")
def get_map_layers(
    location: Optional[str] = Query(None, description="Location filter e.g. Chennai, Vizag, Kochi"),
    harbour: Optional[str] = Query(None, description="Harbour filter"),
    is_veto: Optional[bool] = Query(None, description="Safety veto active state"),
    zone_id: Optional[str] = Query(None, description="Target PFZ candidate zone ID"),
    query: Optional[str] = Query(None, description="User natural language search query")
) -> Dict[str, Any]:
    """
    Returns all GIS GeoJSON layers dynamically constructed from backend data plane.
    Accepts query/location parameters to synchronize the exact sector, route, and hazards.
    """
    sector_key = _resolve_sector_key(location, query, harbour)
    sector_info = SECTOR_PRESETS[sector_key]

    veto_active = is_veto if is_veto is not None else (sector_key == "visakhapatnam" or (query and "cyclone" in query.lower()))

    # 1. Landing Centres
    lc_file = DEMO_DATA_DIR / "landing_centres.json"
    lc_features = []
    if lc_file.exists():
        with open(lc_file, "r", encoding="utf-8") as f:
            for item in json.load(f):
                is_active_harbour = item.get("name") == sector_info["primary_harbour"] or sector_key in item.get("name", "").lower()
                lc_features.append({
                    "type": "Feature",
                    "properties": {
                        "id": item["id"],
                        "name": item["name"],
                        "district": item.get("district", ""),
                        "state": item["state"],
                        "facilities": ", ".join(item.get("facilities", [])),
                        "capacity": item.get("max_boat_capacity", 200),
                        "is_active_harbour": is_active_harbour,
                        "type": "LANDING_CENTRE"
                    },
                    "geometry": {
                        "type": "Point",
                        "coordinates": [item["longitude"], item["latitude"]]
                    }
                })

    # 2. INCOIS PFZ Advisories
    pfz_file = DEMO_DATA_DIR / "pfz_advisories.json"
    pfz_polygons = []
    pfz_points = []
    recommended_target = sector_info["target_zone"]

    if pfz_file.exists():
        with open(pfz_file, "r", encoding="utf-8") as f:
            for item in json.load(f):
                dest_lon = item.get("center_lon")
                dest_lat = item.get("center_lat")

                if (dest_lon is None or dest_lat is None) and item.get("nearest_landing_centre") in HARBOUR_COORDS:
                    origin = HARBOUR_COORDS[item["nearest_landing_centre"]]
                    dest_lon, dest_lat = _destination_point(
                        origin[0], origin[1], item["distance_km"], item["bearing_deg"]
                    )

                if dest_lon is not None and dest_lat is not None:
                    is_current_sector_zone = (
                        (sector_key == "chennai" and "chn" in item["zone_id"]) or
                        (sector_key == "visakhapatnam" and "vzg" in item["zone_id"]) or
                        (sector_key == "kochi" and "kch" in item["zone_id"]) or
                        (sector_key == "mangalore" and "mng" in item["zone_id"])
                    )

                    is_targeted = bool(zone_id and item.get("zone_id") == zone_id)
                    is_rec = is_targeted or (is_current_sector_zone and not veto_active)

                    props = {
                        "zone_id": item["zone_id"],
                        "sector_name": item["sector_name"],
                        "score": item["strength_score"],
                        "depth_m": item["depth_m"],
                        "bearing_deg": item["bearing_deg"],
                        "distance_km": item["distance_km"],
                        "nearest_landing_centre": item.get("nearest_landing_centre", sector_info["primary_harbour"]),
                        "is_recommended": is_rec,
                        "is_selected": is_targeted,
                        "source": item.get("source", "INCOIS")
                    }

                    if is_rec and (is_targeted or recommended_target == sector_info["target_zone"]):
                        recommended_target = [dest_lon, dest_lat]

                    pfz_points.append({
                        "type": "Feature",
                        "properties": props,
                        "geometry": {
                            "type": "Point",
                            "coordinates": [dest_lon, dest_lat]
                        }
                    })

                    pfz_polygons.append({
                        "type": "Feature",
                        "properties": props,
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": _create_circle_polygon(dest_lon, dest_lat, 7.0)
                        }
                    })

    # 3. MOSDAC Ocean Observations (SST & Chlorophyll)
    ocean_file = DEMO_DATA_DIR / "ocean_grids.json"
    sst_features = []
    chl_features = []
    if ocean_file.exists():
        with open(ocean_file, "r", encoding="utf-8") as f:
            ocean_data = json.load(f)
            for obs in ocean_data.get("sst_observations", []):
                sst_features.append({
                    "type": "Feature",
                    "properties": {
                        "timestamp": obs.get("timestamp", ""),
                        "sst_celsius": obs["sst_celsius"],
                        "quality_flag": obs.get("quality_flag", "GOOD"),
                        "source": obs.get("source", "MOSDAC")
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": _create_circle_polygon(obs["longitude"], obs["latitude"], 10.0)
                    }
                })

            for obs in ocean_data.get("chlorophyll_observations", []):
                chl_features.append({
                    "type": "Feature",
                    "properties": {
                        "timestamp": obs.get("timestamp", ""),
                        "concentration_mg_m3": obs["concentration_mg_m3"],
                        "quality_flag": obs.get("quality_flag", "GOOD"),
                        "source": obs.get("source", "MOSDAC")
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": _create_circle_polygon(obs["longitude"], obs["latitude"], 8.5)
                    }
                })

    # 4. IMD Marine Weather
    mw_file = DEMO_DATA_DIR / "marine_weather.json"
    weather_features = []
    if mw_file.exists():
        with open(mw_file, "r", encoding="utf-8") as f:
            for w in json.load(f):
                weather_features.append({
                    "type": "Feature",
                    "properties": {
                        "location_name": w["location_name"],
                        "wind_speed_knots": w["wind_speed_knots"],
                        "wind_direction_deg": w["wind_direction_deg"],
                        "wave_height_m": w["wave_height_m"],
                        "wave_period_sec": w["wave_period_sec"],
                        "pressure_hpa": w.get("sea_surface_pressure_hpa", 1012.0),
                        "source": w.get("source", "IMD")
                    },
                    "geometry": {
                        "type": "Point",
                        "coordinates": [w["longitude"], w["latitude"]]
                    }
                })

    # 5. IMD Hazard Warnings (Cyclones & High Swells)
    hw_file = DEMO_DATA_DIR / "hazard_warnings.json"
    hazard_features = []
    if hw_file.exists():
        with open(hw_file, "r", encoding="utf-8") as f:
            for h in json.load(f):
                b = h["bounding_box"]
                # Detect whether bbox is [minLat, minLon, maxLat, maxLon] or [minLon, minLat, maxLon, maxLat]
                # India latitudes are ~8-37, longitudes are ~68-97
                if b[0] < 40 and b[1] > 60:
                    min_lat, min_lon, max_lat, max_lon = b[0], b[1], b[2], b[3]
                else:
                    min_lon, min_lat, max_lon, max_lat = b[0], b[1], b[2], b[3]

                poly = [
                    [
                        [min_lon, min_lat],
                        [max_lon, min_lat],
                        [max_lon, max_lat],
                        [min_lon, max_lat],
                        [min_lon, min_lat]
                    ]
                ]
                hazard_features.append({
                    "type": "Feature",
                    "properties": {
                        "warning_id": h["warning_id"],
                        "warning_type": h["warning_type"],
                        "severity": h["severity"],
                        "title": h["title"],
                        "description": h["description"],
                        "affected_sector": h["affected_sector"],
                        "source": h.get("source", "IMD")
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": poly
                    }
                })

    # 6. Sector-Specific Active AIS Vessels
    vessels_by_sector = {
        "chennai": [
            {
                "type": "Feature",
                "properties": {
                    "vessel_id": "IND-TN-02-MM-104",
                    "name": "MFV Sea Queen",
                    "type": "Deep Sea Mechanized Trawler",
                    "speed_knots": 8.5,
                    "heading_deg": 105,
                    "status": "Active Fishing inside PFZ",
                    "harbour": "Kasimedu Harbour"
                },
                "geometry": {"type": "Point", "coordinates": [80.5210, 13.1420]}
            },
            {
                "type": "Feature",
                "properties": {
                    "vessel_id": "IND-TN-01-MM-088",
                    "name": "MFV Blue Marlin",
                    "type": "Gillnetter",
                    "speed_knots": 6.2,
                    "heading_deg": 120,
                    "status": "Transit to PFZ Zone",
                    "harbour": "Kasimedu Harbour"
                },
                "geometry": {"type": "Point", "coordinates": [80.4510, 12.9510]}
            }
        ],
        "visakhapatnam": [
            {
                "type": "Feature",
                "properties": {
                    "vessel_id": "IND-AP-01-FD-302",
                    "name": "MFV Sagar Kanya",
                    "type": "Motorized Gillnetter",
                    "speed_knots": 0.0,
                    "heading_deg": 0,
                    "status": "DOCKED (Severe Cyclone Warning Active)",
                    "harbour": "Visakhapatnam Fishing Harbour"
                },
                "geometry": {"type": "Point", "coordinates": [83.3032, 17.6974]}
            },
            {
                "type": "Feature",
                "properties": {
                    "vessel_id": "IND-AP-05-MM-302",
                    "name": "MFV Ocean Sentinel",
                    "type": "Trawler",
                    "speed_knots": 4.1,
                    "heading_deg": 290,
                    "status": "🚨 CYCLONE HAZARD ALERT — RETURNING TO PORT",
                    "harbour": "Visakhapatnam Fishing Harbour"
                },
                "geometry": {"type": "Point", "coordinates": [83.4500, 17.4200]}
            }
        ],
        "kochi": [
            {
                "type": "Feature",
                "properties": {
                    "vessel_id": "IND-KL-07-FD-511",
                    "name": "MFV Matsya 09",
                    "type": "Deep Sea Trawler",
                    "speed_knots": 7.8,
                    "heading_deg": 260,
                    "status": "Active Harvesting in High CHL Plume",
                    "harbour": "Munambam Fishing Harbour"
                },
                "geometry": {"type": "Point", "coordinates": [75.9200, 10.1500]}
            }
        ],
        "mangalore": [
            {
                "type": "Feature",
                "properties": {
                    "vessel_id": "IND-KA-19-FD-401",
                    "name": "MFV Karavali Star",
                    "type": "Purse Seiner",
                    "speed_knots": 5.5,
                    "heading_deg": 235,
                    "status": "Operating under Moderate Swell Caution",
                    "harbour": "Old Mangalore Port Jetty"
                },
                "geometry": {"type": "Point", "coordinates": [74.6500, 12.8100]}
            }
        ]
    }
    vessel_features = vessels_by_sector.get(sector_key, vessels_by_sector["chennai"])

    # 7. Dynamic Navigation Route
    origin_pt = sector_info["harbour_coords"]
    dest_pt = recommended_target

    # If veto active, the route represents a safe harbour anchorage return or is suppressed
    if veto_active:
        mid_pt = [round((origin_pt[0] + dest_pt[0]) / 2, 5), round((origin_pt[1] + dest_pt[1]) / 2, 5)]
        route_coords = [dest_pt, mid_pt, origin_pt]
        route_status = "SAFETY VETO — EMERGENCY RETURN TO HARBOUR"
    else:
        mid_pt = [round(origin_pt[0] * 0.6 + dest_pt[0] * 0.4, 5), round(origin_pt[1] * 0.6 + dest_pt[1] * 0.4, 5)]
        route_coords = [origin_pt, mid_pt, dest_pt]
        route_status = "RECOMMENDED NAVIGATION PATH TO PFZ"

    route_features = [
        {
            "type": "Feature",
            "properties": {
                "route_id": f"ROUTE-{sector_key.upper()}-001",
                "origin": sector_info["primary_harbour"],
                "destination": sector_info["zone_name"],
                "sector": sector_key,
                "is_veto": veto_active,
                "status": route_status
            },
            "geometry": {
                "type": "LineString",
                "coordinates": route_coords
            }
        }
    ]

    return {
        "metadata": {
            "active_sector": sector_key,
            "sector_name": sector_info["name"],
            "center": sector_info["center"],
            "zoom": sector_info["zoom"],
            "is_veto": veto_active,
            "synced_at": datetime.now(timezone.utc).isoformat()
        },
        "landing_centres": {"type": "FeatureCollection", "features": lc_features},
        "pfz_polygons": {"type": "FeatureCollection", "features": pfz_polygons},
        "pfz_points": {"type": "FeatureCollection", "features": pfz_points},
        "sst": {"type": "FeatureCollection", "features": sst_features},
        "chl": {"type": "FeatureCollection", "features": chl_features},
        "weather": {"type": "FeatureCollection", "features": weather_features},
        "hazards": {"type": "FeatureCollection", "features": hazard_features},
        "vessels": {"type": "FeatureCollection", "features": vessel_features},
        "route": {"type": "FeatureCollection", "features": route_features}
    }
