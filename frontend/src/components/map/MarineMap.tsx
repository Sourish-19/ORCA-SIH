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
  onSelectZone
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
      />
    </div>
  );
};
