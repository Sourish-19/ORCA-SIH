import React from 'react';
import { MapView } from '../../map/MapView';
import { PFZZone, Hazard, ORCAResponse } from '../../types';

interface MarineMapProps {
  pfzZones?: PFZZone[];
  activeHazard?: Hazard | null;
  selectedZone?: PFZZone | null;
  isVeto?: boolean;
  center?: [number, number];
  zoom?: number;
  response?: ORCAResponse | null;
  location?: string;
  query?: string;
  onSelectZone?: (zone: any) => void;
  activePreset?: 'scenario_01' | 'scenario_02' | 'scenario_03' | null;
  onSelectPreset?: (id: 'scenario_01' | 'scenario_02' | 'scenario_03', q: string) => void;
  executeTrigger?: number;
}

export const MarineMap: React.FC<MarineMapProps> = ({
  pfzZones = [],
  activeHazard,
  selectedZone,
  isVeto = false,
  center,
  zoom,
  response,
  location,
  query,
  onSelectZone,
  activePreset,
  onSelectPreset,
  executeTrigger
}) => {
  return (
    <div className="w-full h-full">
      <MapView
        isVeto={isVeto}
        center={center}
        zoom={zoom}
        response={response}
        location={location}
        query={query}
        selectedZoneId={selectedZone?.id || (selectedZone as any)?.zone_id}
        onSelectZone={onSelectZone}
        activePreset={activePreset}
        onSelectPreset={onSelectPreset}
        executeTrigger={executeTrigger}
      />
    </div>
  );
};
