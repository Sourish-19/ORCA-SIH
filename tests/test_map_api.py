"""
Unit tests for Map API endpoints:
- GET /api/map/config
- GET /api/map/sectors
- GET /api/map/layers
- Location-specific query resolution (Chennai vs. Vizag cyclone veto vs. Kochi vs. Mangalore)
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_map_config_endpoint():
    response = client.get("/api/map/config")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "OPERATIONAL"
    assert "active_basemaps" in data
    assert "esri-dark" == data["active_basemaps"]["dark"]["id"]
    assert "esri-ocean" == data["active_basemaps"]["ocean"]["id"]
    assert "chennai" in data["available_sectors"]


def test_map_sectors_endpoint():
    response = client.get("/api/map/sectors")
    assert response.status_code == 200
    data = response.json()
    assert data["count"] >= 4
    assert "chennai" in data["sectors"]
    assert "visakhapatnam" in data["sectors"]


def test_map_layers_default_chennai():
    response = client.get("/api/map/layers")
    assert response.status_code == 200
    data = response.json()
    assert "metadata" in data
    assert data["metadata"]["active_sector"] == "chennai"
    assert data["landing_centres"]["type"] == "FeatureCollection"
    assert len(data["landing_centres"]["features"]) > 0
    assert data["pfz_polygons"]["type"] == "FeatureCollection"
    assert len(data["pfz_polygons"]["features"]) > 0
    assert data["route"]["type"] == "FeatureCollection"
    assert len(data["route"]["features"]) == 1
    assert data["route"]["features"][0]["properties"]["sector"] == "chennai"


def test_map_layers_visakhapatnam_cyclone():
    response = client.get("/api/map/layers?location=Visakhapatnam&is_veto=true")
    assert response.status_code == 200
    data = response.json()
    assert data["metadata"]["active_sector"] == "visakhapatnam"
    assert data["metadata"]["is_veto"] is True
    # Verify Vizag coordinates
    assert data["metadata"]["center"] == [83.3032, 17.6974]
    # Verify cyclone hazard
    hazards = data["hazards"]["features"]
    assert len(hazards) > 0
    assert any(h["properties"]["warning_type"] == "CYCLONE" for h in hazards)
    # Verify vessels have returning/docked status
    vessels = data["vessels"]["features"]
    assert len(vessels) > 0
    assert any("CYCLONE" in v["properties"]["status"] for v in vessels)


def test_map_layers_kochi_resolution():
    response = client.get("/api/map/layers?query=Kochi%20fishing%20zone")
    assert response.status_code == 200
    data = response.json()
    assert data["metadata"]["active_sector"] == "kochi"
    assert data["metadata"]["center"] == [76.1683, 10.1812]
    assert data["route"]["features"][0]["properties"]["sector"] == "kochi"
