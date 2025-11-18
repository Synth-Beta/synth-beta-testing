/* eslint-disable no-console */
/**
 * Ticketmaster ingestion: Fetch music events for next 6 months
 * for top 30 US cities and upsert into public.events.
 *
 * Requirements:
 * - Environment variables:
 *   - TICKETMASTER_API_KEY
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY (service-level key for server-side upserts)
 *
 * Notes:
 * - Does not alter/create/drop any tables.
 * - Uses ON CONFLICT on unique(ticketmaster_event_id) to upsert.
 * - Leaves artist_uuid / venue_uuid null unless you later link them.
 * - Respects TM rate limits (<=5 rps) via small throttling between requests.
 */

import { createClient } from "@supabase/supabase-js";

const TM_API_BASE = "https://app.ticketmaster.com/discovery/v2";
const TM_API_KEY = process.env.TICKETMASTER_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TM_API_KEY) {
  console.error("Missing TICKETMASTER_API_KEY");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type TMImage = {
  url: string;
  width?: number;
  height?: number;
  ratio?: string;
};

type TMPriceRange = {
  currency?: string;
  min?: number;
  max?: number;
  type?: string;
};

type TMEvent = {
  id: string;
  name: string;
  type?: string;
  url?: string;
  info?: string;
  pleaseNote?: string;
  locale?: string;
  images?: TMImage[];
  dates?: {
    start?: { dateTime?: string; localDate?: string; localTime?: string };
    timezone?: string;
    status?: { code?: string };
  };
  sales?: any;
  classifications?: any[];
  priceRanges?: TMPriceRange[];
  _embedded?: {
    venues?: Array<{
      name?: string;
      url?: string;
      city?: { name?: string };
      state?: { name?: string; stateCode?: string };
      country?: { countryCode?: string; name?: string };
      address?: { line1?: string; line2?: string };
      postalCode?: string;
      location?: { longitude?: string; latitude?: string };
      timezone?: string;
    }>;
    attractions?: Array<{
      id?: string;
      name?: string;
      url?: string;
      classifications?: any[];
    }>;
  };
  source?: string;
  test?: boolean;
};

type TMCity = { city: string; stateCode?: string };

// Top 30 US cities (by metro/popularity for events). Keep concise; can tune later.
const TOP_US_CITIES: TMCity[] = [
  { city: "New York", stateCode: "NY" },
  { city: "Los Angeles", stateCode: "CA" },
  { city: "Chicago", stateCode: "IL" },
  { city: "Houston", stateCode: "TX" },
  { city: "Phoenix", stateCode: "AZ" },
  { city: "Philadelphia", stateCode: "PA" },
  { city: "San Antonio", stateCode: "TX" },
  { city: "San Diego", stateCode: "CA" },
  { city: "Dallas", stateCode: "TX" },
  { city: "San Jose", stateCode: "CA" },
  { city: "Austin", stateCode: "TX" },
  { city: "Jacksonville", stateCode: "FL" },
  { city: "San Francisco", stateCode: "CA" },
  { city: "Columbus", stateCode: "OH" },
  { city: "Indianapolis", stateCode: "IN" },
  { city: "Fort Worth", stateCode: "TX" },
  { city: "Charlotte", stateCode: "NC" },
  { city: "Seattle", stateCode: "WA" },
  { city: "Denver", stateCode: "CO" },
  { city: "Washington", stateCode: "DC" },
  { city: "Boston", stateCode: "MA" },
  { city: "El Paso", stateCode: "TX" },
  { city: "Nashville", stateCode: "TN" },
  { city: "Detroit", stateCode: "MI" },
  { city: "Oklahoma City", stateCode: "OK" },
  { city: "Portland", stateCode: "OR" },
  { city: "Las Vegas", stateCode: "NV" },
  { city: "Memphis", stateCode: "TN" },
  { city: "Louisville", stateCode: "KY" },
  { city: "Baltimore", stateCode: "MD" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toISO(date: Date): string {
  return date.toISOString().split(".")[0] + "Z";
}

function nextSixMonthsRange(): { start: string; end: string } {
  const start = new Date();
  const end = new Date();
  end.setMonth(end.getMonth() + 6);
  return { start: toISO(start), end: toISO(end) };
}

function pickPriceRange(ranges?: TMPriceRange[]): {
  price_min: number | null;
  price_max: number | null;
  price_currency: string | null;
  price_range_text: string | null;
} {
  if (!ranges || ranges.length === 0) {
    return { price_min: null, price_max: null, price_currency: null, price_range_text: null };
  }
  const pr = ranges[0];
  const price_range_text =
    pr.min != null && pr.max != null ? `${pr.min}-${pr.max} ${pr.currency || "USD"}` : null;
  return {
    price_min: pr.min ?? null,
    price_max: pr.max ?? null,
    price_currency: pr.currency ?? null,
    price_range_text,
  };
}

function extractGenres(classifications?: any[]): string[] | null {
  if (!classifications || classifications.length === 0) return null;
  const names = new Set<string>();
  for (const c of classifications) {
    if (c.segment?.name) names.add(c.segment.name);
    if (c.genre?.name) names.add(c.genre.name);
    if (c.subGenre?.name) names.add(c.subGenre.name);
    if (c.type?.name) names.add(c.type.name);
    if (c.subType?.name) names.add(c.subType.name);
  }
  const arr = Array.from(names).filter(Boolean);
  return arr.length ? arr : null;
}

function firstVenue(e: TMEvent) {
  return e._embedded?.venues?.[0];
}

function firstAttraction(e: TMEvent) {
  return e._embedded?.attractions?.[0];
}

function mapEventToRow(e: TMEvent) {
  const venue = firstVenue(e);
  const attraction = firstAttraction(e);
  const { price_min, price_max, price_currency, price_range_text } = pickPriceRange(e.priceRanges);
  const eventDateISO = e.dates?.start?.dateTime || null;
  const timezone = e.dates?.timezone || venue?.timezone || null;
  const images = e.images && e.images.length ? e.images : null;
  const classifications = e.classifications && e.classifications.length ? e.classifications : null;
  const attractionIds =
    e._embedded?.attractions?.map((a) => a.id).filter(Boolean) ?? null;

  // Flatten images a bit for our JSONB column
  const imagesJson = images
    ? images.map((img) => ({
        url: img.url,
        width: img.width,
        height: img.height,
        ratio: img.ratio,
      }))
    : null;

  const mediaUrls: string[] =
    images?.map((i) => i.url).filter((u) => typeof u === "string") ?? [];

  return {
    ticketmaster_event_id: e.id,
    title: e.name,
    artist_name: attraction?.name || null,
    artist_id: attraction?.id || null,
    artist_uuid: null as string | null,
    venue_name: venue?.name || null,
    venue_id: null as string | null,
    venue_uuid: null as string | null,
    event_date: eventDateISO,
    doors_time: null as string | null,
    description: e.info || e.pleaseNote || null,
    genres: extractGenres(e.classifications),
    venue_address: venue?.address?.line1 || null,
    venue_city: venue?.city?.name || null,
    venue_state: venue?.state?.stateCode || null,
    venue_zip: venue?.postalCode || null,
    latitude: venue?.location?.latitude ? Number(venue.location.latitude) : null,
    longitude: venue?.location?.longitude ? Number(venue.location.longitude) : null,
    ticket_available: true,
    price_range: price_range_text,
    price_min,
    price_max,
    price_currency: price_currency || "USD",
    ticket_urls: e.url ? [e.url] : [],
    external_url: e.url || null,
    setlist: null as any,
    tour_name: null as string | null,
    source: "ticketmaster",
    event_status: e.dates?.status?.code || null,
    classifications,
    sales_info: e.sales || null,
    attraction_ids: attractionIds,
    venue_timezone: timezone,
    images: imagesJson,
    is_user_created: false,
    promoted: false,
    promotion_tier: null as string | null,
    promotion_start_date: null as string | null,
    promotion_end_date: null as string | null,
    is_featured: false,
    featured_until: null as string | null,
    created_by_user_id: null as string | null,
    // metadata jsonb columns are defaulted; we can still set media_urls for UI
    media_urls,
  };
}

async function fetchCityEvents(city: TMCity, startISO: string, endISO: string): Promise<TMEvent[]> {
  const results: TMEvent[] = [];
  const size = 200; // max page size
  let page = 0;

  // deep paging limit: size * page < 1000 → with size=200, up to page=4 (0..4)
  while (page < 5) {
    const params = new URLSearchParams({
      apikey: TM_API_KEY,
      countryCode: "US",
      classificationName: "music",
      city: city.city,
      size: String(size),
      page: String(page),
      startDateTime: startISO,
      endDateTime: endISO,
      sort: "date,asc",
    });
    if (city.stateCode) params.set("stateCode", city.stateCode);

    const url = `${TM_API_BASE}/events.json?${params.toString()}`;
    const rsp = await fetch(url);
    if (!rsp.ok) {
      console.warn(`TM request failed for ${city.city} page ${page}: ${rsp.status}`);
      break;
    }
    const json: any = await rsp.json();
    const pageInfo = json?.page;
    const events: TMEvent[] = json?._embedded?.events || [];
    results.push(...events);

    const totalPages = pageInfo?.totalPages ?? page + 1;
    page += 1;
    // throttle to respect 5 rps
    await sleep(250);
    if (page >= totalPages) break;
  }
  return results;
}

async function upsertEvents(rows: ReturnType<typeof mapEventToRow>[]) {
  if (!rows.length) return;
  // Chunk to avoid payload bloat
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase
      .from("events")
      .upsert(chunk, { onConflict: "ticketmaster_event_id" })
      .select("ticketmaster_event_id");
    if (error) {
      console.error("Upsert error:", error);
      // continue to next chunk
    }
  }
}

async function main() {
  const { start, end } = nextSixMonthsRange();
  console.log(`Fetching Ticketmaster music events from ${start} to ${end} for top US cities...`);

  let totalFetched = 0;
  let totalUpserted = 0;

  for (const city of TOP_US_CITIES) {
    console.log(`→ City: ${city.city}${city.stateCode ? ", " + city.stateCode : ""}`);
    try {
      const events = await fetchCityEvents(city, start, end);
      totalFetched += events.length;
      const rows = events.map(mapEventToRow);
      await upsertEvents(rows);
      totalUpserted += rows.length;
    } catch (err) {
      console.error(`Error processing city ${city.city}:`, err);
    }
  }

  console.log(`Done. Fetched: ${totalFetched}, Upserted: ${totalUpserted}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


