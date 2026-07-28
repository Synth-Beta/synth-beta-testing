/** Shared CORS + REST helpers for editorial edge functions. */

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function optionsResponse(): Response {
  return new Response('ok', { headers: corsHeaders });
}

export async function fetchSupabaseRest(path: string, init: RequestInit = {}): Promise<unknown> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service credentials unavailable');
  }

  const response = await fetch(`${supabaseUrl.replace(/\/+$/g, '')}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: init.method === 'POST' ? 'return=representation' : 'return=representation',
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase REST ${response.status}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

export const DC_CENTER = { lat: 38.9072, lng: -77.0369 };
export const DC_RADIUS_MILES = 50;

const DC_CITIES = new Set([
  'washington dc',
  'washington',
  'washington, dc',
  'washington, d.c.',
  'washington d.c.',
  'district of columbia',
]);

export function normalizeCity(city: string | null | undefined): string {
  return (city ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isDcCity(city: string | null | undefined, state: string | null | undefined): boolean {
  const st = (state ?? '').trim().toUpperCase();
  if (st === 'DC') return true;
  return DC_CITIES.has(normalizeCity(city));
}

/** Haversine distance in miles. */
export function milesBetween(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function isInDcMetro(row: {
  venue_city?: string | null;
  venue_state?: string | null;
  city?: string | null;
  state?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
}): boolean {
  const city = row.venue_city ?? row.city;
  const state = row.venue_state ?? row.state;
  if (isDcCity(city, state)) return true;
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return milesBetween(DC_CENTER.lat, DC_CENTER.lng, lat, lng) <= DC_RADIUS_MILES;
}

export const FALLBACK_IG_IMAGE =
  Deno.env.get('SYNTH_BRAND_IMAGE_URL') ??
  'https://getsynth.app/Logos/Main%20logo%20black%20background.png';
