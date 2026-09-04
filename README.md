# ORCA — Marine EcOsystem Reasoning with Collaborative Agents (SIH26176)

ORCA converts natural-language marine questions into evidence-backed, safety-checked decisions for fishermen, coastal communities, and marine analysts in India.

## 🌊 Core Features
- **Multi-Agent Collaborative Architecture**:
  - `Language + Intent Agent`: Multilingual ASR & entity parsing (English, Tamil, Hindi, Malayalam, Telugu).
  - `Orchestrator`: Async parallel execution and step-by-step trace generation.
  - `Geo-Data Agent`: Retrieves INCOIS Potential Fishing Zones (PFZ), MOSDAC Sea Surface Temperature (SST), & Chlorophyll productivity.
  - `Hazard Agent`: Retrieves IMD marine weather forecasts, wind/wave vectors, and cyclone track warnings.
  - `Context / Memory Agent`: Coordinates resolution, bounding boxes, and landing harbour bindings.
  - `Reasoning Agent`: 6-factor transparent weighted suitability score formula:
    $$\text{Suitability} = 0.35 \cdot \text{PFZ} + 0.25 \cdot \text{CHL} + 0.15 \cdot \text{SST} + 0.10 \cdot \text{Wind} + 0.10 \cdot \text{Wave} + 0.05 \cdot \text{Accessibility}$$
  - `Safety Agent (Deterministic Veto)`: Independent veto authority for active warnings, cyclone intersections, or unsafe thresholds.
  - `Synthesis Agent`: Synthesizes grounded natural language responses and voice audio broadcasts.

- **Dual-Mode Web Dashboard**:
  - **Fisherman Mode**: Voice-first, high contrast, audio player broadcast, large touch targets.
  - **Analyst Mode**: Interactive spatial GIS map, agent trace timeline, "Why this answer?" evidence provenance inspector.

---

## 🚀 Quick Start Guide

### 1. Run Python Backend Service
```bash
cd backend
pip install -r requirements.txt
python -m pytest ../tests/    # Run unit tests
python app/main.py            # Starts server at http://localhost:8000
```

### 2. Run React Web Interface
```bash
cd frontend
npm install
npm run dev                   # Starts web dashboard at http://localhost:3000
```

---

## 🧪 Preset Demonstration Scenarios
1. **Clear Weather Fishing**: *"Where should I fish tomorrow near Chennai?"* (Recommends Chennai Offshore East, 88% score).
2. **Safety Veto Execution**: *"Can I take my boat out tomorrow near Vizag?"* (Triggers RED Cyclone Warning Veto).
3. **Multilingual Query**: *"நாளைக்கு சென்னைக்கு அருகில் எங்கு மீன் பிடிக்கலாம்?"* (Parses Tamil intent & recommends Chennai Offshore East).
4. **Moderate High Wave Swell**: *"What is the sea condition tomorrow near Mangalore?"* (Displays high wave surge caution).
