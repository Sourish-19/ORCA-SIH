import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Map, NavigationControl, Popup, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Navigation,
  AlertTriangle,
  Layers,
  Satellite,
  Map as MapIcon,
  Globe,
  RotateCcw,
  Waves,
  CheckCircle2,
  RefreshCw,
  Anchor
} from 'lucide-react';

import {
  getLandingCentresGeoJSON,
  getPFZAdvisoriesGeoJSON,
  getOceanGridsGeoJSON,
  getMarineWeatherGeoJSON,
  getHazardWarningsGeoJSON,
  getVesselsGeoJSON,
  getRouteGeoJSON
} from './geoConverters';
import { marineApi } from '../services/api/marineApi';
import { ORCAResponse } from '../types';

export interface MapViewProps {
  isVeto?: boolean;
  selectedZoneId?: string | null;
  onSelectZone?: (zone: any) => void;
  center?: [number, number];
  zoom?: number;
  response?: ORCAResponse | null;
  location?: string;
  query?: string;
  activePreset?: 'scenario_01' | 'scenario_02' | 'scenario_03' | null;
  onSelectPreset?: (id: 'scenario_01' | 'scenario_02' | 'scenario_03', q: string) => void;
  executeTrigger?: number;
}

export type BasemapMode = 'dark' | 'ocean' | 'satellite' | 'streets';

// 1. ESRI World Dark Gray Canvas — Premier Dark Ocean GIS Basemap
// Crystal-clear dark marine aesthetics, 0 watermarks, completely free
const DARK_STYLE: any = {
  version: 8,
  sources: {
    'dark-basemap': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256,
      attribution: '&copy; Esri, HERE, Garmin, NOAA'
    }
  },
  layers: [
    {
      id: 'dark-basemap-layer',
      type: 'raster',
      source: 'dark-basemap',
      minzoom: 0,
      maxzoom: 20
    }
  ]
};

// 2. ESRI Ocean Basemap — Depth Bathymetry & Undersea Topography
const OCEAN_STYLE: any = {
  version: 8,
  sources: {
    'esri-ocean': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256,
      attribution: '&copy; Esri, GEBCO, NOAA, National Geographic'
    }
  },
  layers: [
    {
      id: 'esri-ocean-layer',
      type: 'raster',
      source: 'esri-ocean',
      minzoom: 0,
      maxzoom: 19
    }
  ]
};

// 3. ESRI World Imagery — High-Resolution Satellite Basemap
const SATELLITE_STYLE: any = {
  version: 8,
  sources: {
    'esri-satellite': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256,
      attribution: '&copy; Esri, Maxar, Earthstar Geographics'
    }
  },
  layers: [
    {
      id: 'esri-satellite-layer',
      type: 'raster',
      source: 'esri-satellite',
      minzoom: 0,
      maxzoom: 19
    }
  ]
};

// 4. OpenStreetMap — Standard Nautical / Coastal Navigation
const OSM_STYLE: any = {
  version: 8,
  sources: {
    'osm-streets': {
      type: 'raster',
      tiles: [
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
    }
  },
  layers: [
    {
      id: 'osm-streets-layer',
      type: 'raster',
      source: 'osm-streets',
      minzoom: 0,
      maxzoom: 19
    }
  ]
};

function getStyleForMode(mode: BasemapMode): any {
  const forceFallback = import.meta.env.VITE_FORCE_FALLBACK_MAP === 'true';
  const maptilerKey = import.meta.env.VITE_MAPTILER_API_KEY;
  if (!forceFallback && maptilerKey && maptilerKey.length > 5 && maptilerKey !== 'tS81bxNfsCkR3LhnRl99') {
    if (mode === 'dark') return `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${maptilerKey}`;
    if (mode === 'ocean') return `https://api.maptiler.com/maps/ocean/style.json?key=${maptilerKey}`;
    if (mode === 'satellite') return `https://api.maptiler.com/maps/satellite/style.json?key=${maptilerKey}`;
    return `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerKey}`;
  }
  if (mode === 'ocean') return OCEAN_STYLE;
  if (mode === 'satellite') return SATELLITE_STYLE;
  if (mode === 'streets') return OSM_STYLE;
  return DARK_STYLE;
}

const DEFAULT_CENTER: [number, number] = [80.3600, 13.1500]; // Framing Chennai coastal harbours and PFZ route
const DEFAULT_ZOOM = 10.8; // +20% zoom in over base ~9.0

export const MapView: React.FC<MapViewProps> = ({
  isVeto = false,
  selectedZoneId,
  onSelectZone,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  response,
  location,
  query,
  activePreset,
  onSelectPreset,
  executeTrigger
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Map | null>(null);

  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [activeBasemap, setActiveBasemap] = useState<BasemapMode>('dark');
  const [backendSyncStatus, setBackendSyncStatus] = useState<'synced' | 'syncing' | 'offline'>('syncing');
  const [activeSectorTitle, setActiveSectorTitle] = useState<string>('Chennai Offshore East Sector');
  const [backendMapConfig, setBackendMapConfig] = useState<any>(null);
  const [currentMapZoom, setCurrentMapZoom] = useState<number>(zoom ?? DEFAULT_ZOOM);

  const cachedBackendLayersRef = useRef<any>(null);
  const domMarkersRef = useRef<any[]>([]);
  const onSelectZoneRef = useRef(onSelectZone);
  onSelectZoneRef.current = onSelectZone;

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

  const layerVisibilityRef = useRef(layerVisibility);
  layerVisibilityRef.current = layerVisibility;

  const targetLon = center ? center[0] : DEFAULT_CENTER[0];
  const targetLat = center ? center[1] : DEFAULT_CENTER[1];
  const targetZoom = zoom ?? DEFAULT_ZOOM;

  // Helper: Safely updates MapLibre sources with GeoJSON data
  const updateMapSourcesWithData = useCallback((map: Map, data: any) => {
    if (!map || !map.isStyleLoaded() || !data) return;

    const setSourceData = (id: string, collection: any) => {
      try {
        const src = map.getSource(id) as any;
        if (src && src.setData && collection) {
          src.setData(collection);
        }
      } catch (err) {
        console.warn(`[ORCA MAP] Could not update source ${id}:`, err);
      }
    };

    if (data.landing_centres) setSourceData('orca-landing-centres-src', data.landing_centres);
    if (data.pfz_polygons) setSourceData('orca-pfz-polygons-src', data.pfz_polygons);
    if (data.pfz_points) setSourceData('orca-pfz-points-src', data.pfz_points);
    if (data.sst) setSourceData('orca-sst-src', data.sst);
    if (data.chl) setSourceData('orca-chl-src', data.chl);
    if (data.weather) setSourceData('orca-weather-src', data.weather);
    if (data.hazards) setSourceData('orca-hazard-src', data.hazards);
    if (data.vessels) setSourceData('orca-vessels-src', data.vessels);
    if (data.route) setSourceData('orca-route-src', data.route);
  }, []);

  // Sync spatial layers from FastAPI backend (/api/map/layers)
  const syncLayersFromBackend = useCallback(async (mapInstance?: Map) => {
    const map = mapInstance || mapInstanceRef.current;
    setBackendSyncStatus('syncing');

    const locParam = location || (
      targetLon > 82 ? 'Visakhapatnam' :
      targetLon < 76 ? 'Kochi' :
      targetLon < 78 ? 'Mangalore' :
      'Chennai'
    );

    try {
      const data = await marineApi.getMapLayers({
        location: locParam,
        is_veto: isVeto,
        query: query,
        zone_id: selectedZoneId || undefined
      });

      cachedBackendLayersRef.current = data;
      setBackendSyncStatus('synced');

      if (data.metadata?.sector_name) {
        setActiveSectorTitle(data.metadata.sector_name);
      }

      if (map && map.isStyleLoaded()) {
        updateMapSourcesWithData(map, data);
      }
    } catch (err) {
      console.warn('[ORCA MAP] Backend sync fallback to local GeoJSON:', err);
      setBackendSyncStatus('offline');
    }
  }, [location, targetLon, isVeto, query, selectedZoneId, updateMapSourcesWithData]);

  // Helper to safely register or update sources and layers without collision
  const attachOrcaDataLayers = useCallback((map: Map) => {
    if (!map) return;

    const currentVis = layerVisibilityRef.current;
    const backendData = cachedBackendLayersRef.current;

    const landingData = backendData?.landing_centres || getLandingCentresGeoJSON();
    const pfzFallback = getPFZAdvisoriesGeoJSON();
    const pfzPolyData = backendData?.pfz_polygons || pfzFallback.polygons;
    const pfzPointData = backendData?.pfz_points || pfzFallback.points;
    const oceanFallback = getOceanGridsGeoJSON();
    const sstData = backendData?.sst || oceanFallback.sst;
    const chlData = backendData?.chl || oceanFallback.chl;
    const weatherData = backendData?.weather || getMarineWeatherGeoJSON();
    const hazardData = backendData?.hazards || getHazardWarningsGeoJSON();
    const vesselData = backendData?.vessels || getVesselsGeoJSON();
    const routeData = backendData?.route || getRouteGeoJSON();

    // Helper: Add or Update Source
    const setOrCreateSource = (id: string, data: any) => {
      try {
        const existingSrc = map.getSource(id) as any;
        if (existingSrc && existingSrc.setData) {
          existingSrc.setData(data);
        } else if (!existingSrc) {
          map.addSource(id, {
            type: 'geojson',
            data: data as any
          });
        }
      } catch (err) {
        console.warn(`[ORCA MAP] Error setting source ${id}:`, err);
      }
    };

    // 1. Landing Centres (Harbours)
    setOrCreateSource('orca-landing-centres-src', landingData);
    if (!map.getLayer('orca-landing-centres-circle')) {
      try {
        map.addLayer({
          id: 'orca-landing-centres-circle',
          type: 'circle',
          source: 'orca-landing-centres-src',
          layout: {
            visibility: currentVis.ports !== false ? 'visible' : 'none'
          },
          paint: {
            'circle-radius': 10,
            'circle-color': '#0284c7',
            'circle-stroke-width': 3.5,
            'circle-stroke-color': '#000000'
          }
        });
      } catch (e) {}
    }

    // 2. INCOIS PFZ Advisories (Polygons, Concentric Outer Ring & Centroid Points)
    setOrCreateSource('orca-pfz-polygons-src', pfzPolyData);
    setOrCreateSource('orca-pfz-points-src', pfzPointData);

    if (!map.getLayer('orca-pfz-fill')) {
      try {
        map.addLayer({
          id: 'orca-pfz-fill',
          type: 'fill',
          source: 'orca-pfz-polygons-src',
          layout: {
            visibility: currentVis.pfz ? 'visible' : 'none'
          },
          paint: {
            'fill-color': '#10b981',
            'fill-opacity': 0.50
          }
        });
      } catch (e) {}
    }

    if (!map.getLayer('orca-pfz-line')) {
      try {
        map.addLayer({
          id: 'orca-pfz-line',
          type: 'line',
          source: 'orca-pfz-polygons-src',
          layout: {
            visibility: currentVis.pfz ? 'visible' : 'none'
          },
          paint: {
            'line-color': '#059669',
            'line-width': 3.5
          }
        });
      } catch (e) {}
    }

    if (!map.getLayer('orca-pfz-outer-ring')) {
      try {
        map.addLayer({
          id: 'orca-pfz-outer-ring',
          type: 'line',
          source: 'orca-pfz-polygons-src',
          layout: {
            visibility: currentVis.pfz ? 'visible' : 'none'
          },
          paint: {
            'line-color': '#f59e0b',
            'line-width': 4,
            'line-dasharray': [3, 3]
          }
        });
      } catch (e) {}
    }

    if (!map.getLayer('orca-pfz-points')) {
      try {
        map.addLayer({
          id: 'orca-pfz-points',
          type: 'circle',
          source: 'orca-pfz-points-src',
          layout: {
            visibility: currentVis.pfz ? 'visible' : 'none'
          },
          paint: {
            'circle-radius': 9,
            'circle-color': '#0ea5e9',
            'circle-stroke-width': 3,
            'circle-stroke-color': '#000000'
          }
        });
      } catch (e) {}
    }

    // 3. MOSDAC Ocean Observations (SST Thermal & Chlorophyll)
    setOrCreateSource('orca-sst-src', sstData);
    if (!map.getLayer('orca-sst-fill')) {
      try {
        map.addLayer({
          id: 'orca-sst-fill',
          type: 'fill',
          source: 'orca-sst-src',
          layout: {
            visibility: currentVis.sst ? 'visible' : 'none'
          },
          paint: {
            'fill-color': '#f59e0b',
            'fill-opacity': 0.45
          }
        });
      } catch (e) {}
    }

    setOrCreateSource('orca-chl-src', chlData);
    if (!map.getLayer('orca-chl-fill')) {
      try {
        map.addLayer({
          id: 'orca-chl-fill',
          type: 'fill',
          source: 'orca-chl-src',
          layout: {
            visibility: currentVis.chl ? 'visible' : 'none'
          },
          paint: {
            'fill-color': '#06b6d4',
            'fill-opacity': 0.45
          }
        });
      } catch (e) {}
    }

    // 4. IMD Marine Weather (Wind Vector Arrows & Observation Markers)
    setOrCreateSource('orca-weather-src', weatherData);
    if (!map.getLayer('orca-weather-circle')) {
      try {
        map.addLayer({
          id: 'orca-weather-circle',
          type: 'circle',
          source: 'orca-weather-src',
          layout: {
            visibility: currentVis.wind ? 'visible' : 'none'
          },
          paint: {
            'circle-radius': 8,
            'circle-color': '#38bdf8',
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#ffffff'
          }
        });
      } catch (e) {}
    }

    if (!map.getLayer('orca-weather-arrow')) {
      try {
        map.addLayer({
          id: 'orca-weather-arrow',
          type: 'symbol',
          source: 'orca-weather-src',
          layout: {
            visibility: currentVis.wind ? 'visible' : 'none',
            'text-field': '➔',
            'text-size': 24,
            'text-rotate': ['get', 'wind_direction_deg'],
            'text-allow-overlap': true
          },
          paint: {
            'text-color': '#0284c7'
          }
        });
      } catch (e) {}
    }

    // 5. IMD Hazard Warnings
    setOrCreateSource('orca-hazard-src', hazardData);
    if (!map.getLayer('orca-hazard-fill')) {
      try {
        map.addLayer({
          id: 'orca-hazard-fill',
          type: 'fill',
          source: 'orca-hazard-src',
          layout: {
            visibility: currentVis.hazards ? 'visible' : 'none'
          },
          paint: {
            'fill-color': '#dc2626',
            'fill-opacity': isVeto ? 0.50 : 0.35
          }
        });
      } catch (e) {}
    }

    if (!map.getLayer('orca-hazard-line')) {
      try {
        map.addLayer({
          id: 'orca-hazard-line',
          type: 'line',
          source: 'orca-hazard-src',
          layout: {
            visibility: currentVis.hazards ? 'visible' : 'none'
          },
          paint: {
            'line-color': '#ef4444',
            'line-width': 3.5,
            'line-dasharray': [4, 3]
          }
        });
      } catch (e) {}
    }

    // 6. Active AIS Vessels
    setOrCreateSource('orca-vessels-src', vesselData);
    if (!map.getLayer('orca-vessels-circle')) {
      try {
        map.addLayer({
          id: 'orca-vessels-circle',
          type: 'circle',
          source: 'orca-vessels-src',
          layout: {
            visibility: currentVis.vessels ? 'visible' : 'none'
          },
          paint: {
            'circle-radius': 8,
            'circle-color': '#0ea5e9',
            'circle-stroke-width': 3,
            'circle-stroke-color': '#000000'
          }
        });
      } catch (e) {}
    }

    // 7. Navigation Route (Dark Outline Casing + Glowing Cyan Dashed Path Line)
    setOrCreateSource('orca-route-src', routeData);
    if (!map.getLayer('orca-route-casing')) {
      try {
        map.addLayer({
          id: 'orca-route-casing',
          type: 'line',
          source: 'orca-route-src',
          layout: {
            visibility: currentVis.route ? 'visible' : 'none'
          },
          paint: {
            'line-color': '#000000',
            'line-width': 8,
            'line-opacity': 0.85
          }
        });
      } catch (e) {}
    }

    if (!map.getLayer('orca-route-line')) {
      try {
        map.addLayer({
          id: 'orca-route-line',
          type: 'line',
          source: 'orca-route-src',
          layout: {
            visibility: currentVis.route ? 'visible' : 'none'
          },
          paint: {
            'line-color': isVeto ? '#ef4444' : '#06b6d4',
            'line-width': 5,
            'line-dasharray': [3, 3]
          }
        });
      } catch (e) {}
    }

    // Move all ORCA layers to the top of the map layer stack so basemap tiles never cover them
    const ORCA_LAYER_IDS = [
      'orca-sst-fill',
      'orca-chl-fill',
      'orca-hazard-fill',
      'orca-hazard-line',
      'orca-pfz-fill',
      'orca-pfz-line',
      'orca-pfz-outer-ring',
      'orca-pfz-points',
      'orca-route-casing',
      'orca-route-line',
      'orca-weather-circle',
      'orca-weather-arrow',
      'orca-vessels-circle',
      'orca-landing-centres-circle'
    ];

    ORCA_LAYER_IDS.forEach((id) => {
      try {
        if (map.getLayer(id)) {
          map.moveLayer(id);
        }
      } catch (e) {}
    });

    // 8. Attach High-Contrast HTML DOM Badges & Markers for instant visual clarity at all zoom levels
    try {
      // 8. Attach High-Contrast HTML DOM Badges & Markers dynamically from GeoJSON collections
      domMarkersRef.current.forEach((m) => {
        try { m.remove(); } catch (e) {}
      });
      domMarkersRef.current = [];

      // Inject keyframes for Kasimedu Harbour Sonar Radar Ripple effect
      const rippleStyleId = 'orca-harbour-ripple-keyframes';
      if (!document.getElementById(rippleStyleId)) {
        const styleEl = document.createElement('style');
        styleEl.id = rippleStyleId;
        styleEl.innerHTML = `
          @keyframes harbourSonarPing {
            0% { transform: scale(0.5); opacity: 0.95; }
            75%, 100% { transform: scale(2.6); opacity: 0; }
          }
          @keyframes harbourSonarPulse {
            0%, 100% { opacity: 0.85; transform: scale(1); }
            50% { opacity: 0.35; transform: scale(1.4); }
          }
        `;
        document.head.appendChild(styleEl);
      }

      // 1. Dynamic Harbour HTML Markers for All Sector Coastal Harbours (West/Inland Anchored for Zero Overlap)
      if (currentVis.ports !== false && landingData?.features?.length > 0) {
        // Find all harbours relevant to the active view / sector
        const relevantHarbours = landingData.features.filter((f: any) => {
          if (!f.geometry?.coordinates) return false;
          const [lon, lat] = f.geometry.coordinates;
          const dist = Math.hypot(lon - targetLon, lat - targetLat);
          return dist < 1.2 || f.properties?.is_active_harbour;
        });

        const harboursToRender = relevantHarbours.length > 0 ? relevantHarbours : landingData.features.slice(0, 4);

        harboursToRender.forEach((harbourFeat: any) => {
          const harbourCoords = harbourFeat.geometry?.coordinates;
          if (!harbourCoords) return;
          const props = harbourFeat.properties || {};
          const harbourName = props.name || 'Fishing Harbour';
          const lower = harbourName.toLowerCase();
          const isKasimedu = lower.includes('kasimedu') || lower.includes('royapuram') || props.is_active_harbour;
          const isEnnore = lower.includes('ennore') || lower.includes('kamarajar');
          const isKattupalli = lower.includes('kattupalli');
          const isChennaiPort = lower.includes('chennai port') || lower.includes('madras');

          // Clean display name to prevent oversized labels
          const cleanName = isKasimedu
            ? 'Kasimedu Harbour'
            : isEnnore
            ? 'Ennore Port'
            : isKattupalli
            ? 'Kattupalli Port'
            : isChennaiPort
            ? 'Chennai Port'
            : props.name?.length > 22
            ? props.name.slice(0, 20) + '..'
            : props.name;

          const capacity = props.capacity ? `${props.capacity >= 1000 ? (props.capacity / 1000).toFixed(1) + 'k' : props.capacity} boats` : '';

          const harbourEl = document.createElement('div');
          harbourEl.style.position = 'relative';
          harbourEl.style.display = 'flex';
          harbourEl.style.alignItems = 'center';
          harbourEl.style.justifyContent = 'center';
          harbourEl.style.cursor = 'pointer';

          if (isKasimedu) {
            harbourEl.innerHTML = `
              <div style="position:absolute; width:44px; height:44px; border-radius:50%; background:rgba(56,189,248,0.35); border:1.5px solid #38bdf8; animation:harbourSonarPing 2.2s infinite ease-out; pointer-events:none"></div>
              <div style="position:absolute; width:26px; height:26px; border-radius:50%; background:rgba(2,132,199,0.45); border:1.5px solid #7dd3fc; animation:harbourSonarPulse 1.8s infinite ease-in-out; pointer-events:none"></div>
              <div style="background:linear-gradient(135deg, #0284c7, #0369a1); color:#ffffff; padding:3px 8px; border-radius:10px; border:1.5px solid #ffffff; font-family:monospace; font-weight:900; font-size:10px; box-shadow:0 0 16px rgba(2,132,199,0.9); display:flex; align-items:center; gap:4px; white-space:nowrap; z-index:10">
                <span style="font-size:12px">⚓</span>
                <span>${cleanName}</span>
                ${capacity ? `<span style="background:rgba(0,0,0,0.35); padding:1px 4px; border-radius:4px; font-size:8.5px; color:#bae6fd">${capacity}</span>` : ''}
              </div>
            `;
          } else {
            harbourEl.innerHTML = `
              <div style="background:linear-gradient(135deg, #0b172a, #1e293b); color:#e2e8f0; padding:2.5px 7px; border-radius:8px; border:1.5px solid #38bdf8; font-family:monospace; font-weight:800; font-size:9.5px; box-shadow:0 3px 10px rgba(0,0,0,0.7); display:flex; align-items:center; gap:3px; white-space:nowrap; z-index:9">
                <span style="font-size:11px; color:#38bdf8">⚓</span>
                <span>${cleanName}</span>
                ${capacity ? `<span style="background:rgba(56,189,248,0.15); padding:1px 3px; border-radius:3px; font-size:8px; color:#7dd3fc">${capacity}</span>` : ''}
              </div>
            `;
          }

          harbourEl.addEventListener('click', () => {
            new Popup({ closeButton: true })
              .setLngLat(harbourCoords)
              .setHTML(`
                <div style="font-family:sans-serif; padding:6px; color:#0f172a; max-width:240px">
                  <strong style="color:#0284c7; font-size:13px; display:block; margin-bottom:4px">⚓ ${props.name}</strong>
                  <div style="font-size:11px; line-height:1.4">
                    <div>State: <b>${props.state}</b> (${props.district || ''})</div>
                    <div>Max Capacity: <b>${props.capacity} boats</b></div>
                    <div style="color:#475569; margin-top:3px">${props.facilities || ''}</div>
                  </div>
                </div>
              `)
              .addTo(map);
          });

          // Anchor to 'right' so badge extends westwards onto the land, avoiding all marine layers
          const vOffset = isKattupalli ? -5 : isEnnore ? 5 : 0;
          const m = new Marker({ element: harbourEl, anchor: 'right', offset: [-12, vOffset] })
            .setLngLat(harbourCoords)
            .addTo(map);
          domMarkersRef.current.push(m);
        });
      }

      // 2. Dynamic Navigation Route HTML Badge Pin (Mid-Channel, Floating Above Route Line)
      if (currentVis.route && routeData?.features?.length > 0) {
        const rFeat = routeData.features[0];
        const coords = rFeat?.geometry?.coordinates;
        if (coords && coords.length >= 2) {
          const midPt: [number, number] = (targetLon > 79 && targetLon < 82)
            ? [80.4400, 13.1600]
            : coords[Math.floor(coords.length / 2)];

          const isVetoRoute = rFeat.properties?.is_veto || isVeto;
          const routeLabel = isVetoRoute
            ? '🚨 VETO HARBOUR RETURN'
            : '⛵ PFZ Route (35 km • 85° ENE)';

          const routeEl = document.createElement('div');
          routeEl.innerHTML = `
            <div style="background:${isVetoRoute ? 'linear-gradient(135deg, #991b1b, #7f1d1d)' : 'linear-gradient(135deg, #0891b2, #0e7490)'}; color:#ffffff; padding:3px 8px; border-radius:10px; border:1.5px solid ${isVetoRoute ? '#fca5a5' : '#67e8f9'}; font-family:monospace; font-weight:900; font-size:9.5px; box-shadow:0 0 12px ${isVetoRoute ? 'rgba(239,68,68,0.7)' : 'rgba(6,182,212,0.7)'}; display:flex; align-items:center; gap:4px; white-space:nowrap; cursor:pointer">
              ${routeLabel}
            </div>
          `;

          routeEl.addEventListener('click', () => {
            new Popup({ closeButton: true })
              .setLngLat(midPt)
              .setHTML(`
                <div style="font-family:sans-serif; padding:6px; color:#0f172a; max-width:240px">
                  <strong style="color:#0891b2; font-size:12px; display:block; margin-bottom:3px">⛵ Navigation Route Telemetry</strong>
                  <div style="font-size:11px; line-height:1.4">
                    <div>Origin: <b>Kasimedu Fishing Harbour</b></div>
                    <div>Destination: <b>Chennai Offshore PFZ #12A</b></div>
                    <div>Total Distance: <b>35.2 km (~19 NM)</b></div>
                    <div>Recommended Heading: <b>85° ENE</b></div>
                    <div style="color:#16a34a; font-weight:bold; margin-top:2px">Status: Cleared for Marine Transit</div>
                  </div>
                </div>
              `)
              .addTo(map);
          });

          const rm = new Marker({ element: routeEl, anchor: 'bottom', offset: [0, -8] })
            .setLngLat(midPt)
            .addTo(map);
          domMarkersRef.current.push(rm);
        }
      }

      // 3. Dynamic PFZ Target HTML Markers (Outer Shelf Quadrant)
      if (currentVis.pfz && pfzPointData?.features?.length > 0) {
        const topPts = pfzPointData.features.filter((f: any) => f.properties?.is_recommended).slice(0, 1);
        const ptsToRender = topPts.length > 0 ? topPts : pfzPointData.features.slice(0, 1);

        ptsToRender.forEach((ptFeat: any) => {
          const pCoords = ptFeat?.geometry?.coordinates;
          const pProps = ptFeat?.properties;
          if (pCoords && pProps) {
            const pScore = pProps.score || 84;
            const pTitle = pProps.sector_name || 'Kasimedu Shelf (PFZ #12A)';
            const pfzEl = document.createElement('div');
            pfzEl.innerHTML = `
              <div style="background:linear-gradient(135deg, #065f46, #047857); color:#ffffff; padding:4px 9px; border-radius:12px; border:2px solid #6ee7b7; font-family:monospace; font-weight:900; font-size:10px; box-shadow:0 0 16px rgba(16,185,129,0.75); display:flex; align-items:center; gap:4px; white-space:nowrap; cursor:pointer">
                🐟 ${pTitle} • ${pScore}% Score
              </div>
            `;

            pfzEl.addEventListener('click', () => {
              new Popup({ closeButton: true })
                .setLngLat(pCoords)
                .setHTML(`
                  <div style="font-family:sans-serif; padding:6px; color:#0f172a; max-width:240px">
                    <strong style="color:#059669; font-size:12px; display:block; margin-bottom:3px">🐟 INCOIS PFZ Advisory</strong>
                    <div style="font-size:11px; line-height:1.4">
                      <div>Zone: <b>${pTitle}</b></div>
                      <div>Suitability Score: <b style="color:#16a34a">${pScore}%</b></div>
                      <div>Depth: <b>36.5 meters</b></div>
                      <div>Target Species: <b>Yellowfin Tuna, Mackerel, Sardines</b></div>
                    </div>
                  </div>
                `)
                .addTo(map);
            });

            const m = new Marker({ element: pfzEl, anchor: 'bottom-left', offset: [10, -8] })
              .setLngLat(pCoords)
              .addTo(map);
            domMarkersRef.current.push(m);
          }
        });
      }

      // 4. Dynamic AIS Vessel HTML Markers (Live & Sector Fallback with Zero Overlap)
      if (currentVis.vessels) {
        const vFeatures = vesselData?.features && vesselData.features.length > 0 ? vesselData.features : [
          { properties: { vessel_id: 'IND-TN-1906', name: 'SANMAR SNEHA', speed_knots: 5.2 }, geometry: { coordinates: [80.3753, 13.0952] } },
          { properties: { vessel_id: 'IND-TN-7740', name: 'HAN HUI', speed_knots: 0.0, isHazard: true }, geometry: { coordinates: [80.3950, 13.1120] } },
          { properties: { vessel_id: 'IND-TN-02-MM-104', name: 'MFV Sea Queen', speed_knots: 8.5 }, geometry: { coordinates: [80.5500, 13.2300] } },
          { properties: { vessel_id: 'IND-TN-05-MM-302', name: 'MFV Chennai Sentinel', speed_knots: 4.1, isHazard: true }, geometry: { coordinates: [80.3800, 13.1800] } },
          { properties: { vessel_id: 'IND-TN-01-MM-088', name: 'MFV Blue Marlin', speed_knots: 6.2 }, geometry: { coordinates: [80.4510, 12.9510] } }
        ];

        vFeatures.forEach((vf: any, idx: number) => {
          const props = vf.properties || {};
          let coords = vf.geometry?.coordinates;
          if (!coords || coords.length < 2) return;

          // Nudge Sea Queen away from PFZ point if coincident
          if (Math.abs(coords[0] - 80.6210) < 0.02 && Math.abs(coords[1] - 13.1850) < 0.02) {
            coords = [80.5500, 13.2300];
          }

          const vId = props.vessel_id || props.code || props.name || 'IND-TN-1906';
          const isHz = props.isHazard || props.status?.includes('HAZARD') || props.status?.includes('ALERT');

          const vesselEl = document.createElement('div');
          vesselEl.style.cursor = 'pointer';
          vesselEl.innerHTML = `
            <div style="background:${isHz ? 'linear-gradient(135deg, #7f1d1d, #991b1b)' : 'linear-gradient(135deg, #0c4a6e, #075985)'}; color:${isHz ? '#fca5a5' : '#7dd3fc'}; padding:2.5px 6.5px; border-radius:8px; border:1px solid ${isHz ? '#ef4444' : '#38bdf8'}; font-family:monospace; font-weight:800; font-size:9px; box-shadow:0 2px 8px rgba(0,0,0,0.6); display:flex; align-items:center; gap:3px; white-space:nowrap">
              <span>${isHz ? '⚠️ 🚢' : '🚢'}</span>
              <span>${vId}</span>
              ${props.speed_knots !== undefined ? `<span style="opacity:0.75; font-size:8px">(${props.speed_knots} kts)</span>` : ''}
            </div>
          `;

          vesselEl.addEventListener('click', () => {
            new Popup({ closeButton: true })
              .setLngLat([coords[0], coords[1]])
              .setHTML(`
                <div style="font-family:sans-serif; padding:6px; color:#0f172a; max-width:230px">
                  <strong style="color:#0284c7; font-size:12px; display:block; margin-bottom:3px">🚢 AIS Vessel Telemetry</strong>
                  <div style="font-size:11px; line-height:1.4">
                    <div>Reg: <b>${vId}</b></div>
                    <div>Name: <b>${props.name || vId}</b></div>
                    <div>Type: <b>${props.type || 'Deep Sea Vessel'}</b></div>
                    <div>Speed: <b>${props.speed_knots ?? 5} kts</b></div>
                    <div style="color:#0284c7; margin-top:2px">Status: ${props.status || 'Active in sector'}</div>
                  </div>
                </div>
              `)
              .addTo(map);
          });

          const vm = new Marker({
            element: vesselEl,
            anchor: idx % 2 === 0 ? 'top-left' : 'bottom-left',
            offset: idx % 2 === 0 ? [8, 8] : [8, -8]
          })
            .setLngLat([coords[0], coords[1]])
            .addTo(map);
          domMarkersRef.current.push(vm);
        });
      }

      // 5. Dynamic SST Grid HTML Marker (South-East Open Ocean Quadrant)
      if (currentVis.sst && sstData?.features?.length > 0) {
        const sFeat = sstData.features[0];
        const sstVal = sFeat?.properties?.sst_celsius || '28.4';
        const sstCoords: [number, number] = (targetLon > 79 && targetLon < 82)
          ? [80.5000, 13.0500]
          : targetLon > 82
            ? [83.4200, 17.5800]
            : targetLon < 77
              ? [75.9800, 10.0800]
              : [74.6500, 12.7200];

        const sstEl = document.createElement('div');
        sstEl.innerHTML = `
          <div style="background:linear-gradient(135deg, #78350f, #451a03); color:#fde68a; padding:3px 7px; border-radius:8px; border:1px solid #f59e0b; font-family:monospace; font-weight:800; font-size:9.5px; box-shadow:0 0 10px rgba(245,158,11,0.4); display:flex; align-items:center; gap:3px; white-space:nowrap; cursor:pointer">
            🌡️ SST ${sstVal}°C • Front
          </div>
        `;

        sstEl.addEventListener('click', () => {
          new Popup({ closeButton: true })
            .setLngLat(sstCoords)
            .setHTML(`
              <div style="font-family:sans-serif; padding:6px; color:#0f172a; max-width:240px">
                <strong style="color:#d97706; font-size:12px; display:block; margin-bottom:3px">🌡️ Satellite Ocean Telemetry</strong>
                <div style="font-size:11px; line-height:1.4">
                  <div>Sea Surface Temp: <b>${sstVal}°C</b></div>
                  <div>Chlorophyll: <b>1.85 mg/m³</b></div>
                  <div>Thermal Gradient: <b>High (+0.8°C front)</b></div>
                  <div style="color:#15803d; font-weight:bold; margin-top:2px">Favorable for pelagic schools</div>
                </div>
              </div>
            `)
            .addTo(map);
        });

        const sm = new Marker({ element: sstEl, anchor: 'center', offset: [0, 0] })
          .setLngLat(sstCoords)
          .addTo(map);
        domMarkersRef.current.push(sm);
      }
    } catch (err) {
      console.warn('[ORCA MAP] HTML DOM Marker error:', err);
    }
  }, [isVeto]);

  // Set up click popups and cursor hover effects ONCE per map instance
  const setupInteractionHandlers = useCallback((map: Map) => {
    try {
      map.on('click', 'orca-landing-centres-circle', (e: any) => {
        if (!e.features || !e.features[0]) return;
        const props = e.features[0].properties;
        new Popup({ closeButton: true })
          .setLngLat((e.features[0].geometry as any).coordinates)
          .setHTML(`
            <div style="font-family:sans-serif; padding:6px; color:#0f172a; max-width:220px">
              <strong style="color:#0284c7; font-size:13px; display:block; margin-bottom:4px">⚓ ${props.name}</strong>
              <div style="font-size:11px; line-height:1.4">
                <div>State: <b>${props.state}</b> (${props.district || ''})</div>
                <div>Capacity: <b>${props.capacity} boats</b></div>
                <div style="color:#475569; margin-top:3px">${props.facilities || ''}</div>
              </div>
            </div>
          `)
          .addTo(map);
      });

      map.on('click', 'orca-pfz-fill', (e: any) => {
        if (!e.features || !e.features[0]) return;
        const props = e.features[0].properties;
        if (onSelectZoneRef.current) {
          onSelectZoneRef.current(props);
        }
        new Popup({ closeButton: true })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family:sans-serif; padding:6px; color:#0f172a; max-width:240px">
              <strong style="color:#059669; font-size:13px; display:block; margin-bottom:4px">🐟 INCOIS PFZ: ${props.sector_name}</strong>
              <div style="font-size:11px; line-height:1.4">
                <div>Suitability Score: <b style="color:#059669">${props.score}%</b></div>
                <div>Bearing: <b>${props.bearing_deg}°</b> | Dist: <b>${props.distance_km} km</b></div>
                <div>Depth: <b>${props.depth_m} m</b></div>
                <div>Harbour: <b>${props.nearest_landing_centre}</b></div>
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
            <div style="font-family:sans-serif; padding:6px; color:#0f172a">
              <strong style="color:#0284c7; font-size:12px">🚢 ${props.vessel_id || props.code ? `${props.vessel_id || props.code} • ` : ''}${props.name}</strong>
              <div style="font-size:11px; margin-top:3px">
                <div>Type: ${props.type}</div>
                <div>Speed: <b>${props.speed_knots} kts</b> | Heading: <b>${props.heading_deg}°</b></div>
                <div style="color:${props.status?.includes('ALERT') || props.status?.includes('WARNING') ? '#dc2626' : '#059669'}; font-weight:bold; margin-top:2px">
                  ${props.status}
                </div>
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
      console.warn('[ORCA MAP] Popup handler setup warning:', err);
    }
  }, []);

  // Fetch backend map configuration on mount
  useEffect(() => {
    marineApi.getMapConfig()
      .then((cfg) => {
        if (cfg) setBackendMapConfig(cfg);
      })
      .catch((err) => {
        console.warn('[ORCA MAP] Map config fetch error:', err);
      });
  }, []);

  // Map Instance Lifecycle: Mount ONCE
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialStyle = getStyleForMode('dark');
    let fallbackTriggered = false;

    let map: Map;
    try {
      map = new Map({
        container: mapContainerRef.current,
        style: initialStyle,
        center: [targetLon, targetLat],
        zoom: targetZoom,
        pitch: 0,
        attributionControl: { compact: true }
      });
    } catch (err) {
      console.error('[ORCA MAP] MapLibre initialization error:', err);
      setMapStatus('error');
      return;
    }

    mapInstanceRef.current = map;

    try {
      map.addControl(new NavigationControl({ showCompass: true }), 'bottom-left');
    } catch (e) {}

    map.on('zoom', () => {
      setCurrentMapZoom(Number(map.getZoom().toFixed(1)));
    });

    const onStyleReady = () => {
      setMapStatus('ready');
      map.resize();
      attachOrcaDataLayers(map);
      syncLayersFromBackend(map);
    };

    const triggerFallback = () => {
      if (fallbackTriggered) return;
      fallbackTriggered = true;
      console.warn('[ORCA MAP] Remote MapTiler style failed to load. Falling back to ESRI Dark GIS raster basemap.');
      try {
        map.setStyle(DARK_STYLE);
      } catch (e) {
        console.error('[ORCA MAP] Fallback setStyle error:', e);
      }
    };

    map.once('load', () => {
      setupInteractionHandlers(map);
      onStyleReady();
    });

    map.on('style.load', () => {
      setMapStatus('ready');
      map.resize();
      if (map.isStyleLoaded()) {
        attachOrcaDataLayers(map);
        if (cachedBackendLayersRef.current) {
          updateMapSourcesWithData(map, cachedBackendLayersRef.current);
        }
      }
    });

    map.on('error', (e: any) => {
      const msg = e?.error?.message || e?.message || '';
      if (!map.isStyleLoaded() && !fallbackTriggered) {
        console.warn('[ORCA MAP] MapLibre style load error:', msg);
        triggerFallback();
      }
    });

    // Safety timeout: If map style hasn't loaded in 1.5s, trigger fallback directly
    const loadTimeout = setTimeout(() => {
      if (!map.isStyleLoaded() && !fallbackTriggered) {
        console.warn('[ORCA MAP] Map load timeout (1.5s). Triggering ESRI Dark raster fallback.');
        triggerFallback();
      }
    }, 1500);

    const timer = setTimeout(() => {
      if (map) map.resize();
    }, 150);

    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.resize();
      }
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      clearTimeout(loadTimeout);
      clearTimeout(timer);
      resizeObserver.disconnect();
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {}
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Sync layers whenever location, query, or isVeto updates
  useEffect(() => {
    syncLayersFromBackend();
  }, [location, isVeto, query, syncLayersFromBackend]);

  // Reactively fly camera when center or zoom props update
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const cur = map.getCenter();
    const dist = Math.hypot(cur.lng - targetLon, cur.lat - targetLat);
    if (dist > 0.0005 || Math.abs(map.getZoom() - targetZoom) > 0.1) {
      map.flyTo({
        center: [targetLon, targetLat],
        zoom: targetZoom,
        essential: true,
        duration: 1100
      });
      setCurrentMapZoom(targetZoom);
    }
  }, [targetLon, targetLat, targetZoom]);

  // Unconditionally zoom in 20% and focus target sector whenever executeTrigger changes (typed execute or submitted question)
  useEffect(() => {
    if (!executeTrigger) return;
    const map = mapInstanceRef.current;
    if (!map) return;

    map.flyTo({
      center: [targetLon, targetLat],
      zoom: targetZoom,
      essential: true,
      duration: 1100
    });
    setCurrentMapZoom(targetZoom);
    syncLayersFromBackend(map);
  }, [executeTrigger, targetLon, targetLat, targetZoom, syncLayersFromBackend]);

  // Reactively update hazard and route styling when isVeto updates
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !map.isStyleLoaded()) return;

    try {
      if (map.getLayer('orca-hazard-fill')) {
        map.setPaintProperty('orca-hazard-fill', 'fill-opacity', isVeto ? 0.48 : 0.25);
      }
      if (map.getLayer('orca-route-line')) {
        map.setPaintProperty('orca-route-line', 'line-color', isVeto ? '#ef4444' : '#06b6d4');
      }
    } catch (e) {}
  }, [isVeto]);

  // Basemap Switcher Handler
  const handleBasemapChange = (mode: BasemapMode) => {
    setActiveBasemap(mode);
    const map = mapInstanceRef.current;
    if (!map) return;

    const nextStyle = getStyleForMode(mode);
    map.setStyle(nextStyle);
  };

  // Toggle Layer Visibility
  const toggleLayer = (layerKey: keyof typeof layerVisibility) => {
    const nextState = !layerVisibility[layerKey];
    setLayerVisibility((prev) => ({ ...prev, [layerKey]: nextState }));

    const map = mapInstanceRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const visibilityVal = nextState ? 'visible' : 'none';

    const layerMap: Record<string, string[]> = {
      pfz: ['orca-pfz-fill', 'orca-pfz-line', 'orca-pfz-points', 'orca-pfz-outer-ring'],
      sst: ['orca-sst-fill'],
      chl: ['orca-chl-fill'],
      wind: ['orca-weather-circle', 'orca-weather-arrow'],
      hazards: ['orca-hazard-fill', 'orca-hazard-line'],
      route: ['orca-route-line', 'orca-route-casing'],
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

    // Re-sync HTML DOM Badges with updated layer visibility state
    try {
      attachOrcaDataLayers(map);
    } catch (e) {}
  };

  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut();
  };

  const handleRecenter = () => {
    const map = mapInstanceRef.current;
    if (map) {
      map.flyTo({
        center: [targetLon, targetLat],
        zoom: targetZoom,
        duration: 900
      });
    }
  };

  return (
    <div className="bg-[#040a16] border border-[#1b2b45] rounded-xl overflow-hidden shadow-2xl relative w-full h-full min-h-[570px] flex flex-col">
      
      {/* 1. Full 100% Height MapLibre GL DOM Container */}
      <div
        ref={mapContainerRef}
        className="absolute inset-0 w-full h-full"
      />

      {/* 2. Floating In-Map Control Cockpit HUD (Top Overlay) */}
      <div className="absolute top-2.5 inset-x-2.5 z-20 pointer-events-none flex flex-col gap-2">
        
        {/* HUD Row 1: Engine Title, Live GIS Sync, Live Zoom Indicator & Basemap Switchers */}
        <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-2 bg-[#070f1e]/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-[#1b2b45]/80 shadow-2xl">
          
          {/* Left: GIS Engine Branding & Sync Status */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5 font-mono">
              <Navigation className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span className="tracking-wide">Bay of Bengal GIS Engine</span>
            </span>

            <div className="h-3.5 w-px bg-[#1b2b45] mx-0.5 hidden sm:block"></div>

            {/* Backend GIS Live Sync Pill */}
            <div className="hidden sm:flex items-center">
              {backendSyncStatus === 'synced' ? (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 text-[10px] font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                  <span>GIS SYNCED</span>
                </span>
              ) : backendSyncStatus === 'syncing' ? (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 text-[10px] font-mono">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin text-cyan-400" />
                  <span>SYNCING...</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/80 text-[10px] font-mono">
                  <span>OFFLINE DEMO</span>
                </span>
              )}
            </div>

            {/* Active Sector Name Pill */}
            <div className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded bg-[#0f172a]/90 border border-cyan-900/60 text-[10px] text-cyan-300 font-mono">
              <Anchor className="w-3 h-3 text-cyan-400" />
              <span>{activeSectorTitle}</span>
            </div>
          </div>

          {/* Right: Zoom % Indicator Pill & Basemap Controls */}
          <div className="flex items-center gap-1.5 text-[10px] font-mono">
            {/* Zoom Indicator Pill (+20% for Chennai) */}
            <div className="flex items-center gap-1 bg-[#0b1322] border border-cyan-500/40 px-2 py-0.5 rounded-lg text-cyan-300 shadow-inner">
              <span className="font-extrabold">ZOOM: {currentMapZoom || targetZoom}</span>
              {(currentMapZoom >= 10.5 || targetZoom >= 10.5) && (
                <span className="text-[9px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 font-bold">
                  +20% CHENNAI
                </span>
              )}
              <div className="flex items-center ml-1 border-l border-[#1b2b45] pl-1 gap-0.5">
                <button
                  onClick={handleZoomIn}
                  className="w-4 h-4 rounded flex items-center justify-center bg-[#15233c] hover:bg-cyan-500 hover:text-slate-950 text-slate-200 font-bold transition"
                  title="Zoom In (+)"
                >
                  +
                </button>
                <button
                  onClick={handleZoomOut}
                  className="w-4 h-4 rounded flex items-center justify-center bg-[#15233c] hover:bg-cyan-500 hover:text-slate-950 text-slate-200 font-bold transition"
                  title="Zoom Out (-)"
                >
                  -
                </button>
              </div>
            </div>

            {/* Basemap Mode Switcher Buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleBasemapChange('dark')}
                className={`h-6 px-2 rounded border transition flex items-center gap-1 font-semibold ${
                  activeBasemap === 'dark'
                    ? 'bg-cyan-950/90 text-cyan-300 border-cyan-500 shadow-xs'
                    : 'bg-[#0a1220]/90 text-slate-400 border-[#1c2838] hover:text-slate-200'
                }`}
                title="Esri World Dark Gray Canvas (High-Res Marine GIS)"
              >
                <Globe className="w-2.5 h-2.5" />
                <span>DARK</span>
              </button>

              <button
                onClick={() => handleBasemapChange('ocean')}
                className={`h-6 px-2 rounded border transition flex items-center gap-1 font-semibold ${
                  activeBasemap === 'ocean'
                    ? 'bg-blue-950/90 text-blue-300 border-blue-500 shadow-xs'
                    : 'bg-[#0a1220]/90 text-slate-400 border-[#1c2838] hover:text-slate-200'
                }`}
                title="Esri Ocean Bathymetry & Depth Contours"
              >
                <Waves className="w-2.5 h-2.5" />
                <span>OCEAN</span>
              </button>

              <button
                onClick={() => handleBasemapChange('satellite')}
                className={`h-6 px-2 rounded border transition flex items-center gap-1 font-semibold ${
                  activeBasemap === 'satellite'
                    ? 'bg-amber-950/90 text-amber-300 border-amber-500 shadow-xs'
                    : 'bg-[#0a1220]/90 text-slate-400 border-[#1c2838] hover:text-slate-200'
                }`}
                title="ESRI World Imagery Satellite"
              >
                <Satellite className="w-2.5 h-2.5" />
                <span>SAT</span>
              </button>

              <button
                onClick={() => handleBasemapChange('streets')}
                className={`h-6 px-2 rounded border transition flex items-center gap-1 font-semibold ${
                  activeBasemap === 'streets'
                    ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500 shadow-xs'
                    : 'bg-[#0a1220]/90 text-slate-400 border-[#1c2838] hover:text-slate-200'
                }`}
                title="OpenStreetMap Coastal Navigation"
              >
                <MapIcon className="w-2.5 h-2.5" />
                <span>COAST</span>
              </button>
            </div>
          </div>
        </div>

        {/* HUD Row 2: Marine Layer Controls & Quick Scenario Presets */}
        <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-2 bg-[#070f1e]/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-[#1b2b45]/70 shadow-lg">
          
          {/* Layer Toggles */}
          <div className="flex flex-wrap items-center gap-1 text-[10px] font-mono">
            <button
              onClick={() => toggleLayer('pfz')}
              className={`h-6 px-2 rounded border transition font-bold ${
                layerVisibility.pfz
                  ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                  : 'bg-[#091322]/80 text-slate-500 border-[#1b2b45] hover:text-slate-400'
              }`}
            >
              PFZ
            </button>

            <button
              onClick={() => toggleLayer('sst')}
              className={`h-6 px-2 rounded border transition font-bold ${
                layerVisibility.sst
                  ? 'bg-amber-950/90 text-amber-300 border-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
                  : 'bg-[#091322]/80 text-slate-500 border-[#1b2b45] hover:text-slate-400'
              }`}
            >
              SST
            </button>

            <button
              onClick={() => toggleLayer('chl')}
              className={`h-6 px-2 rounded border transition font-bold ${
                layerVisibility.chl
                  ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                  : 'bg-[#091322]/80 text-slate-500 border-[#1b2b45] hover:text-slate-400'
              }`}
            >
              CHL
            </button>

            <button
              onClick={() => toggleLayer('wind')}
              className={`h-6 px-2 rounded border transition font-bold ${
                layerVisibility.wind
                  ? 'bg-blue-950/90 text-blue-300 border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.3)]'
                  : 'bg-[#091322]/80 text-slate-500 border-[#1b2b45] hover:text-slate-400'
              }`}
            >
              WIND
            </button>

            <button
              onClick={() => toggleLayer('hazards')}
              className={`h-6 px-2 rounded border transition font-bold ${
                layerVisibility.hazards
                  ? 'bg-red-950/90 text-red-300 border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.3)]'
                  : 'bg-[#091322]/80 text-slate-500 border-[#1b2b45] hover:text-slate-400'
              }`}
            >
              HAZARDS
            </button>

            <button
              onClick={() => toggleLayer('vessels')}
              className={`h-6 px-2 rounded border transition font-bold ${
                layerVisibility.vessels
                  ? 'bg-sky-950/90 text-sky-300 border-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.3)]'
                  : 'bg-[#091322]/80 text-slate-500 border-[#1b2b45] hover:text-slate-400'
              }`}
            >
              VESSELS
            </button>

            <button
              onClick={() => toggleLayer('route')}
              className={`h-6 px-2 rounded border transition font-bold ${
                layerVisibility.route
                  ? 'bg-cyan-950/90 text-cyan-300 border-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                  : 'bg-[#091322]/80 text-slate-500 border-[#1b2b45] hover:text-slate-400'
              }`}
            >
              ROUTE
            </button>

            <button
              onClick={() => toggleLayer('ports')}
              className={`h-6 px-2 rounded border transition font-bold ${
                layerVisibility.ports
                  ? 'bg-sky-950/90 text-sky-300 border-sky-500 shadow-[0_0_8px_rgba(56,189,248,0.3)]'
                  : 'bg-[#091322]/80 text-slate-500 border-[#1b2b45] hover:text-slate-400'
              }`}
            >
              HARBOURS
            </button>
          </div>

          {/* Right: Quick Scenario Preset Buttons inside Map & Recenter */}
          <div className="flex items-center gap-1.5 text-[10px] font-mono">
            {onSelectPreset && (
              <div className="hidden sm:flex items-center gap-1 border-r border-[#1b2b45] pr-1.5">
                <button
                  onClick={() => onSelectPreset('scenario_01', 'Where should I fish tomorrow near Chennai?')}
                  className={`h-6 px-2 rounded border transition font-bold flex items-center gap-1 ${
                    activePreset === 'scenario_01'
                      ? 'bg-cyan-400 text-slate-950 border-cyan-300 shadow-md shadow-cyan-500/30'
                      : 'bg-[#0a1220] text-cyan-300 border-cyan-900/60 hover:border-cyan-500'
                  }`}
                  title="Focus Chennai & Harbours (+20% Zoom)"
                >
                  <span>CHENNAI +20%</span>
                </button>

                <button
                  onClick={() => onSelectPreset('scenario_02', 'Can I take my boat out tomorrow near Vizag?')}
                  className={`h-6 px-2 rounded border transition font-bold flex items-center gap-1 ${
                    activePreset === 'scenario_02'
                      ? 'bg-red-600 text-white border-red-400 shadow-md shadow-red-600/30'
                      : 'bg-[#0a1220] text-red-300 border-red-900/60 hover:border-red-500'
                  }`}
                  title="Cyclone Safety Veto"
                >
                  <span>VIZAG VETO</span>
                </button>
              </div>
            )}

            <button
              onClick={handleRecenter}
              className="h-6 px-2 rounded bg-[#091322] text-slate-300 hover:text-cyan-300 border border-[#1b2b45] transition flex items-center gap-1 font-mono text-[10px]"
              title="Recenter Map Camera"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>RECENTER</span>
            </button>
          </div>

        </div>

      </div>

      {/* Loading Indicator Overlay */}
      {mapStatus === 'loading' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#070f1e]/80 backdrop-blur-xs">
          <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mb-2"></div>
          <span className="text-xs font-mono text-cyan-300 tracking-wider">
            LOADING MARINE GIS ENGINE...
          </span>
        </div>
      )}

      {/* Error Fallback Overlay */}
      {mapStatus === 'error' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#070f1e] p-4 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
          <h4 className="text-sm font-bold text-slate-200">Unable to initialize WebGL map</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            Please ensure hardware acceleration or WebGL is enabled in your browser.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-semibold"
          >
            Reload Page
          </button>
        </div>
      )}

      {/* Active Hazard Veto Banner */}
      {isVeto && layerVisibility.hazards && mapStatus === 'ready' && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-20 bg-red-950/90 border-2 border-red-500 p-3 rounded-xl max-w-sm text-center backdrop-blur-md shadow-2xl">
          <AlertTriangle className="w-6 h-6 text-red-500 mx-auto mb-1 animate-bounce" />
          <h4 className="font-bold text-xs text-red-300 uppercase tracking-wider font-mono">
            CYCLONE HAZARD ZONE ACTIVE
          </h4>
          <p className="text-[11px] text-red-200 mt-0.5">
            IMD Severe Cyclonic Storm Warning • Gale winds 45-55 kts
          </p>
        </div>
      )}

      {/* Map Legend Footer */}
      {mapStatus === 'ready' && (
        <div className="absolute bottom-3 right-3 z-20 bg-[#070f1e]/90 border border-[#1b2b45] px-3 py-1.5 rounded-md text-[10px] text-slate-300 flex items-center gap-3 backdrop-blur-xs font-mono shadow-lg">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <span>PFZ Zone #12A</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
            <span>Chennai Harbours (4)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
            <span>Vessels</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
            <span>SST Grid</span>
          </div>
          {isVeto && (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
              <span className="text-red-300">Hazard</span>
            </div>
          )}
        </div>
      )}

    </div>
  );
};
