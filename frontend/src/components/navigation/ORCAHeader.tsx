import React from 'react';
import { NavLink } from 'react-router-dom';
import { PersonaMode, DataMode } from '../../types';

interface ORCAHeaderProps {
  persona: PersonaMode;
  onPersonaChange: (persona: PersonaMode) => void;
  dataMode?: DataMode;
  location?: string;
  selectedScenarioTitle?: string;
  onOpenScenarios?: () => void;
}

export const ORCAHeader: React.FC<ORCAHeaderProps> = ({
  persona,
  onPersonaChange,
  location = 'Chennai • Bay of Bengal'
}) => {
  return (
    <header className="bg-surface/90 backdrop-blur-md border-b border-outline-variant px-5 py-2 flex items-center justify-between gap-4 sticky top-0 z-50 h-16">
      
      {/* LEFT: ORCA Logo + Subtitle / Location Underline */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xl font-black tracking-wider text-white font-sans">ORCA</span>
        </div>

        {/* Location Underline Badge */}
        <div className="border-b-2 border-primary pb-0.5">
          <span className="text-xs font-extrabold text-primary tracking-wider font-mono uppercase">
            {location}
          </span>
        </div>
      </div>

      {/* RIGHT: Persona Switcher, Demo Badge, Bell, Gear, Profile Avatar */}
      <div className="flex items-center gap-4">
        
        {/* Demo Mode Badge */}
        <NavLink
          to="/demo-scenarios"
          className="hidden sm:flex items-center gap-1.5 text-xs font-mono font-bold px-3 py-1 rounded bg-amber-950/80 text-amber-300 border border-amber-800 hover:bg-amber-900 transition"
        >
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
          <span>DEMO MODE • CHENNAI</span>
        </NavLink>

        {/* Persona Switcher (Segmented Control matching Stitch) */}
        <div className="bg-surface-container-lowest border border-outline-variant p-1 rounded flex items-center gap-1">
          <button
            onClick={() => onPersonaChange('analyst')}
            className={`px-4 py-1 rounded text-xs font-extrabold uppercase transition ${
              persona === 'analyst'
                ? 'bg-secondary-container text-white shadow-md'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Analyst
          </button>
          <button
            onClick={() => onPersonaChange('fisherman')}
            className={`px-4 py-1 rounded text-xs font-extrabold uppercase transition ${
              persona === 'fisherman'
                ? 'bg-tertiary-container text-on-tertiary-fixed-variant shadow-md font-extrabold'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Fisherman
          </button>
        </div>

      </div>

    </header>
  );
};
