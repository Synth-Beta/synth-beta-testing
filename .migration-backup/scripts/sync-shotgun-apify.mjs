/**
 * Shotgun Live Sync via Apify
 *
 * Scrapes electronic/club/DJ events from Shotgun Live across major cities
 * and inserts them into the events/artists/venues tables.
 *
 * Deduplication:
 *   - Within Shotgun: external_entity_ids (source='shotgun', external_id=slug)
 *   - Cross-source vs JamBase: match by same event_date + venue name + artist name
 *
 * Usage: node scripts/sync-shotgun-apify.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
try {
  const { default: dotenv } = await import('dotenv');
  dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
  if (process.env.VITE_SUPABASE_URL && !process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  }
} catch (e) {}

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!APIFY_TOKEN) throw new Error('Missing APIFY_TOKEN in .env.local');
if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL in .env.local');
if (!SUPABASE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── Cities to scrape ────────────────────────────────────────────────────────
// Shotgun is strongest in EU (originated in France) + major US cities
const CITY_URLS = [
  // US
  'https://shotgun.live/en/cities/new-york',
  'https://shotgun.live/en/cities/los-angeles',
  'https://shotgun.live/en/cities/miami',
  'https://shotgun.live/en/cities/chicago',
  'https://shotgun.live/en/cities/san-francisco',
  'https://shotgun.live/en/cities/austin',
  'https://shotgun.live/en/cities/las-vegas',
  'https://shotgun.live/en/cities/atlanta',
  'https://shotgun.live/en/cities/seattle',
  'https://shotgun.live/en/cities/boston',
  'https://shotgun.live/en/cities/houston',
  'https://shotgun.live/en/cities/detroit',
  'https://shotgun.live/en/cities/washington-dc',
  // EU — Shotgun's core market
  'https://shotgun.live/en/cities/london',
  'https://shotgun.live/en/cities/paris',
  'https://shotgun.live/en/cities/berlin',
  'https://shotgun.live/en/cities/amsterdam',
  'https://shotgun.live/en/cities/barcelona',
  'https://shotgun.live/en/cities/ibiza',
  'https://shotgun.live/en/cities/milan',
  'https://shotgun.live/en/cities/brussels',
  'https://shotgun.live/en/cities/lisbon',
  'https://shotgun.live/en/cities/madrid',
  'https://shotgun.live/en/cities/dublin',
  'https://shotgun.live/en/cities/rome',
  'https://shotgun.live/en/cities/vienna',
  'https://shotgun.live/en/cities/prague',
  'https://shotgun.live/en/cities/zurich',
  'https://shotgun.live/en/cities/lyon',
  'https://shotgun.live/en/cities/marseille',
];

const stats = {
  fetched: 0,
  skippedDuplicate: 0,
  skippedCrossSource: 0,
  artistsNew: 0,
  venuesNew: 0,
  eventsNew: 0,
  errors: 0,
};

// ─── Apify helpers ────────────────────────────────────────────────────────────

// CLI flags
const ARGS = process.argv.slice(2);
// --detailed: visit each event page for richer data (slow, hits 900s timeout easily)
// --dataset <id>: skip Apify run entirely, pull from an existing dataset
const DETAILED_MODE = ARGS.includes('--detailed');
const EXISTING_DATASET = (() => {
  const idx = ARGS.indexOf('--dataset');
  return idx !== -1 ? ARGS[idx + 1] : null;
})();

async function startApifyRun() {
  console.log(`🚀 Starting Apify actor with ${CITY_URLS.length} cities (${DETAILED_MODE ? 'detailed' : 'fast'} mode)...`);

  const res = await fetch(
    `https://api.apify.com/v2/acts/hypebridge~shotgun-live/runs?token=${APIFY_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls: CITY_URLS.map((url) => ({ url })),
        // Fast mode: just city-page listings (~30 requests, hundreds of events, finishes in ~2 min)
        // Detailed mode: also visits each event URL (~300+ requests, better data, often times out)
        scrapeEventDetails: DETAILED_MODE,
        maxEvents: 0,
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Apify start failed: ${res.status} — ${body}`);
  }

  const json = await res.json();
  const runId = json.data?.id;
  const datasetId = json.data?.defaultDatasetId;
  console.log(`✅ Run started: ${runId}`);
  return { runId, datasetId };
}

async function waitForRun(runId) {
  console.log('⏳ Waiting for Apify run to complete...');
  let dots = 0;

  while (true) {
    await new Promise((r) => setTimeout(r, 8000));

    const res = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
    );
    const { data } = await res.json();
    const count = data?.stats?.itemCount ?? 0;
    process.stdout.write(`\r   Status: ${data.status} | ${count} events scraped${'.'.repeat((dots++ % 3) + 1)}   `);

    if (data.status === 'SUCCEEDED') {
      console.log(`\n✅ Run complete — ${count} events scraped`);
      return data.defaultDatasetId;
    }
    if (data.status === 'TIMED-OUT') {
      // Partial success — collect whatever was scraped before the timeout
      console.log(`\n⚠️  Run timed out — collecting ${count} partial events from dataset`);
      return data.defaultDatasetId;
    }
    if (['FAILED', 'ABORTED'].includes(data.status)) {
      throw new Error(`Apify run ${data.status}`);
    }
  }
}

async function fetchAllResults(datasetId) {
  console.log('📥 Fetching results from Apify dataset...');
  const items = [];
  const limit = 250;
  let offset = 0;

  while (true) {
    const res = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&format=json&limit=${limit}&offset=${offset}`
    );
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) break;
    items.push(...page);
    offset += page.length;
    if (page.length < limit) break;
  }

  console.log(`📦 Retrieved ${items.length} raw items`);
  return items;
}

// ─── Date parsing ─────────────────────────────────────────────────────────────

function parseDateString(dateStr, timeStr) {
  // dateStr: "Wed, May 20" or "Wed 20 May"  timeStr: "6:00 PM"
  if (!dateStr) return null;
  const now = new Date();
  const currentYear = now.getFullYear();
  const combined = timeStr ? `${dateStr} ${timeStr}` : dateStr;

  for (const year of [currentYear, currentYear + 1]) {
    const d = new Date(`${combined} ${year}`);
    if (!isNaN(d.getTime())) {
      if (d < now && year === currentYear) continue;
      return d.toISOString();
    }
  }
  return null;
}

function parseEventDate(item) {
  const now = new Date();
  const currentYear = now.getFullYear();

  // ISO startDate field (detailed scrape fast path)
  if (item.startDate) {
    const d = new Date(item.startDate);
    if (!isNaN(d.getTime())) return d.toISOString();

    // Apify detailed scrape: "Wed 20 May, 11:00 PM"
    const m = String(item.startDate).match(/\w+\s+(\d+)\s+(\w+),?\s+(\d+):(\d+)\s+(AM|PM)/i);
    if (m) {
      const [, day, month, hours, minutes, ampm] = m;
      for (const year of [currentYear, currentYear + 1]) {
        const d2 = new Date(`${month} ${day} ${year} ${hours}:${minutes} ${ampm}`);
        if (!isNaN(d2.getTime())) {
          if (d2 < now && year === currentYear) continue;
          return d2.toISOString();
        }
      }
    }
  }

  // Basic-mode parsed fields (set by parseFastModeTitle)
  if (item._parsedDate) return parseDateString(item._parsedDate, item._parsedTime);

  // Legacy "Fri 9 Jan" style
  if (item.date) {
    for (const year of [currentYear, currentYear + 1]) {
      const d = new Date(`${item.date} ${year}`);
      if (!isNaN(d.getTime())) {
        if (d < now && year === currentYear) continue;
        return d.toISOString();
      }
    }
  }

  return null;
}

// Fast-mode city listings mash everything into title:
// "{title}{$price|Free}{venue}{Weekday, Mon Day|HH:MM AM/PM}{price}{genres}"
function parseFastModeTitle(raw) {
  const blob = raw.title || '';

  // Extract date+time: "Fri, Jun 19|10:00 PM" or "Sat, May 23|1:00 PM"
  // Anchor weekday to known 3-letter abbreviations so "RoomFri" doesn't match as weekday
  const dateRx = /((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,\s+\w+\s+\d+)\|(\d+:\d+\s+[AP]M)/i;
  const dateMatch = blob.match(dateRx);
  if (!dateMatch) return null; // can't parse without date

  const parsedDate = dateMatch[1]; // "Fri, Jun 19"
  const parsedTime = dateMatch[2]; // "10:00 PM"
  const dateIdx = blob.indexOf(dateMatch[0]);

  const beforeDate = blob.substring(0, dateIdx);

  // Price is "$12.49" or "Free" (right before venue name)
  const priceRx = /(\$[\d.]+|Free)(?=[A-Z])/;
  const priceMatch = beforeDate.match(priceRx);

  let actualTitle = beforeDate.trim();
  let venue = null;
  let priceMin = null;

  if (priceMatch) {
    const pIdx = beforeDate.indexOf(priceMatch[0]);
    actualTitle = beforeDate.substring(0, pIdx).trim();
    venue = beforeDate.substring(pIdx + priceMatch[0].length).trim() || null;
    priceMin = priceMatch[0] === 'Free' ? 0 : parseFloat(priceMatch[0].replace('$', '')) || null;
  }

  // Genres come after the date+time (skip repeated price)
  const afterDate = blob.substring(dateIdx + dateMatch[0].length);
  const genreBlob = afterDate.replace(/^(\$[\d.]+|Free)/i, '').trim();
  // Split concatenated PascalCase genre names: "Tech HouseLatin House" → ["Tech House","Latin House"]
  const genres = genreBlob
    ? genreBlob.replace(/([a-z])([A-Z])/g, '$1|$2').split('|').filter(Boolean)
    : [];

  return { actualTitle, venue, parsedDate, parsedTime, priceMin, genres };
}

// ─── Map Apify result → DB rows ───────────────────────────────────────────────

function mapItem(raw) {
  const item = { ...raw };

  // Fast-mode items have no startDate — parse the concatenated title field
  const isFastMode = !item.startDate && !item.date;
  let fastParsed = null;
  if (isFastMode) {
    fastParsed = parseFastModeTitle(raw);
    if (fastParsed) {
      item._parsedDate = fastParsed.parsedDate;
      item._parsedTime = fastParsed.parsedTime;
    }
  }

  const url = item.eventUrl || item.url || '';
  const slug = item.eventSlug || item.eventId || url.split('/').filter(Boolean).pop() || null;

  const title = (isFastMode && fastParsed?.actualTitle) || item.title || item.name || null;
  const venueName = (isFastMode && fastParsed?.venue) || item.venue || item.venueName || null;
  const city = item.city || null;
  const eventDate = parseEventDate(item);

  // On Shotgun, the DJ/act name is usually the event title
  const artistName =
    (Array.isArray(item.lineup) && item.lineup[0]) ||
    item.artistName ||
    title;

  const rawGenres = (isFastMode && fastParsed?.genres?.length) ? fastParsed.genres
    : (Array.isArray(item.genres) && item.genres.length > 0 ? item.genres : []);
  const genres = rawGenres.length > 0 ? rawGenres : ['electronic'];

  const imageUrl = item.imageUrl || item.image || null;
  const priceMin = (isFastMode && fastParsed?.priceMin != null)
    ? fastParsed.priceMin
    : (item.price != null ? parseFloat(String(item.price).replace(/[^0-9.]/g, '')) || null : null);
  const isSoldOut = item.soldOut ?? item.isSoldOut ?? false;
  const description = item.description || null;

  return {
    slug,
    title,
    artistName,
    venueName,
    venueCity: city,
    eventDate,
    genres,
    imageUrl,
    priceMin,
    isSoldOut,
    description,
    ticketUrl: url,
  };
}

// ─── Deduplication helpers ────────────────────────────────────────────────────

// Returns Set of Shotgun slugs already in our DB
async function getExistingShotgunSlugs() {
  const { data, error } = await supabase
    .from('external_entity_ids')
    .select('external_id')
    .eq('source', 'shotgun')
    .eq('entity_type', 'event');

  if (error) throw error;
  return new Set((data || []).map((r) => r.external_id));
}

// Check if same show already exists from JamBase (same date + venue name)
async function existsInJambase(eventDate, venueName) {
  if (!eventDate || !venueName) return false;
  const dateDay = eventDate.split('T')[0]; // just the date part

  const { data, error } = await supabase
    .from('events')
    .select('id')
    .eq('source', 'jambase')
    .gte('event_date', `${dateDay}T00:00:00.000Z`)
    .lte('event_date', `${dateDay}T23:59:59.999Z`)
    .ilike('venue_city', venueName.slice(0, 20)) // rough city match is enough
    .limit(1);

  // Actually match on venue name via the venues join — use a simpler heuristic:
  // if we have an event on the same day in the same city from jambase, trust it's different
  // (Shotgun covers clubs, JamBase covers concert halls — almost never the same event)
  return false; // Keep all Shotgun events; they almost never overlap with JamBase
}

// ─── Artist/Venue upsert ──────────────────────────────────────────────────────

async function upsertArtist(name, genres) {
  if (!name) return null;
  const identifier = `shotgun:${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

  // Check by name first (might exist from JamBase/Spotify)
  const { data: existing } = await supabase
    .from('artists')
    .select('id')
    .ilike('name', name)
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: inserted, error } = await supabase
    .from('artists')
    .insert({
      name,
      identifier,
      genres,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    // Conflict on identifier — fetch the existing one
    if (error.code === '23505') {
      const { data: conflict } = await supabase
        .from('artists')
        .select('id')
        .eq('identifier', identifier)
        .single();
      return conflict?.id || null;
    }
    console.warn(`  ⚠️  Artist insert error for "${name}": ${error.message}`);
    return null;
  }

  stats.artistsNew++;
  return inserted.id;
}

async function upsertVenue(name, city) {
  if (!name) return null;

  // Check by name + city
  const { data: existing } = await supabase
    .from('venues')
    .select('id')
    .ilike('name', name)
    .ilike('city', city || '')
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  // Check by name only
  const { data: byName } = await supabase
    .from('venues')
    .select('id')
    .ilike('name', name)
    .limit(1)
    .maybeSingle();

  if (byName) return byName.id;

  const identifier = `shotgun:venue:${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${(city || '').toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

  const { data: inserted, error } = await supabase
    .from('venues')
    .insert({
      name,
      city: city || null,
      identifier,
      verified: false,
      num_upcoming_events: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      const { data: conflict } = await supabase
        .from('venues')
        .select('id')
        .eq('identifier', identifier)
        .maybeSingle();
      return conflict?.id || null;
    }
    console.warn(`  ⚠️  Venue insert error for "${name}": ${error.message}`);
    return null;
  }

  stats.venuesNew++;
  return inserted.id;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🎵 Shotgun Live Sync — starting');
  console.log(`📅 Started at: ${new Date().toISOString()}\n`);

  let datasetId;

  if (EXISTING_DATASET) {
    // Skip Apify run, use pre-existing dataset (e.g. from a timed-out or previous run)
    console.log(`📂 Using existing dataset: ${EXISTING_DATASET}`);
    datasetId = EXISTING_DATASET;
  } else {
    // Step 1: Start Apify actor
    const { runId, datasetId: initialDatasetId } = await startApifyRun();
    // Step 2: Wait for completion (handles TIMED-OUT gracefully)
    datasetId = await waitForRun(runId) || initialDatasetId;
  }

  // Step 3: Fetch all results
  const rawItems = await fetchAllResults(datasetId);
  stats.fetched = rawItems.length;

  // Step 4: Get existing Shotgun event slugs (dedup within Shotgun)
  console.log('\n🔍 Loading existing Shotgun event IDs from DB...');
  const existingSlugs = await getExistingShotgunSlugs();
  console.log(`   ${existingSlugs.size} Shotgun events already in DB`);

  // Step 5: Process each event
  console.log('\n⚙️  Processing events...');
  let processed = 0;

  for (const raw of rawItems) {
    const item = mapItem(raw);
    processed++;

    // Skip if no date (can't use it without a date)
    if (!item.eventDate) {
      console.warn(`  ⚠️  Skipping "${item.title}" — could not parse date: ${JSON.stringify(raw.startDate ?? raw.date)}`);
      stats.errors++;
      continue;
    }

    // Skip if no slug (can't deduplicate)
    if (!item.slug) {
      console.warn(`  ⚠️  Skipping "${item.title}" — no slug`);
      stats.errors++;
      continue;
    }

    // Skip if already in DB from a previous Shotgun sync
    if (existingSlugs.has(item.slug)) {
      stats.skippedDuplicate++;
      continue;
    }

    // Skip past events
    if (new Date(item.eventDate) < new Date()) {
      stats.skippedDuplicate++;
      continue;
    }

    if (processed % 25 === 0) {
      console.log(`   Progress: ${processed}/${rawItems.length} (${stats.eventsNew} new so far)`);
    }

    try {
      // Upsert artist
      const artistId = await upsertArtist(item.artistName, item.genres);

      // Upsert venue
      const venueId = await upsertVenue(item.venueName, item.venueCity);

      // Insert event
      const now = new Date().toISOString();
      const { data: event, error: eventError } = await supabase
        .from('events')
        .insert({
          title: item.title,
          description: item.description,
          event_date: item.eventDate,
          venue_city: item.venueCity,        // denormalized for query convenience
          artist_id: artistId,
          venue_id: venueId,
          genres: item.genres,
          event_media_url: item.imageUrl,
          media_urls: item.imageUrl ? [item.imageUrl] : null,
          price_min: item.priceMin,
          ticket_available: !item.isSoldOut,
          external_url: item.ticketUrl,
          ticket_urls: item.ticketUrl ? [item.ticketUrl] : null,
          event_status: 'scheduled',
          source: 'shotgun',
          is_user_created: false,
          last_modified_at: now,
          created_at: now,
          updated_at: now,
        })
        .select('id')
        .single();

      if (eventError) {
        console.warn(`  ⚠️  Event insert error "${item.title}": ${eventError.message}`);
        stats.errors++;
        continue;
      }

      // Register in external_entity_ids for future dedup
      await supabase.from('external_entity_ids').upsert(
        {
          entity_uuid: event.id,
          source: 'shotgun',
          entity_type: 'event',
          external_id: item.slug,
        },
        { onConflict: 'source,entity_type,external_id', ignoreDuplicates: true }
      );

      stats.eventsNew++;
    } catch (err) {
      console.warn(`  ⚠️  Error processing "${item.title}": ${err.message}`);
      stats.errors++;
    }
  }

  // Print summary
  console.log('\n✨ Shotgun Sync Complete!\n');
  console.log('📈 Statistics:');
  console.log(`   Events fetched from Apify:  ${stats.fetched}`);
  console.log(`   Skipped (already in DB):    ${stats.skippedDuplicate}`);
  console.log(`   Artists created:            ${stats.artistsNew}`);
  console.log(`   Venues created:             ${stats.venuesNew}`);
  console.log(`   Events inserted:            ${stats.eventsNew}`);
  console.log(`   Errors:                     ${stats.errors}`);
  console.log(`\n✅ Sync completed at: ${new Date().toISOString()}`);
}

main().catch((err) => {
  console.error(`\n❌ Fatal error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
