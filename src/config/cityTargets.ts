/**
 * City Targets Configuration
 * Defines all cities across expansion phases with their critical mass targets
 */

export type MarketType = 'college_hub' | 'major_metro' | 'cultural_capital' | 'regional';

export interface CityTarget {
  city: string;
  phase: number;
  tier: 1 | 2 | 3; // Tier based on target size
  targetMAU: number;
  marketType: MarketType;
  aliases?: string[]; // Alternative city name formats for matching
}

export const CITY_TARGETS: CityTarget[] = [
  // Phase 0: DC (Launch Market)
  {
    city: 'DC',
    phase: 0,
    tier: 1,
    targetMAU: 1300,
    marketType: 'major_metro',
    aliases: ['Washington', 'Washington DC', 'Washington, DC', 'Washington D.C.', 'Washington D.C', 'District of Columbia']
  },

  // Phase 1: NYC + Boston
  {
    city: 'NYC',
    phase: 1,
    tier: 3,
    targetMAU: 2500,
    marketType: 'major_metro',
    aliases: ['New York', 'New York City', 'New York, NY', 'NYC, NY', 'Manhattan', 'Brooklyn', 'Queens', 'The Bronx']
  },
  {
    city: 'Boston',
    phase: 1,
    tier: 2,
    targetMAU: 800,
    marketType: 'college_hub',
    aliases: ['Boston, MA', 'Boston MA', 'Cambridge']
  },

  // Phase 2: SF + LA
  {
    city: 'SF',
    phase: 2,
    tier: 2,
    targetMAU: 1200,
    marketType: 'major_metro',
    aliases: ['San Francisco', 'San Francisco, CA', 'SF, CA', 'San Francisco CA']
  },
  {
    city: 'LA',
    phase: 2,
    tier: 3,
    targetMAU: 2500,
    marketType: 'major_metro',
    aliases: ['Los Angeles', 'Los Angeles, CA', 'LA, CA', 'Los Angeles CA', 'LA']
  },

  // Phase 3: Regional Diversification
  {
    city: 'Austin',
    phase: 3,
    tier: 2,
    targetMAU: 800,
    marketType: 'college_hub',
    aliases: ['Austin, TX', 'Austin TX']
  },
  {
    city: 'Chicago',
    phase: 3,
    tier: 3,
    targetMAU: 2500,
    marketType: 'major_metro',
    aliases: ['Chicago, IL', 'Chicago IL']
  },
  {
    city: 'New Orleans',
    phase: 3,
    tier: 2,
    targetMAU: 1200,
    marketType: 'cultural_capital',
    aliases: ['New Orleans, LA', 'New Orleans LA', 'NOLA', 'NOLA, LA']
  },
  {
    city: 'Memphis',
    phase: 3,
    tier: 2,
    targetMAU: 1000,
    marketType: 'cultural_capital',
    aliases: ['Memphis, TN', 'Memphis TN']
  },
  {
    city: 'St. Louis',
    phase: 3,
    tier: 2,
    targetMAU: 1200,
    marketType: 'regional',
    aliases: ['St. Louis, MO', 'St. Louis MO', 'Saint Louis', 'Saint Louis, MO', 'STL']
  },

  // Phase 4: National/International (placeholder)
  {
    city: 'National',
    phase: 4,
    tier: 3,
    targetMAU: 50000,
    marketType: 'major_metro',
    aliases: []
  }
];

/**
 * Normalize city name for matching
 * Handles variations in city name format
 */
export function normalizeCityName(cityName: string | null | undefined): string {
  if (!cityName) return '';
  
  const normalized = cityName.trim();
  
  // Remove common suffixes
  const clean = normalized
    .replace(/,?\s*(CA|NY|TX|IL|MO|TN|LA|MA|DC|D\.C\.?)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  return clean;
}

/**
 * Match user's location_city to a configured city target
 * Returns the standardized city name or null if no match
 */
export function matchCityToTarget(userCity: string | null | undefined): string | null {
  if (!userCity) return null;
  
  const userCityLower = userCity.toLowerCase().trim();
  const normalizedUserCity = normalizeCityName(userCity).toLowerCase();
  
  // Direct match first
  for (const target of CITY_TARGETS) {
    const targetLower = target.city.toLowerCase();
    const normalizedTarget = normalizeCityName(target.city).toLowerCase();
    
    // Direct match on normalized names
    if (targetLower === normalizedUserCity || normalizedTarget === normalizedUserCity) {
      return target.city;
    }
    
    // Check if user city contains target city name or vice versa (for DC, NYC, etc.)
    if (normalizedUserCity.includes(targetLower) || targetLower.includes(normalizedUserCity)) {
      // Special handling for DC - "dc" alone should match
      if (target.city === 'DC' && (userCityLower.includes('dc') || userCityLower.includes('d.c'))) {
        return target.city;
      }
      // For other cities, ensure we're not matching too loosely
      if (target.city !== 'DC') {
        return target.city;
      }
    }
    
    // Check aliases with more flexible matching
    if (target.aliases) {
      for (const alias of target.aliases) {
        const aliasLower = alias.toLowerCase();
        const normalizedAlias = normalizeCityName(alias).toLowerCase();
        
        // Exact match on normalized alias
        if (normalizedAlias === normalizedUserCity) {
          return target.city;
        }
        
        // Substring match - user city contains alias or alias contains user city
        if (userCityLower.includes(aliasLower) || aliasLower.includes(userCityLower)) {
          return target.city;
        }
        
        // Normalized substring match
        if (normalizedUserCity.includes(normalizedAlias) || normalizedAlias.includes(normalizedUserCity)) {
          return target.city;
        }
      }
    }
    
    // For DC specifically, check if user city contains "washington" and "dc/d.c."
    if (target.city === 'DC') {
      const hasWashington = userCityLower.includes('washington');
      const hasDC = userCityLower.includes('dc') || userCityLower.includes('d.c') || userCityLower.includes('district');
      if (hasWashington && hasDC) {
        return target.city;
      }
      // Also match just "dc" or "d.c"
      if ((userCityLower === 'dc' || userCityLower === 'd.c' || userCityLower === 'd.c.') && !hasWashington) {
        return target.city;
      }
    }
  }
  
  return null;
}

/**
 * Get all cities for a specific phase
 */
export function getCitiesForPhase(phase: number): CityTarget[] {
  return CITY_TARGETS.filter(target => target.phase === phase);
}

/**
 * Get the current phase (highest phase with active targets, defaults to Phase 0)
 */
export function getCurrentPhase(): number {
  return Math.max(...CITY_TARGETS.map(t => t.phase));
}

/**
 * Get city target by city name
 */
export function getCityTarget(city: string): CityTarget | undefined {
  return CITY_TARGETS.find(target => target.city === city);
}

