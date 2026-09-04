import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Cpu,
  Zap,
  Anchor,
  Activity,
  Map as MapIcon,
  HelpCircle,
  FileText,
  ShieldAlert,
  PlaySquare
} from 'lucide-react';

export const ORCASidebar: React.FC = () => {
  const location = useLocation();
  const pathname = location.pathname;

  const isIntelligence = pathname === '/' || pathname === '/dashboard';
  const isVessels = pathname === '/fleet-overview' || pathname === '/vessels';
  const isAgentTrace = pathname === '/agent-execution';
  const isMapControls = pathname === '/marine-map' || pathname === '/marine_map' || pathname === '/map' || pathname === '/map-controls';
  const isSystemHealth = pathname === '/data-health';
  const isSafetyVeto = pathname === '/safety-veto' || pathname === '/safety_veto';

  return (
    <aside className="fixed left-0 top-16 bottom-0 w-60 bg-surface-container-low border-r border-outline-variant flex flex-col justify-between p-4 z-40">
      
      <div className="space-y-4">
        {/* Top Header Box matching Stitch */}
        <div className="bg-surface-container-lowest border border-outline-variant p-3 rounded flex items-center gap-3">
          <div className="p-2 bg-surface-container-high text-primary border border-outline-variant rounded">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-extrabold text-on-surface uppercase tracking-wider">ORCA Core</h3>
            <p className="text-[10px] text-on-surface-variant font-mono font-semibold">MULTI-AGENT REASONING</p>
          </div>
        </div>

        {/* Main Nav Items List */}
        <nav className="space-y-1 text-xs font-sans">
          <NavLink
            to="/dashboard"
            className={`flex items-center gap-3 px-3 py-2.5 rounded font-bold transition ${
              isIntelligence
                ? 'bg-secondary-container text-white shadow-md'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
          >
            <Zap className="w-4 h-4 text-primary" />
            <span>INTELLIGENCE</span>
          </NavLink>

          <NavLink
            to="/fleet-overview"
            className={`flex items-center gap-3 px-3 py-2.5 rounded font-bold transition ${
              isVessels
                ? 'bg-secondary-container text-white shadow-md'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
          >
            <Anchor className="w-4 h-4 text-primary" />
            <span>VESSELS</span>
          </NavLink>

          <NavLink
            to="/agent-execution"
            className={`flex items-center gap-3 px-3 py-2.5 rounded font-bold transition ${
              isAgentTrace
                ? 'bg-secondary-container text-white shadow-md'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
          >
            <Cpu className="w-4 h-4 text-primary" />
            <span>AGENT TRACE</span>
          </NavLink>

          <NavLink
            to="/marine-map"
            className={`flex items-center gap-3 px-3 py-2.5 rounded font-bold transition ${
              isMapControls
                ? 'bg-secondary-container text-white shadow-md'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
          >
            <MapIcon className="w-4 h-4 text-primary" />
            <span>MAP CONTROLS</span>
          </NavLink>

          <NavLink
            to="/data-health"
            className={`flex items-center gap-3 px-3 py-2.5 rounded font-bold transition ${
              isSystemHealth
                ? 'bg-secondary-container text-white shadow-md'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
          >
            <Activity className="w-4 h-4 text-primary" />
            <span>SYSTEM HEALTH</span>
          </NavLink>

          <NavLink
            to="/safety-veto"
            className={`flex items-center gap-3 px-3 py-2.5 rounded font-bold transition ${
              isSafetyVeto
                ? 'bg-error-container text-on-error-container shadow-md'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-error" />
            <span>SAFETY VETO</span>
          </NavLink>
        </nav>
      </div>

      {/* Bottom Nav Links */}
      <div className="space-y-1 text-xs border-t border-outline-variant pt-3">
        <NavLink
          to="/demo-scenarios"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded font-bold transition ${
              isActive
                ? 'bg-secondary-container text-white shadow-md'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`
          }
        >
          <PlaySquare className="w-4 h-4 text-primary" />
          <span>DEMO SCENARIOS</span>
        </NavLink>

        <NavLink
          to="/alerts"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded font-bold transition ${
              isActive
                ? 'bg-secondary-container text-white shadow-md'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`
          }
        >
          <HelpCircle className="w-4 h-4 text-primary" />
          <span>SUPPORT</span>
        </NavLink>

        <NavLink
          to="/evidence-inspector"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded font-bold transition ${
              isActive
                ? 'bg-secondary-container text-white shadow-md'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`
          }
        >
          <FileText className="w-4 h-4 text-primary" />
          <span>LOGS</span>
        </NavLink>
      </div>

    </aside>
  );
};
