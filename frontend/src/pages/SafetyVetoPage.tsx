import React, { useState } from 'react';
import { SafetyHUD } from '../components/safety/SafetyHUD';
import { MarineMap } from '../components/map/MarineMap';
import {
  AlertTriangle,
  ShieldAlert,
  Wind,
  Waves,
  Radio,
  Sliders,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Volume2,
  ShieldCheck,
  Activity,
  Gauge,
  Compass,
  FileText,
  Lock,
  Zap,
  MapPin
} from 'lucide-react';
import { ORCAResponse } from '../types';

interface SafetyVetoPageProps {
  response?: ORCAResponse | null;
}

export const SafetyVetoPage: React.FC<SafetyVetoPageProps> = ({ response }) => {
  // Preset Scenarios & Interactive Parameter Controls State
  const [activeScenario, setActiveScenario] = useState<'vizag_cyclone' | 'mangalore_swell' | 'chennai_safe' | 'custom'>('vizag_cyclone');
  
  // Custom Slider Telemetry Parameters
  const [windSpeed, setWindSpeed] = useState<number>(48.5); // kts
  const [waveHeight, setWaveHeight] = useState<number>(3.8); // meters
  const [pressure, setPressure] = useState<number>(988); // hPa
  const [stormDistance, setStormDistance] = useState<number>(45); // km

  // Notification Toast for VHF Broadcast Simulation
  const [vhfToast, setVhfToast] = useState<string | null>(null);

  // Apply Preset Scenarios
  const handleSelectScenario = (sc: 'vizag_cyclone' | 'mangalore_swell' | 'chennai_safe') => {
    setActiveScenario(sc);
    if (sc === 'vizag_cyclone') {
      setWindSpeed(48.5);
      setWaveHeight(3.8);
      setPressure(988);
      setStormDistance(45);
    } else if (sc === 'mangalore_swell') {
      setWindSpeed(28.5);
      setWaveHeight(2.8);
      setPressure(1002);
      setStormDistance(120);
    } else if (sc === 'chennai_safe') {
      setWindSpeed(12.5);
      setWaveHeight(1.1);
      setPressure(1012);
      setStormDistance(380);
    }
  };

  // Evaluate Deterministic Safety Veto Conditions
  const isWindVeto = windSpeed > 25.0;
  const isWaveVeto = waveHeight > 2.5;
  const isPressureVeto = pressure < 1000;
  const isDistVeto = stormDistance < 150;

  const isVetoActive = isWindVeto || isWaveVeto || isPressureVeto || isDistVeto;
  const safetyStatus: 'SAFE' | 'VETO' = isVetoActive ? 'VETO' : 'SAFE';

  // Compute Active Location & Map Camera Coordinates
  const activeLocationName = activeScenario === 'vizag_cyclone' ? 'Visakhapatnam'
    : activeScenario === 'mangalore_swell' ? 'Mangalore'
    : activeScenario === 'chennai_safe' ? 'Chennai'
    : 'Custom Marine Sector';

  const mapCenter: [number, number] = activeScenario === 'vizag_cyclone' ? [83.3032, 17.6974]
    : activeScenario === 'mangalore_swell' ? [74.8320, 12.8550]
    : activeScenario === 'chennai_safe' ? [80.2974, 13.0827]
    : [80.2974, 13.0827];

  const mapZoom = activeScenario === 'vizag_cyclone' ? 7.5 : activeScenario === 'mangalore_swell' ? 8.5 : 9.5;

  // Generate Hard Veto Trigger Reasons
  const getVetoReasons = () => {
    const reasons: string[] = [];
    if (isWindVeto) {
      reasons.push(`Gale wind speed threshold exceeded: ${windSpeed.toFixed(1)} knots (Maximum safe threshold: 25.0 knots)`);
    }
    if (isWaveVeto) {
      reasons.push(`Significant wave height threshold exceeded: ${waveHeight.toFixed(1)} meters (Maximum safe threshold: 2.5 meters)`);
    }
    if (isPressureVeto) {
      reasons.push(`Severe barometric pressure drop detected: ${pressure} hPa (Cyclone Alert Boundary: < 1000 hPa)`);
    }
    if (isDistVeto) {
      reasons.push(`Extreme weather storm center proximity hazard: ${stormDistance} km from sector (Minimum safe buffer: 150 km)`);
    }
    return reasons;
  };

  const handleSendVHFBroadcast = () => {
    const msg = `[IMD/COAST GUARD EMERGENCY BROADCAST] VHF CH 16 (156.8 MHz): Severe weather advisory dispatched to Sector 12 Coast Guard & Kasimedu/Vizag fleet units. ${isVetoActive ? 'ALL SHIPS ORDERED TO RETURN TO HARBOUR IMMEDIATELY.' : 'NORMAL MARINE OPERATIONS CLEAR.'}`;
    setVhfToast(msg);
    setTimeout(() => setVhfToast(null), 5000);
  };

  return (
    <div className="space-y-4 font-sans text-slate-100 pb-8">
      
      {/* Toast Notification for Emergency VHF Transmission */}
      {vhfToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[10000] bg-red-950/95 text-red-200 border-2 border-red-500 p-4 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-3 text-xs font-mono animate-bounce max-w-xl">
          <Volume2 className="w-5 h-5 text-red-400 shrink-0 animate-pulse" />
          <span>{vhfToast}</span>
        </div>
      )}

      {/* Title & Interactive Scenario Selector Header */}
      <div className="bg-[#0e1622] border border-[#1c2838] p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2 font-sans">
            <ShieldAlert className="w-5 h-5 text-red-500 animate-pulse" />
            ORCA Safety Veto & Deterministic Gatekeeper
          </h1>
          <p className="text-xs text-slate-400 font-medium">
            Hard boundary enforcement engine: Overrides biological suitability when meteorological parameters breach safety limits
          </p>
        </div>

        {/* Preset Threat Scenario Selector Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => handleSelectScenario('vizag_cyclone')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 border uppercase ${
              activeScenario === 'vizag_cyclone'
                ? 'bg-red-600 text-white border-red-400 shadow-lg shadow-red-600/30'
                : 'bg-[#060c16] text-slate-300 border-[#1c2838] hover:border-red-500'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <span>Vizag Cyclone (Veto)</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectScenario('mangalore_swell')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 border uppercase ${
              activeScenario === 'mangalore_swell'
                ? 'bg-amber-600 text-white border-amber-400 shadow-lg shadow-amber-600/30'
                : 'bg-[#060c16] text-slate-300 border-[#1c2838] hover:border-amber-500'
            }`}
          >
            <Wind className="w-3.5 h-3.5 text-amber-300" />
            <span>Mangalore Swell (Veto)</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectScenario('chennai_safe')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 border uppercase ${
              activeScenario === 'chennai_safe'
                ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-600/30'
                : 'bg-[#060c16] text-slate-300 border-[#1c2838] hover:border-emerald-500'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
            <span>Chennai Clear (Safe)</span>
          </button>
        </div>
      </div>

      {/* Dynamic SafetyHUD Prominent Status Banner */}
      <SafetyHUD
        safetyStatus={safetyStatus}
        riskLevel={isVetoActive ? (windSpeed > 40 ? 'CRITICAL / RED ALERT' : 'HIGH / SEVERE') : 'LOW / SAFE'}
        summary={
          isVetoActive
            ? `SAFETY VETO ACTIVE — Hard meteorological boundaries breached in ${activeLocationName} Coastal Sector. Wind speed ${windSpeed.toFixed(1)} kts, wave height ${waveHeight.toFixed(1)}m. Operational fishing refusal in effect.`
            : `OPERATIONAL SAFETY CLEARANCE — Marine weather parameters clear in ${activeLocationName} Sector. Wind speed ${windSpeed.toFixed(1)} kts, wave height ${waveHeight.toFixed(1)}m. Cleared for marine transit.`
        }
        reasons={getVetoReasons()}
      />

      {/* Main Cockpit Grid: Biological Suitability vs Operational Safety Decision */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* Left Column (5-Cols): Biological Score vs Operational Gatekeeper & Parameter Tuning */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Side-by-Side Comparison Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            
            {/* Card 1: High Biological Suitability */}
            <div className="bg-[#0b1420] border border-[#1c2838] p-4 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                  BIOLOGICAL FISHING SUITABILITY
                </span>
                <span className="text-lg font-mono font-black text-emerald-400">92 / 100</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                INCOIS & MOSDAC telemetry indicates very high ocean productivity and dense fish schooling potential.
              </p>
              <div className="w-full bg-[#050c18] h-2 rounded-full overflow-hidden border border-[#1c2838]">
                <div className="bg-emerald-500 h-full w-[92%] transition-all duration-500"></div>
              </div>
            </div>

            {/* Card 2: Operational Safety Veto Override */}
            <div className={`p-4 rounded-xl space-y-2 border transition ${
              isVetoActive
                ? 'bg-red-950/40 border-red-700 text-red-200'
                : 'bg-emerald-950/40 border-emerald-700 text-emerald-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest font-mono">
                  OPERATIONAL SAFETY DECISION
                </span>
                <span className={`text-sm font-mono font-black px-2 py-0.5 rounded border ${
                  isVetoActive ? 'bg-red-900 text-red-200 border-red-700' : 'bg-emerald-900 text-emerald-200 border-emerald-700'
                }`}>
                  {isVetoActive ? 'VETO ACTIVE' : 'CLEAR TO SAIL'}
                </span>
              </div>
              <p className="text-xs leading-relaxed font-sans">
                {isVetoActive
                  ? '🚨 ORCA Safety Specialist Agent overrides positive biological suitability due to extreme weather hazard.'
                  : '✓ ORCA Safety Gatekeeper confirms sea conditions are safe for navigation and commercial harvesting.'}
              </p>
              <div className="w-full bg-[#050c18] h-2 rounded-full overflow-hidden border border-[#1c2838]">
                <div className={`h-full transition-all duration-500 ${isVetoActive ? 'bg-red-600 w-full animate-pulse' : 'bg-emerald-500 w-[15%]'}`}></div>
              </div>
            </div>

          </div>

          {/* Interactive Meteorological Parameter Tuner & Boundary Matrix */}
          <div className="bg-[#0e1622] border border-[#1c2838] p-4 rounded-xl space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-[#1c2838] pb-3">
              <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider font-mono flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                Live Meteorological Boundary Matrix
              </h3>
              <button
                type="button"
                onClick={() => handleSelectScenario('vizag_cyclone')}
                className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-[#060c16] px-2 py-1 rounded border border-[#1c2838]"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Defaults
              </button>
            </div>

            {/* Interactive Sliders Grid */}
            <div className="space-y-4 font-mono text-xs">
              
              {/* Slider 1: Wind Speed */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Wind className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Wind Speed (kts):</span>
                  </span>
                  <strong className={windSpeed > 25 ? 'text-red-400' : 'text-emerald-400'}>
                    {windSpeed.toFixed(1)} kts {windSpeed > 25 ? '(LIMIT BREACHED)' : '(SAFE)'}
                  </strong>
                </div>
                <input
                  type="range"
                  min="5"
                  max="65"
                  step="0.5"
                  value={windSpeed}
                  onChange={(e) => {
                    setActiveScenario('custom');
                    setWindSpeed(parseFloat(e.target.value));
                  }}
                  className="w-full h-1.5 bg-[#050c18] rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
                <div className="flex justify-between text-[9px] text-slate-500">
                  <span>5 kts (Calm)</span>
                  <span className="text-red-400 font-bold">25 kts Safe Boundary</span>
                  <span>65 kts (Super Cyclone)</span>
                </div>
              </div>

              {/* Slider 2: Wave Height */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Waves className="w-3.5 h-3.5 text-teal-400" />
                    <span>Significant Wave Height (m):</span>
                  </span>
                  <strong className={waveHeight > 2.5 ? 'text-red-400' : 'text-emerald-400'}>
                    {waveHeight.toFixed(1)} m {waveHeight > 2.5 ? '(LIMIT BREACHED)' : '(SAFE)'}
                  </strong>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="7.0"
                  step="0.1"
                  value={waveHeight}
                  onChange={(e) => {
                    setActiveScenario('custom');
                    setWaveHeight(parseFloat(e.target.value));
                  }}
                  className="w-full h-1.5 bg-[#050c18] rounded-lg appearance-none cursor-pointer accent-teal-400"
                />
                <div className="flex justify-between text-[9px] text-slate-500">
                  <span>0.5 m (Smooth)</span>
                  <span className="text-red-400 font-bold">2.5 m Safe Ceiling</span>
                  <span>7.0 m (High Seas)</span>
                </div>
              </div>

              {/* Slider 3: Barometric Pressure */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5 text-amber-400" />
                    <span>Barometric Pressure (hPa):</span>
                  </span>
                  <strong className={pressure < 1000 ? 'text-red-400' : 'text-emerald-400'}>
                    {pressure} hPa {pressure < 1000 ? '(CYCLONE ALERT)' : '(STABLE)'}
                  </strong>
                </div>
                <input
                  type="range"
                  min="960"
                  max="1020"
                  step="1"
                  value={pressure}
                  onChange={(e) => {
                    setActiveScenario('custom');
                    setPressure(parseInt(e.target.value));
                  }}
                  className="w-full h-1.5 bg-[#050c18] rounded-lg appearance-none cursor-pointer accent-amber-400"
                />
                <div className="flex justify-between text-[9px] text-slate-500">
                  <span>960 hPa (Depression)</span>
                  <span className="text-amber-400 font-bold">1000 hPa Boundary</span>
                  <span>1020 hPa (High Pressure)</span>
                </div>
              </div>

            </div>

            {/* Emergency Action Buttons */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSendVHFBroadcast}
                className="w-full py-2.5 bg-red-950 hover:bg-red-900 text-red-300 border border-red-700 font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-red-950/50"
              >
                <Radio className="w-4 h-4 text-red-400 animate-pulse" />
                <span>DISPATCH EMERGENCY VHF BROADCAST (CH 16)</span>
              </button>
            </div>

          </div>

          {/* Hard Boundary Deterministic Gatekeeper Table */}
          <div className="bg-[#0e1622] border border-[#1c2838] p-4 rounded-xl space-y-3">
            <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider font-mono flex items-center justify-between">
              <span>DETERMINISTIC GATEKEEPER VERDICT</span>
              <span className="text-[10px] text-slate-400 font-normal">IMD & Coast Guard Policy</span>
            </h3>

            <div className="space-y-2 font-mono text-[11px]">
              {/* Gate 1 */}
              <div className="p-2.5 rounded-lg bg-[#060c16] border border-[#1c2838] flex items-center justify-between">
                <span className="text-slate-300">1. IMD Gale Wind Boundary (&le; 25.0 kts)</span>
                <span className={`font-bold flex items-center gap-1 ${isWindVeto ? 'text-red-400' : 'text-emerald-400'}`}>
                  {isWindVeto ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {isWindVeto ? 'BREACHED' : 'PASSED'}
                </span>
              </div>

              {/* Gate 2 */}
              <div className="p-2.5 rounded-lg bg-[#060c16] border border-[#1c2838] flex items-center justify-between">
                <span className="text-slate-300">2. INCOIS Wave Height Ceiling (&le; 2.5 m)</span>
                <span className={`font-bold flex items-center gap-1 ${isWaveVeto ? 'text-red-400' : 'text-emerald-400'}`}>
                  {isWaveVeto ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {isWaveVeto ? 'BREACHED' : 'PASSED'}
                </span>
              </div>

              {/* Gate 3 */}
              <div className="p-2.5 rounded-lg bg-[#060c16] border border-[#1c2838] flex items-center justify-between">
                <span className="text-slate-300">3. Cyclone Proximity Distance (&ge; 150 km)</span>
                <span className={`font-bold flex items-center gap-1 ${isDistVeto ? 'text-red-400' : 'text-emerald-400'}`}>
                  {isDistVeto ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {isDistVeto ? 'BREACHED' : 'PASSED'}
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column (7-Cols): Map View with Hazard Bounding Boxes & Telemetry */}
        <div className="lg:col-span-7 space-y-4">
          
          <div className="h-[620px] rounded-xl overflow-hidden border border-[#1c2838] shadow-2xl">
            <MarineMap
              isVeto={isVetoActive}
              location={activeLocationName}
              query={isVetoActive ? "Severe Weather Cyclone Warning Active" : "Clear Weather"}
              center={mapCenter}
              zoom={mapZoom}
              response={response}
            />
          </div>

          {/* Safety Agent Multi-Agent Execution Provenance */}
          <div className="bg-[#0e1622] border border-[#1c2838] p-4 rounded-xl space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-[#1c2838] pb-2">
              <span className="font-extrabold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-cyan-400" />
                SAFETY AGENT REASONING PROVENANCE
              </span>
              <span className="text-[10px] text-slate-400">Deterministic Safety Pipeline</span>
            </div>

            <div className="space-y-2 text-[11px] text-slate-300">
              <div className="p-2 bg-[#060c16] rounded border border-[#1c2838] leading-relaxed">
                <strong className="text-cyan-300 block mb-0.5">Input Vector:</strong>
                Target Location: <span className="text-white">{activeLocationName} Sector</span> | Measured Wind: <span className="text-amber-300">{windSpeed.toFixed(1)} kts</span> | Wave Height: <span className="text-teal-300">{waveHeight.toFixed(1)}m</span> | Pressure: <span className="text-slate-200">{pressure} hPa</span>
              </div>

              <div className="p-2 bg-[#060c16] rounded border border-[#1c2838] leading-relaxed">
                <strong className="text-cyan-300 block mb-0.5">Rule Evaluation Outcome:</strong>
                {isVetoActive ? (
                  <span className="text-red-400 font-bold">
                    🚨 HARD SAFETY BOUNDARY EXCEEDED. Biological Suitability score (92/100) overridden by Safety Gatekeeper. Refusal advisory generated.
                  </span>
                ) : (
                  <span className="text-emerald-400 font-bold">
                    ✓ ALL SAFETY GATES CLEAR. Biological suitability score (92/100) endorsed by Safety Gatekeeper. Voyage approved.
                  </span>
                )}
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
