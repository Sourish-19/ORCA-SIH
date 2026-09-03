import React, { useState } from 'react';
import { MarineMap } from '../components/map/MarineMap';
import { SuitabilityDonut } from '../components/SuitabilityDonut';
import { AgentTracePanel } from '../components/AgentTracePanel';
import { KeyOceanDrivers } from '../components/KeyOceanDrivers';
import { OceanTelemetryChart } from '../components/charts/OceanTelemetryChart';
import { Mic, Send, HelpCircle } from 'lucide-react';
import { ORCAResponse } from '../types';

interface DashboardProps {
  response: ORCAResponse | null;
  onQuerySubmit: (query: string) => void;
  isLoading: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({ response, onQuerySubmit, isLoading }) => {
  const [queryInput, setQueryInput] = useState('Where should I fish tomorrow near Chennai?');
  const [activePreset, setActivePreset] = useState<'scenario_01' | 'scenario_02' | 'scenario_03'>('scenario_01');
  const [selectedZone, setSelectedZone] = useState<any>(null);

  const isVeto = response?.safety?.veto_triggered || activePreset === 'scenario_02';

  const activeLocation = React.useMemo(() => {
    if (activePreset === 'scenario_02') return 'Visakhapatnam';
    if (activePreset === 'scenario_03') return 'Kochi';
    return response?.intent?.location_name || 'Chennai';
  }, [activePreset, response?.intent?.location_name]);

  const mapCenter: [number, number] = React.useMemo(() => {
    if (activePreset === 'scenario_02') return [83.3032, 17.6974];
    if (activePreset === 'scenario_03') return [76.1683, 10.1812];
    if (response?.top_recommendation?.center_lon && response?.top_recommendation?.center_lat) {
      return [response.top_recommendation.center_lon, response.top_recommendation.center_lat];
    }
    return [80.2974, 13.0827];
  }, [response?.top_recommendation, activePreset]);

  const mapZoom = activePreset === 'scenario_02' ? 7.5 : 8.5;

  const handleExecute = (e: React.FormEvent) => {
    e.preventDefault();
    if (queryInput.trim()) {
      setSelectedZone(null);
      const lower = queryInput.toLowerCase();
      if (lower.includes('vizag') || lower.includes('cyclone')) {
        setActivePreset('scenario_02');
      } else if (lower.includes('kochi') || lower.includes('munambam')) {
        setActivePreset('scenario_03');
      }
      onQuerySubmit(queryInput.trim());
    }
  };

  const handleSelectPreset = (id: 'scenario_01' | 'scenario_02' | 'scenario_03', q: string) => {
    setActivePreset(id);
    setSelectedZone(null);
    setQueryInput(q);
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
            onClick={() => handleSelectPreset('scenario_03', 'Kochi nallu meen enga kedaikkum?')}
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
                onChange={(e) => setQueryInput(e.target.value)}
                className="w-full bg-[#060c16] border border-[#1c2838] text-xs text-slate-100 p-2.5 rounded-lg outline-none focus:ring-1 focus:ring-cyan-400 font-sans resize-none"
              ></textarea>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleSelectPreset('scenario_03', 'Kochi nallu meen enga kedaikkum?')}
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
            </form>
          </div>

          <AgentTracePanel agentTraces={response?.agent_traces || []} />
        </div>

        {/* Column 2 (Center 6-Cols): Interactive Ocean GIS Map with deck.gl + MapLibre */}
        <div className="lg:col-span-6 space-y-3">
          <div className="h-[520px]">
            <MarineMap
              isVeto={isVeto}
              center={mapCenter}
              zoom={mapZoom}
              response={response}
              location={activeLocation}
              query={queryInput}
              selectedZone={selectedZone}
              onSelectZone={setSelectedZone}
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
                    zone_id: selectedZone.zone_id || 'zone_selected',
                    total_score: Number(selectedZone.score) || 88,
                    pfz_contribution: 50,
                    chlorophyll_contribution: 20,
                    sst_contribution: 12,
                    accessibility_contribution: 6,
                    formula_explanation: 'OSI = PFZ baseline (50) + Chlorophyll (20) + SST (12) + Access (6)'
                  }
                : response?.suitability_breakdown
            }
            recommendation={
              selectedZone
                ? {
                    zone_id: selectedZone.zone_id || 'zone_selected',
                    sector_name: selectedZone.sector_name || 'Selected Sector',
                    center_lat: 0,
                    center_lon: 0,
                    depth_m: Number(selectedZone.depth_m) || 35,
                    bearing_deg: Number(selectedZone.bearing_deg) || 87,
                    distance_km: Number(selectedZone.distance_km) || 12,
                    nearest_landing_centre: selectedZone.nearest_landing_centre || 'Harbour',
                    valid_from: new Date().toISOString(),
                    valid_until: new Date(Date.now() + 86400000).toISOString(),
                    strength_score: Number(selectedZone.score) || 88,
                    source: selectedZone.source || 'INCOIS',
                    fetched_at: new Date().toISOString()
                  }
                : response?.top_recommendation
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
