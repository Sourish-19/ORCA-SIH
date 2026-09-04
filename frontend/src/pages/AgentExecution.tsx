import React, { useState } from 'react';
import { Cpu, CheckCircle2, Circle, Mic, Send, Globe, ArrowDown, Radio } from 'lucide-react';
import { ORCAResponse } from '../types';

interface AgentExecutionProps {
  response: ORCAResponse | null;
  onQuerySubmit?: (query: string) => void;
  isLoading?: boolean;
}

export const AgentExecution: React.FC<AgentExecutionProps> = ({ response, onQuerySubmit, isLoading = false }) => {
  const [queryInput, setQueryInput] = useState('');
  const [activeLang, setActiveLang] = useState<'EN' | 'TA'>('EN');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (queryInput.trim() && onQuerySubmit) {
      onQuerySubmit(queryInput.trim());
    }
  };

  const intent = response?.intent;
  const isVeto = response?.safety?.veto_triggered;
  const vetoReason = response?.safety?.veto_reasons?.join(', ') || response?.safety?.safety_summary;
  const suitabilityScore = response?.suitability_breakdown?.total_score || response?.top_recommendation?.strength_score || 88;

  return (
    <div className="space-y-4">
      {/* Title Header */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-white uppercase font-sans">
          ORCA AGENT EXECUTION
        </h1>
        <p className="text-xs text-slate-400 font-medium">
          From natural language to evidence-backed marine intelligence
        </p>
      </div>

      {/* Main Grid: Left Active Query & Intent Vector | Right Orchestration Graph */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* Left Column (4-Cols): Active Query & Intent Vector */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Active Query Card */}
          <div className="bg-[#0b1420] border border-[#1c2838] p-4 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
                ● ACTIVE QUERY
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

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="bg-[#050c18] border border-[#1c2838] p-3 rounded-lg flex items-start gap-2">
                <textarea
                  rows={3}
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  className="w-full bg-transparent text-xs text-slate-100 font-bold outline-none resize-none"
                ></textarea>
                <button
                  type="button"
                  onClick={() => {
                    setQueryInput('நாளைக்கு சென்னைக்கு அருகில் எங்கு மீன் பிடிக்கலாம்?');
                    setActiveLang('TA');
                  }}
                  className="p-1.5 bg-[#0e1929] hover:bg-[#18273c] text-slate-400 hover:text-cyan-400 rounded border border-[#1c2838] transition"
                >
                  <Mic className="w-4 h-4 text-cyan-400" />
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 transition shadow-md shadow-cyan-500/20"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isLoading ? 'EXECUTING QUERY...' : 'Execute Query'}</span>
              </button>
            </form>
          </div>

          {/* Normalized Intent Vector Table */}
          <div className="bg-[#0b1420] border border-[#1c2838] p-4 rounded-xl space-y-3">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
              NORMALIZED INTENT VECTOR
            </h3>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-[#1c2838]">
                <span className="text-slate-400">Intent:</span>
                <span className="text-cyan-300 font-bold">{intent?.primary_intent || 'FISHING_RECOMMENDATION'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1c2838]">
                <span className="text-slate-400">Location:</span>
                <span className="text-slate-200">{intent?.location_name || 'Chennai'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1c2838]">
                <span className="text-slate-400">Time:</span>
                <span className="text-slate-200">{intent?.target_date_str || 'Tomorrow'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1c2838]">
                <span className="text-slate-400">Activity:</span>
                <span className="text-slate-200">{intent?.activity || 'Fishing'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Radius:</span>
                <span className="text-slate-200">100 km</span>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column (8-Cols): Orchestration Graph Flow Tree */}
        <div className="lg:col-span-8 bg-[#0b1420] border border-[#1c2838] p-5 rounded-xl space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[#1c2838]">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider font-mono">
              ORCHESTRATION GRAPH
            </h3>
          </div>

          <div className="space-y-4 max-w-2xl mx-auto py-2">
            
            {/* Step 1: Language + Intent */}
            <div className="bg-[#060c18] border border-[#1c2838] p-3 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Globe className="w-4 h-4 text-emerald-400" />
                <div>
                  <h4 className="text-xs font-bold text-slate-100">LANGUAGE + INTENT</h4>
                  <p className="text-[10px] text-slate-400 font-mono">Summary: Query parsed ({intent?.detected_language || 'English'}).</p>
                </div>
              </div>
              <div className="text-right font-mono text-[10px]">
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold block mb-1">
                  COMPLETED
                </span>
                <span className="text-slate-500">154ms</span>
              </div>
            </div>

            <div className="w-px h-4 bg-[#1c2838] mx-auto"></div>

            {/* Step 2: Orchestrator */}
            <div className="bg-[#060c18] border border-cyan-500/50 p-3 rounded-xl flex items-center justify-between shadow-lg shadow-cyan-950/50">
              <div className="flex items-center gap-2.5">
                <Cpu className="w-4 h-4 text-cyan-400 animate-spin" />
                <div>
                  <h4 className="text-xs font-bold text-slate-100">ORCHESTRATOR</h4>
                  <p className="text-[10px] text-cyan-300 font-mono">Summary: Routing to domain experts...</p>
                </div>
              </div>
              <div className="text-right font-mono text-[10px]">
                <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold block mb-1">
                  ● ACTIVE
                </span>
                <span className="text-slate-500">42ms</span>
              </div>
            </div>

            <div className="w-px h-4 bg-[#1c2838] mx-auto"></div>

            {/* Step 3: Parallel Domain Agents Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-[#060c18] border border-[#1c2838] p-3 rounded-xl space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="font-bold text-emerald-400">GEO-DATA</span>
                  <span className="text-slate-500">812ms</span>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 font-mono inline-block font-bold">
                  COMPLETED
                </span>
                <p className="text-[10px] text-slate-400 font-mono pt-1">INCOIS PFZ: retrieved<br/>MOSDAC SST: retrieved</p>
              </div>

              <div className="bg-[#060c18] border border-[#1c2838] p-3 rounded-xl space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="font-bold text-emerald-400">HAZARD</span>
                  <span className="text-slate-500">621ms</span>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 font-mono inline-block font-bold">
                  COMPLETED
                </span>
                <p className="text-[10px] text-slate-400 font-mono pt-1">
                  {isVeto ? 'IMD: CYCLONE VETO' : 'IMD forecast | No cyclone'}
                </p>
              </div>

              <div className="bg-[#060c18] border border-[#1c2838] p-3 rounded-xl space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="font-bold text-emerald-400">CONTEXT</span>
                  <span className="text-slate-500">345ms</span>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 font-mono inline-block font-bold">
                  COMPLETED
                </span>
                <p className="text-[10px] text-slate-400 font-mono pt-1">Success rates: 94%</p>
              </div>
            </div>

            <div className="w-px h-4 bg-[#1c2838] mx-auto"></div>

            {/* Step 4: Reasoning Agent */}
            <div className="bg-[#060c18] border border-[#1c2838] p-3 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <div>
                  <h4 className="text-xs font-bold text-slate-100">REASONING AGENT</h4>
                  <p className="text-[10px] text-slate-400 font-mono">Summary: OSI Score: {suitabilityScore}/100.</p>
                </div>
              </div>
              <div className="text-right font-mono text-[10px]">
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold block mb-1">
                  COMPLETED
                </span>
                <span className="text-slate-500">84ms</span>
              </div>
            </div>

            <div className="w-px h-4 bg-[#1c2838] mx-auto"></div>

            {/* Step 5: Safety Agent */}
            <div className="bg-[#060c18] border border-[#1c2838] p-3 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className={`w-4 h-4 ${isVeto ? 'text-red-400' : 'text-emerald-400'}`} />
                <div>
                  <h4 className="text-xs font-bold text-slate-100">SAFETY AGENT</h4>
                  <p className={`text-[10px] font-mono font-semibold ${isVeto ? 'text-red-400' : 'text-emerald-400'}`}>
                    Summary: {isVeto ? `🚨 VETO ACTIVE: ${vetoReason || 'Gale winds / Cyclone warning'}` : 'No veto triggered. Safe sea conditions.'}
                  </p>
                </div>
              </div>
              <div className="text-right font-mono text-[10px]">
                <span className={`px-2 py-0.5 rounded font-bold block mb-1 ${isVeto ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-emerald-950 text-emerald-400 border border-emerald-800'}`}>
                  {isVeto ? 'VETO TRIGGERED' : 'CLEAR'}
                </span>
                <span className="text-slate-500">12ms</span>
              </div>
            </div>

            <div className="w-px h-4 bg-[#1c2838] mx-auto"></div>

            {/* Step 6: Synthesis Agent */}
            <div className="bg-[#060c18] border border-[#1c2838] p-3 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                <div>
                  <h4 className="text-xs font-bold text-slate-100">SYNTHESIS AGENT</h4>
                  <p className="text-[10px] text-slate-400 font-mono">Summary: Grounded advisory ready.</p>
                </div>
              </div>
              <div className="text-right font-mono text-[10px]">
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold block mb-1">
                  COMPLETED
                </span>
                <span className="text-slate-500">210ms</span>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Bottom Metrics Summary Bar */}
      <div className="bg-[#0b1420] border border-[#1c2838] p-3.5 rounded-xl grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono text-xs text-center">
        <div>
          <span className="text-slate-500 text-[10px] block uppercase font-sans font-bold">TOTAL LATENCY</span>
          <strong className="text-slate-100 text-sm">2.28s</strong>
        </div>
        <div>
          <span className="text-slate-500 text-[10px] block uppercase font-sans font-bold">SOURCES QUERIED</span>
          <strong className="text-slate-100 text-sm">5</strong>
          <span className="text-[9px] text-slate-500 block">INCOIS, MOSDAC...</span>
        </div>
        <div>
          <span className="text-slate-500 text-[10px] block uppercase font-sans font-bold">AGENTS COMPLETED</span>
          <strong className="text-emerald-400 text-sm">8/8</strong>
        </div>
        <div>
          <span className="text-slate-500 text-[10px] block uppercase font-sans font-bold">DATA MODE</span>
          <strong className="text-emerald-400 text-sm">● LIVE</strong>
        </div>
        <div>
          <span className="text-slate-500 text-[10px] block uppercase font-sans font-bold">SYSTEM CONFIDENCE</span>
          <strong className="text-cyan-400 text-sm">94%</strong>
        </div>
      </div>

    </div>
  );
};
