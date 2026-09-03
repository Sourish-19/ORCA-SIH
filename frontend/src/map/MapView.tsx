import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Map, NavigationControl, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Navigation, AlertTriangle, RotateCcw } from 'lucide-react';

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
}

// 1. Official OpenStreetMap Raster Style (Fallback)
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

function getPrimaryStyle(): any {
  const forceFallback = import.meta.env.VITE_FORCE_FALLBACK_MAP === 'true';
  const maptilerKey = import.meta.env.VITE_MAPTILER_API_KEY;
  if (!forceFallback && maptilerKey && maptilerKey.length > 5 && maptilerKey !== 'tS81bxNfsCkR3LhnRl99') {
    return `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerKey}`;
  }
  return OSM_STYLE;
}

const DEFAULT_CENTER: [number, number] = [80.4700, 13.1200]; // Chennai Maritime Sector (Kasimedu + PFZ #12A)
const DEFAULT_ZOOM = 8.8;

export const MapView: React.FC<MapViewProps> = ({
  isVeto = false,
  selectedZoneId,
  onSelectZone,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  response,
  location,
  query
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Map | null>(null);

  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const cachedBackendLayersRef = useRef<any>(null);
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

  // Safely updates MapLibre sources with GeoJSON data
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

      if (map && map.isStyleLoaded()) {
        updateMapSourcesWithData(map, data);
      }
    } catch (err) {
      console.warn('[ORCA MAP] Backend sync fallback to local GeoJSON:', err);
    }
  }, [location, targetLon, isVeto, query, selectedZoneId, updateMapSourcesWithData]);

  // Safely register or update sources and layers
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

    // 1. Landing Centres (Kasimedu Harbour Pin)
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
            'circle-radius': 8,
            'circle-color': '#0284c7',
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#000000'
          }
        });
      } catch (e) {}
    }

    // 2. INCOIS PFZ Advisories (Concentric Green Polygons & Outer Dashed Ring)
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
            'fill-opacity': 0.45
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
            'line-width': 2.5
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
            'line-width': 3,
            'line-dasharray': [2, 2]
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
            'circle-radius': 7,
            'circle-color': '#0ea5e9',
            'circle-stroke-width': 2.5,
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
            'fill-opacity': 0.35
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
            'fill-opacity': 0.35
          }
        });
      } catch (e) {}
    }

    // 4. IMD Marine Weather
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
            'circle-radius': 6,
            'circle-color': '#38bdf8',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
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
            'fill-opacity': isVeto ? 0.48 : 0.25
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
            'line-width': 3,
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
            'circle-radius': 7,
            'circle-color': '#0ea5e9',
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#000000'
          }
        });
      } catch (e) {}
    }

    // 7. Navigation Route
    setOrCreateSource('orca-route-src', routeData);
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
            'line-color': isVeto ? '#ef4444' : '#38bdf8',
            'line-width': 2.5,
            'line-dasharray': [3, 3]
          }
        });
      } catch (e) {}
    }

    // Move all ORCA layers to top of stack so basemap tiles never cover them
    const ORCA_LAYER_IDS = [
      'orca-sst-fill',
      'orca-chl-fill',
      'orca-hazard-fill',
      'orca-hazard-line',
      'orca-pfz-fill',
      'orca-pfz-line',
      'orca-pfz-outer-ring',
      'orca-pfz-points',
      'orca-route-line',
      'orca-weather-circle',
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
              <strong style="color:#0284c7; font-size:12px">🚢 ${props.name}</strong>
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

  // Map Instance Lifecycle: MapTiler with automatic instance-recreation OSM fallback architecture
  useEffect(() => {
    if (!mapContainerRef.current) return;

    let loadTimeout: any = null;

    const initMapInstance = (styleToUse: any, isFallbackMode = false) => {
      if (!mapContainerRef.current) return;

      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {}
        mapInstanceRef.current = null;
      }

      let map: Map;
      try {
        map = new Map({
          container: mapContainerRef.current,
          style: styleToUse,
          center: [targetLon, targetLat],
          zoom: targetZoom,
          pitch: 0,
          attributionControl: { compact: true }
        });
      } catch (err) {
        console.error('[ORCA MAP] MapLibre creation error:', err);
        if (!isFallbackMode) {
          initMapInstance(OSM_STYLE, true);
        } else {
          setMapStatus('error');
        }
        return;
      }

      mapInstanceRef.current = map;

      try {
        map.addControl(new NavigationControl({ showCompass: true }), 'top-right');
      } catch (e) {}

      let fallbackHandled = false;

      const triggerOSMFallback = () => {
        if (fallbackHandled || isFallbackMode) return;
        fallbackHandled = true;
        console.warn('[ORCA MAP] Primary MapTiler style failed. Destroying instance and creating NEW MapLibre instance with OpenStreetMap raster tiles.');
        initMapInstance(OSM_STYLE, true);
      };

      map.once('load', () => {
        setupInteractionHandlers(map);
        setMapStatus('ready');
        map.resize();
        attachOrcaDataLayers(map);
        syncLayersFromBackend(map);
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
        if (!map.isStyleLoaded() && !fallbackHandled && !isFallbackMode) {
          console.warn('[ORCA MAP] Style error encountered:', e?.error?.message || e?.message);
          triggerOSMFallback();
        }
      });

      loadTimeout = setTimeout(() => {
        if (!map.isStyleLoaded() && !fallbackHandled && !isFallbackMode) {
          console.warn('[ORCA MAP] Style load timeout (1.5s). Triggering OpenStreetMap fallback.');
          triggerOSMFallback();
        }
      }, 1500);
    };

    const initialStyle = getPrimaryStyle();
    initMapInstance(initialStyle);

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
    if (dist > 0.008 || Math.abs(map.getZoom() - targetZoom) > 0.2) {
      map.flyTo({
        center: [targetLon, targetLat],
        zoom: targetZoom,
        essential: true,
        duration: 1100
      });
    }
  }, [targetLon, targetLat, targetZoom]);

  // Reactively update hazard and route styling when isVeto updates
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !map.isStyleLoaded()) return;

    try {
      if (map.getLayer('orca-hazard-fill')) {
        map.setPaintProperty('orca-hazard-fill', 'fill-opacity', isVeto ? 0.48 : 0.25);
      }
      if (map.getLayer('orca-route-line')) {
        map.setPaintProperty('orca-route-line', 'line-color', isVeto ? '#ef4444' : '#38bdf8');
      }
    } catch (e) {}
  }, [isVeto]);

  // Toggle Layer Visibility
  const toggleLayer = (layerKey: keyof typeof layerVisibility) => {
    const nextState = !layerVisibility[layerKey];
    setLayerVisibility((prev) => ({ ...prev, [layerKey]: nextState }));

    const map = mapInstanceRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const visibilityVal = nextState ? 'visible' : 'none';

    const layerMap: Record<string, string[]> = {
      pfz: ['orca-pfz-fill', 'orca-pfz-line', 'orca-pfz-outer-ring', 'orca-pfz-points'],
      sst: ['orca-sst-fill'],
      chl: ['orca-chl-fill'],
      wind: ['orca-weather-circle'],
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
    <div className="bg-[#0b172a] border border-[#1b2b45] rounded-xl overflow-hidden shadow-2xl flex flex-col h-[520px] min-h-[520px] w-full relative">
      
      {/* Top Map Layer Toolbar */}
      <div className="bg-[#070f1e] px-3 py-2 border-b border-[#1b2b45] flex items-center justify-between gap-2 z-10 shrink-0">
        
        {/* Left: GIS Title */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 font-mono">
            <Navigation className="w-3.5 h-3.5 text-cyan-400" />
            <span>Bay of Bengal GIS Engine — MapLibre GL</span>
          </span>
        </div>

        {/* Right: Layer Visibility Toggle Chips */}
        <div className="flex items-center gap-1.5 text-[10px] font-mono overflow-x-auto">
          {([
            { id: 'pfz', label: 'PFZ', color: 'border-emerald-500 text-emerald-400 bg-emerald-950/60' },
            { id: 'sst', label: 'SST', color: 'border-amber-500 text-amber-400 bg-amber-950/60' },
            { id: 'chl', label: 'CHL', color: 'border-cyan-500 text-cyan-400 bg-cyan-950/60' },
            { id: 'wind', label: 'WIND', color: 'border-sky-500 text-sky-400 bg-sky-950/60' },
            { id: 'hazards', label: 'HAZARDS', color: 'border-red-500 text-red-400 bg-red-950/60' },
            { id: 'vessels', label: 'VESSELS', color: 'border-blue-500 text-blue-400 bg-blue-950/60' },
            { id: 'route', label: 'ROUTE', color: 'border-teal-500 text-teal-400 bg-teal-950/60' }
          ] as const).map((chip) => {
            const active = layerVisibility[chip.id];
            return (
              <button
                key={chip.id}
                onClick={() => toggleLayer(chip.id)}
                className={`px-2 py-0.5 rounded border font-semibold transition ${
                  active
                    ? chip.color
                    : 'bg-[#0a1220] text-slate-500 border-slate-800 hover:text-slate-300'
                }`}
              >
                {chip.label}
              </button>
            );
          })}

          <button
            onClick={handleRecenter}
            className="p-1 rounded bg-[#0d1728] text-slate-400 hover:text-cyan-300 border border-[#1b2b45] transition ml-1"
            title="Recenter Map"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Main MapLibre GL Rendering Viewport */}
      <div className="relative flex-1 bg-[#040a16] overflow-hidden min-h-[460px] w-full h-full">
        
        {/* Real MapLibre GL DOM Container */}
        <div
          ref={mapContainerRef}
          className="w-full h-full min-h-[460px]"
          style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
        />

        {/* Loading Indicator Overlay */}
        {mapStatus === 'loading' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#070f1e]/80 backdrop-blur-xs">
            <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mb-2"></div>
            <span className="text-xs font-mono text-cyan-300 tracking-wider">
              LOADING MARINE GIS ENGINE...
            </span>
          </div>
        )}

        {/* Error Fallback Overlay */}
        {mapStatus === 'error' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#070f1e] p-4 text-center">
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
          <div className="absolute bottom-3 right-3 z-20 bg-[#070f1e]/90 border border-[#1b2b45] px-3 py-1.5 rounded-md text-[10px] text-slate-300 flex items-center gap-3 backdrop-blur-xs font-mono shadow-lg">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <span>PFZ Zone #12A</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
              <span>Kasimedu Harbour</span>
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
    </div>
  );
};
