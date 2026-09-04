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
GFW_API_TOKEN = os.getenv("GFW_API_TOKEN", "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImtpZEtleSJ9.eyJkYXRhIjp7Im5hbWUiOiJPUkNBIiwidXNlcklkIjo3MDAxOSwiYXBwbGljYXRpb25OYW1lIjoiT1JDQSIsImlkIjoxNDA5MSwidHlwZSI6InVzZXItYXBwbGljYXRpb24ifSwiaWF0IjoxNzg4NTI4MDA5LCJleHAiOjIxMDM4ODgwMDksImF1ZCI6ImdmdyIsImlzcyI6ImdmdyJ9.fTed2LOqczHmjbChIbRLyoTG3PdWdrqcPWWNmCjY1gUdacXXXG0zD05_Vfe2xYJIbsKGIfYFKpf6Ut3mnd0OEDS7lUgUT_K91m1fTGMw9__CCiqPnY7G5gUzHc66jFPFDuF3aYpg6hTLUOI-uUSQhNkVS0gxQ0JiajQP31-02C9b8nV7OqnTtBawIPX6rZvzu7WGFD3COLwHcDT2gGjoFnQfTJ6SvZjYKsyc0KaxTGjqROKqg-_UB6MwioT0arsLA9lwFe2ZRQSVoYtUQTr9cP5KikoS9inx6sUIB8O25OhMwcb97TIenzZLy4fDvZmIf5Zp2A05NYNRx9h9f9891dFvAReFsXhY26HhwsAVbdAzMmS-RLyRv2GWvrlpV1LNv6AApBDfmYPR01qiOLiE1dMO-r5hg6Qq4se_w-eNEqqj-wK193VS_CpEqxJelkxrsJ-hmWebdG_WYXKZRP3oqVsx2NGcHcICJ5iJUpGE8jjWexRVQ6ug6lV1Dw3nPBxg")

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
# LLM Explainer (Groq / Gemini API for real-time narration)
# =====================================================================
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
ORCA_LLM_PROVIDER = os.getenv("ORCA_LLM_PROVIDER", "groq")  # "groq", "gemini", or "auto"
ORCA_LLM_MODEL = os.getenv("ORCA_LLM_MODEL", "qwen/qwen3.6-27b")
ORCA_LLM_ENABLED = os.getenv("ORCA_LLM_ENABLED", "auto")
ORCA_LLM_TIMEOUT_SECONDS = float(os.getenv("ORCA_LLM_TIMEOUT_SECONDS", "12.0"))
ORCA_LLM_MAX_OUTPUT_TOKENS = int(os.getenv("ORCA_LLM_MAX_OUTPUT_TOKENS", "350"))

