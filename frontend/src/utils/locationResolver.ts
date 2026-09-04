/**
 * ORCA Location Resolver & Fuzzy Spelling Optimization Module
 * Resolves user query text into canonical coastal sectors or maps inland cities
 * to their nearest coastal marine GIS sector.
 * Features Levenshtein edit distance and similarity metric for typo tolerance.
 */

export interface CoastalSector {
  id: 'chennai' | 'visakhapatnam' | 'kochi' | 'mangalore';
  name: string;
  fullName: string;
  center: [number, number];
  zoom: number;
  aliases: string[];
}

export interface InlandCity {
  name: string;
  aliases: string[];
  lat: number;
  lon: number;
  nearestSectorId: 'chennai' | 'visakhapatnam' | 'kochi' | 'mangalore';
  distanceKm: number;
}

export interface ResolvedLocationResult {
  rawToken: string;
  matchedPlace: string;
  isCoastal: boolean;
  sectorId: 'chennai' | 'visakhapatnam' | 'kochi' | 'mangalore';
  sectorName: string;
  center: [number, number];
  zoom: number;
  confidence: number;
  nearestCoastalNotice?: string;
}

// 1. Coastal Sectors Supported by ORCA Marine GIS
export const COASTAL_SECTORS: CoastalSector[] = [
  {
    id: 'chennai',
    name: 'Chennai',
    fullName: 'Chennai Offshore East Sector',
    center: [80.3600, 13.1500],
    zoom: 10.8, // 20% zoom-in
    aliases: [
      'chennai', 'madras', 'kasimedu', 'royapuram', 'ennore', 'kattupalli',
      'mahabalipuram', 'mamallapuram', 'puducherry', 'pondicherry', 'pondy',
      'kovalam', 'srinivasapuram', 'pattinapakkam', 'cuddalore', 'enore',
      'royapuram fishing harbour', 'kasimedu fishing harbour',
      'சென்னை', 'காசிமேடு', 'ராயபுரம்', 'பாண்டிச்சேரி', 'கடலூர்'
    ]
  },
  {
    id: 'visakhapatnam',
    name: 'Visakhapatnam',
    fullName: 'Visakhapatnam Coastal Sector',
    center: [83.3032, 17.6974],
    zoom: 10.2,
    aliases: [
      'visakhapatnam', 'vizag', 'waltair', 'gangavaram', 'bheemunipatnam',
      'bheemili', 'kakinada', 'machilipatnam', 'srikakulam', 'gopalpur',
      'paradip', 'puri', 'odisha', 'andhra', 'rushikonda', 'lawson bay',
      'விசாகப்பட்டினம்', 'విశాఖపట్నం', 'వైజాగ్'
    ]
  },
  {
    id: 'kochi',
    name: 'Kochi',
    fullName: 'Kochi & Munambam Deep Sea',
    center: [76.1683, 10.1812],
    zoom: 10.2,
    aliases: [
      'kochi', 'cochin', 'munambam', 'ernakulam', 'alappuzha', 'alleppey',
      'kollam', 'quilon', 'thiruvananthapuram', 'trivandrum', 'vizhinjam',
      'kannur', 'kozhikode', 'calicut', 'kerala', 'beypore', 'chetwai',
      'கொச்சி', 'கொச்சின்', 'കൊച്ചി'
    ]
  },
  {
    id: 'mangalore',
    name: 'Mangalore',
    fullName: 'Old Mangalore Coast & Shelf',
    center: [74.8320, 12.8550],
    zoom: 10.2,
    aliases: [
      'mangalore', 'mangaluru', 'udupi', 'malpe', 'karwar', 'bhatkal',
      'kundapura', 'panambur', 'honnavar', 'goa', 'panaji', 'mumbai',
      'bombay', 'karnataka', 'tadadi', 'மங்களூரு', 'ಮಂಗಳೂರು'
    ]
  }
];

// 2. Comprehensive Inland / Non-Coastal Cities with Mappings to Nearest Coastal Sectors
export const INLAND_CITIES: InlandCity[] = [
  {
    name: 'Bengaluru',
    aliases: ['bengaluru', 'bangalore', 'banglore', 'bengaluru city', 'blr'],
    lat: 12.9716,
    lon: 77.5946,
    nearestSectorId: 'chennai',
    distanceKm: 290
  },
  {
    name: 'Hyderabad',
    aliases: ['hyderabad', 'hydrabad', 'secunderabad', 'cyberabad', 'hyd'],
    lat: 17.3850,
    lon: 78.4867,
    nearestSectorId: 'visakhapatnam',
    distanceKm: 520
  },
  {
    name: 'Tirupati',
    aliases: ['tirupati', 'tirupathi', 'tirumala', 'chittoor'],
    lat: 13.6288,
    lon: 79.4192,
    nearestSectorId: 'chennai',
    distanceKm: 130
  },
  {
    name: 'Vellore',
    aliases: ['vellore', 'ranipet', 'katpadi', 'kanchipuram'],
    lat: 12.9165,
    lon: 79.1325,
    nearestSectorId: 'chennai',
    distanceKm: 125
  },
  {
    name: 'Vijayawada',
    aliases: ['vijayawada', 'amaravati', 'guntur', 'bezawada'],
    lat: 16.5062,
    lon: 80.6480,
    nearestSectorId: 'visakhapatnam',
    distanceKm: 340
  },
  {
    name: 'Coimbatore',
    aliases: ['coimbatore', 'kovai', 'tirupur', 'pollachi'],
    lat: 11.0168,
    lon: 76.9558,
    nearestSectorId: 'kochi',
    distanceKm: 160
  },
  {
    name: 'Madurai',
    aliases: ['madurai', 'dindigul', 'theeni', 'virudhunagar'],
    lat: 9.9252,
    lon: 78.1198,
    nearestSectorId: 'chennai',
    distanceKm: 380
  },
  {
    name: 'Tiruchirappalli',
    aliases: ['trichy', 'tiruchirappalli', 'thanjavur', 'thanjai'],
    lat: 10.7905,
    lon: 78.7047,
    nearestSectorId: 'chennai',
    distanceKm: 310
  },
  {
    name: 'Salem',
    aliases: ['salem', 'erode', 'dharmapuri', 'namakkal'],
    lat: 11.6643,
    lon: 78.1460,
    nearestSectorId: 'chennai',
    distanceKm: 315
  },
  {
    name: 'Mysuru',
    aliases: ['mysuru', 'mysore', 'hassan', 'mandya'],
    lat: 12.2958,
    lon: 76.6394,
    nearestSectorId: 'mangalore',
    distanceKm: 245
  },
  {
    name: 'Hubballi',
    aliases: ['hubballi', 'hubli', 'dharwad', 'belgaum', 'belagavi'],
    lat: 15.3647,
    lon: 75.1240,
    nearestSectorId: 'mangalore',
    distanceKm: 270
  },
  {
    name: 'New Delhi',
    aliases: ['delhi', 'new delhi', 'dilli', 'ncr', 'gurgaon', 'noida'],
    lat: 28.6139,
    lon: 77.2090,
    nearestSectorId: 'visakhapatnam',
    distanceKm: 1350
  },
  {
    name: 'Kolkata',
    aliases: ['kolkata', 'calcutta', 'howrah'],
    lat: 22.5726,
    lon: 88.3639,
    nearestSectorId: 'visakhapatnam',
    distanceKm: 780
  },
  {
    name: 'Pune',
    aliases: ['pune', 'poona'],
    lat: 18.5204,
    lon: 73.8567,
    nearestSectorId: 'mangalore',
    distanceKm: 700
  },
  {
    name: 'Nagpur',
    aliases: ['nagpur', 'raipur'],
    lat: 21.1458,
    lon: 79.0882,
    nearestSectorId: 'visakhapatnam',
    distanceKm: 690
  }
];

// Levenshtein edit distance between two strings
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,       // deletion
        dp[i][j - 1] + 1,       // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

// Normalized similarity score [0.0 - 1.0]
export function stringSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(a, b);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Extracts candidate tokens and n-grams from query text.
 */
function extractCandidateTokens(text: string): string[] {
  const clean = text.toLowerCase().replace(/[^\w\s\u0B80-\u0BFF\u0C00-\u0C7F]/g, ' ').trim();
  const words = clean.split(/\s+/).filter(w => w.length >= 2);

  const candidates: string[] = [];

  // Add individual words
  candidates.push(...words);

  // Add bigrams
  for (let i = 0; i < words.length - 1; i++) {
    candidates.push(`${words[i]} ${words[i + 1]}`);
  }

  // Add trigrams
  for (let i = 0; i < words.length - 2; i++) {
    candidates.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }

  return candidates;
}

/**
 * Main Location Resolver
 * Analyzes query text ONLY when submitted.
 * Returns ResolvedLocationResult if a location is found (coastal or inland with nearest coastal mapping).
 * Returns null if no geographical place was identified.
 */
export function resolveLocationFromText(queryText: string): ResolvedLocationResult | null {
  if (!queryText || !queryText.trim()) return null;

  const normalizedQuery = queryText.toLowerCase();
  const candidates = extractCandidateTokens(queryText);

  // Stop-words to ignore as candidate locations
  const stopWords = new Set([
    'fish', 'fishing', 'zone', 'zones', 'near', 'where', 'should', 'can', 'take',
    'boat', 'out', 'tomorrow', 'today', 'how', 'what', 'good', 'spot', 'spots',
    'safe', 'safety', 'weather', 'sea', 'ocean', 'water', 'deep', 'port', 'harbour'
  ]);

  let bestMatch: {
    token: string;
    targetName: string;
    isCoastal: boolean;
    sectorId: 'chennai' | 'visakhapatnam' | 'kochi' | 'mangalore';
    similarity: number;
    nearestCoastNotice?: string;
  } | null = null;

  // ==========================================
  // PASS 1: Exact Substring or Whole-Word Match
  // ==========================================
  // 1a. Coastal Sectors Exact Match
  for (const sector of COASTAL_SECTORS) {
    for (const alias of sector.aliases) {
      if (normalizedQuery.includes(alias)) {
        return {
          rawToken: alias,
          matchedPlace: sector.name,
          isCoastal: true,
          sectorId: sector.id,
          sectorName: sector.fullName,
          center: sector.center,
          zoom: sector.zoom,
          confidence: 1.0
        };
      }
    }
  }

  // 1b. Inland Cities Exact Match (Maps to nearest coastal sector)
  for (const city of INLAND_CITIES) {
    for (const alias of city.aliases) {
      if (normalizedQuery.includes(alias)) {
        const sector = COASTAL_SECTORS.find(s => s.id === city.nearestSectorId)!;
        return {
          rawToken: alias,
          matchedPlace: city.name,
          isCoastal: false,
          sectorId: sector.id,
          sectorName: sector.fullName,
          center: sector.center,
          zoom: sector.zoom,
          confidence: 1.0,
          nearestCoastalNotice: `${city.name} is an inland area (~${city.distanceKm} km from sea). Displaying nearest coastal sector: ${sector.name}.`
        };
      }
    }
  }

  // ==========================================
  // PASS 2: Typo-Tolerant Fuzzy Matching
  // ==========================================
  // 2a. Fuzzy check against Coastal Sectors
  for (const sector of COASTAL_SECTORS) {
    for (const alias of sector.aliases) {
      for (const token of candidates) {
        if (stopWords.has(token) && token !== alias) continue;
        if (token.length < 3) continue;

        const sim = stringSimilarity(token, alias);
        // High confidence threshold for typos (e.g., 'chenai' vs 'chennai' = 0.86, 'vzag' vs 'vizag' = 0.8)
        if (sim >= 0.72) {
          if (!bestMatch || sim > bestMatch.similarity) {
            bestMatch = {
              token,
              targetName: sector.name,
              isCoastal: true,
              sectorId: sector.id,
              similarity: sim
            };
          }
        }
      }
    }
  }

  // 2b. Fuzzy check against Inland Cities
  for (const city of INLAND_CITIES) {
    for (const alias of city.aliases) {
      for (const token of candidates) {
        if (stopWords.has(token) && token !== alias) continue;
        if (token.length < 3) continue;

        const sim = stringSimilarity(token, alias);
        if (sim >= 0.72) {
          if (!bestMatch || sim > bestMatch.similarity) {
            const sector = COASTAL_SECTORS.find(s => s.id === city.nearestSectorId)!;
            bestMatch = {
              token,
              targetName: city.name,
              isCoastal: false,
              sectorId: sector.id,
              similarity: sim,
              nearestCoastNotice: `${city.name} is an inland area (~${city.distanceKm} km from sea). Displaying nearest coastal sector: ${sector.name}.`
            };
          }
        }
      }
    }
  }

  // If a fuzzy match was found with similarity >= 0.72
  if (bestMatch && bestMatch.similarity >= 0.72) {
    const sector = COASTAL_SECTORS.find(s => s.id === bestMatch!.sectorId)!;
    return {
      rawToken: bestMatch.token,
      matchedPlace: bestMatch.targetName,
      isCoastal: bestMatch.isCoastal,
      sectorId: sector.id,
      sectorName: sector.fullName,
      center: sector.center,
      zoom: sector.zoom,
      confidence: Number(bestMatch.similarity.toFixed(2)),
      nearestCoastalNotice: bestMatch.nearestCoastNotice
    };
  }

  // If the query contains "execute" or is a general query, default to Chennai (+20% zoom = 10.8)
  if (
    normalizedQuery.includes('execute') ||
    normalizedQuery.includes('fish') ||
    normalizedQuery.includes('zone') ||
    normalizedQuery.includes('boat') ||
    normalizedQuery.includes('sea') ||
    normalizedQuery.includes('harbour')
  ) {
    const chennai = COASTAL_SECTORS.find(s => s.id === 'chennai')!;
    return {
      rawToken: normalizedQuery.includes('execute') ? 'execute' : 'chennai',
      matchedPlace: 'Chennai',
      isCoastal: true,
      sectorId: 'chennai',
      sectorName: chennai.fullName,
      center: chennai.center,
      zoom: 10.8,
      confidence: 1.0
    };
  }

  // No recognized location found in the text
  return null;
}
