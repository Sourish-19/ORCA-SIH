import React from 'react';
import { MarineMap } from '../components/map/MarineMap';
import { ORCAResponse } from '../types';

interface MarineMapPageProps {
  response: ORCAResponse | null;
}

export const MarineMapPage: React.FC<MarineMapPageProps> = ({ response }) => {
  const center: [number, number] | undefined = response?.top_recommendation
    ? [response.top_recommendation.center_lon, response.top_recommendation.center_lat]
    : undefined;

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col space-y-2">
      <MarineMap
        isVeto={response?.safety?.veto_triggered}
        center={center}
        zoom={8.5}
        response={response}
        location={response?.intent?.location_name || response?.top_recommendation?.nearest_landing_centre}
        query={response?.query}
      />
    </div>
  );
};
