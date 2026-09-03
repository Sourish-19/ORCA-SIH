import React from 'react';
import { SafetyHUD } from '../components/safety/SafetyHUD';
import { MarineMap } from '../components/map/MarineMap';
import { AlertTriangle, ShieldAlert, Wind, Waves, Radio } from 'lucide-react';
import { ORCAResponse } from '../types';

interface SafetyVetoPageProps {
  response: ORCAResponse | null;
}

export const SafetyVetoPage: React.FC<SafetyVetoPageProps> = ({ response }) => {
  return (
    <div className="space-y-4">
      {/* Safety Veto Prominent Banner */}
      <SafetyHUD
        safetyStatus="VETO"
        summary="SAFETY VETO ACTIVE — IMD Severe Cyclonic Storm Warning active near Visakhapatnam. Gale winds 45-55 knots, wave height 3.2m. All vessels strictly advised to remain docked."
        reasons={[
          "Official RED Alert Issued: IMD Cyclone Warning Centre Visakhapatnam",
          "Gale wind speed threshold exceeded: 48.5 knots (Max safe: 25 knots)",
          "Wave height threshold exceeded: 3.2 meters (Max safe: 2.5 meters)",
          "Vessel Stability & Storm Surge Risk in sector"
        ]}
        riskLevel="SEVERE"
      />

      {/* Grid: Biological Suitability vs Operational Safety Veto */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Card 1: High Biological Suitability */}
        <div className="bg-[#0b172a] border border-[#1b2b45] p-4 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              BIOLOGICAL FISHING SUITABILITY
            </span>
            <span className="text-lg font-mono font-extrabold text-emerald-400">92 / 100</span>
          </div>
          <p className="text-xs text-slate-300">
            INCOIS & MOSDAC telemetry indicates very high ocean productivity and dense fish schooling potential.
          </p>
          <div className="w-full bg-[#070f1e] h-2 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full w-[92%]"></div>
          </div>
        </div>

        {/* Card 2: Operational Safety Veto Override */}
        <div className="bg-red-950/40 border border-red-800 p-4 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
              OPERATIONAL SAFETY DECISION
            </span>
            <span className="text-lg font-mono font-extrabold text-red-500">VETO ACTIVE</span>
          </div>
          <p className="text-xs text-red-200">
            🚨 ORCA Safety Specialist Agent overrides positive biological suitability due to extreme weather hazard.
          </p>
          <div className="w-full bg-red-950 h-2 rounded-full overflow-hidden border border-red-800">
            <div className="bg-red-600 h-full w-full animate-pulse"></div>
          </div>
        </div>

      </div>

      {/* Map with Hazard Bounding Box Overlay */}
      <MarineMap
        isVeto={true}
        location="Visakhapatnam"
        query="Severe Cyclone Warning Active"
        center={[83.3032, 17.6974]}
        zoom={7.5}
        response={response}
      />
    </div>
  );
};
