"""
System Configuration & Environment Variables
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"
DEMO_DATA_DIR = DATA_DIR / "demo"

# Load .env if present; real environment variables always take precedence, and
# an already-set var is never overridden, so backend/.env wins over the repo-root
# .env when both define the same key.
load_dotenv(BASE_DIR / ".env")          # backend/.env  (documented location)
load_dotenv(PROJECT_ROOT / ".env")      # repo-root .env (fallback)

# Server configuration
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
DEBUG = os.getenv("DEBUG", "True").lower() == "true"

# Data plane settings
DATA_MODE = os.getenv("ORCA_DATA_MODE", "DEMO")  # "LIVE", "FAILOVER", "DEMO"

# Map Basemap & GIS API Keys
MAPTILER_API_KEY = os.getenv("MAPTILER_API_KEY", "")
CARTO_API_KEY = os.getenv("CARTO_API_KEY", "")
AISSTREAM_API_KEY = os.getenv("AISSTREAM_API_KEY", "fde31f354a0d95fb01736aca62295a018a972423")

# Safety Thresholds
MAX_SAFE_WIND_KNOTS = float(os.getenv("MAX_SAFE_WIND_KNOTS", "25.0"))
MAX_SAFE_WAVE_M = float(os.getenv("MAX_SAFE_WAVE_M", "2.5"))
DATA_FRESHNESS_MAX_HOURS = float(os.getenv("DATA_FRESHNESS_MAX_HOURS", "48.0"))

# Suitability Weights
WEIGHT_PFZ = 0.35
WEIGHT_CHL = 0.25
WEIGHT_SST = 0.15
WEIGHT_WIND = 0.10
WEIGHT_WAVE = 0.10
WEIGHT_ACCESSIBILITY = 0.05

# =====================================================================
# LLM Explainer (Google Gemini - free tier; narration only, never scoring)
# =====================================================================
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
# "gemini-flash-latest" is a stable alias Google keeps pointed at the current free
# Flash model; pin a specific id (e.g. "gemini-3.6-flash") only if you need it.
ORCA_LLM_MODEL = os.getenv("ORCA_LLM_MODEL", "gemini-flash-latest")
# "auto" -> enabled iff GEMINI_API_KEY is set; "off" -> always use the template fallback;
# "on" -> attempt the LLM even if the key looks unset (will fall back on failure).
ORCA_LLM_ENABLED = os.getenv("ORCA_LLM_ENABLED", "auto")
ORCA_LLM_TIMEOUT_SECONDS = float(os.getenv("ORCA_LLM_TIMEOUT_SECONDS", "12.0"))
# Generous headroom: "thinking" Flash models spend part of this budget before the
# visible answer, and Tamil output is token-dense.
ORCA_LLM_MAX_OUTPUT_TOKENS = int(os.getenv("ORCA_LLM_MAX_OUTPUT_TOKENS", "800"))
