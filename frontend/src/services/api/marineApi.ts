import { ORCAResponse, DemoScenario } from '../../types';
import { RecommendationResponse } from '../../types/recommendation';
import { adaptToORCAResponse } from './recommendationAdapter';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const marineApi = {
  /**
   * Runs the ORCA Stack B pipeline (POST /api/recommend) and adapts the result
   * into the ORCAResponse shape the existing components consume.
   */
  async processQuery(query: string): Promise<ORCAResponse> {
    const res = await fetch(`${API_BASE_URL}/api/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    if (!res.ok) {
      throw new Error(`Recommendation API request failed: ${res.status} ${res.statusText}`);
    }
    const rec: RecommendationResponse = await res.json();
    return adaptToORCAResponse(rec);
  },

  /** The raw Stack B payload, for views that want the richer shape directly. */
  async getRecommendation(query: string): Promise<RecommendationResponse> {
    const res = await fetch(`${API_BASE_URL}/api/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    if (!res.ok) {
      throw new Error(`Recommendation API request failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  },

  async getDemoScenarios(): Promise<DemoScenario[]> {
    const res = await fetch(`${API_BASE_URL}/api/demo-scenarios`);
    if (!res.ok) {
      throw new Error('Failed to fetch demo scenarios');
    }
    return res.json();
  },

  async getHealthStatus() {
    const res = await fetch(`${API_BASE_URL}/api/health`);
    return res.json();
  },

  /**
   * Fetches Map API configuration, supported basemaps, and sector definitions.
   */
  async getMapConfig() {
    const res = await fetch(`${API_BASE_URL}/api/map/config`);
    if (!res.ok) {
      throw new Error(`Failed to fetch map config: ${res.statusText}`);
    }
    return res.json();
  },

  /**
   * Fetches all registered coastal sectors and bounding coordinates.
   */
  async getMapSectors() {
    const res = await fetch(`${API_BASE_URL}/api/map/sectors`);
    if (!res.ok) {
      throw new Error(`Failed to fetch map sectors: ${res.statusText}`);
    }
    return res.json();
  },

  /**
   * Synchronizes live GIS GeoJSON layers dynamically from the backend data plane.
   */
  async getMapLayers(params?: {
    location?: string;
    harbour?: string;
    is_veto?: boolean;
    zone_id?: string;
    query?: string;
  }) {
    const url = new URL(`${API_BASE_URL}/api/map/layers`);
    if (params) {
      if (params.location) url.searchParams.set('location', params.location);
      if (params.harbour) url.searchParams.set('harbour', params.harbour);
      if (params.is_veto !== undefined) url.searchParams.set('is_veto', String(params.is_veto));
      if (params.zone_id) url.searchParams.set('zone_id', params.zone_id);
      if (params.query) url.searchParams.set('query', params.query);
    }
    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Failed to fetch map layers: ${res.statusText}`);
    }
    return res.json();
  },

  /**
   * Fetches real-time AIS vessel telemetry and coastal fleet statistics from the backend.
   */
  async getFleetVessels(location?: string, query?: string) {
    const url = new URL(`${API_BASE_URL}/api/vessels`);
    if (location) url.searchParams.set('location', location);
    if (query) url.searchParams.set('query', query);
    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Failed to fetch vessel telemetry: ${res.statusText}`);
    }
    return res.json();
  }
};
