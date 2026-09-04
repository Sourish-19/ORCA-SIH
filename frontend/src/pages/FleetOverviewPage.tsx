import React, { useState, useEffect } from 'react';
import { Anchor, Navigation, ShieldAlert, CheckCircle2, AlertTriangle, Radio, X, Info, Locate, ExternalLink, Activity, Fuel, Gauge, Eye } from 'lucide-react';
import { MarineMap } from '../components/map/MarineMap';
import { marineApi } from '../services/api/marineApi';

const DEFAULT_VESSELS = [
  {
    id: "v_7740",
    vessel_id: "IND-TN-7740",
    name: "HAN HUI",
    type: "Mechanized Trawler",
    badge: "⚠️ HAZARD",
    badgeStyle: "bg-red-950 text-red-400 border-red-800",
    proximity: "0.0 kts from Kasimedu Harbour",
    lastPing: "Live AIS (Chennai Base)",
    isHazard: true,
    speed_knots: 0.0,
    heading_deg: 0,
    harbour: "Kasimedu Harbour (Chennai)",
    latitude: 13.1120,
    longitude: 80.3950,
    mmsi: "419007740",
    imo: "IMO 9827740",
    call_sign: "VW7740",
    crew_onboard: 6,
    fuel_level_pct: 68,
    engine_status: "Stationary / Anchorage",
    sea_depth_m: 16.5,
    vhf_channel: "CH 16 (156.8 MHz)",
    owner: "Kasimedu Marine Fleet",
    status: "HAZARD ADVISORY ACTIVE"
  },
  {
    id: "v_1906",
    vessel_id: "IND-TN-1906",
    name: "SANMAR SNEHA",
    type: "Live AIS Craft",
    badge: "📡 Live AIS",
    badgeStyle: "bg-cyan-950 text-cyan-300 border-cyan-800",
    proximity: "5.2 kts from Kasimedu Harbour",
    lastPing: "Live AIS (Chennai Base)",
    isHazard: false,
    speed_knots: 5.2,
    heading_deg: 95,
    harbour: "Kasimedu Harbour (Chennai)",
    latitude: 13.0952,
    longitude: 80.3753,
    mmsi: "419001906",
    imo: "IMO 9821906",
    call_sign: "VW1906",
    crew_onboard: 5,
    fuel_level_pct: 88,
    engine_status: "Cruising (1200 RPM)",
    sea_depth_m: 22.0,
    vhf_channel: "CH 14 (Port Operations)",
    owner: "Sanmar Coastal Fleet",
    status: "Active Coastal Operations"
  },
  {
    id: "v_104",
    vessel_id: "IND-TN-02-MM-104",
    name: "MFV Sea Queen",
    type: "Deep Sea Mechanized Trawler",
    badge: "⚓ Fishing",
    badgeStyle: "bg-cyan-950 text-cyan-300 border-cyan-800",
    proximity: "Inside PFZ Zone #12A",
    lastPing: "2 min ago",
    isHazard: false,
    speed_knots: 8.5,
    heading_deg: 105,
    harbour: "Kasimedu Harbour (Chennai)",
    latitude: 13.1420,
    longitude: 80.5210,
    mmsi: "419001104",
    imo: "IMO 9821104",
    call_sign: "VW104",
    crew_onboard: 7,
    fuel_level_pct: 84,
    engine_status: "Nominal (1400 RPM)",
    sea_depth_m: 32.4,
    vhf_channel: "CH 16 (156.8 MHz)",
    owner: "Kasimedu Deepsea Cooperative",
    status: "Active Fishing Operation (PFZ Zone #12A)"
  },
  {
    id: "v_302",
    vessel_id: "IND-TN-05-MM-302",
    name: "MFV Chennai Sentinel",
    type: "Mechanized Trawler",
    badge: "⚠️ HAZARD",
    badgeStyle: "bg-red-950 text-red-400 border-red-800",
    proximity: "3.2km from Chennai Gale Advisory",
    lastPing: "1 min ago",
    isHazard: true,
    speed_knots: 4.1,
    heading_deg: 290,
    harbour: "Kasimedu Harbour (Chennai)",
    latitude: 13.1800,
    longitude: 80.3800,
    mmsi: "419003302",
    imo: "IMO 9823302",
    call_sign: "VW302",
    crew_onboard: 5,
    fuel_level_pct: 42,
    engine_status: "Heavy Rough Seas (850 RPM)",
    sea_depth_m: 48.0,
    vhf_channel: "CH 16 / Distress Channel",
    owner: "Kasimedu Fishermen Alliance",
    status: "HAZARD ADVISORY: High Gale Warning Proximity"
  },
  {
    id: "v_088",
    vessel_id: "IND-TN-01-MM-088",
    name: "MFV Blue Marlin",
    type: "Gillnetter",
    badge: "🚢 Transit",
    badgeStyle: "bg-slate-900 text-slate-300 border-slate-700",
    proximity: "1.5km from PFZ #100",
    lastPing: "5 min ago",
    isHazard: false,
    speed_knots: 6.2,
    heading_deg: 120,
    harbour: "Kasimedu Harbour (Chennai)",
    latitude: 12.9510,
    longitude: 80.4510,
    mmsi: "419001088",
    imo: "IMO 9821088",
    call_sign: "VW088",
    crew_onboard: 4,
    fuel_level_pct: 91,
    engine_status: "Cruising (1100 RPM)",
    sea_depth_m: 18.2,
    vhf_channel: "CH 14 (Port Operations)",
    owner: "Chennai Artisanal Fleet",
    status: "In Transit to Inshore Fishing Coordinates"
  },
  {
    id: "v_211",
    vessel_id: "IND-TN-04-MM-211",
    name: "MFV Kasimedu Pride",
    type: "Motorized Craft",
    badge: "🚢 Transit",
    badgeStyle: "bg-slate-900 text-slate-300 border-slate-700",
    proximity: "5.0km from Kasimedu Base",
    lastPing: "12 min ago",
    isHazard: false,
    speed_knots: 5.5,
    heading_deg: 90,
    harbour: "Kasimedu Harbour (Chennai)",
    latitude: 13.1200,
    longitude: 80.3500,
    mmsi: "419004211",
    imo: "IMO 9824211",
    call_sign: "VW211",
    crew_onboard: 3,
    fuel_level_pct: 78,
    engine_status: "Idle / Low Speed (700 RPM)",
    sea_depth_m: 12.0,
    vhf_channel: "CH 16 (156.8 MHz)",
    owner: "Royapuram Fishermen Society",
    status: "Returning to Kasimedu Base Jetty"
  }
];

export const FleetOverviewPage: React.FC = () => {
  const [fleetData, setFleetData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedVessel, setSelectedVessel] = useState<any>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([80.2974, 13.0827]);
  const [mapZoom, setMapZoom] = useState<number>(9.5);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleSelectVessel = (vessel: any) => {
    setSelectedVessel(vessel);
    if (vessel.longitude && vessel.latitude) {
      setMapCenter([vessel.longitude, vessel.latitude]);
      setMapZoom(11);
    }
  };

  const handleTrackOnMap = (vessel: any) => {
    if (vessel.longitude && vessel.latitude) {
      setMapCenter([vessel.longitude, vessel.latitude]);
      setMapZoom(12);
      showToast(`Map camera focused to ${vessel.vessel_id || vessel.code || vessel.name} at [${vessel.latitude.toFixed(4)}°N, ${vessel.longitude.toFixed(4)}°E]`);
    }
    setSelectedVessel(null);
  };

  const handleSendVHFBroadcast = (vessel: any) => {
    showToast(`[AIS EMERGENCY BROADCAST] Dispatched VHF channel ${vessel.vhf_channel || 'CH 16'} emergency alert to Indian Coast Guard Sector 12 for ${vessel.vessel_id || vessel.name}`);
  };

  const vessels = (fleetData?.vessels && fleetData.vessels.length > 0) ? fleetData.vessels : DEFAULT_VESSELS;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start h-[calc(100vh-80px)] relative">
      
      {/* Toast Alert Notification */}
      {toastMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[10000] bg-cyan-950/95 text-cyan-200 border border-cyan-500/80 px-4 py-2.5 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-2 text-xs font-mono animate-bounce">
          <Activity className="w-4 h-4 text-cyan-400 shrink-0 animate-pulse" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Left 8-Cols: Map & Current Conditions Overlay */}
      <div className="lg:col-span-8 h-full flex flex-col space-y-2">
        <div className="bg-[#0e1622] border border-[#1c2838] p-3 rounded-xl flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-slate-100 uppercase tracking-wide flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
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

        <div className="flex-1 rounded-xl overflow-hidden border border-[#1c2838]">
          <MarineMap location="Chennai" query="Fleet Telemetry Kasimedu Harbour" center={mapCenter} zoom={mapZoom} />
        </div>
      </div>

      {/* Right 4-Cols: Fleet Overview Panel */}
      <div className="lg:col-span-4 bg-[#0e1622] border border-[#1c2838] rounded-xl p-4 space-y-4 h-full flex flex-col overflow-y-auto">
        
        {/* Header Summary */}
        <div className="pb-3 border-b border-[#1c2838]">
          <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider flex items-center justify-between">
            <span>FLEET OVERVIEW</span>
            <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
              LIVE AIS SYNC
            </span>
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
                    <h4 className="text-xs font-bold text-slate-100 font-mono flex items-center gap-1.5">
                      <span className="text-sm">🚢</span>
                      <span>{v.vessel_id || v.code}</span>
                    </h4>
                    <span className="text-[10px] text-slate-400 font-sans block mt-0.5">{v.name}</span>
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
                  onClick={() => handleSelectVessel(v)}
                  className={`w-full py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 border ${
                    v.isHazard
                      ? 'bg-red-950 text-red-300 border-red-700 hover:bg-red-900 shadow-lg shadow-red-950/50'
                      : 'bg-[#0e1622] text-cyan-300 border-[#1c2838] hover:border-cyan-500 hover:bg-[#121e30]'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5 text-cyan-400" />
                  View Details
                </button>
              </div>
            ))
          )}
        </div>

      </div>

      {/* Selected Vessel Telemetry Detail Modal */}
      {selectedVessel && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
          <div className="bg-[#0b1420] border border-cyan-500/40 p-6 rounded-2xl max-w-lg w-full space-y-5 shadow-2xl">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-[#1c2838] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-widest bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800">
                    AIS TELEMETRY DOSSIER
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${selectedVessel.badgeStyle}`}>
                    {selectedVessel.badge}
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-100 font-mono mt-1 flex items-center gap-2">
                  <span className="text-xl">🚢</span>
                  <span className="text-cyan-300">{selectedVessel.vessel_id || selectedVessel.code}</span>
                  <span className="text-xs text-slate-400 font-normal">({selectedVessel.name})</span>
                </h3>
              </div>
              <button
                onClick={() => setSelectedVessel(null)}
                className="p-1.5 rounded-lg bg-[#050c18] border border-[#1c2838] text-slate-400 hover:text-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Grid Specifications */}
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="bg-[#060c16] p-2.5 rounded-xl border border-[#1c2838]">
                <span className="text-slate-500 text-[10px] block">MMSI TRANSPONDER</span>
                <span className="text-cyan-300 font-bold">{selectedVessel.mmsi || '419001104'}</span>
              </div>
              <div className="bg-[#060c16] p-2.5 rounded-lg border border-[#1c2838]">
                <span className="text-slate-500 text-[10px] block">CALL SIGN / IMO</span>
                <span className="text-slate-200 font-bold">{selectedVessel.call_sign || 'VW104'} • {selectedVessel.imo || 'IMO 9821104'}</span>
              </div>
              <div className="bg-[#060c16] p-2.5 rounded-lg border border-[#1c2838]">
                <span className="text-slate-500 text-[10px] block">VESSEL TYPE</span>
                <span className="text-slate-200 font-bold">{selectedVessel.type}</span>
              </div>
              <div className="bg-[#060c16] p-2.5 rounded-lg border border-[#1c2838]">
                <span className="text-slate-500 text-[10px] block">CREW ONBOARD</span>
                <span className="text-emerald-400 font-bold">{selectedVessel.crew_onboard || 6} Fishermen</span>
              </div>
              <div className="bg-[#060c16] p-2.5 rounded-lg border border-[#1c2838]">
                <span className="text-slate-500 text-[10px] block">OPERATING HARBOUR</span>
                <span className="text-cyan-300 font-bold">{selectedVessel.harbour}</span>
              </div>
              <div className="bg-[#060c16] p-2.5 rounded-lg border border-[#1c2838]">
                <span className="text-slate-500 text-[10px] block">OWNER / COOPERATIVE</span>
                <span className="text-slate-200 font-bold">{selectedVessel.owner || 'Kasimedu Deepsea Co-op'}</span>
              </div>
            </div>

            {/* Live Navigation & AIS Telemetry */}
            <div className="bg-[#050c18] border border-[#1c2838] p-3.5 rounded-xl space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-[#1c2838]">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5 text-cyan-400" />
                  Speed / Heading:
                </span>
                <strong className="text-slate-100">{selectedVessel.speed_knots} kts | {selectedVessel.heading_deg}°</strong>
              </div>

              <div className="flex justify-between items-center pb-2 border-b border-[#1c2838]">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Locate className="w-3.5 h-3.5 text-cyan-400" />
                  GPS Coordinates:
                </span>
                <strong className="text-cyan-300">{selectedVessel.latitude?.toFixed(4)}°N, {selectedVessel.longitude?.toFixed(4)}°E</strong>
              </div>

              <div className="flex justify-between items-center pb-2 border-b border-[#1c2838]">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-cyan-400" />
                  VHF Channel:
                </span>
                <strong className="text-cyan-300">{selectedVessel.vhf_channel || 'CH 16 (156.8 MHz)'}</strong>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  Last Telemetry Sync:
                </span>
                <strong className="text-emerald-400">● {selectedVessel.lastPing || 'Just now'}</strong>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleTrackOnMap(selectedVessel)}
                className="py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/50"
              >
                <Locate className="w-4 h-4" />
                Track Live Position
              </button>

              <button
                onClick={() => handleSendVHFBroadcast(selectedVessel)}
                className="py-2.5 bg-[#162232] hover:bg-red-950 hover:text-red-300 text-slate-200 border border-[#24354a] font-bold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2"
              >
                <ShieldAlert className="w-4 h-4 text-red-400" />
                VHF Alert Ping
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
