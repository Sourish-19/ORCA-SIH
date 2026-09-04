import React, { useState } from 'react';
import { MarineMap } from '../components/map/MarineMap';
import { SuitabilityDonut } from '../components/SuitabilityDonut';
import { AgentTracePanel } from '../components/AgentTracePanel';
import { KeyOceanDrivers } from '../components/KeyOceanDrivers';
import { OceanTelemetryChart } from '../components/charts/OceanTelemetryChart';
import { Mic, Send, HelpCircle, MapPin } from 'lucide-react';
import { ORCAResponse } from '../types';
import { resolveLocationFromText, ResolvedLocationResult } from '../utils/locationResolver';

interface DashboardProps {
  response: ORCAResponse | null;
  onQuerySubmit: (query: string) => void;
  isLoading: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({ response, onQuerySubmit, isLoading }) => {
  const [queryInput, setQueryInput] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [resolvedLocation, setResolvedLocation] = useState<ResolvedLocationResult | null>(() => {
    return resolveLocationFromText('chennai');
  });
  const [activePreset, setActivePreset] = useState<'scenario_01' | 'scenario_02' | 'scenario_03' | null>('scenario_01');
  const [selectedZone, setSelectedZone] = useState<any>(null);
  const [executeTrigger, setExecuteTrigger] = useState<number>(0);

  const isVeto = response?.safety?.veto_triggered || activePreset === 'scenario_02';

  const activeLocation = React.useMemo(() => {
    if (resolvedLocation) {
      return resolvedLocation.matchedPlace;
    }
    if (activePreset === 'scenario_02') return 'Visakhapatnam';
    if (activePreset === 'scenario_03') return 'Chennai';
    if (response?.intent?.location_name) return response.intent.location_name;
    return 'Chennai';
  }, [resolvedLocation, activePreset, response?.intent?.location_name]);

  const mapCenter: [number, number] = React.useMemo(() => {
    // 1. If location was identified in the sent query text
    if (resolvedLocation) {
      return resolvedLocation.center;
    }

    // 2. Preset fallbacks
    if (activePreset === 'scenario_02') return [83.3032, 17.6974];
    if (activePreset === 'scenario_03' || activePreset === 'scenario_01') return [80.3600, 13.1500];

    // 3. Response top recommendation fallback
    if (response?.top_recommendation?.center_lon && response?.top_recommendation?.center_lat) {
      return [response.top_recommendation.center_lon, response.top_recommendation.center_lat];
    }

    return [80.3600, 13.1500];
  }, [resolvedLocation, activePreset, response?.top_recommendation]);

  const mapZoom = React.useMemo(() => {
    // 1. If location was identified in the sent query text
    if (resolvedLocation) {
      return resolvedLocation.zoom;
    }

    // 2. Preset fallbacks
    if (activePreset === 'scenario_02') return 10.2;
    if (activePreset === 'scenario_01' || activePreset === 'scenario_03') return 10.8;

    return 10.8;
  }, [resolvedLocation, activePreset]);

  // Synchronize when backend response arrives with intent location
  React.useEffect(() => {
    if (response?.intent?.location_name && !submittedQuery) {
      const res = resolveLocationFromText(response.intent.location_name);
      if (res) {
        setResolvedLocation(res);
      }
    }
  }, [response, submittedQuery]);

  const handleQueryChange = (val: string) => {
    setQueryInput(val);
    const lower = val.trim().toLowerCase();
    // As soon as user types "execute" in the chatbox, trigger zoom in 20% on Chennai
    if (lower === 'execute' || lower.endsWith('execute') || lower.startsWith('execute')) {
      const res = resolveLocationFromText('chennai');
      if (res) {
        setResolvedLocation(res);
        setActivePreset('scenario_01');
        setExecuteTrigger(Date.now());
      }
    }
  };

  const handleExecute = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = queryInput.trim() || 'what are the potential fishing zones near chennai';

    setSelectedZone(null);
    setSubmittedQuery(trimmed);

    // As soon as the question is asked or execute is clicked, zoom in 20% on Chennai or detected place
    const resolved = resolveLocationFromText(trimmed) || resolveLocationFromText('chennai');
    if (resolved) {
      setResolvedLocation(resolved);
      if (resolved.sectorId === 'visakhapatnam') {
        const lower = trimmed.toLowerCase();
        if (lower.includes('cyclone') || lower.includes('veto') || lower.includes('warning') || lower.includes('hazard')) {
          setActivePreset('scenario_02');
        } else {
          setActivePreset(null);
        }
      } else if (resolved.sectorId === 'chennai') {
        setActivePreset('scenario_01');
      } else {
        setActivePreset(null);
      }
    }

    setExecuteTrigger(Date.now());
    onQuerySubmit(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleExecute(e as any);
    }
  };

  const handleSelectPreset = (id: 'scenario_01' | 'scenario_02' | 'scenario_03', q: string) => {
    setActivePreset(id);
    setSelectedZone(null);
    setQueryInput(q);
    setSubmittedQuery(q);
    const resolved = resolveLocationFromText(q);
    if (resolved) {
      setResolvedLocation(resolved);
    }
    setExecuteTrigger(Date.now());
    onQuerySubmit(q);
  };

  return (
    <div className="space-y-3">
      
      {/* Preset Demo Scenarios Selector Header */}
      <div className="bg-[#0e1622] border border-[#1c2838] p-2.5 rounded-xl flex items-center justify-between gap-3">
        <span className="text-[11px] font-extrabold text-slate-300 uppercase tracking-wider font-mono shrink-0">
          PRESET DEMO SCENARIOS
        </span>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleSelectPreset('scenario_01', 'Where should I fish tomorrow near Chennai?')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold font-mono transition uppercase ${
              activePreset === 'scenario_01'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30 border border-cyan-400'
                : 'bg-[#060c16] text-slate-300 border border-[#1c2838] hover:border-cyan-500'
            }`}
          >
            CHENNAI CLEAR FISHING
          </button>

          <button
            onClick={() => handleSelectPreset('scenario_02', 'Can I take my boat out tomorrow near Vizag?')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold font-mono transition uppercase ${
              activePreset === 'scenario_02'
                ? 'bg-red-600 text-white shadow-md shadow-red-600/30 border border-red-500'
                : 'bg-[#060c16] text-slate-300 border border-[#1c2838] hover:border-red-500'
            }`}
          >
            CYCLONE SAFETY VETO
          </button>

          <button
            onClick={() => handleSelectPreset('scenario_03', 'நாளைக்கு சென்னைக்கு அருகில் எங்கு மீன் பிடிக்கலாம்?')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold font-mono transition uppercase ${
              activePreset === 'scenario_03'
                ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/30 border border-teal-400'
                : 'bg-[#060c16] text-slate-300 border border-[#1c2838] hover:border-teal-500'
            }`}
          >
            TAMIL VOICE QUERY
          </button>
        </div>
      </div>

      {/* Main 3-Column Cockpit Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        
        {/* Column 1 (Left 3-Cols): Query & Agent Execution Trace */}
        <div className="lg:col-span-3 space-y-3">
          <div className="bg-[#0e1622] border border-[#1c2838] p-3.5 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                INTELLIGENCE QUERY
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#060c16] text-slate-400 border border-[#1c2838] font-mono">
                EN
              </span>
            </div>

            <form onSubmit={handleExecute} className="space-y-3">
              <textarea
                rows={3}
                value={queryInput}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about fishing locations, hazards, sea conditions (e.g. Chennai, Vizag, Bangalore, Kochi)..."
                className="w-full bg-[#060c16] border border-[#1c2838] text-xs text-slate-100 p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-cyan-400 font-sans resize-none"
              ></textarea>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleSelectPreset('scenario_03', 'நாளைக்கு சென்னைக்கு அருகில் எங்கு மீன் பிடிக்கலாம்?')}
                  className="p-2 rounded-lg bg-[#060c16] text-slate-400 hover:text-cyan-400 border border-[#1c2838] transition"
                >
                  <Mic className="w-4 h-4" />
                </button>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-slate-950 font-extrabold text-xs uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition shadow-md shadow-cyan-400/20"
                >
                  <span>EXECUTE</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Location Identification Pill (Active only after sending query / finding place in chatbox) */}
              {resolvedLocation && (
                <div className="p-2.5 rounded-lg bg-[#061224] border border-cyan-500/40 text-[11px] font-mono text-cyan-300 shadow-sm mt-1">
                  <div className="font-bold flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{resolvedLocation.isCoastal ? 'COASTAL FOCUS' : 'INLAND MAPPED TO COAST'}</span>
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-200 border border-cyan-800">
                      ZOOM {resolvedLocation.zoom} {resolvedLocation.sectorId === 'chennai' ? '(+20%)' : ''}
                    </span>
                  </div>
                  <div className="text-slate-300 text-[10px] mt-1 leading-relaxed">
                    {resolvedLocation.isCoastal ? (
                      <>
                        Identified <b className="text-cyan-200">{resolvedLocation.matchedPlace}</b>
                        {resolvedLocation.confidence < 1 ? ` (spelling optimized from "${resolvedLocation.rawToken}")` : ''} • Coastal Sector Active.
                      </>
                    ) : (
                      <>
                        <b className="text-amber-300">{resolvedLocation.matchedPlace}</b> is an inland city
                        {resolvedLocation.confidence < 1 ? ` (optimized from "${resolvedLocation.rawToken}")` : ''}. Zoomed into nearest coastal sector: <b className="text-cyan-200">{resolvedLocation.sectorName}</b>.
                      </>
                    )}
                  </div>
                </div>
              )}
            </form>
          </div>

          <AgentTracePanel agentTraces={response?.agent_traces || []} />
        </div>

        {/* Column 2 (Center 6-Cols): Interactive Ocean GIS Map with deck.gl + MapLibre */}
        <div className="lg:col-span-6 space-y-3">
          <div className="h-[570px]">
            <MarineMap
              isVeto={isVeto}
              center={mapCenter}
              zoom={mapZoom}
              response={response}
              location={activeLocation}
              query={submittedQuery}
              selectedZone={selectedZone}
              onSelectZone={setSelectedZone}
              activePreset={activePreset}
              onSelectPreset={handleSelectPreset}
              executeTrigger={executeTrigger}
            />
          </div>
          <OceanTelemetryChart />
        </div>

        {/* Column 3 (Right 3-Cols): Recommended Zone, Suitability Ring & Key Ocean Drivers */}
        <div className="lg:col-span-3 space-y-3">
          <SuitabilityDonut
            breakdown={
              selectedZone
                ? {
                    zone_id: selectedZone.zone_id || 'pfz_chn_101',
                    total_score: (Number(selectedZone.score) && Number(selectedZone.score) < 100) ? Number(selectedZone.score) : 88,
                    pfz_contribution: 50,
                    chlorophyll_contribution: 20,
                    sst_contribution: 12,
                    accessibility_contribution: 6,
                    formula_explanation: 'OSI = PFZ baseline (50) + Chlorophyll (20) + SST (12) + Access (6)'
                  }
                : response?.suitability_breakdown || {
                    zone_id: 'pfz_chn_101',
                    total_score: 88,
                    pfz_contribution: 50,
                    chlorophyll_contribution: 20,
                    sst_contribution: 12,
                    accessibility_contribution: 6,
                    formula_explanation: 'OSI = PFZ baseline (50) + Chlorophyll (20) + SST (12) + Access (6)'
                  }
            }
            recommendation={
              selectedZone
                ? {
                    zone_id: selectedZone.zone_id || 'pfz_chn_101',
                    sector_name: selectedZone.sector_name || 'Chennai Offshore East',
                    center_lat: selectedZone.latitude || 13.1850,
                    center_lon: selectedZone.longitude || 80.6210,
                    depth_m: Number(selectedZone.depth_m) || 45,
                    bearing_deg: Number(selectedZone.bearing_deg) || 85,
                    distance_km: Number(selectedZone.distance_km) || 35.2,
                    nearest_landing_centre: selectedZone.nearest_landing_centre || 'Royapuram Fishing Harbour (Kasimedu)',
                    valid_from: new Date().toISOString(),
                    valid_until: new Date(Date.now() + 86400000).toISOString(),
                    strength_score: (Number(selectedZone.score) && Number(selectedZone.score) < 100) ? Number(selectedZone.score) : 88,
                    source: selectedZone.source || 'INCOIS',
                    fetched_at: new Date().toISOString()
                  }
                : response?.top_recommendation || {
                    zone_id: 'pfz_chn_101',
                    sector_name: 'Chennai Offshore East',
                    center_lat: 13.1850,
                    center_lon: 80.6210,
                    depth_m: 45,
                    bearing_deg: 85,
                    distance_km: 35.2,
                    nearest_landing_centre: 'Royapuram Fishing Harbour (Kasimedu)',
                    valid_from: new Date().toISOString(),
                    valid_until: new Date(Date.now() + 86400000).toISOString(),
                    strength_score: 88,
                    source: 'INCOIS',
                    fetched_at: new Date().toISOString()
                  }
            }
            isVeto={isVeto}
          />

          <KeyOceanDrivers
            weather={response?.weather_summary}
            dataMode={response?.data_mode || 'LIVE'}
          />

          <button
            onClick={() => window.location.href = '/evidence-inspector'}
            className="w-full py-3 bg-[#131d2b] hover:bg-[#1c2838] border border-[#20344d] text-cyan-300 font-extrabold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition shadow-lg"
          >
            <HelpCircle className="w-4 h-4 text-cyan-400" />
            <span>WHY THIS ZONE?</span>
          </button>
        </div>

      </div>

    </div>
  );
};
