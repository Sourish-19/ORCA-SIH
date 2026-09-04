/**
 * ORCA Normalized GeoJSON Converters Module
 * Converts demo datasets (INCOIS PFZ, MOSDAC SST/CHL, IMD Weather, IMD Hazards, Landing Centres)
 * into strict GeoJSON FeatureCollections for MapLibre GL JS layers.
 */

import {
  calculateDestinationPoint,
  createPointBufferPolygon,
  bboxToPolygon
} from './geoUtils';

// Backend demo datasets imports
import pfzAdvisoriesData from '../../../data/demo/pfz_advisories.json';
import oceanGridsData from '../../../data/demo/ocean_grids.json';
import marineWeatherData from '../../../data/demo/marine_weather.json';
import hazardWarningsData from '../../../data/demo/hazard_warnings.json';
import landingCentresData from '../../../data/demo/landing_centres.json';

/**
 * Converts Landing Centres to GeoJSON Point FeatureCollection
 */
export function getLandingCentresGeoJSON() {
  const features = landingCentresData.map((lc) => ({
    type: 'Feature' as const,
    properties: {
      id: lc.id,
      name: lc.name,
      district: lc.district,
      state: lc.state,
      facilities: lc.facilities.join(', '),
      capacity: lc.max_boat_capacity,
      type: 'LANDING_CENTRE'
    },
    geometry: {
      type: 'Point' as const,
      coordinates: [lc.longitude, lc.latitude]
    }
  }));

  return {
    type: 'FeatureCollection' as const,
    features
  };
}

/**
 * Converts INCOIS PFZ Advisories to GeoJSON Polygons and Points.
 * If exact lat/lon center exists, uses it; if only bearing/distance exists, calculates destination.
 */
export function getPFZAdvisoriesGeoJSON() {
  const harbourMap: Record<string, [number, number]> = {
    'Royapuram Fishing Harbour (Kasimedu)': [80.2974, 13.1258],
    'Kasimedu Fishing Harbour': [80.2974, 13.1258],
    'Chennai Port (Madras Harbour)': [80.2989, 13.0844],
    'Chennai Port': [80.2989, 13.0844],
    'Kamarajar Port (Ennore Harbour)': [80.3317, 13.2611],
    'Kamarajar Port': [80.3317, 13.2611],
    'Kattupalli Port & Shipyard Harbour': [80.3450, 13.3100],
    'Kattupalli Harbour': [80.3450, 13.3100],
    'Munambam Fishing Harbour': [76.1683, 10.1812],
    'Old Mangalore Port Jetty': [74.8320, 12.8550],
    'Visakhapatnam Fishing Harbour': [83.3032, 17.6974]
  };

  const polygonFeatures: any[] = [];
  const pointFeatures: any[] = [];

  pfzAdvisoriesData.forEach((pfz) => {
    let destLon = pfz.center_lon;
    let destLat = pfz.center_lat;

    // Calculate destination using bearing and distance if needed
    const originCoords = harbourMap[pfz.nearest_landing_centre];
    if (originCoords && (!destLon || !destLat)) {
      const [calculatedLon, calculatedLat] = calculateDestinationPoint(
        originCoords[0],
        originCoords[1],
        pfz.distance_km,
        pfz.bearing_deg
      );
      destLon = calculatedLon;
      destLat = calculatedLat;
    }

    const properties = {
      zone_id: pfz.zone_id,
      sector_name: pfz.sector_name,
      score: pfz.strength_score,
      depth_m: pfz.depth_m,
      bearing_deg: pfz.bearing_deg,
      distance_km: pfz.distance_km,
      nearest_landing_centre: pfz.nearest_landing_centre,
      source: pfz.source,
      is_demo_buffer: true
    };

    // Point Marker Feature
    pointFeatures.push({
      type: 'Feature' as const,
      properties,
      geometry: {
        type: 'Point' as const,
        coordinates: [destLon, destLat]
      }
    });

    // Polygon Estimated Influence Zone
    const polygonCoords = createPointBufferPolygon(destLon, destLat, 7);
    polygonFeatures.push({
      type: 'Feature' as const,
      properties,
      geometry: {
        type: 'Polygon' as const,
        coordinates: polygonCoords
      }
    });
  });

  return {
    polygons: {
      type: 'FeatureCollection' as const,
      features: polygonFeatures
    },
    points: {
      type: 'FeatureCollection' as const,
      features: pointFeatures
    }
  };
}

/**
 * Converts MOSDAC Ocean Observations (SST & Chlorophyll) to GeoJSON Points and Grid Cells
 */
export function getOceanGridsGeoJSON() {
  const sstFeatures = oceanGridsData.sst_observations.map((obs) => {
    const polyCoords = createPointBufferPolygon(obs.longitude, obs.latitude, 10);
    return {
      type: 'Feature' as const,
      properties: {
        timestamp: obs.timestamp,
        sst_celsius: obs.sst_celsius,
        quality_flag: obs.quality_flag,
        source: obs.source
      },
      geometry: {
        type: 'Polygon' as const,
        coordinates: polyCoords
      }
    };
  });

  const chlFeatures = oceanGridsData.chlorophyll_observations.map((obs) => {
    const polyCoords = createPointBufferPolygon(obs.longitude, obs.latitude, 9);
    return {
      type: 'Feature' as const,
      properties: {
        timestamp: obs.timestamp,
        concentration_mg_m3: obs.concentration_mg_m3,
        quality_flag: obs.quality_flag,
        source: obs.source
      },
      geometry: {
        type: 'Polygon' as const,
        coordinates: polyCoords
      }
    };
  });

  return {
    sst: {
      type: 'FeatureCollection' as const,
      features: sstFeatures
    },
    chl: {
      type: 'FeatureCollection' as const,
      features: chlFeatures
    }
  };
}

/**
 * Converts IMD Marine Weather Bulletins to GeoJSON Points for Wind and Waves
 */
export function getMarineWeatherGeoJSON() {
  const features = marineWeatherData.map((w) => ({
    type: 'Feature' as const,
    properties: {
      location_name: w.location_name,
      wind_speed_knots: w.wind_speed_knots,
      wind_direction_deg: w.wind_direction_deg,
      wave_height_m: w.wave_height_m,
      wave_period_sec: w.wave_period_sec,
      pressure_hpa: w.sea_surface_pressure_hpa,
      source: w.source
    },
    geometry: {
      type: 'Point' as const,
      coordinates: [w.longitude, w.latitude]
    }
  }));

  return {
    type: 'FeatureCollection' as const,
    features
  };
}

/**
 * Converts IMD Hazard Warnings to GeoJSON Polygons using bounding_box
 */
export function getHazardWarningsGeoJSON() {
  const features = hazardWarningsData.map((h) => {
    const polyCoords = bboxToPolygon(h.bounding_box as [number, number, number, number]);
    return {
      type: 'Feature' as const,
      properties: {
        warning_id: h.warning_id,
        warning_type: h.warning_type,
        severity: h.severity,
        title: h.title,
        description: h.description,
        affected_sector: h.affected_sector,
        source: h.source
      },
      geometry: {
        type: 'Polygon' as const,
        coordinates: polyCoords
      }
    };
  });

  return {
    type: 'FeatureCollection' as const,
    features
  };
}

/**
 * Converts Active Vessels to GeoJSON Points
 */
export function getVesselsGeoJSON() {
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {
          vessel_id: 'IND-TN-7740',
          name: 'HAN HUI',
          type: 'Mechanized Trawler',
          speed_knots: 0.0,
          heading_deg: 0,
          status: '⚠️ HAZARD ADVISORY ACTIVE',
          harbour: 'Kasimedu Harbour',
          isHazard: true
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [80.3950, 13.1120]
        }
      },
      {
        type: 'Feature' as const,
        properties: {
          vessel_id: 'IND-TN-5404',
          name: 'AL MANHAL',
          type: 'Live AIS Trawler',
          speed_knots: 0.0,
          heading_deg: 0,
          status: '⚠️ HAZARD ADVISORY ACTIVE',
          harbour: 'Kasimedu Harbour',
          isHazard: true
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [80.4120, 13.1550]
        }
      },
      {
        type: 'Feature' as const,
        properties: {
          vessel_id: 'IND-TN-5973',
          name: 'Chennai Vessel MMSI-255815973',
          type: 'Live AIS Craft',
          speed_knots: 9.8,
          heading_deg: 85,
          status: 'Live AIS Sync',
          harbour: 'Kasimedu Harbour'
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [80.3850, 13.0720]
        }
      },
      {
        type: 'Feature' as const,
        properties: {
          vessel_id: 'IND-TN-8000',
          name: 'MAPLE GAS',
          type: 'Mechanized Vessel',
          speed_knots: 0.1,
          heading_deg: 0,
          status: '⚠️ HAZARD ADVISORY ACTIVE',
          harbour: 'Kasimedu Harbour',
          isHazard: true
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [80.4260, 13.2704]
        }
      },
      {
        type: 'Feature' as const,
        properties: {
          vessel_id: 'IND-TN-1906',
          name: 'SANMAR SNEHA',
          type: 'Live AIS Craft',
          speed_knots: 5.2,
          heading_deg: 95,
          status: 'Active Coastal Operations',
          harbour: 'Kasimedu Harbour'
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [80.3753, 13.0952]
        }
      },
      {
        type: 'Feature' as const,
        properties: {
          vessel_id: 'IND-TN-1342',
          name: 'OCEAN BLISS',
          type: 'Motorized Craft',
          speed_knots: 5.8,
          heading_deg: 100,
          status: 'Active Marine Operations',
          harbour: 'Kasimedu Harbour'
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [80.4000, 13.0500]
        }
      },
      {
        type: 'Feature' as const,
        properties: {
          vessel_id: 'IND-TN-02-MM-104',
          name: 'MFV Sea Queen',
          type: 'Deep Sea Mechanized Trawler',
          speed_knots: 8.5,
          heading_deg: 105,
          status: 'Fishing inside PFZ #12A',
          harbour: 'Kasimedu Harbour'
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [80.5500, 13.2300]
        }
      },
      {
        type: 'Feature' as const,
        properties: {
          vessel_id: 'IND-TN-05-MM-302',
          name: 'MFV Chennai Sentinel',
          type: 'Mechanized Trawler',
          speed_knots: 4.1,
          heading_deg: 290,
          status: '⚠️ GALE ADVISORY NEARSHORE',
          harbour: 'Kasimedu Harbour',
          isHazard: true
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [80.3800, 13.1800]
        }
      },
      {
        type: 'Feature' as const,
        properties: {
          vessel_id: 'IND-TN-01-MM-088',
          name: 'MFV Blue Marlin',
          type: 'Gillnetter',
          speed_knots: 6.2,
          heading_deg: 120,
          status: 'Transit to Zone',
          harbour: 'Kasimedu Harbour'
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [80.4510, 12.9510]
        }
      },
      {
        type: 'Feature' as const,
        properties: {
          vessel_id: 'IND-TN-04-MM-211',
          name: 'MFV Kasimedu Pride',
          type: 'Motorized Craft',
          speed_knots: 5.5,
          heading_deg: 90,
          status: 'Returning to Jetty',
          harbour: 'Kasimedu Harbour'
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [80.3650, 13.1350]
        }
      }
    ]
  };
}

/**
 * Generates GeoJSON LineString Route from Kasimedu Harbour to recommended PFZ
 */
export function getRouteGeoJSON(
  startLon: number = 80.2974,
  startLat: number = 13.1258,
  endLon: number = 80.6210,
  endLat: number = 13.1850
) {
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {
          route_id: 'kasimedu_pfz_primary',
          origin: 'Kasimedu Fishing Harbour',
          destination: 'Chennai Offshore East (PFZ #12A)',
          distance_km: 35.2,
          bearing_deg: 85
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [startLon, startLat],
            [startLon + 0.12, startLat + 0.02],
            [endLon, endLat]
          ]
        }
      }
    ]
  };
}
