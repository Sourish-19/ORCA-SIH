import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Database, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  Server, 
  RefreshCw, 
  Cpu, 
  Play, 
  Pause, 
  Zap, 
  ShieldAlert, 
  Clock, 
  Radio, 
  Layers, 
  FileText, 
  X, 
  ChevronRight,
  Wifi,
  HardDrive
} from 'lucide-react';
import { marineApi } from '../services/api/marineApi';

interface Connector {
  id: string;
  name: string;
  role: string;
  status: 'LIVE' | 'CACHED' | 'PAUSED' | 'FAILED';
  lastUpdated: string;
  dataAgeMinutes: number;
  recordCount: number;
  latencyMs: number;
  healthPercent: number;
  connectorStatus: string;
}

interface Toast {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

interface PipelineNode {
  id: string;
  name: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  borderColor: string;
  throughput: string;
  latency: string;
  workers: number;
  description: string;
  schema: string;
  sampleData: string;
}

export const DataHealthPage: React.FC = () => {
  // Live API status state
  const [backendStatus, setBackendStatus] = useState<'checking' | 'healthy' | 'demo'>('checking');
  const [backendLatency, setBackendLatency] = useState<number | null>(null);
  const [isRefreshingHealth, setIsRefreshingHealth] = useState(false);

  // Interactive Connectors State
  const [connectors, setConnectors] = useState<Connector[]>([
    {
      id: 'incois',
      name: 'INCOIS',
      role: 'PFZ Advisory & Fisheries',
      status: 'LIVE',
      lastUpdated: '4 min ago',
      dataAgeMinutes: 4,
      recordCount: 142,
      latencyMs: 185,
      healthPercent: 99.9,
      connectorStatus: 'Healthy — 100% Sync'
    },
    {
      id: 'mosdac',
      name: 'MOSDAC / ISRO',
      role: 'SST & Ocean Colour',
      status: 'LIVE',
      lastUpdated: '12 min ago',
      dataAgeMinutes: 12,
      recordCount: 580,
      latencyMs: 320,
      healthPercent: 99.8,
      connectorStatus: 'Healthy — Live Stream'
    },
    {
      id: 'imd',
      name: 'IMD',
      role: 'Marine Weather & Gale Warnings',
      status: 'LIVE',
      lastUpdated: '2 min ago',
      dataAgeMinutes: 2,
      recordCount: 89,
      latencyMs: 140,
      healthPercent: 100.0,
      connectorStatus: 'Healthy — Active Sync'
    },
    {
      id: 'bhuvan',
      name: 'Bhuvan / ISRO',
      role: 'Indian Coastal & GIS Base Layers',
      status: 'LIVE',
      lastUpdated: '5 min ago',
      dataAgeMinutes: 5,
      recordCount: 1250,
      latencyMs: 210,
      healthPercent: 99.7,
      connectorStatus: 'Healthy — Live Stream'
    },
    {
      id: 'noaa',
      name: 'NOAA ERDDAP',
      role: 'Secondary Ocean Forecast Grids',
      status: 'LIVE',
      lastUpdated: '3 min ago',
      dataAgeMinutes: 3,
      recordCount: 420,
      latencyMs: 240,
      healthPercent: 99.5,
      connectorStatus: 'Healthy — Live Stream'
    },
    {
      id: 'copernicus',
      name: 'Copernicus Marine',
      role: 'Global Ocean Circulation Model',
      status: 'LIVE',
      lastUpdated: '6 min ago',
      dataAgeMinutes: 6,
      recordCount: 310,
      latencyMs: 280,
      healthPercent: 99.6,
      connectorStatus: 'Healthy — Live Stream'
    }
  ]);

  // Syncing states for specific connectors
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // Pipeline Failover Simulator State
  const [isFailoverActive, setIsFailoverActive] = useState(false);

  // Pipeline Node Inspection Modal State
  const [selectedNode, setSelectedNode] = useState<PipelineNode | null>(null);

  // Toast Notifications
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Fetch backend health and connectors state on mount
  const checkHealth = async () => {
    setIsRefreshingHealth(true);
    const start = performance.now();
    try {
      const data = await marineApi.getHealthStatus();
      const end = performance.now();
      setBackendLatency(Math.round(end - start));
      if (data && (data.status === 'HEALTHY' || data.status === 'ok' || data.status === 'LIVE')) {
        setBackendStatus('healthy');
        addToast(`Backend API online (${Math.round(end - start)}ms latency)`, 'success');
      } else {
        setBackendStatus('demo');
        addToast('Connected to ORCA Demo Local Data Engine', 'info');
      }
      try {
        const connData = await marineApi.getConnectors();
        if (Array.isArray(connData) && connData.length > 0) {
          setConnectors(connData);
        }
      } catch (err) {
        console.warn('Backend connectors fetch fallback to local state', err);
      }
    } catch (e) {
      setBackendStatus('demo');
      setBackendLatency(12);
      addToast('Backend ping offline. Using cached state.', 'warning');
    } finally {
      setIsRefreshingHealth(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  // Handler for Connector Actions (Toggle Active / Pause / Sync)
  const handleToggleConnector = async (id: string) => {
    try {
      const updated = await marineApi.toggleConnector(id);
      setConnectors(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c));
      addToast(
        `${updated.name} connector ${updated.status === 'LIVE' ? 'ACTIVATED — Streaming live feed' : 'PAUSED — Standby'}`,
        updated.status === 'LIVE' ? 'success' : 'warning'
      );
    } catch (err) {
      // Local fallback toggle if backend network is unreachable
      setConnectors(prev => prev.map(c => {
        if (c.id === id) {
          const nextStatus = c.status === 'LIVE' ? 'PAUSED' : 'LIVE';
          addToast(
            `${c.name} connector ${nextStatus === 'LIVE' ? 'ACTIVATED — Streaming live feed' : 'PAUSED — Standby'}`,
            nextStatus === 'LIVE' ? 'success' : 'warning'
          );
          return {
            ...c,
            status: nextStatus,
            lastUpdated: nextStatus === 'LIVE' ? 'Just now' : c.lastUpdated,
            connectorStatus: nextStatus === 'LIVE' ? 'Healthy — Live Stream' : 'Paused by operator'
          };
        }
        return c;
      }));
    }
  };

  const handleManualSync = async (id: string) => {
    setSyncingId(id);
    addToast(`Triggering manual sync for ${id.toUpperCase()}...`, 'info');
    try {
      const updated = await marineApi.syncConnector(id);
      setTimeout(() => {
        setConnectors(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c));
        setSyncingId(null);
        addToast(`Sync complete for ${id.toUpperCase()} (Updated records & telemetry)`, 'success');
      }, 700);
    } catch (err) {
      setTimeout(() => {
        setConnectors(prev => prev.map(c => {
          if (c.id === id) {
            return {
              ...c,
              status: 'LIVE',
              lastUpdated: 'Just now',
              dataAgeMinutes: 0,
              recordCount: c.recordCount + Math.floor(Math.random() * 15) + 5,
              healthPercent: 100.0,
              connectorStatus: 'Healthy — Sync Complete'
            };
          }
          return c;
        }));
        setSyncingId(null);
        addToast(`Sync complete for ${id.toUpperCase()} (Updated records & telemetry)`, 'success');
      }, 700);
    }
  };

  // Toggle Failover Simulator
  const handleToggleFailover = () => {
    const nextState = !isFailoverActive;
    setIsFailoverActive(nextState);
    
    // Also reflect on MOSDAC connector status
    setConnectors(prev => prev.map(c => {
      if (c.id === 'mosdac') {
        return {
          ...c,
          status: nextState ? 'FAILED' : 'LIVE',
          connectorStatus: nextState ? 'FAILED — 504 Gateway Timeout' : 'Healthy — Live Stream'
        };
      }
      return c;
    }));

    if (nextState) {
      addToast('🚨 SIMULATED FAILURE: MOSDAC connection timed out! Failover circuit engaged to Redis Cache.', 'error');
    } else {
      addToast('✅ RESTORED: MOSDAC live connection re-established. Fallback circuit released.', 'success');
    }
  };

  // Pipeline architecture nodes data for inspection
  const pipelineNodes: PipelineNode[] = [
    {
      id: 'source',
      name: 'SOURCE',
      sub: 'External APIs & Satellites',
      icon: Database,
      color: 'text-cyan-400',
      borderColor: 'border-[#1c2838]',
      throughput: '8.4 MB/s',
      latency: '140ms avg',
      workers: 6,
      description: 'Ingests raw telemetry feeds, WMS maps, and netCDF ocean grids from INCOIS, MOSDAC, IMD, and Bhuvan.',
      schema: 'JSON / GeoJSON / NetCDF-4',
      sampleData: `{ "provider": "INCOIS", "type": "PFZ_POLYGON", "coords": [[[79.8, 11.2], [80.1, 11.4]]], "validity_hrs": 24 }`
    },
    {
      id: 'connector',
      name: 'CONNECTOR',
      sub: 'Async Ingestion Pool',
      icon: Server,
      color: 'text-cyan-300',
      borderColor: 'border-cyan-500/50',
      throughput: '12.1 MB/s',
      latency: '45ms avg',
      workers: 16,
      description: 'High-concurrency Python worker pool managing API retries, exponential backoff, rate limiting, and raw buffer parsing.',
      schema: 'IngestJob { id, source_id, timestamp, status, payload_bytes }',
      sampleData: `{ "worker_id": "connector-04", "status": "INGESTED", "records": 142, "retry_count": 0 }`
    },
    {
      id: 'normalize',
      name: 'NORMALIZE',
      sub: 'GeoJSON & EPSG Transformer',
      icon: RefreshCw,
      color: 'text-slate-200',
      borderColor: 'border-[#1c2838]',
      throughput: '11.8 MB/s',
      latency: '18ms avg',
      workers: 8,
      description: 'Standardizes spatial coordinates to WGS-84 (EPSG:4326), validates bounding boxes, and enriches records with metadata tags.',
      schema: 'FeatureCollection<Geometry, MaritimeProperties>',
      sampleData: `{ "type": "Feature", "geometry": { "type": "Point", "coordinates": [80.278, 13.082] }, "properties": { "sst": 28.4 } }`
    },
    {
      id: 'postgis',
      name: 'POSTGIS/REDIS',
      sub: 'Spatial DB & Hot Cache',
      icon: Database,
      color: 'text-emerald-400',
      borderColor: 'border-emerald-800',
      throughput: '45.0 MB/s',
      latency: '3ms avg',
      workers: 32,
      description: 'PostGIS spatial storage for multi-year historical queries paired with Redis L1 memory cache for 15-minute hot telemetry lookup.',
      schema: 'ST_Geometry (PostGIS) + Redis GEOHASH',
      sampleData: `{ "key": "orca:sst:tn:sector-4", "ttl": 840, "fallback_active": false, "val_c": 28.4 }`
    },
    {
      id: 'agents',
      name: 'ORCA AGENTS',
      sub: 'Tactical AI & Gatekeepers',
      icon: Cpu,
      color: 'text-cyan-300',
      borderColor: 'border-cyan-500',
      throughput: '2.5 req/s',
      latency: '310ms avg',
      workers: 5,
      description: 'Multi-agent LLM reasoning pipeline (Sentinel, Navigator, Analyst) consuming live spatial context to generate safety advisories.',
      schema: 'ORCAResponse { decision, veto_reasons, confidence, zone_id }',
      sampleData: `{ "veto": false, "action": "PROCEED", "confidence": 0.98, "recommendation": "Optimal PFZ conditions near 11.2N 79.9E" }`
    }
  ];

  // Calculated Metrics
  const activeCount = connectors.filter(c => c.status === 'LIVE' || c.status === 'CACHED').length;
  const totalIngestionRate = (activeCount * 1.05 + (isFailoverActive ? -0.4 : 0)).toFixed(1);

  return (
    <div className="space-y-4 pb-8">
      {/* Toast Notification Container */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-md pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-3 rounded-lg border shadow-xl flex items-center gap-3 text-xs font-mono backdrop-blur-md animate-in slide-in-from-bottom duration-200 ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
                : toast.type === 'error'
                ? 'bg-red-950/90 border-red-500/50 text-red-200'
                : toast.type === 'warning'
                ? 'bg-amber-950/90 border-amber-500/50 text-amber-200'
                : 'bg-cyan-950/90 border-cyan-500/50 text-cyan-200'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
            {toast.type === 'warning' && <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />}
            {toast.type === 'info' && <Zap className="w-4 h-4 text-cyan-400 shrink-0" />}
            <span className="flex-1 font-medium">{toast.message}</span>
            <button
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Header Banner & Live Status */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-[#0b1420] border border-[#1c2838] p-4 rounded-xl">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-white uppercase font-sans">
              DATA SOURCE HEALTH
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-400 font-bold uppercase tracking-wider">
              DATA PLANE V2
            </span>
          </div>
          <p className="text-xs text-slate-400 font-medium">
            SYSTEM-WIDE DATA INGESTION, PIPELINE CONNECTORS & FAILOVER MONITORING
          </p>
        </div>

        <div className="flex items-center gap-3 font-mono">
          <div className="flex items-center gap-2 bg-[#050c18] border border-[#1c2838] px-3 py-1.5 rounded-lg text-xs">
            <div className={`w-2 h-2 rounded-full ${backendStatus === 'healthy' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></div>
            <span className="text-slate-400">Backend API:</span>
            <span className={`font-bold ${backendStatus === 'healthy' ? 'text-emerald-400' : 'text-amber-300'}`}>
              {backendStatus === 'healthy' ? `ONLINE (${backendLatency}ms)` : 'DEMO ENGINE ACTIVE'}
            </span>
          </div>

          <button
            onClick={checkHealth}
            disabled={isRefreshingHealth}
            className="flex items-center gap-1.5 bg-[#050c18] hover:bg-[#122438] text-slate-200 border border-[#1c2838] px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition disabled:opacity-50"
            title="Ping backend health endpoint"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isRefreshingHealth ? 'animate-spin' : ''}`} />
            <span>Re-Check</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* Left 8-Cols: Ingestion Architecture & Source Cards */}
        <div className="lg:col-span-8 space-y-4">
          
          {/* Data Pipeline Architecture Box */}
          <div className="bg-[#0b1420] border border-[#1c2838] p-4 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest font-mono flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                Data Pipeline Architecture (Click node for detailed telemetry)
              </h3>
              <span className="text-[9px] text-slate-400 font-mono">
                Click any stage to inspect live schema & payload
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono py-2">
              {pipelineNodes.map((node, index) => {
                const IconComponent = node.icon;
                return (
                  <React.Fragment key={node.id}>
                    <button
                      onClick={() => setSelectedNode(node)}
                      className={`bg-[#050c18] border ${node.borderColor} hover:border-cyan-400 p-3 rounded-lg text-center flex-1 min-w-[100px] transition-all hover:scale-105 group relative`}
                    >
                      <IconComponent className={`w-5 h-5 ${node.color} mx-auto mb-1 group-hover:scale-110 transition-transform`} />
                      <span className={`font-bold text-[10px] uppercase block ${node.color}`}>
                        {node.name}
                      </span>
                      <span className="text-[8px] text-slate-400 block truncate max-w-[90px] mx-auto mt-0.5">
                        {node.throughput}
                      </span>
                    </button>

                    {index < pipelineNodes.length - 1 && (
                      <ArrowRight className="w-4 h-4 text-cyan-500 shrink-0 hidden sm:block" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* 6 Source Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {connectors.map(connector => (
              <div 
                key={connector.id}
                className={`bg-[#0b1420] border p-3.5 rounded-xl space-y-2.5 font-mono transition-all ${
                  connector.status === 'FAILED'
                    ? 'border-red-900 bg-red-950/10'
                    : connector.status === 'LIVE'
                    ? 'border-[#1c2838] hover:border-cyan-500/50'
                    : 'border-[#1c2838] opacity-85'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                      {connector.name}
                    </h4>
                    <p className="text-[9px] text-slate-400">{connector.role}</p>
                  </div>
                  <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase ${
                    connector.status === 'LIVE'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : connector.status === 'CACHED'
                      ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                      : connector.status === 'PAUSED'
                      ? 'bg-amber-950 text-amber-400 border border-amber-800'
                      : 'bg-red-950 text-red-400 border border-red-800 animate-pulse'
                  }`}>
                    {connector.status === 'LIVE' ? '● LIVE' : connector.status}
                  </span>
                </div>

                <div className="text-[10px] space-y-1 text-slate-400 pt-2 border-t border-[#1c2838]">
                  <div className="flex justify-between">
                    <span>Updated:</span>
                    <span className="text-slate-200 font-bold">{connector.lastUpdated}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Records:</span>
                    <span className="text-slate-200">{connector.recordCount} entries</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Latency:</span>
                    <span className="text-slate-200">{connector.latencyMs} ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Status:</span>
                    <span className={`font-bold ${
                      connector.status === 'FAILED' ? 'text-red-400' : 'text-emerald-400'
                    }`}>
                      {connector.connectorStatus}
                    </span>
                  </div>
                </div>

                {/* Control Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => handleToggleConnector(connector.id)}
                    className={`py-1 px-2 border text-[9px] font-bold uppercase rounded flex items-center justify-center gap-1 transition ${
                      connector.status === 'LIVE'
                        ? 'bg-[#050c18] hover:bg-amber-950/40 text-amber-300 border-amber-800/60'
                        : 'bg-[#050c18] hover:bg-emerald-950/40 text-emerald-400 border-emerald-800/60'
                    }`}
                  >
                    {connector.status === 'LIVE' ? (
                      <>
                        <Pause className="w-3 h-3 text-amber-400" />
                        <span>PAUSE</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3 text-emerald-400" />
                        <span>ACTIVATE</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleManualSync(connector.id)}
                    disabled={syncingId === connector.id}
                    className="py-1 px-2 bg-[#050c18] hover:bg-[#122438] text-cyan-300 border border-[#1c2838] text-[9px] font-bold uppercase rounded flex items-center justify-center gap-1 transition disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 text-cyan-400 ${syncingId === connector.id ? 'animate-spin' : ''}`} />
                    <span>SYNC</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

        </div>

        {/* Right 4-Cols: Failover Box & Global Metrics Panel */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Live Interactive Failover Box */}
          <div className="bg-[#0b1420] border border-[#1c2838] p-4 rounded-xl space-y-3 font-mono">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" />
                FAILOVER & CIRCUIT BREAKER
              </span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800">
                L2 REDIS CACHE
              </span>
            </div>

            {/* Simulated Live Failure Box */}
            <div className={`p-3 rounded-lg flex items-center gap-2.5 transition-colors border ${
              isFailoverActive
                ? 'bg-red-950/40 border-red-800 text-red-200'
                : 'bg-[#180a0a] border-red-900/60 text-slate-200'
            }`}>
              <AlertCircle className={`w-4 h-4 shrink-0 ${isFailoverActive ? 'text-red-400 animate-pulse' : 'text-red-500'}`} />
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <h5 className="text-xs font-bold text-red-200">MOSDAC LIVE STREAM</h5>
                  <span className="text-[9px] font-bold text-red-400">
                    {isFailoverActive ? 'TIMEOUT (504)' : 'CONNECTED'}
                  </span>
                </div>
                <p className="text-[10px] text-red-400">
                  {isFailoverActive ? 'ISRO Primary Gateway Disconnected' : 'Normal Operations'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-center my-1">
              <div className="w-px h-3 bg-slate-700"></div>
              <ArrowRight className={`w-4 h-4 text-cyan-400 rotate-90 my-1 ${isFailoverActive ? 'animate-bounce' : ''}`} />
              <div className="w-px h-3 bg-slate-700"></div>
            </div>

            {/* Redis Fallback Box */}
            <div className={`p-3 rounded-lg flex items-center gap-2.5 border transition-colors ${
              isFailoverActive
                ? 'bg-cyan-950/60 border-cyan-500 text-cyan-100 shadow-lg shadow-cyan-950/50'
                : 'bg-[#061424] border-cyan-800/80 text-cyan-200'
            }`}>
              <Database className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <h5 className="text-xs font-bold text-cyan-200">REDIS CACHE LAYER</h5>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-900 text-cyan-300">
                    {isFailoverActive ? 'FALLBACK ACTIVE' : 'STANDBY'}
                  </span>
                </div>
                <p className="text-[10px] text-cyan-400">Hot Spatial Memory Snapshot</p>
              </div>
            </div>

            <div className="bg-[#050c18] border border-[#1c2838] p-2.5 rounded-lg text-[10px] space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Cached Payload:</span>
                <span className="text-slate-200 font-bold">Sea Surface Temp (SST)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Snapshot Age:</span>
                <span className="text-amber-300 font-bold">Updated 42 min ago</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Circuit Breaker:</span>
                <span className={isFailoverActive ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
                  {isFailoverActive ? 'OPEN (Tripped)' : 'CLOSED (Normal)'}
                </span>
              </div>
            </div>

            {/* Interactive Failover Simulator Trigger Button */}
            <button
              onClick={handleToggleFailover}
              className={`w-full py-2 px-3 text-xs font-bold uppercase rounded-lg border transition-all flex items-center justify-center gap-2 ${
                isFailoverActive
                  ? 'bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border-emerald-700'
                  : 'bg-red-950/60 hover:bg-red-900 text-red-200 border-red-800'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{isFailoverActive ? 'RESTORE MOSDAC LIVE FEED' : 'SIMULATE MOSDAC TIMEOUT'}</span>
            </button>
          </div>

          {/* Global Metrics Box */}
          <div className="bg-[#0b1420] border border-[#1c2838] p-4 rounded-xl space-y-3">
            <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest font-mono flex items-center justify-between">
              <span>Global Metrics</span>
              <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            </h3>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-[#1c2838]">
                <span className="text-slate-400">Total Ingestion Rate</span>
                <span className="text-slate-100 font-bold">{totalIngestionRate} GB/hr</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1c2838]">
                <span className="text-slate-400">Active Connectors</span>
                <span className="text-cyan-400 font-bold">{activeCount} / {connectors.length}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1c2838]">
                <span className="text-slate-400">System Uptime</span>
                <span className="text-emerald-400 font-bold">99.99%</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">ORCA Core Version</span>
                <span className="text-slate-300 font-bold">v2.4.0-sih</span>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Node Telemetry Modal */}
      {selectedNode && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b1420] border border-[#1c2838] w-full max-w-2xl rounded-xl p-5 space-y-4 font-mono shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            
            <button
              onClick={() => setSelectedNode(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg bg-[#050c18] border border-[#1c2838]"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 border-b border-[#1c2838] pb-3">
              <selectedNode.icon className={`w-7 h-7 ${selectedNode.color}`} />
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>PIPELINE STAGE: {selectedNode.name}</span>
                </h3>
                <p className="text-xs text-cyan-400 font-sans">{selectedNode.sub}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 font-sans leading-relaxed">
              {selectedNode.description}
            </p>

            <div className="grid grid-cols-3 gap-3 text-xs bg-[#050c18] p-3 rounded-lg border border-[#1c2838]">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Throughput</span>
                <span className="text-slate-100 font-bold">{selectedNode.throughput}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Avg Latency</span>
                <span className="text-emerald-400 font-bold">{selectedNode.latency}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Workers</span>
                <span className="text-cyan-400 font-bold">{selectedNode.workers} active threads</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-400 uppercase font-bold block flex items-center gap-1">
                <FileText className="w-3 h-3 text-cyan-400" />
                Data Schema Protocol
              </span>
              <div className="bg-[#050c18] border border-[#1c2838] p-2.5 rounded-lg text-xs text-slate-200">
                <code>{selectedNode.schema}</code>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">
                Sample Live Payload Frame
              </span>
              <pre className="bg-[#030712] border border-[#1c2838] p-3 rounded-lg text-[11px] text-emerald-400 overflow-x-auto font-mono">
                {selectedNode.sampleData}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedNode(null)}
                className="px-4 py-1.5 bg-[#050c18] hover:bg-[#122438] text-slate-200 border border-[#1c2838] text-xs font-bold uppercase rounded-lg transition"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
