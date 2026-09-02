import React, { useState, useEffect, useRef } from 'react';
import { Map, NavigationControl, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Navigation, AlertTriangle } from 'lucide-react';
import { MAP_CONFIG } from '../config/map';

import {
  getLandingCentresGeoJSON,
  getPFZAdvisoriesGeoJSON,
  getOceanGridsGeoJSON,
  getMarineWeatherGeoJSON,
  getHazardWarningsGeoJSON,
  getVesselsGeoJSON,
  getRouteGeoJSON
} from './geoConverters';

export interface MapViewProps {
  isVeto?: boolean;
  selectedZoneId?: string | null;
  onSelectZone?: (zone: any) => void;
  center?: [number, number];
  zoom?: number;
}

// Official OpenStreetMap Raster Tile Style Object
const OSM_FALLBACK_STYLE: any = {
  version: 8,
  sources: {
    'osm-basemap': {
      type: 'raster',
      tiles: [
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors'
    }
  },
  layers: [
    {
      id: 'osm-basemap',
      type: 'raster',
      source: 'osm-basemap'
    }
  ]
};

export const MapView: React.FC<MapViewProps> = ({
  isVeto = false,
  selectedZoneId,
  onSelectZone,
  center = [80.2974, 13.0827],
  zoom = 8
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const fallbackAttemptedRef = useRef<boolean>(false);

  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const [layerVisibility, setLayerVisibility] = useState({
    pfz: true,
    sst: true,
    chl: true,
    wind: true,
    hazards: true,
    route: true,
    vessels: true,
    ports: true
  });

  const toggleLayer = (layerKey: keyof typeof layerVisibility) => {
    const nextState = !layerVisibility[layerKey];
    setLayerVisibility((prev) => ({ ...prev, [layerKey]: nextState }));

    const map = mapInstanceRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const visibilityVal = nextState ? 'visible' : 'none';

    const layerMap: Record<string, string[]> = {
      pfz: ['orca-pfz-fill', 'orca-pfz-line', 'orca-pfz-points'],
      sst: ['orca-sst-fill', 'orca-sst-line'],
      chl: ['orca-chl-fill', 'orca-chl-line'],
      wind: ['orca-wind-points'],
      hazards: ['orca-hazard-fill', 'orca-hazard-line'],
      route: ['orca-route-line'],
      vessels: ['orca-vessels-circle'],
      ports: ['orca-landing-centres-circle']
    };

    const targetLayers = layerMap[layerKey] || [];
    targetLayers.forEach((id) => {
      try {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', visibilityVal);
        }
      } catch (e) {}
    });
  };

  // Safely attaches all ORCA data layers independently with complete failure isolation
  const attachOrcaDataLayers = (map: Map) => {
    if (!map || !map.isStyleLoaded()) return;

    // 1. Landing Centres (Kasimedu Harbour)
    try {
      if (!map.getSource('orca-landing-centres-src')) {
        map.addSource('orca-landing-centres-src', {
          type: 'geojson',
          data: getLandingCentresGeoJSON() as any
        });
        map.addLayer({
          id: 'orca-landing-centres-circle',
          type: 'circle',
          source: 'orca-landing-centres-src',
          paint: {
            'circle-radius': 8,
            'circle-color': '#0284c7',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
          }
        });
      }
    } catch (err) {
      console.error('[ORCA MAP] Landing centres layer error:', err);
    }

    // 2. INCOIS PFZ Advisories
    try {
      const pfzData = getPFZAdvisoriesGeoJSON();
      if (!map.getSource('orca-pfz-polygons-src')) {
        map.addSource('orca-pfz-polygons-src', {
          type: 'geojson',
          data: pfzData.polygons as any
        });
        map.addSource('orca-pfz-points-src', {
          type: 'geojson',
          data: pfzData.points as any
        });
        map.addLayer({
          id: 'orca-pfz-fill',
          type: 'fill',
          source: 'orca-pfz-polygons-src',
          paint: {
            'fill-color': '#10b981',
            'fill-opacity': 0.4
          }
        });
        map.addLayer({
          id: 'orca-pfz-line',
          type: 'line',
          source: 'orca-pfz-polygons-src',
          paint: {
            'line-color': '#059669',
            'line-width': 2.5
          }
        });
        map.addLayer({
          id: 'orca-pfz-points',
          type: 'circle',
          source: 'orca-pfz-points-src',
          paint: {
            'circle-radius': 5,
            'circle-color': '#10b981',
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#ffffff'
          }
        });
      }
    } catch (err) {
      console.error('[ORCA MAP] PFZ layer error:', err);
    }

    // 3. MOSDAC Ocean Observations (SST & Chlorophyll)
    try {
      const oceanData = getOceanGridsGeoJSON();
      if (!map.getSource('orca-sst-src')) {
        map.addSource('orca-sst-src', {
          type: 'geojson',
          data: oceanData.sst as any
        });
        map.addLayer({
          id: 'orca-sst-fill',
          type: 'fill',
          source: 'orca-sst-src',
          paint: {
            'fill-color': '#f59e0b',
            'fill-opacity': 0.25
          }
        });
        map.addLayer({
          id: 'orca-sst-line',
          type: 'line',
          source: 'orca-sst-src',
          paint: {
            'line-color': '#d97706',
            'line-width': 1.5,
            'line-dasharray': [2, 2]
          }
        });
      }

      if (!map.getSource('orca-chl-src')) {
        map.addSource('orca-chl-src', {
          type: 'geojson',
          data: oceanData.chl as any
        });
        map.addLayer({
          id: 'orca-chl-fill',
          type: 'fill',
          source: 'orca-chl-src',
          paint: {
            'fill-color': '#059669',
            'fill-opacity': 0.25
          }
        });
        map.addLayer({
          id: 'orca-chl-line',
          type: 'line',
          source: 'orca-chl-src',
          paint: {
            'line-color': '#047857',
            'line-width': 1.5,
            'line-dasharray': [3, 2]
          }
        });
      }
    } catch (err) {
      console.error('[ORCA MAP] MOSDAC Ocean layer error:', err);
    }

    // 4. IMD Marine Weather
    try {
      const weatherData = getMarineWeatherGeoJSON();
      if (!map.getSource('orca-weather-src')) {
        map.addSource('orca-weather-src', {
          type: 'geojson',
          data: weatherData as any
        });
        map.addLayer({
          id: 'orca-wind-points',
          type: 'circle',
          source: 'orca-weather-src',
          paint: {
            'circle-radius': 5,
            'circle-color': '#2563eb',
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff'
          }
        });
      }
    } catch (err) {
      console.error('[ORCA MAP] Weather layer error:', err);
    }

    // 5. IMD Hazard Warnings
    try {
      const hazardData = getHazardWarningsGeoJSON();
      if (!map.getSource('orca-hazard-src')) {
        map.addSource('orca-hazard-src', {
          type: 'geojson',
          data: hazardData as any
        });
        map.addLayer({
          id: 'orca-hazard-fill',
          type: 'fill',
          source: 'orca-hazard-src',
          paint: {
            'fill-color': '#dc2626',
            'fill-opacity': isVeto ? 0.45 : 0.25
          }
        });
        map.addLayer({
          id: 'orca-hazard-line',
          type: 'line',
          source: 'orca-hazard-src',
          paint: {
            'line-color': '#991b1b',
            'line-width': 2.5,
            'line-dasharray': [4, 4]
          }
        });
      }
    } catch (err) {
      console.error('[ORCA MAP] Hazard layer error:', err);
    }

    // 6. Active Vessels
    try {
      const vesselData = getVesselsGeoJSON();
      if (!map.getSource('orca-vessels-src')) {
        map.addSource('orca-vessels-src', {
          type: 'geojson',
          data: vesselData as any
        });
        map.addLayer({
          id: 'orca-vessels-circle',
          type: 'circle',
          source: 'orca-vessels-src',
          paint: {
            'circle-radius': 6,
            'circle-color': '#0284c7',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
          }
        });
      }
    } catch (err) {
      console.error('[ORCA MAP] Vessels layer error:', err);
    }

    // 7. Navigation Route
    try {
      const routeData = getRouteGeoJSON();
      if (!map.getSource('orca-route-src')) {
        map.addSource('orca-route-src', {
          type: 'geojson',
          data: routeData as any
        });
        map.addLayer({
          id: 'orca-route-line',
          type: 'line',
          source: 'orca-route-src',
          paint: {
            'line-color': '#0284c7',
            'line-width': 3.5,
            'line-dasharray': [2, 2]
          }
        });
      }
    } catch (err) {
      console.error('[ORCA MAP] Route layer error:', err);
    }

    // Interactive Layer Popups
    try {
      map.on('click', 'orca-landing-centres-circle', (e: any) => {
        if (!e.features || !e.features[0]) return;
        const props = e.features[0].properties;
        new Popup({ closeButton: true })
          .setLngLat((e.features[0].geometry as any).coordinates)
          .setHTML(`
            <div style="font-family:sans-serif; padding:4px; color:#0f172a">
              <strong style="color:#0284c7; font-size:12px">${props.name}</strong>
              <div style="font-size:11px; margin-top:4px">
                <div>State: <b>${props.state}</b></div>
                <div>Facilities: ${props.facilities}</div>
                <div>Max Capacity: ${props.capacity} boats</div>
              </div>
            </div>
          `)
          .addTo(map);
      });

      map.on('click', 'orca-pfz-fill', (e: any) => {
        if (!e.features || !e.features[0]) return;
        const props = e.features[0].properties;
        if (onSelectZone) onSelectZone(props);
        new Popup({ closeButton: true })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family:sans-serif; padding:4px; color:#0f172a">
              <strong style="color:#059669; font-size:12px">INCOIS PFZ: ${props.sector_name}</strong>
              <div style="font-size:11px; margin-top:4px">
                <div>Score: <b style="color:#059669">${props.score}%</b></div>
                <div>Bearing: <b>${props.bearing_deg}° SE</b></div>
                <div>Distance: <b>${props.distance_km} km</b></div>
                <div>Depth: <b>${props.depth_m} m</b></div>
                <div>Harbour: ${props.nearest_landing_centre}</div>
              </div>
            </div>
          `)
          .addTo(map);
      });

      map.on('click', 'orca-vessels-circle', (e: any) => {
        if (!e.features || !e.features[0]) return;
        const props = e.features[0].properties;
        new Popup({ closeButton: true })
          .setLngLat((e.features[0].geometry as any).coordinates)
          .setHTML(`
            <div style="font-family:sans-serif; padding:4px; color:#0f172a">
              <strong style="color:#0284c7; font-size:12px">${props.name} (${props.vessel_id})</strong>
              <div style="font-size:11px; margin-top:4px">
                <div>Type: ${props.type}</div>
                <div>Speed: <b>${props.speed_knots} knots</b></div>
                <div>Heading: <b>${props.heading_deg}°</b></div>
                <div style="color:${props.status.includes('ALERT') ? '#dc2626' : '#059669'}"><b>${props.status}</b></div>
              </div>
            </div>
          `)
          .addTo(map);
      });

      ['orca-landing-centres-circle', 'orca-pfz-fill', 'orca-vessels-circle'].forEach((id) => {
        map.on('mouseenter', id, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', id, () => {
          map.getCanvas().style.cursor = '';
        });
      });
    } catch (err) {
      console.error('[ORCA MAP] Popup handler setup error:', err);
    }
  };

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const apiKey = import.meta.env.VITE_MAPTILER_API_KEY;
    const forceFallback = import.meta.env.VITE_FORCE_FALLBACK_MAP === 'true';

    // Helper to start the clean independent raster fallback map
    const startFallbackMap = () => {
      if (fallbackAttemptedRef.current) return;
      fallbackAttemptedRef.current = true;

      console.log('[ORCA MAP] Switching to fallback basemap');
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {}
        mapInstanceRef.current = null;
      }

      if (!mapContainerRef.current) return;

      let fallbackMap: Map;
      try {
        fallbackMap = new Map({
          container: mapContainerRef.current,
          style: OSM_FALLBACK_STYLE,
          center: center,
          zoom: zoom,
          pitch: 0,
          attributionControl: { compact: true }
        });
      } catch (err) {
        console.error('[ORCA MAP] Fallback map instantiation error:', err);
        return;
      }

      mapInstanceRef.current = fallbackMap;
      try {
        fallbackMap.addControl(new NavigationControl({ showCompass: true }), 'top-right');
      } catch (e) {}

      fallbackMap.on('load', () => {
        console.log('[ORCA MAP] Fallback basemap loaded');
        setMapStatus('ready');
        fallbackMap.resize();
        attachOrcaDataLayers(fallbackMap);
      });
    };

    // Container ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.resize();
      }
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    if (forceFallback || !apiKey) {
      console.log('[ORCA MAP] Using fallback basemap (Force mode or missing key)');
      startFallbackMap();
      return () => {
        resizeObserver.disconnect();
        if (mapInstanceRef.current) {
          try {
            mapInstanceRef.current.remove();
          } catch (e) {}
        }
      };
    }

    console.log('[ORCA MAP] Initializing MapTiler');
    const mapTilerUrl = `https://api.maptiler.com/maps/streets-v2/style.json?key=${apiKey}`;

    let styleLoaded = false;
    let map: Map;

    try {
      map = new Map({
        container: mapContainerRef.current,
        style: mapTilerUrl,
        center: center,
        zoom: zoom,
        pitch: 20,
        attributionControl: false
      });
    } catch (err) {
      console.error('[ORCA MAP] MapTiler instantiation error:', err);
      startFallbackMap();
      return () => {
        resizeObserver.disconnect();
      };
    }

    mapInstanceRef.current = map;
    try {
      map.addControl(new NavigationControl({ showCompass: true }), 'top-right');
    } catch (e) {}

    map.on('style.load', () => {
      styleLoaded = true;
      console.log('[ORCA MAP] MapTiler style loaded');
    });

    map.on('load', () => {
      console.log('[ORCA MAP] MapTiler basemap rendered cleanly at Chennai [80.2974, 13.0827]');
      setMapStatus('ready');
      map.resize();
      attachOrcaDataLayers(map);
    });

    map.on('error', (event: any) => {
      console.error('[ORCA MAP] MapTiler error:', event.error || event);
      if (!styleLoaded && !fallbackAttemptedRef.current) {
        startFallbackMap();
      }
    });

    return () => {
      resizeObserver.disconnect();
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {}
      }
    };
  }, [isVeto, center, zoom]);

  return (
    <div className="bg-[#0b172a] border border-[#1b2b45] rounded-xl overflow-hidden shadow-2xl flex flex-col h-[500px] min-h-[500px] w-full relative">
      
      {/* Top Map Layer Toolbar */}
      <div className="bg-[#070f1e] px-3 py-2 border-b border-[#1b2b45] flex flex-wrap items-center justify-between gap-2 z-10 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1 font-mono">
            <Navigation className="w-3.5 h-3.5 text-cyan-400" />
            Bay of Bengal GIS Engine — MapLibre GL
          </span>
        </div>

        {/* Layer Visibility Toggle Chips */}
        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          <button
            onClick={() => toggleLayer('pfz')}
            className={`px-2 py-0.5 rounded border transition font-mono ${
              layerVisibility.pfz ? 'bg-cyan-950 text-cyan-300 border-cyan-700' : 'bg-[#0d1728] text-slate-500 border-[#1b2b45]'
            }`}
          >
            PFZ
          </button>
          <button
            onClick={() => toggleLayer('sst')}
            className={`px-2 py-0.5 rounded border transition font-mono ${
              layerVisibility.sst ? 'bg-amber-950 text-amber-300 border-amber-800' : 'bg-[#0d1728] text-slate-500 border-[#1b2b45]'
            }`}
          >
            SST
          </button>
          <button
            onClick={() => toggleLayer('chl')}
            className={`px-2 py-0.5 rounded border transition font-mono ${
              layerVisibility.chl ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-[#0d1728] text-slate-500 border-[#1b2b45]'
            }`}
          >
            CHL
          </button>
          <button
            onClick={() => toggleLayer('wind')}
            className={`px-2 py-0.5 rounded border transition font-mono ${
              layerVisibility.wind ? 'bg-blue-950 text-blue-300 border-blue-800' : 'bg-[#0d1728] text-slate-500 border-[#1b2b45]'
            }`}
          >
            WIND
          </button>
          <button
            onClick={() => toggleLayer('hazards')}
            className={`px-2 py-0.5 rounded border transition font-mono ${
              layerVisibility.hazards ? 'bg-red-950 text-red-300 border-red-800' : 'bg-[#0d1728] text-slate-500 border-[#1b2b45]'
            }`}
          >
            HAZARDS
          </button>
          <button
            onClick={() => toggleLayer('vessels')}
            className={`px-2 py-0.5 rounded border transition font-mono ${
              layerVisibility.vessels ? 'bg-sky-950 text-sky-300 border-sky-800' : 'bg-[#0d1728] text-slate-500 border-[#1b2b45]'
            }`}
          >
            VESSELS
          </button>
          <button
            onClick={() => toggleLayer('route')}
            className={`px-2 py-0.5 rounded border transition font-mono ${
              layerVisibility.route ? 'bg-teal-950 text-teal-300 border-teal-800' : 'bg-[#0d1728] text-slate-500 border-[#1b2b45]'
            }`}
          >
            ROUTE
          </button>
        </div>
      </div>

      {/* Main MapLibre GL Rendering Viewport */}
      <div className="relative flex-1 bg-[#040a16] overflow-hidden min-h-[440px] w-full h-full">
        
        {/* Real MapLibre GL DOM Container */}
        <div
          ref={mapContainerRef}
          className="w-full h-full min-h-[440px]"
          style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
        />

        {/* Active Hazard Veto Banner */}
        {isVeto && layerVisibility.hazards && mapStatus === 'ready' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-red-950/90 border-2 border-red-500 p-3.5 rounded-xl max-w-sm text-center backdrop-blur-md shadow-2xl">
            <AlertTriangle className="w-7 h-7 text-red-500 mx-auto mb-1 animate-bounce" />
            <h4 className="font-bold text-xs text-red-300 uppercase tracking-wider font-mono">
              CYCLONE HAZARD ZONE ACTIVE
            </h4>
            <p className="text-[11px] text-red-200 mt-1">
              IMD Severe Cyclonic Storm Warning • Gale winds 45-55 kts
            </p>
          </div>
        )}

        {/* Map Legend Footer */}
        {mapStatus === 'ready' && (
          <div className="absolute bottom-3 right-3 z-20 bg-[#070f1e]/90 border border-[#1b2b45] px-3 py-1.5 rounded-md text-[10px] text-slate-300 flex items-center gap-3 backdrop-blur-xs font-mono">
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-emerald-400"></span>
              <span>PFZ Zone #12A</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-cyan-400"></span>
              <span>Kasimedu Harbour</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-sky-400"></span>
              <span>Vessels</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-amber-400"></span>
              <span>SST Grid</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
