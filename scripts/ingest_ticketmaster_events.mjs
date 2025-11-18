/* eslint-disable no-console */
// Ticketmaster -> public.events importer
// Requirements (env):
// - TM_API_KEY
// - SUPABASE_URL
// - SUPABASE_SERVICE_KEY (service role for inserts/upserts)
//
// Usage:
//   npm run ingest:tm
//
// Scope:
// - Fetch next 6 months of music events for top 30 US cities
// - Map Ticketmaster fields -> public.events columns
// - Upsert by unique ticketmaster_event_id
// - Do NOT alter any tables

import { createClient } from '@supabase/supabase-js';

const TM_API = 'https://app.ticketmaster.com/discovery/v2';
// Prefer explicit env vars; fall back to names used elsewhere in repo; lastly use repo defaults
const TM_API_KEY =
  process.env.TM_API_KEY ||
  process.env.TICKETMASTER_API_KEY ||
  'rM94dPPl7ne1EAkGeZBEq5AH7zLvCAVA';
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  'https://glpiolbrafqikqhnseto.supabase.co';
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjkzNzgyNCwiZXhwIjoyMDcyNTEzODI0fQ.cS0y6dQiw2VvGD7tKfKADKqM8whaopJ716G4dexBRGI';

// Soft warnings only; proceed with repository defaults if provided
if (!process.env.TM_API_KEY && !process.env.TICKETMASTER_API_KEY) {
  console.warn('Using fallback Ticketmaster API key from repository defaults.');
}
if (!process.env.SUPABASE_URL) {
  console.warn('Using fallback Supabase URL from repository defaults.');
}
if (!process.env.SUPABASE_SERVICE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_ANON_KEY) {
  console.warn('Using fallback Supabase key from repository defaults.');
}

// ESM Node 18+ has global fetch
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Top 30 US cities (city, state) - broad coverage across regions
const TOP_CITIES = [
  { city: 'New York', stateCode: 'NY' },
  { city: 'Los Angeles', stateCode: 'CA' },
  { city: 'Chicago', stateCode: 'IL' },
  { city: 'Houston', stateCode: 'TX' },
  { city: 'Phoenix', stateCode: 'AZ' },
  { city: 'Philadelphia', stateCode: 'PA' },
  { city: 'San Antonio', stateCode: 'TX' },
  { city: 'San Diego', stateCode: 'CA' },
  { city: 'Dallas', stateCode: 'TX' },
  { city: 'San Jose', stateCode: 'CA' },
  { city: 'Austin', stateCode: 'TX' },
  { city: 'Jacksonville', stateCode: 'FL' },
  { city: 'San Francisco', stateCode: 'CA' },
  { city: 'Columbus', stateCode: 'OH' },
  { city: 'Fort Worth', stateCode: 'TX' },
  { city: 'Indianapolis', stateCode: 'IN' },
  { city: 'Charlotte', stateCode: 'NC' },
  { city: 'Seattle', stateCode: 'WA' },
  { city: 'Denver', stateCode: 'CO' },
  { city: 'Washington', stateCode: 'DC' },
  { city: 'Boston', stateCode: 'MA' },
  { city: 'Nashville', stateCode: 'TN' },
  { city: 'El Paso', stateCode: 'TX' },
  { city: 'Detroit', stateCode: 'MI' },
  { city: 'Portland', stateCode: 'OR' },
  { city: 'Memphis', stateCode: 'TN' },
  { city: 'Oklahoma City', stateCode: 'OK' },
  { city: 'Las Vegas', stateCode: 'NV' },
  { city: 'Louisville', stateCode: 'KY' },
  { city: 'Baltimore', stateCode: 'MD' },
];

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function toISO(dt) {
  return dt.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function getDateRangeMonths(monthsAhead = 6) {
  const start = new Date();
  const end = new Date();
  end.setMonth(end.getMonth() + monthsAhead);
  return { start: toISO(start), end: toISO(end) };
}

function extractGenres(classifications) {
  if (!Array.isArray(classifications)) return [];
  const names = new Set();
  for (const c of classifications) {
    if (c?.segment?.name) names.add(c.segment.name);
    if (c?.genre?.name) names.add(c.genre.name);
    if (c?.subGenre?.name) names.add(c.subGenre.name);
    if (c?.type?.name) names.add(c.type.name);
    if (c?.subType?.name) names.add(c.subType.name);
  }
  return Array.from(names);
}

function extractAttractionIds(embedded) {
  const atts = embedded?.attractions;
  if (!Array.isArray(atts)) return [];
  return atts.map((a) => a?.id).filter(Boolean);
}

function extractArtistName(embedded) {
  const atts = embedded?.attractions;
  if (!Array.isArray(atts) || atts.length === 0) return null;
  // Heuristic: first attraction as primary
  return atts[0]?.name || null;
}

function extractVenue(embedded) {
  const v = Array.isArray(embedded?.venues) ? embedded.venues[0] : undefined;
  if (!v) return {};
  const addr = v.address?.line1 || null;
  const city = v.city?.name || null;
  const state = v.state?.stateCode || null;
  const zip = v.postalCode || null;
  const lat = v.location?.latitude ? Number(v.location.latitude) : null;
  const lng = v.location?.longitude ? Number(v.location.longitude) : null;
  const tz = v.timezone || null;
  const venueName = v.name || null;
  return {
    venue_name: venueName,
    venue_address: addr,
    venue_city: city,
    venue_state: state,
    venue_zip: zip,
    latitude: lat,
    longitude: lng,
    venue_timezone: tz,
  };
}

function extractImages(images) {
  if (!Array.isArray(images)) return null;
  // Keep as JSONB (full objects)
  return images;
}

function extractMediaUrls(images) {
  if (!Array.isArray(images)) return [];
  return images.map((i) => i?.url).filter(Boolean);
}

function extractPrice(priceRanges) {
  if (!Array.isArray(priceRanges) || priceRanges.length === 0) {
    return { price_range: null, price_min: null, price_max: null, price_currency: 'USD' };
  }
  // Choose the first range
  const p = priceRanges[0];
  const min = typeof p.min === 'number' ? p.min : null;
  const max = typeof p.max === 'number' ? p.max : null;
  const currency = p.currency || 'USD';
  const rangeText = [min, max].filter((x) => x !== null && x !== undefined).join(' - ');
  return {
    price_range: rangeText || null,
    price_min: min,
    price_max: max,
    price_currency: currency,
  };
}

function mapTicketmasterEventToRow(e) {
  const id = e.id || null;
  const title = e.name || null;
  const description = e.info || e.pleaseNote || e.description || null;
  const url = e.url || null;
  const status = e?.dates?.status?.code || null;
  const start = e?.dates?.start?.dateTime || null;
  const doors = e?.dates?.start?.dateTBD || e?.dates?.start?.dateTBA ? null : e?.dates?.start?.noSpecificTime ? null : e?.dates?.start?.dateTime || null;
  const sales = e.sales || null;
  const classifications = e.classifications || null;
  const artistName = extractArtistName(e?._embedded) || (e?.name || null);
  const attractionIds = extractAttractionIds(e?._embedded);
  const genres = extractGenres(classifications);
  const venue = extractVenue(e?._embedded);
  const images = extractImages(e.images);
  const mediaUrls = extractMediaUrls(e.images);
  const { price_range, price_min, price_max, price_currency } = extractPrice(e.priceRanges);
  const source = 'ticketmaster';

  return {
    ticketmaster_event_id: id,
    title,
    artist_name: artistName || (e?.name || 'Unknown Artist'),
    artist_id: null, // unknown cross-source; keep null
    artist_uuid: null, // optional future linking by name
    venue_name: venue.venue_name || null,
    venue_id: null,
    venue_uuid: null, // optional future linking by name
    event_date: start ? new Date(start).toISOString() : null,
    doors_time: doors ? new Date(doors).toISOString() : null,
    description,
    genres: genres.length ? genres : null,
    venue_address: venue.venue_address,
    venue_city: venue.venue_city,
    venue_state: venue.venue_state,
    venue_zip: venue.venue_zip,
    latitude: venue.latitude,
    longitude: venue.longitude,
    ticket_available: Boolean(e?.dates?.status?.code === 'onsale' || e?.sales?.public?.startDateTime),
    price_range,
    price_min,
    price_max,
    price_currency,
    ticket_urls: url ? [url] : [],
    external_url: url,
    setlist: null,
    tour_name: e?.promoter?.name || null,
    source,
    event_status: status,
    classifications,
    sales_info: sales,
    attraction_ids: attractionIds.length ? attractionIds : null,
    venue_timezone: venue.venue_timezone,
    images,
    is_user_created: false,
    promoted: false,
    promotion_tier: null,
    promotion_start_date: null,
    promotion_end_date: null,
    is_featured: false,
    featured_until: null,
    created_by_user_id: null,
    claim_metadata: {},
    group_metadata: {},
    promotion_metadata: {},
    ticket_metadata: {
      seatmap: e?.seatmap || null,
      promoters: e?.promoters || e?.promoter || null,
      products: e?.products || null,
      outlets: e?.outlets || null,
      accessibility: e?.accessibility || null,
    },
    monetization_metadata: {},
    media_urls: mediaUrls,
    // created_at / updated_at default in DB
  };
}

async function fetchEventsForCity({ city, stateCode }, startISO, endISO) {
  const perPage = 200; // max size
  let page = 0;
  const rows = [];
  while (true) {
    const url = new URL(`${TM_API}/events.json`);
    url.searchParams.set('apikey', TM_API_KEY);
    url.searchParams.set('countryCode', 'US');
    url.searchParams.set('classificationName', 'music');
    url.searchParams.set('city', city);
    if (stateCode) url.searchParams.set('stateCode', stateCode);
    url.searchParams.set('startDateTime', startISO);
    url.searchParams.set('endDateTime', endISO);
    url.searchParams.set('size', String(perPage));
    url.searchParams.set('page', String(page));

    const resp = await fetch(url.toString());
    if (!resp.ok) {
      const text = await resp.text();
      console.warn(`Ticketmaster error for ${city}, page ${page}: ${resp.status} ${text}`);
      break;
    }
    const data = await resp.json();
    const embedded = data?._embedded;
    const events = embedded?.events || [];
    for (const e of events) {
      const row = mapTicketmasterEventToRow(e);
      // Only include rows with minimal viable data
      if (row.ticketmaster_event_id && row.title && row.event_date) {
        rows.push(row);
      }
    }

    const pageInfo = data?.page;
    const totalPages = typeof pageInfo?.totalPages === 'number' ? pageInfo.totalPages : 0;
    // Respect deep paging limit (size * page < 1000)
    if (events.length < perPage || page + 1 >= totalPages || (perPage * (page + 1)) >= 1000) {
      break;
    }
    page += 1;
    // Rate limit: 5 rps -> sleep ~250ms between pages
    await sleep(300);
  }
  return rows;
}

async function upsertEvents(rows) {
  if (!rows.length) return { inserted: 0, updated: 0 };
  // Chunk uploads to avoid payload limits
  const chunkSize = 500;
  let insertedOrUpdated = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error, count } = await supabase
      .from('events')
      .upsert(chunk, { onConflict: 'ticketmaster_event_id', ignoreDuplicates: false, count: 'exact' });
    if (error) {
      console.error('Supabase upsert error:', error);
      throw error;
    }
    insertedOrUpdated += count || 0;
    // Gentle pacing for DB
    await sleep(200);
  }
  return { inserted: insertedOrUpdated, updated: 0 };
}

async function main() {
  const { start, end } = getDateRangeMonths(6);
  console.log(`Importing Ticketmaster music events from ${start} to ${end} for ${TOP_CITIES.length} cities...`);

  let totalPrepared = 0;
  let totalUpserted = 0;

  for (const loc of TOP_CITIES) {
    console.log(`Fetching: ${loc.city}, ${loc.stateCode}`);
    try {
      const rows = await fetchEventsForCity(loc, start, end);
      console.log(`  Prepared rows: ${rows.length}`);
      totalPrepared += rows.length;
      if (rows.length) {
        const { inserted } = await upsertEvents(rows);
        console.log(`  Upserted: ${inserted}`);
        totalUpserted += inserted;
      }
    } catch (e) {
      console.warn(`  Skipped ${loc.city} due to error:`, e?.message || e);
    }
    // Pace between cities to respect 5 rps across sequential calls
    await sleep(500);
  }

  console.log(`Done. Prepared: ${totalPrepared}, Upserted: ${totalUpserted}`);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});


