import { supabase } from '../integrations/supabase/client';

export interface CityData {
  id?: string;
  name: string;
  state?: string;
  country?: string;
  center_latitude?: number;
  center_longitude?: number;
}

const CITY_SEARCH_RPC = 'search_city_centers';
const MIN_QUERY_LENGTH = 2;

function normalizeRpcRow(row: any): CityData {
  const lat =
    row.center_latitude != null
      ? Number(row.center_latitude)
      : row.latitude != null
      ? Number(row.latitude)
      : undefined;
  const lng =
    row.center_longitude != null
      ? Number(row.center_longitude)
      : row.longitude != null
      ? Number(row.longitude)
      : undefined;
  return {
    id: row.id,
    name: String(row.normalized_name || row.name || row.city || '').trim(),
    state: row.state ?? undefined,
    country: row.country ?? undefined,
    center_latitude: Number.isFinite(lat) ? lat : undefined,
    center_longitude: Number.isFinite(lng) ? lng : undefined,
  };
}

async function fallbackSearch(query: string, limit: number): Promise<CityData[]> {
  try {
    const { data } = await supabase
      .from('events')
      .select('venue_city, venue_state, latitude, longitude')
      .ilike('venue_city', `%${query}%`)
      .not('venue_city', 'is', null)
      .limit(limit * 2);

    if (!data || !Array.isArray(data)) {
      return [];
    }

    const cities: CityData[] = [];
    const seen = new Set<string>();

    for (const row of data) {
      const city = String(row.venue_city || '').trim();
      if (!city) continue;
      const state = row.venue_state ? String(row.venue_state).trim() : undefined;
      const key = state ? `${city}, ${state}` : city;
      if (seen.has(key)) continue;
      seen.add(key);
      const lat =
        row.latitude != null ? Number(row.latitude) : undefined;
      const lng =
        row.longitude != null ? Number(row.longitude) : undefined;
      if (!Number.isFinite(lat ?? NaN) || !Number.isFinite(lng ?? NaN)) continue;
      cities.push({
        name: city,
        state,
        center_latitude: lat,
        center_longitude: lng,
      });
      if (cities.length >= limit) break;
    }

    return cities;
  } catch (error) {
    console.error('[CityService] fallback search failed', error);
    return [];
  }
}

export async function searchCities(query: string, limit: number = 20): Promise<CityData[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return [];

  try {
    const { data, error } = await supabase.rpc(CITY_SEARCH_RPC, {
      query: trimmed,
      max_results: limit,
    });

    if (error) {
      console.warn('[CityService] RPC search failed, falling back to events table', error.message);
      throw error;
    }

    if (!Array.isArray(data)) {
      return [];
    }

    const normalized = data
      .map(normalizeRpcRow)
      .filter(
        (city): city is CityData =>
          Boolean(city.name) &&
          city.center_latitude != null &&
          city.center_longitude != null
      );

    return normalized.slice(0, limit);
  } catch {
    return fallbackSearch(trimmed, limit);
  }
}
