import React from 'react';
import { Anchor, Navigation, ShieldAlert, CheckCircle2, AlertTriangle, Radio } from 'lucide-react';
import { MarineMap } from '../components/map/MarineMap';

export const FleetOverviewPage: React.FC = () => {
  const fleetList = [
    {
      id: 'v_104',
      code: 'IND-TN-02-MM-104',
      badge: '⚓ Fishing',
      badgeStyle: 'bg-cyan-950 text-cyan-300 border-cyan-800',
      proximity: 'Inside Zone',
      lastPing: '2 min ago',
      isHazard: false
    },
    {
      id: 'v_302',
      code: 'IND-AP-05-MM-302',
      badge: '⚠️ HAZARD',
      badgeStyle: 'bg-red-950 text-red-400 border-red-800',
      proximity: '3.2km away',
      lastPing: '1 min ago',
      isHazard: true
    },
    {
      id: 'v_088',
      code: 'IND-TN-01-MM-088',
      badge: '🚢 Transit',
      badgeStyle: 'bg-slate-900 text-slate-300 border-slate-700',
      proximity: '1.5km away',
      lastPing: '5 min ago',
      isHazard: false
    },
    {
      id: 'v_211',
      code: 'IND-TN-04-MM-211',
      badge: '🚢 Transit',
      badgeStyle: 'bg-slate-900 text-slate-300 border-slate-700',
      proximity: '5.0km away',
      lastPing: '12 min ago',
      isHazard: false
    }
  ];

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
              <strong className="text-cyan-300">28.4°C</strong>
            </div>
            <div className="bg-[#060c16] px-3 py-1 rounded border border-[#1c2838]">
              <span className="text-slate-500 text-[10px] block">WAVE</span>
              <strong className="text-teal-300">1.1 m</strong>
            </div>
          </div>
        </div>

        <div className="flex-1">
          <MarineMap location="Chennai" query="Fleet Telemetry Kasimedu Harbour" />
        </div>
      </div>

      {/* Right 4-Cols: Fleet Overview Panel matching image 2 */}
      <div className="lg:col-span-4 bg-[#0e1622] border border-[#1c2838] rounded-xl p-4 space-y-4 h-full flex flex-col overflow-y-auto">
        
        {/* Header Summary */}
        <div className="pb-3 border-b border-[#1c2838]">
          <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider">
            FLEET OVERVIEW
          </h3>

          <div className="grid grid-cols-2 gap-4 mt-3 font-mono">
            <div className="bg-[#060c16] p-2.5 rounded-lg border border-[#1c2838]">
              <span className="text-2xl font-extrabold text-cyan-400 block">142</span>
              <span className="text-[10px] text-slate-400 uppercase font-sans font-semibold">Vessels Active</span>
            </div>

            <div className="bg-[#060c16] p-2.5 rounded-lg border border-[#1c2838]">
              <span className="text-2xl font-extrabold text-red-500 block">12</span>
              <span className="text-[10px] text-slate-400 uppercase font-sans font-semibold">In Hazards</span>
            </div>
          </div>
        </div>

        {/* Vessel Cards List */}
        <div className="space-y-3 flex-1">
          {fleetList.map((v) => (
            <div
              key={v.id}
              className={`bg-[#060c16] border p-3.5 rounded-xl space-y-3 transition ${
                v.isHazard ? 'border-red-500/80 bg-red-950/20' : 'border-[#1c2838] hover:border-cyan-500/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-100 font-mono">{v.code}</h4>
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
                className={`w-full py-1.5 rounded-lg text-xs font-bold transition border ${
                  v.isHazard
                    ? 'bg-red-950 text-red-300 border-red-700 hover:bg-red-900'
                    : 'bg-[#0e1622] text-slate-300 border-[#1c2838] hover:border-cyan-500'
                }`}
              >
                View Details
              </button>
            </div>
          ))}
        </div>

      </div>

    </div>
  );
};
