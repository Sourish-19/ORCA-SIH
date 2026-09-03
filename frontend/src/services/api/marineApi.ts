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
  }
};
