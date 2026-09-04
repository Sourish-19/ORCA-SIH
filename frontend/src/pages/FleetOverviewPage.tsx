import React, { useState, useEffect } from 'react';
import { Anchor, Navigation, ShieldAlert, CheckCircle2, AlertTriangle, Radio, X, Info } from 'lucide-react';
import { MarineMap } from '../components/map/MarineMap';
import { marineApi } from '../services/api/marineApi';

export const FleetOverviewPage: React.FC = () => {
  const [fleetData, setFleetData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedVessel, setSelectedVessel] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchVessels = () => {
      marineApi.getFleetVessels('Chennai')
        .then((data) => {
          if (isMounted) {
            setFleetData(data);
            setIsLoading(false);
          }
        })
        .catch((err) => {
          console.error('Failed to fetch fleet telemetry', err);
          if (isMounted) setIsLoading(false);
        });
    };

    fetchVessels();
    const interval = setInterval(fetchVessels, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const vessels = fleetData?.vessels || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start h-[calc(100vh-80px)]">
      
      {/* Left 8-Cols: Map & Current Conditions Overlay */}
      <div className="lg:col-span-8 h-full flex flex-col space-y-2">
        <div className="bg-[#0e1622] border border-[#1c2838] p-3 rounded-xl flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-slate-100 uppercase tracking-wide">
              ORCA Intelligence Vessel Tracking
            </h2>
            <p className="text-[11px] text-slate-400">Chennai • Bay of Bengal Coastal Fleet Telemetry</p>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="bg-[#060c16] px-3 py-1 rounded border border-[#1c2838]">
              <span className="text-slate-500 text-[10px] block">SST</span>
              <strong className="text-cyan-300">{fleetData?.sst_celsius || 28.4}°C</strong>
            </div>
            <div className="bg-[#060c16] px-3 py-1 rounded border border-[#1c2838]">
              <span className="text-slate-500 text-[10px] block">WAVE</span>
              <strong className="text-teal-300">{fleetData?.wave_height_m || 1.1} m</strong>
            </div>
          </div>
        </div>

        <div className="flex-1">
          <MarineMap location="Chennai" query="Fleet Telemetry Kasimedu Harbour" />
        </div>
      </div>

      {/* Right 4-Cols: Fleet Overview Panel */}
      <div className="lg:col-span-4 bg-[#0e1622] border border-[#1c2838] rounded-xl p-4 space-y-4 h-full flex flex-col overflow-y-auto">
        
        {/* Header Summary */}
        <div className="pb-3 border-b border-[#1c2838]">
          <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider">
            FLEET OVERVIEW
          </h3>

          <div className="grid grid-cols-2 gap-4 mt-3 font-mono">
            <div className="bg-[#060c16] p-2.5 rounded-lg border border-[#1c2838]">
              <span className="text-2xl font-extrabold text-cyan-400 block">
                {isLoading ? '...' : fleetData?.active_count || 142}
              </span>
              <span className="text-[10px] text-slate-400 uppercase font-sans font-semibold">Vessels Active</span>
            </div>

            <div className="bg-[#060c16] p-2.5 rounded-lg border border-[#1c2838]">
              <span className="text-2xl font-extrabold text-red-500 block">
                {isLoading ? '...' : fleetData?.hazard_count || 12}
              </span>
              <span className="text-[10px] text-slate-400 uppercase font-sans font-semibold">In Hazards</span>
            </div>
          </div>
        </div>

        {/* Vessel Cards List */}
        <div className="space-y-3 flex-1">
          {isLoading ? (
            <div className="text-xs font-mono text-slate-400 p-4 text-center">
              Fetching AIS Vessel Telemetry from backend...
            </div>
          ) : (
            vessels.map((v: any) => (
              <div
                key={v.id || v.vessel_id}
                className={`bg-[#060c18] border p-3.5 rounded-xl space-y-3 transition ${
                  v.isHazard ? 'border-red-500/80 bg-red-950/20' : 'border-[#1c2838] hover:border-cyan-500/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-100 font-mono">{v.code || v.vessel_id}</h4>
                    <span className="text-[10px] text-slate-400 font-sans block">{v.name}</span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${v.badgeStyle}`}>
                    {v.badge}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400">
                  <div>
                    <span className="text-slate-500 block">PROXIMITY TO PFZ</span>
                    <span className="text-slate-200">{v.proximity}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">LAST PING</span>
                    <span className="text-emerald-400">● {v.lastPing}</span>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedVessel(v)}
                  className={`w-full py-1.5 rounded-lg text-xs font-bold transition border ${
                    v.isHazard
                      ? 'bg-red-950 text-red-300 border-red-700 hover:bg-red-900'
                      : 'bg-[#0e1622] text-slate-300 border-[#1c2838] hover:border-cyan-500'
                  }`}
                >
                  View Details
                </button>
              </div>
            ))
          )}
        </div>

      </div>

      {/* Selected Vessel Telemetry Detail Modal */}
      {selectedVessel && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b1420] border border-[#1c2838] p-5 rounded-2xl max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1c2838] pb-3">
              <div>
                <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-widest block">
                  AIS TELEMETRY DETAILS
                </span>
                <h3 className="text-base font-extrabold text-slate-100 font-mono mt-0.5">
                  {selectedVessel.name} ({selectedVessel.vessel_id || selectedVessel.code})
                </h3>
              </div>
              <button
                onClick={() => setSelectedVessel(null)}
                className="p-1.5 rounded-lg bg-[#050c18] border border-[#1c2838] text-slate-400 hover:text-slate-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="flex justify-between py-1.5 border-b border-[#1c2838]">
                <span className="text-slate-400">Vessel Type:</span>
                <span className="text-slate-100 font-bold">{selectedVessel.type}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#1c2838]">
                <span className="text-slate-400">Operating Harbour:</span>
                <span className="text-cyan-300 font-bold">{selectedVessel.harbour}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#1c2838]">
                <span className="text-slate-400">Speed / Heading:</span>
                <span className="text-slate-100 font-bold">{selectedVessel.speed_knots} kts | {selectedVessel.heading_deg}° SE</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#1c2838]">
                <span className="text-slate-400">Coordinates:</span>
                <span className="text-slate-100 font-bold">{selectedVessel.latitude?.toFixed(4)}°N, {selectedVessel.longitude?.toFixed(4)}°E</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#1c2838]">
                <span className="text-slate-400">Status / Alert:</span>
                <span className={selectedVessel.isHazard ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
                  {selectedVessel.status}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-400">Last Telemetry Ping:</span>
                <span className="text-emerald-400 font-bold">● {selectedVessel.lastPing}</span>
              </div>
            </div>

            <button
              onClick={() => setSelectedVessel(null)}
              className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider rounded-xl transition"
            >
              CLOSE TELEMETRY PANEL
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
