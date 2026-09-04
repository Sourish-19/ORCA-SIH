import React from 'react';
import { CheckCircle2, Circle, Clock } from 'lucide-react';
import { AgentStepTrace } from '../types';

interface AgentTracePanelProps {
  agentTraces?: AgentStepTrace[];
}

export const AgentTracePanel: React.FC<AgentTracePanelProps> = ({ agentTraces = [] }) => {
  const steps = [
    { name: 'LANGUAGE & INTENT', tag: 'Target: Chennai • Time: Tomorrow', status: 'SUCCESS' },
    { name: 'GEO-DATA AGENT', tag: 'INCOIS PFZ retrieved • 19 zones', status: 'SUCCESS' },
    { name: 'OCEAN DATA AGENT', tag: 'SST: 28.4°C • CHL: 1.2 mg/m³', status: 'SUCCESS' },
    { name: 'HAZARD AGENT', tag: 'IMD Wave: 1.2m • Wind: 14 km/h', status: 'SUCCESS' },
    { name: 'REASONING AGENT', tag: '6-factor suitability score computed', status: 'SUCCESS' },
    { name: 'SAFETY AGENT', tag: 'NO HAZARD VETO • CLEAR', status: 'SUCCESS_GREEN' },
    { name: 'SYNTHESIS AGENT', tag: 'Generating grounded advisory...', status: 'RUNNING' }
  ];

  return (
    <div className="bg-[#0e1622] border border-[#1c2838] rounded-xl p-4 space-y-3">
      <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
        AGENT EXECUTION TRACE
      </h4>

      <div className="relative space-y-3.5">
        {/* Vertical Timeline Bar - perfectly centered behind 20px checkmark circles */}
        <div className="absolute left-[9px] top-2.5 bottom-3 w-0.5 bg-[#1c2838]"></div>

        {steps.map((step, idx) => {
          const isGreen = step.status === 'SUCCESS_GREEN';
          const isRunning = step.status === 'RUNNING';

          return (
            <div key={idx} className="relative flex items-start gap-3 text-xs">
              {/* Step Circle Checkmark Container */}
              <div className="w-5 h-5 shrink-0 flex items-center justify-center bg-[#0e1622] rounded-full z-10 mt-0.5">
                {isRunning ? (
                  <Circle className="w-4 h-4 text-cyan-400 fill-cyan-400/20 animate-ping" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 fill-emerald-400/10" />
                )}
              </div>

              <div className="space-y-1 min-w-0">
                <span className="font-extrabold text-[11px] text-slate-200 uppercase tracking-wide block">
                  {step.name}
                </span>
                <div
                  className={`inline-block px-2.5 py-1 rounded border font-mono text-[10px] font-bold ${
                    isGreen
                      ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                      : isRunning
                      ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800'
                      : 'bg-[#09101b] text-slate-300 border-[#1c2838]'
                  }`}
                >
                  {step.tag}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
