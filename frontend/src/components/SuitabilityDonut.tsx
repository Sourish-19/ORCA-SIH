import React from 'react';
import { SuitabilityBreakdown, PFZCandidateZone } from '../types';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

interface SuitabilityDonutProps {
  breakdown?: SuitabilityBreakdown | null;
  recommendation?: PFZCandidateZone | null;
  isVeto?: boolean;
  onWhyThisZone?: () => void;
}

export const SuitabilityDonut: React.FC<SuitabilityDonutProps> = ({
  breakdown,
  recommendation,
  isVeto = false,
  onWhyThisZone
}) => {
  const rawScore = isVeto ? 0 : breakdown?.total_score ?? recommendation?.strength_score ?? 88;
  const score = isVeto ? 0 : (Math.round(rawScore) >= 100 ? 88 : Math.round(rawScore));
  const sectorName = recommendation?.sector_name || 'Chennai Offshore East';
  const bearing = recommendation?.bearing_deg ? `${recommendation.bearing_deg}° SE` : '107° SE';
  const distance = recommendation?.distance_km ? `${recommendation.distance_km} km` : '38 km';
  const depth = recommendation?.depth_m ? `${recommendation.depth_m} m` : '215 m';

  return (
    <div className="bg-[#0e1622] border border-[#1c2838] rounded-xl p-4 space-y-4">
      {/* Recommended Zone Header */}
      <div>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
          RECOMMENDED FISHING ZONE
        </span>
        <h3 className="text-lg font-bold text-slate-100 mt-0.5">{sectorName}</h3>
        <p className="text-xs text-cyan-400 font-mono font-medium">Sector: INCOIS SEC007</p>
      </div>

      {/* Safety Clearance Badge */}
      <div
        className={`px-3 py-2 rounded-lg flex items-center justify-between font-bold text-xs border ${
          isVeto
            ? 'bg-red-950/80 border-red-500 text-red-100'
            : 'bg-emerald-950/60 border-emerald-500/80 text-emerald-300'
        }`}
      >
        <span className="flex items-center gap-2">
          {isVeto ? (
            <>
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span>🚨 SAFETY VETO ACTIVE</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span>● SAFE TO PROCEED</span>
            </>
          )}
        </span>
        <ShieldCheck className="w-4 h-4 text-emerald-400" />
      </div>

      {/* Suitability Ring & Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Suitability Score Ring */}
        <div className="bg-[#09101b] border border-[#1c2838] p-3 rounded-xl flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            SUITABILITY
          </span>
          <div className="relative w-20 h-20 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" stroke="#172436" strokeWidth="10" fill="transparent" />
              <circle
                cx="50"
                cy="50"
                r="40"
                stroke={isVeto ? '#ef4444' : '#38bdf8'}
                strokeWidth="10"
                strokeDasharray={2 * Math.PI * 40}
                strokeDashoffset={(2 * Math.PI * 40) * (1 - score / 100)}
                strokeLinecap="round"
                fill="transparent"
                className="transition-all duration-700"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xl font-extrabold text-slate-100 font-mono">{score.toFixed(0)}</span>
              <span className="text-[9px] text-slate-400 font-mono">/100</span>
            </div>
          </div>
        </div>

        {/* Bearing, Distance, Depth Box Grid */}
        <div className="space-y-2">
          <div className="bg-[#09101b] border border-[#1c2838] px-3 py-1.5 rounded-lg">
            <span className="text-[9px] text-slate-400 block font-bold uppercase">BEARING</span>
            <span className="text-xs font-bold text-slate-100 font-mono">{bearing}</span>
          </div>

          <div className="bg-[#09101b] border border-[#1c2838] px-3 py-1.5 rounded-lg">
            <span className="text-[9px] text-slate-400 block font-bold uppercase">DISTANCE</span>
            <span className="text-xs font-bold text-slate-100 font-mono">{distance}</span>
          </div>

          <div className="bg-[#09101b] border border-[#1c2838] px-3 py-1.5 rounded-lg">
            <span className="text-[9px] text-slate-400 block font-bold uppercase">DEPTH</span>
            <span className="text-xs font-bold text-slate-100 font-mono">{depth}</span>
          </div>
        </div>
      </div>

    </div>
  );
};
