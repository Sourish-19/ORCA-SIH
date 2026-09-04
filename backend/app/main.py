"""
ORCA Backend Engine — Main FastAPI Application
Marine EcOsystem Reasoning with Collaborative Agents • SIH26176
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any, Optional

from app.config import HOST, PORT, DEBUG
from app.models.request import UserQueryRequest, ORCAResponse
from app.agents.orchestrator import run_orca_pipeline
from app.ingestion.incois import fetch_landing_centres
from app.routers.recommend import router as recommend_router
from app.routers.map import router as map_router

app = FastAPI(
    title="ORCA Backend Engine — SIH26176",
    description="Marine EcOsystem Reasoning with Collaborative Agents",
    version="1.0.0"
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Stack B pipeline: POST /api/recommend, GET /api/recommend/demo
# (the legacy POST /api/query below is left untouched)
app.include_router(recommend_router)
app.include_router(map_router)


@app.get("/api/vessels")
def get_vessels_alias(location: Optional[str] = None, query: Optional[str] = None):
    from app.routers.map import get_vessels_telemetry
    return get_vessels_telemetry(location=location, query=query)


@app.get("/")
def read_root():
    return {
        "system": "ORCA — Marine EcOsystem Reasoning with Collaborative Agents",
        "problem_statement": "SIH26176",
        "status": "OPERATIONAL",
        "docs_url": "/docs"
    }


# Data Connectors State Store
CONNECTORS_DB = {
    "incois": {
        "id": "incois",
        "name": "INCOIS",
        "role": "PFZ Advisory & Fisheries",
        "status": "LIVE",
        "lastUpdated": "4 min ago",
        "dataAgeMinutes": 4,
        "recordCount": 142,
        "latencyMs": 185,
        "healthPercent": 99.9,
        "connectorStatus": "Healthy — 100% Sync"
    },
    "mosdac": {
        "id": "mosdac",
        "name": "MOSDAC / ISRO",
        "role": "SST & Ocean Colour",
        "status": "LIVE",
        "lastUpdated": "12 min ago",
        "dataAgeMinutes": 12,
        "recordCount": 580,
        "latencyMs": 320,
        "healthPercent": 99.8,
        "connectorStatus": "Healthy — Live Stream"
    },
    "imd": {
        "id": "imd",
        "name": "IMD",
        "role": "Marine Weather & Gale Warnings",
        "status": "LIVE",
        "lastUpdated": "2 min ago",
        "dataAgeMinutes": 2,
        "recordCount": 89,
        "latencyMs": 140,
        "healthPercent": 100.0,
        "connectorStatus": "Healthy — Active Sync"
    },
    "bhuvan": {
        "id": "bhuvan",
        "name": "Bhuvan / ISRO",
        "role": "Indian Coastal & GIS Base Layers",
        "status": "LIVE",
        "lastUpdated": "5 min ago",
        "dataAgeMinutes": 5,
        "recordCount": 1250,
        "latencyMs": 210,
        "healthPercent": 99.7,
        "connectorStatus": "Healthy — Live Stream"
    },
    "noaa": {
        "id": "noaa",
        "name": "NOAA ERDDAP",
        "role": "Secondary Ocean Forecast Grids",
        "status": "LIVE",
        "lastUpdated": "3 min ago",
        "dataAgeMinutes": 3,
        "recordCount": 420,
        "latencyMs": 240,
        "healthPercent": 99.5,
        "connectorStatus": "Healthy — Live Stream"
    },
    "copernicus": {
        "id": "copernicus",
        "name": "Copernicus Marine",
        "role": "Global Ocean Circulation Model",
        "status": "LIVE",
        "lastUpdated": "6 min ago",
        "dataAgeMinutes": 6,
        "recordCount": 310,
        "latencyMs": 280,
        "healthPercent": 99.6,
        "connectorStatus": "Healthy — Live Stream"
    }
}


@app.get("/api/health")
def health_check():
    return {"status": "HEALTHY", "data_plane": "LIVE/DEMO_ACTIVE", "connectors": list(CONNECTORS_DB.values())}


@app.get("/api/connectors")
def get_connectors():
    return list(CONNECTORS_DB.values())


@app.post("/api/connectors/{connector_id}/toggle")
def toggle_connector(connector_id: str):
    if connector_id not in CONNECTORS_DB:
        raise HTTPException(status_code=404, detail="Connector not found")
    c = CONNECTORS_DB[connector_id]
    if c["status"] == "LIVE":
        c["status"] = "PAUSED"
        c["connectorStatus"] = "Paused by operator"
    else:
        c["status"] = "LIVE"
        c["lastUpdated"] = "Just now"
        c["dataAgeMinutes"] = 0
        c["connectorStatus"] = "Healthy — Live Stream"
    return c


@app.post("/api/connectors/{connector_id}/sync")
def sync_connector(connector_id: str):
    import random
    if connector_id not in CONNECTORS_DB:
        raise HTTPException(status_code=404, detail="Connector not found")
    c = CONNECTORS_DB[connector_id]
    c["status"] = "LIVE"
    c["lastUpdated"] = "Just now"
    c["dataAgeMinutes"] = 0
    c["recordCount"] += random.randint(5, 20)
    c["healthPercent"] = 100.0
    c["connectorStatus"] = "Healthy — Sync Complete"
    return c


@app.post("/api/query", response_model=ORCAResponse)
async def process_user_query(request: UserQueryRequest):
    """
    Process a natural language marine query through the ORCA collaborative multi-agent pipeline.
    """
    try:
        response = await run_orca_pipeline(request)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/landing-centres")
def get_all_landing_centres():
    """
    Get all registered Indian coastal fishing harbours & landing centres.
    """
    return fetch_landing_centres()


@app.get("/api/demo-scenarios")
def get_demo_scenarios():
    """
    Get pre-configured test scenarios for live demonstration.
    """
    return [
        {
            "id": "scenario_01",
            "title": "Chennai Fishing Recommendation (Clear Weather)",
            "query": "Where should I fish tomorrow near Chennai?",
            "location": "Chennai",
            "expected_outcome": "Safe fishing zone recommended at Chennai Offshore East with 88% suitability score."
        },
        {
            "id": "scenario_02",
            "title": "Vizag Severe Cyclone Warning (Safety Veto Triggered)",
            "query": "Can I take my boat out tomorrow near Vizag?",
            "location": "Visakhapatnam",
            "expected_outcome": "SAFETY VETO ACTIVE — Gale winds and Red Cyclone Warning suppress fishing recommendation."
        },
        {
            "id": "scenario_03",
            "title": "Chennai Multilingual Advisory (Tamil Voice Query)",
            "query": "நாளைக்கு சென்னைக்கு அருகில் எங்கு மீன் பிடிக்கலாம்?",
            "location": "Chennai",
            "expected_outcome": "Multilingual Intent detected (Tamil), Chennai Offshore East recommended with high Chlorophyll signal."
        },
        {
            "id": "scenario_04",
            "title": "Mangalore High Swell Surge Advisory (Caution Badge)",
            "query": "What is the sea condition tomorrow near Mangalore?",
            "location": "Mangalore",
            "expected_outcome": "High wave advisory detected; moderate risk warning displayed."
        }
    ]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=DEBUG)
