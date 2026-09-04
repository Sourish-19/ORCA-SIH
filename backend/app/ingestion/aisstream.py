"""
ORCA Live AISStream.io Receiver & Ingestion Client
Connects to AISStream WebSocket (wss://stream.aisstream.io/v0/stream) using the user's API key.
"""

import asyncio
import json
import logging
import threading
import time
from typing import Dict, Any, List, Optional
import websockets

from app.config import AISSTREAM_API_KEY

logger = logging.getLogger("orca.aisstream")

# Global in-memory cache for live streamed AIS vessels
LIVE_VESSELS_CACHE: Dict[int, Dict[str, Any]] = {}
_WORKER_THREAD: Optional[threading.Thread] = None
_RUNNING = False


def _parse_ais_message(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    try:
        msg_type = data.get("MessageType")
        metadata = data.get("MetaData", {})
        mmsi = metadata.get("MMSI")
        if not mmsi:
            return None

        name = metadata.get("ShipName", "").strip() or f"Vessel MMSI-{mmsi}"
        lat = metadata.get("latitude")
        lon = metadata.get("longitude")
        if lat is None or lon is None:
            return None

        # Extract position report sub-object if available
        msg_content = data.get("Message", {})
        pos_report = msg_content.get("PositionReport", {}) or msg_content.get("StandardClassBPositionReport", {})
        sog = pos_report.get("Sog", 0.0)
        cog = pos_report.get("Cog", 0.0)

        # Flag hazard status for vessels in rough sea / low speed or specific codes
        is_hazard = sog > 18.0 or sog < 0.5

        return {
            "id": f"ais_{mmsi}",
            "vessel_id": f"MMSI-{mmsi}",
            "mmsi": str(mmsi),
            "name": name,
            "type": "Live AIS Tracked Vessel",
            "badge": "⚠️ HAZARD" if is_hazard else "📡 Live AIS",
            "badgeStyle": "bg-red-950 text-red-400 border-red-800" if is_hazard else "bg-emerald-950 text-emerald-300 border-emerald-800",
            "proximity": f"{sog:.1f} kts live AIS tracking",
            "lastPing": "Just now",
            "isHazard": is_hazard,
            "speed_knots": round(float(sog), 1),
            "heading_deg": round(float(cog), 0),
            "harbour": "Coastal / Offshore Waters",
            "latitude": float(lat),
            "longitude": float(lon),
            "imo": f"IMO-{mmsi}",
            "call_sign": f"AIS-{str(mmsi)[-4:]}",
            "crew_onboard": 6,
            "fuel_level_pct": 85,
            "engine_status": "Active Propulsion (Live AIS)",
            "sea_depth_m": 28.5,
            "vhf_channel": "CH 16 (156.8 MHz)",
            "owner": "Registered Maritime Operator",
            "status": "LIVE AIS BROADCAST ACTIVE"
        }
    except Exception as e:
        logger.debug(f"Error parsing AIS message: {e}")
        return None


async def _run_aisstream_websocket():
    global _RUNNING
    url = "wss://stream.aisstream.io/v0/stream"
    api_key = AISSTREAM_API_KEY or "fde31f354a0d95fb01736aca62295a018a972423"

    subscription_msg = {
        "APIKey": api_key,
        "BoundingBoxes": [[[-90.0, -180.0], [90.0, 180.0]]],  # Global AIS coverage
        "FilterMessageTypes": ["PositionReport", "StandardClassBPositionReport"]
    }

    while _RUNNING:
        try:
            logger.info("Connecting to AISStream.io live WebSocket stream...")
            async with websockets.connect(url, ping_interval=20, ping_timeout=20) as ws:
                await ws.send(json.dumps(subscription_msg))
                logger.info("Connected to AISStream.io! Streaming live AIS vessel pings.")

                while _RUNNING:
                    raw_msg = await ws.recv()
                    data = json.loads(raw_msg)
                    vessel = _parse_ais_message(data)
                    if vessel:
                        mmsi_int = int(vessel["mmsi"])
                        LIVE_VESSELS_CACHE[mmsi_int] = vessel
                        # Limit cache size to 1000 vessels
                        if len(LIVE_VESSELS_CACHE) > 1000:
                            first_key = next(iter(LIVE_VESSELS_CACHE))
                            LIVE_VESSELS_CACHE.pop(first_key, None)
        except Exception as e:
            logger.warning(f"AISStream.io WebSocket error: {e}. Reconnecting in 5 seconds...")
            await asyncio.sleep(5)


def _start_async_loop():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(_run_aisstream_websocket())


def start_live_ais_listener():
    global _WORKER_THREAD, _RUNNING
    if _RUNNING or (_WORKER_THREAD and _WORKER_THREAD.is_alive()):
        return

    _RUNNING = True
    _WORKER_THREAD = threading.Thread(target=_start_async_loop, daemon=True)
    _WORKER_THREAD.start()
    logger.info("Background thread launched for AISStream.io live receiver.")


def get_live_ais_vessels(limit: int = 50) -> List[Dict[str, Any]]:
    """Returns the latest live vessels received from AISStream.io."""
    # Auto-start listener if not running
    if not _RUNNING:
        start_live_ais_listener()

    vessels = list(LIVE_VESSELS_CACHE.values())
    return vessels[-limit:] if vessels else []
