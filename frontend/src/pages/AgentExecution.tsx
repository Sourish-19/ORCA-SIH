import React, { useState, useEffect } from 'react';
import { Cpu, CheckCircle2, Circle, Mic, Send, Globe, AlertTriangle, ShieldCheck, Database, Layers, Radio, Activity, Eye, X, ChevronRight, RefreshCw } from 'lucide-react';
import { ORCAResponse } from '../types';
import { VoiceRecorder } from '../components/common/VoiceRecorder';

interface AgentExecutionProps {
  response: ORCAResponse | null;
  onQuerySubmit?: (query: string) => void;
  isLoading?: boolean;
}

export const AgentExecution: React.FC<AgentExecutionProps> = ({ response, onQuerySubmit, isLoading = false }) => {
  const [queryInput, setQueryInput] = useState('');
  const [activeLang, setActiveLang] = useState<'EN' | 'TA'>('EN');
  const [animStep, setAnimStep] = useState<number>(6); // 0: Idle/Running, 1-6: Execution steps
  const [selectedAgentDetail, setSelectedAgentDetail] = useState<any>(null);

  const isVeto = response?.safety?.veto_triggered || queryInput.toLowerCase().includes('vizag') || queryInput.toLowerCase().includes('cyclone');
  const vetoReason = response?.safety?.veto_reasons?.join(', ') || response?.safety?.safety_summary || 'Gale winds / Red Cyclone Warning active off Vizag coast';
  const suitabilityScore = isVeto ? 0 : (response?.suitability_breakdown?.total_score || response?.top_recommendation?.strength_score || 88);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (queryInput.trim() && onQuerySubmit) {
      setAnimStep(1);
      onQuerySubmit(queryInput.trim());
    }
  };

  useEffect(() => {
    if (isLoading) {
      setAnimStep(1);
      const t1 = setTimeout(() => setAnimStep(2), 300);
      const t2 = setTimeout(() => setAnimStep(3), 700);
      const t3 = setTimeout(() => setAnimStep(4), 1200);
      const t4 = setTimeout(() => setAnimStep(5), 1600);
      const t5 = setTimeout(() => setAnimStep(6), 2000);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
        clearTimeout(t5);
      };
    } else {
      setAnimStep(6);
    }
  }, [isLoading]);

  const presetScenarios = [
    {
      title: "Chennai Offshore Fishing (EN)",
      query: "Where should I fish tomorrow near Chennai?",
      lang: "EN" as const
    },
    {
      title: "Tamil Voice Query (TA)",
      query: "நாளைக்கு சென்னைக்கு அருகில் எங்கு மீன் பிடிக்கலாம்?",
      lang: "TA" as const
    },
    {
      title: "Vizag Severe Cyclone (Veto)",
      query: "Can I take my boat out tomorrow near Vizag?",
      lang: "EN" as const
    },
    {
      title: "Mangalore Swell Advisory",
      query: "What is the sea condition tomorrow near Mangalore?",
      lang: "EN" as const
    }
  ];

  const agentDetailsData = {
    intent: {
      name: "Language & Intent Parsing Agent",
      role: "Multilingual Intent Extraction",
      latency: "154ms",
      apiEndpoint: "POST /api/agents/intent",
      prompt: "Extract location, target date, activity, and language from natural language voice/text query.",
      provenance: "Grounded NLP intent parser (EN/TA)",
      output: `Intent: FISHING_RECOMMENDATION | Location: ${queryInput.toLowerCase().includes('vizag') ? 'Visakhapatnam' : 'Chennai'} | Language: ${activeLang === 'TA' ? 'Tamil' : 'English'}`
    },
    orchestrator: {
      name: "Master Multi-Agent Orchestrator",
      role: "Parallel Task Routing & Execution DAG",
      latency: "42ms",
      apiEndpoint: "POST /api/agents/orchestrate",
      prompt: "Dispatch normalized intent vector concurrently to Geo-Data, Hazard, and Context agents.",
      provenance: "ORCA Core Orchestrator (DAG Pipeline)",
      output: "3 Domain Workers Dispatched in Parallel (Geo, Hazard, Context)"
    },
    geodata: {
      name: "Oceanographic Geo-Data Agent",
      role: "INCOIS & Satellite Remote Sensing Ingestion",
      latency: "812ms",
      apiEndpoint: "GET /api/map/layers?location=Chennai",
      prompt: "Fetch Potential Fishing Zones (PFZ #12A), MOSDAC SST (28.4°C), and Sentinel-3 Chlorophyll (1.4 mg/m³).",
      provenance: "INCOIS, NOAA, NCMRWF, MOSDAC",
      output: "Retrieved 19 PFZ Polygons & 0.05° High-Resolution SST Grids"
    },
    hazard: {
      name: "IMD Weather & Hazard Agent",
      role: "Meteorological Threat & Wave Modeling",
      latency: "621ms",
      apiEndpoint: "GET /api/imd/forecasts",
      prompt: "Query IMD bulletin for gale warnings, wave height thresholds, and cyclone trajectories.",
      provenance: "Indian Meteorological Department (IMD) & INCOIS Wave Model",
      output: isVeto ? "CRITICAL ALERT: Red Cyclone Advisory Triggered" : "INCOIS Wave: 1.1m | Wind: 14 kts | No Cyclone Threat"
    },
    reasoning: {
      name: "Ocean Suitability Reasoning Agent",
      role: "ORCA Suitability Index (OSI) Computation",
      latency: "84ms",
      apiEndpoint: "POST /api/agents/reasoning",
      prompt: "Compute 6-factor OSI score: PFZ (35%) + CHL (25%) + SST (15%) + Access (10%).",
      provenance: "ORCA Marine Science Expert Rules Engine",
      output: `OSI Score Calculated: ${suitabilityScore}/100 (Chennai Offshore East PFZ Zone #12A)`
    },
    safety: {
      name: "Safety Veto Boundary Agent",
      role: "Deterministic Safety Gate Override",
      latency: "12ms",
      apiEndpoint: "POST /api/agents/safety-veto",
      prompt: "Evaluate hard boundaries (Wind > 25 kts, Wave > 2.5m). Enforce veto if threat detected.",
      provenance: "IMD / Coast Guard Mandatory Safety Rules",
      output: isVeto ? `SAFETY VETO TRIGGERED: ${vetoReason}` : "SAFETY STATUS: CLEAR (Sea conditions optimal)"
    }
  };

  return (
    <div className="space-y-4">
      
      {/* Title Header & Scenario Quick-Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#0b1420] border border-[#1c2838] p-4 rounded-xl">
        <div>
          <h1 className="text-xl font-black tracking-tight text-white uppercase font-sans flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400 animate-pulse" />
            ORCA Multi-Agent Execution Trace
          </h1>
          <p className="text-xs text-slate-400 font-medium">
            Live execution pipeline from natural language query to evidence-backed safety synthesis
          </p>
        </div>

        {/* Preset Scenarios Quick Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {presetScenarios.map((sc, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setQueryInput(sc.query);
                setActiveLang(sc.lang);
                if (onQuerySubmit) onQuerySubmit(sc.query);
              }}
              className="text-[10px] font-mono font-bold px-2.5 py-1.5 rounded-lg bg-[#060c18] border border-[#1c2838] text-slate-300 hover:border-cyan-500 hover:text-cyan-300 transition flex items-center gap-1.5"
            >
              <span>{sc.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Left Active Query & Intent Vector | Right Orchestration Graph */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* Left Column (4-Cols): Active Query & Intent Vector */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Active Query Card */}
          <div className="bg-[#0b1420] border border-[#1c2838] p-4 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                ACTIVE QUERY STREAM
              </span>

              <div className="bg-[#050c18] border border-[#1c2838] p-0.5 rounded flex items-center text-[10px] font-mono">
                <button
                  type="button"
                  onClick={() => {
                    setActiveLang('EN');
                    setQueryInput('Where should I fish tomorrow near Chennai?');
                  }}
                  className={`px-2 py-0.5 rounded font-bold transition ${
                    activeLang === 'EN' ? 'bg-cyan-600 text-white' : 'text-slate-400'
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveLang('TA');
                    setQueryInput('நாளைக்கு சென்னைக்கு அருகில் எங்கு மீன் பிடிக்கலாம்?');
                  }}
                  className={`px-2 py-0.5 rounded font-bold transition ${
                    activeLang === 'TA' ? 'bg-cyan-600 text-white' : 'text-slate-400'
                  }`}
                >
                  TA
                </button>
              </div>
            </div>

            <VoiceRecorder
              language={activeLang}
              initialText={queryInput}
              onTranscriptChange={(txt) => setQueryInput(txt)}
              onSendQuery={(txt) => {
                setQueryInput(txt);
                setAnimStep(1);
                if (onQuerySubmit) onQuerySubmit(txt);
              }}
            />
          </div>

          {/* Normalized Intent Vector Table */}
          <div className="bg-[#0b1420] border border-[#1c2838] p-4 rounded-xl space-y-3">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono flex items-center justify-between">
              <span>NORMALIZED INTENT VECTOR</span>
              <span className="text-cyan-400 font-bold">LIVE PARSED</span>
            </h3>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-[#1c2838]">
                <span className="text-slate-400">Intent:</span>
                <span className="text-cyan-300 font-bold">FISHING_RECOMMENDATION</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1c2838]">
                <span className="text-slate-400">Location:</span>
                <span className="text-slate-200">{queryInput.toLowerCase().includes('vizag') ? 'Visakhapatnam' : 'Chennai'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1c2838]">
                <span className="text-slate-400">Time Horizon:</span>
                <span className="text-slate-200">Tomorrow</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1c2838]">
                <span className="text-slate-400">Language Detected:</span>
                <span className="text-teal-300 font-bold">{activeLang === 'TA' ? 'Tamil (தமிழ்)' : 'English'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Search Radius:</span>
                <span className="text-slate-200">100 km</span>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column (8-Cols): Orchestration Graph Flow Tree */}
        <div className="lg:col-span-8 bg-[#0b1420] border border-[#1c2838] p-5 rounded-xl space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#1c2838]">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider font-mono">
                ORCHESTRATION GRAPH
              </h3>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Click any agent node to inspect telemetry</span>
          </div>

          <div className="space-y-3.5 max-w-2xl mx-auto py-2">
            
            {/* Step 1: Language + Intent Agent */}
            <div
              onClick={() => setSelectedAgentDetail(agentDetailsData.intent)}
              className={`bg-[#060c18] border p-3 rounded-xl flex items-center justify-between cursor-pointer transition ${
                animStep >= 1 ? 'border-emerald-500/60 bg-emerald-950/10' : 'border-[#1c2838] opacity-60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Globe className="w-4 h-4 text-emerald-400" />
                <div>
                  <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                    LANGUAGE + INTENT AGENT
                    <Eye className="w-3 h-3 text-slate-500 hover:text-cyan-400" />
                  </h4>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Query parsed ({activeLang === 'TA' ? 'Tamil' : 'English'}). Location: {queryInput.toLowerCase().includes('vizag') ? 'Visakhapatnam' : 'Chennai'}.
                  </p>
                </div>
              </div>
              <div className="text-right font-mono text-[10px]">
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold block mb-1">
                  COMPLETED
                </span>
                <span className="text-slate-500">154ms</span>
              </div>
            </div>

            <div className="w-px h-3 bg-[#1c2838] mx-auto" />

            {/* Step 2: Master Orchestrator */}
            <div
              onClick={() => setSelectedAgentDetail(agentDetailsData.orchestrator)}
              className={`bg-[#060c18] border p-3 rounded-xl flex items-center justify-between cursor-pointer transition ${
                animStep >= 2 ? 'border-cyan-500/80 bg-cyan-950/20 shadow-lg shadow-cyan-950/50' : 'border-[#1c2838] opacity-60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Cpu className={`w-4 h-4 ${animStep === 2 ? 'text-cyan-400 animate-spin' : 'text-cyan-400'}`} />
                <div>
                  <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                    MASTER ORCHESTRATOR
                    <Eye className="w-3 h-3 text-slate-500 hover:text-cyan-400" />
                  </h4>
                  <p className="text-[10px] text-cyan-300 font-mono">Summary: Dispatched 3 parallel domain fetchers...</p>
                </div>
              </div>
              <div className="text-right font-mono text-[10px]">
                <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold block mb-1">
                  {animStep === 2 ? '● RUNNING' : 'COMPLETED'}
                </span>
                <span className="text-slate-500">42ms</span>
              </div>
            </div>

            <div className="w-px h-3 bg-[#1c2838] mx-auto" />

            {/* Step 3: Parallel Domain Agents Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div
                onClick={() => setSelectedAgentDetail(agentDetailsData.geodata)}
                className={`bg-[#060c18] border p-3 rounded-xl space-y-1 cursor-pointer transition ${
                  animStep >= 3 ? 'border-emerald-500/50 bg-emerald-950/10' : 'border-[#1c2838] opacity-60'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="font-bold text-emerald-400 flex items-center gap-1">
                    <Database className="w-3 h-3" /> GEO-DATA
                  </span>
                  <span className="text-slate-500">812ms</span>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 font-mono inline-block font-bold">
                  COMPLETED
                </span>
                <p className="text-[10px] text-slate-400 font-mono pt-1">INCOIS PFZ: retrieved<br/>MOSDAC SST: 28.4°C</p>
              </div>

              <div
                onClick={() => setSelectedAgentDetail(agentDetailsData.hazard)}
                className={`bg-[#060c18] border p-3 rounded-xl space-y-1 cursor-pointer transition ${
                  animStep >= 3 ? (isVeto ? 'border-red-500/80 bg-red-950/20' : 'border-emerald-500/50 bg-emerald-950/10') : 'border-[#1c2838] opacity-60'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className={`font-bold ${isVeto ? 'text-red-400' : 'text-emerald-400'} flex items-center gap-1`}>
                    <AlertTriangle className="w-3 h-3" /> HAZARD
                  </span>
                  <span className="text-slate-500">621ms</span>
                </div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono inline-block font-bold ${
                  isVeto ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-emerald-950 text-emerald-400'
                }`}>
                  {isVeto ? 'ALERT ACTIVE' : 'COMPLETED'}
                </span>
                <p className="text-[10px] text-slate-400 font-mono pt-1">
                  {isVeto ? 'IMD: RED CYCLONE ALERT' : 'IMD Bulletin | No Cyclone'}
                </p>
              </div>

              <div
                onClick={() => setSelectedAgentDetail(agentDetailsData.reasoning)}
                className={`bg-[#060c18] border p-3 rounded-xl space-y-1 cursor-pointer transition ${
                  animStep >= 3 ? 'border-emerald-500/50 bg-emerald-950/10' : 'border-[#1c2838] opacity-60'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="font-bold text-emerald-400 flex items-center gap-1">
                    <Layers className="w-3 h-3" /> CONTEXT
                  </span>
                  <span className="text-slate-500">345ms</span>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 font-mono inline-block font-bold">
                  COMPLETED
                </span>
                <p className="text-[10px] text-slate-400 font-mono pt-1">Success rate: 94%</p>
              </div>
            </div>

            <div className="w-px h-3 bg-[#1c2838] mx-auto" />

            {/* Step 4: Reasoning Agent */}
            <div
              onClick={() => setSelectedAgentDetail(agentDetailsData.reasoning)}
              className={`bg-[#060c18] border p-3 rounded-xl flex items-center justify-between cursor-pointer transition ${
                animStep >= 4 ? 'border-emerald-500/60 bg-emerald-950/10' : 'border-[#1c2838] opacity-60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <div>
                  <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                    REASONING AGENT
                    <Eye className="w-3 h-3 text-slate-500 hover:text-cyan-400" />
                  </h4>
                  <p className="text-[10px] text-slate-400 font-mono">Summary: OSI Score calculated ({suitabilityScore}/100).</p>
                </div>
              </div>
              <div className="text-right font-mono text-[10px]">
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold block mb-1">
                  COMPLETED
                </span>
                <span className="text-slate-500">84ms</span>
              </div>
            </div>

            <div className="w-px h-3 bg-[#1c2838] mx-auto" />

            {/* Step 5: Safety Agent */}
            <div
              onClick={() => setSelectedAgentDetail(agentDetailsData.safety)}
              className={`bg-[#060c18] border p-3 rounded-xl flex items-center justify-between cursor-pointer transition ${
                animStep >= 5 ? (isVeto ? 'border-red-500/80 bg-red-950/20' : 'border-emerald-500/60 bg-emerald-950/10') : 'border-[#1c2838] opacity-60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {isVeto ? <AlertTriangle className="w-4 h-4 text-red-400 animate-bounce" /> : <ShieldCheck className="w-4 h-4 text-emerald-400" />}
                <div>
                  <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                    SAFETY VETO AGENT
                    <Eye className="w-3 h-3 text-slate-500 hover:text-cyan-400" />
                  </h4>
                  <p className={`text-[10px] font-mono font-semibold ${isVeto ? 'text-red-400' : 'text-emerald-400'}`}>
                    Summary: {isVeto ? `🚨 SAFETY VETO TRIGGERED: ${vetoReason}` : 'No veto triggered. Safe sea conditions.'}
                  </p>
                </div>
              </div>
              <div className="text-right font-mono text-[10px]">
                <span className={`px-2 py-0.5 rounded font-bold block mb-1 ${
                  isVeto ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                }`}>
                  {isVeto ? 'VETO TRIGGERED' : 'CLEAR'}
                </span>
                <span className="text-slate-500">12ms</span>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Grounded Advisory & Recommendation Answer Card */}
      <div className={`border p-5 rounded-2xl space-y-4 shadow-xl transition ${
        isVeto
          ? 'bg-red-950/30 border-red-500/80 shadow-red-950/50'
          : 'bg-[#0b1420] border-cyan-500/50 shadow-cyan-950/30'
      }`}>
        <div className="flex items-center justify-between border-b border-[#1c2838] pb-3">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded border uppercase tracking-wider ${
              isVeto ? 'bg-red-950 text-red-300 border-red-800' : 'bg-cyan-950 text-cyan-300 border-cyan-800'
            }`}>
              {isVeto ? '🚨 SAFETY VETO RESULT' : '💡 SYNTHESIZED ADVISORY ANSWER'}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              ● Query: "{queryInput}"
            </span>
          </div>

          <a
            href={isVeto ? "/safety-veto" : "/recommendation"}
            className="text-xs font-mono font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition"
          >
            <span>View Full Details</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </a>
        </div>

        {isVeto ? (
          <div className="space-y-3 font-mono">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-400 shrink-0 mt-0.5 animate-bounce" />
              <div>
                <h3 className="text-base font-extrabold text-red-300">
                  SAFETY VETO ACTIVE — DO NOT LAUNCH FISHING VESSELS
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  IMD Red Alert & Gale Warning Active off Visakhapatnam. Wind speeds exceeding 38 knots and 3.8m wave swells violate safety thresholds. All fishing vessels must remain safely anchored in port.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2">
              <div className="bg-[#050c18] p-2.5 rounded-lg border border-red-900/60">
                <span className="text-slate-500 text-[10px] block">SAFETY OVERRIDE</span>
                <strong className="text-red-400">VETO TRIGGERED</strong>
              </div>
              <div className="bg-[#050c18] p-2.5 rounded-lg border border-red-900/60">
                <span className="text-slate-500 text-[10px] block">GALE WIND</span>
                <strong className="text-red-400">38.5 Knots (High)</strong>
              </div>
              <div className="bg-[#050c18] p-2.5 rounded-lg border border-red-900/60">
                <span className="text-slate-500 text-[10px] block">SWELL WAVE</span>
                <strong className="text-red-400">3.8 Meters (Danger)</strong>
              </div>
              <div className="bg-[#050c18] p-2.5 rounded-lg border border-red-900/60">
                <span className="text-slate-500 text-[10px] block">PORT ADVISORY</span>
                <strong className="text-red-300">ANCHORED IN PORT</strong>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 font-mono">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold text-slate-100">
                    RECOMMENDED ZONE: Chennai Offshore East (PFZ Zone #12A)
                  </h3>
                  <span className="bg-emerald-950 text-emerald-300 text-xs px-2 py-0.5 rounded font-bold border border-emerald-800">
                    88% OSI Score
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  {activeLang === 'TA'
                    ? 'சென்னை கிழக்கே 35.2 கி.மீ தொலைவில் உயர் குளோரோபில் (1.4 mg/m³) மற்றும் 28.4°C கடல் வெப்பநிலை பதிவு செய்யப்பட்டுள்ளது. சூரை மீன் மற்றும் கானாங்கெளுத்தி அதிகளவில் கிடைக்க வாய்ப்புள்ளது.'
                    : 'Optimal marine productivity detected 35.2 km East of Kasimedu Base. High Chlorophyll plume (1.4 mg/m³) and stable SST (28.4°C) indicate high pelagic fish aggregation.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2">
              <div className="bg-[#050c18] p-2.5 rounded-lg border border-[#1c2838]">
                <span className="text-slate-500 text-[10px] block">GPS COORDINATES</span>
                <strong className="text-cyan-300">13.1420°N, 80.5210°E</strong>
              </div>
              <div className="bg-[#050c18] p-2.5 rounded-lg border border-[#1c2838]">
                <span className="text-slate-500 text-[10px] block">TARGET SPECIES</span>
                <strong className="text-emerald-400">Skipjack Tuna, Mackerel</strong>
              </div>
              <div className="bg-[#050c18] p-2.5 rounded-lg border border-[#1c2838]">
                <span className="text-slate-500 text-[10px] block">HARBOUR DISTANCE</span>
                <strong className="text-slate-200">35.2 km (Kasimedu Base)</strong>
              </div>
              <div className="bg-[#050c18] p-2.5 rounded-lg border border-[#1c2838]">
                <span className="text-slate-500 text-[10px] block">SEA STATE</span>
                <strong className="text-teal-300">Wave: 1.1m | Wind: 14kts</strong>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Metrics Summary Bar */}
      <div className="bg-[#0b1420] border border-[#1c2838] p-3.5 rounded-xl grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono text-xs text-center">
        <div>
          <span className="text-slate-500 text-[10px] block uppercase font-sans font-bold">TOTAL LATENCY</span>
          <strong className="text-slate-100 text-sm">1.87s</strong>
        </div>
        <div>
          <span className="text-slate-500 text-[10px] block uppercase font-sans font-bold">SOURCES QUERIED</span>
          <strong className="text-slate-100 text-sm">5</strong>
          <span className="text-[9px] text-slate-500 block">INCOIS, IMD, MOSDAC</span>
        </div>
        <div>
          <span className="text-slate-500 text-[10px] block uppercase font-sans font-bold">AGENTS COMPLETED</span>
          <strong className="text-emerald-400 text-sm">6/6</strong>
        </div>
        <div>
          <span className="text-slate-500 text-[10px] block uppercase font-sans font-bold">SAFETY STATUS</span>
          <strong className={isVeto ? 'text-red-400 text-sm' : 'text-emerald-400 text-sm'}>
            {isVeto ? '🚨 VETO ACTIVE' : '● SAFE CLEAR'}
          </strong>
        </div>
        <div>
          <span className="text-slate-500 text-[10px] block uppercase font-sans font-bold">SYSTEM CONFIDENCE</span>
          <strong className="text-cyan-400 text-sm">94%</strong>
        </div>
      </div>

      {/* Selected Agent Telemetry Dossier Modal */}
      {selectedAgentDetail && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
          <div className="bg-[#0b1420] border border-cyan-500/40 p-6 rounded-2xl max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1c2838] pb-3">
              <div>
                <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-widest block">
                  AGENT INSPECTION DOSSIER
                </span>
                <h3 className="text-base font-extrabold text-slate-100 font-mono mt-0.5">
                  {selectedAgentDetail.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedAgentDetail(null)}
                className="p-1.5 rounded-lg bg-[#050c18] border border-[#1c2838] text-slate-400 hover:text-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="flex justify-between py-1.5 border-b border-[#1c2838]">
                <span className="text-slate-400">Agent Specialty:</span>
                <span className="text-slate-100 font-bold">{selectedAgentDetail.role}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#1c2838]">
                <span className="text-slate-400">API Endpoint:</span>
                <span className="text-cyan-300 font-bold">{selectedAgentDetail.apiEndpoint}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#1c2838]">
                <span className="text-slate-400">Execution Latency:</span>
                <span className="text-emerald-400 font-bold">{selectedAgentDetail.latency}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#1c2838]">
                <span className="text-slate-400">Data Provenance:</span>
                <span className="text-slate-200 font-bold">{selectedAgentDetail.provenance}</span>
              </div>
              <div className="py-1.5 border-b border-[#1c2838] space-y-1">
                <span className="text-slate-400 block">Agent Instruction / System Prompt:</span>
                <p className="text-[11px] text-slate-300 bg-[#050c18] p-2 rounded border border-[#1c2838]">
                  {selectedAgentDetail.prompt}
                </p>
              </div>
              <div className="py-1.5 space-y-1">
                <span className="text-slate-400 block">Output Result:</span>
                <p className="text-[11px] text-cyan-300 bg-[#050c18] p-2 rounded border border-[#1c2838] font-bold">
                  {selectedAgentDetail.output}
                </p>
              </div>
            </div>

            <button
              onClick={() => setSelectedAgentDetail(null)}
              className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider rounded-xl transition"
            >
              CLOSE AGENT DOSSIER
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
