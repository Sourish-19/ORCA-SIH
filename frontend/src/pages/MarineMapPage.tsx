import React from 'react';
import { MarineMap } from '../components/map/MarineMap';
import { ORCAResponse } from '../types';

interface MarineMapPageProps {
  response: ORCAResponse | null;
}

export const MarineMapPage: React.FC<MarineMapPageProps> = ({ response }) => {
  const center: [number, number] = (response?.top_recommendation?.center_lon && response?.top_recommendation?.center_lat)
    ? [response.top_recommendation.center_lon, response.top_recommendation.center_lat]
    : [80.4500, 13.1500];

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col space-y-2">
      <MarineMap
        isVeto={response?.safety?.veto_triggered}
        center={center}
        zoom={9.5}
        response={response}
        location={response?.intent?.location_name || 'Chennai'}
        query={response?.query || 'Where should I fish tomorrow near Chennai?'}
      />
    </div>
  );
};
