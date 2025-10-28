/**
 * Comprehensive Ticketmaster event population script
 * Fetches events for: DC, NYC, Boston, LA, Chicago, St Louis, Memphis, San Francisco
 * 
 * Run with: node backend/populate-major-cities.js
 */

const { createClient } = require('@supabase/supabase-js');
const ngeohash = require('ngeohash');

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL || 'https://glpiolbrafqikqhnseto.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjkzNzgyNCwiZXhwIjoyMDcyNTEzODI0fQ.cS0y6dQiw2VvGD7tKfKADKqM8whaopJ716G4dexBRGI';
const supabase = createClient(supabaseUrl, supabaseKey);

// Ticketmaster API configuration
const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY || 'rM94dPPl7ne1EAkGeZBEq5AH7zLvCAVA';
const TICKETMASTER_BASE_URL = 'https://app.ticketmaster.com/discovery/v2';

// Major cities with their coordinates and state codes
const MAJOR_CITIES = [
  { name: 'Washington DC', city: 'Washington', stateCode: 'DC', lat: 38.9072, lng: -77.0369, radius: 50 },
  { name: 'New York City', city: 'New York', stateCode: 'NY', lat: 40.7128, lng: -74.0060, radius: 50 },
  { name: 'Boston', city: 'Boston', stateCode: 'MA', lat: 42.3601, lng: -71.0589, radius: 50 },
  { name: 'Los Angeles', city: 'Los Angeles', stateCode: 'CA', lat: 34.0522, lng: -118.2437, radius: 50 },
  { name: 'Chicago', city: 'Chicago', stateCode: 'IL', lat: 41.8781, lng: -87.6298, radius: 50 },
  { name: 'St Louis', city: 'St. Louis', stateCode: 'MO', lat: 38.6270, lng: -90.1994, radius: 50 },
  { name: 'Memphis', city: 'Memphis', stateCode: 'TN', lat: 35.1495, lng: -90.0490, radius: 50 },
  { name: 'San Francisco', city: 'San Francisco', stateCode: 'CA', lat: 37.7749, lng: -122.4194, radius: 50 }
];

// Cities that need all remaining pages fetched (not just first 3 pages)
const CITIES_TO_FETCH_ALL = ['New York City', 'Chicago', 'San Francisco'];

// Calculate tomorrow's date for startDateTime
function getStartDateTime() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.toISOString().split('T')[0] + 'T00:00:00Z';
}

// Fetch events for a single city
async function fetchEventsForCity(city) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📍 Fetching events for ${city.name}...`);
  console.log(`   Coordinates: (${city.lat}, ${city.lng})`);
  console.log(`   Radius: ${city.radius} miles`);
  console.log(`${'='.repeat(80)}\n`);

  const params = new URLSearchParams();
  params.append('apikey', TICKETMASTER_API_KEY);
  params.append('countryCode', 'US');
  params.append('city', city.city);
  params.append('stateCode', city.stateCode);
  
  // Use geoPoint (geohash) for better location filtering
  const geohash = ngeohash.encode(city.lat, city.lng, 7);
  params.append('geoPoint', geohash);
  params.append('latlong', `${city.lat},${city.lng}`);
  params.append('radius', city.radius.toString());
  params.append('unit', 'miles');
  
  // Only get future events
  params.append('startDateTime', getStartDateTime());
  
  // Classification filter - only get music events
  params.append('classificationName', 'music');
  
  // Sort by relevance and date
  params.append('sort', 'date,asc');
  params.append('size', '200'); // Max per page
  params.append('page', '0');

  const url = `${TICKETMASTER_BASE_URL}/events.json?${params.toString()}`;
  
  try {
    console.log(`🌐 Calling Ticketmaster API...`);
    console.log(`   URL: ${url.substring(0, 150)}...`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    
    if (!data._embedded || !data._embedded.events) {
      console.log(`   ⚠️ No events found for ${city.name}`);
      return { city: city.name, events: [], total: 0 };
    }
    
    const events = data._embedded.events;
    const page = data.page || {};
    
    console.log(`   ✅ Found ${events.length} events (Page ${page.number || 0} of ${page.totalPages || 0}, Total: ${page.totalElements || events.length})`);
    
    // Check if there are more pages
    const totalPages = page.totalPages || 1;
    const allEvents = [...events];
    
    // Determine max pages to fetch based on city
    const shouldFetchAll = CITIES_TO_FETCH_ALL.includes(city.name);
    const maxPages = shouldFetchAll ? totalPages : Math.min(totalPages, 3); // Fetch all for specified cities, 3 pages for others
    
    // Fetch additional pages if needed
    if (totalPages > 1 && page.number < maxPages - 1) {
      const pagesToFetch = shouldFetchAll 
        ? `all ${totalPages} pages`
        : `first ${maxPages} pages (of ${totalPages} total)`;
      console.log(`   📄 Fetching additional pages (${pagesToFetch})...`);
      
      for (let pageNum = 1; pageNum < maxPages; pageNum++) {
        const nextParams = new URLSearchParams(params);
        nextParams.set('page', pageNum.toString());
        const nextUrl = `${TICKETMASTER_BASE_URL}/events.json?${nextParams.toString()}`;
        
        try {
          const nextResponse = await fetch(nextUrl);
          if (nextResponse.ok) {
            const nextData = await nextResponse.json();
            if (nextData._embedded && nextData._embedded.events) {
              allEvents.push(...nextData._embedded.events);
              console.log(`   ✅ Page ${pageNum + 1}/${totalPages}: Added ${nextData._embedded.events.length} more events (Total: ${allEvents.length}/${page.totalElements || 'unknown'})`);
            }
          }
          // Small delay to avoid rate limits (longer delay for full fetches)
          await new Promise(resolve => setTimeout(resolve, shouldFetchAll ? 200 : 100));
        } catch (error) {
          console.error(`   ⚠️ Error fetching page ${pageNum + 1}:`, error.message);
        }
      }
    } else if (totalPages > maxPages && !shouldFetchAll) {
      console.log(`   ℹ️  Note: ${totalPages - maxPages} more pages available (not fetching due to limit)`);
    }
    
    return { 
      city: city.name, 
      events: allEvents, 
      total: allEvents.length,
      apiTotal: page.totalElements || allEvents.length
    };
  } catch (error) {
    console.error(`   ❌ Error fetching events for ${city.name}:`, error.message);
    return { city: city.name, events: [], total: 0, error: error.message };
  }
}

// Import transformation logic directly - need to require after ticketmaster-routes defines exports
const ticketmasterRoutes = require('./ticketmaster-routes');
const transformTicketmasterEvent = ticketmasterRoutes.transformTicketmasterEvent;
const { extractGenres } = require('./genreMapping');

// Transform and insert events directly using transformation logic
async function processEventsForCity(cityData, cityInfo) {
  if (cityData.events.length === 0) {
    console.log(`\n   ⏭️ Skipping ${cityData.city} - no events to process`);
    return { processed: 0, stored: 0, errors: [] };
  }

  console.log(`\n   🔄 Processing ${cityData.events.length} events for ${cityData.city}...`);

  try {
    // Filter future events
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const futureEvents = cityData.events.filter(event => {
      const eventDate = event.dates?.start?.localDate || event.dates?.start?.dateTime;
      if (!eventDate) return false;
      return new Date(eventDate) >= tomorrow;
    });
    
    console.log(`   📅 Filtered to ${futureEvents.length} future events (removed ${cityData.events.length - futureEvents.length} past events)`);
    
    // Transform events
    const transformedEvents = futureEvents.map(transformTicketmasterEvent);
    console.log(`   🎨 Transformed ${transformedEvents.length} events`);
    
    if (transformedEvents.length === 0) {
      return { processed: 0, stored: 0, updated: 0, errors: [] };
    }
    
    // Prepare for insertion
    const eventsToInsert = transformedEvents.map(event => {
      const { id, venue_id, artist_id, created_at, updated_at, ...eventWithoutIds } = event;
      // Ensure venue_id and artist_id are explicitly null
      eventWithoutIds.venue_id = null;
      eventWithoutIds.artist_id = null;
      return eventWithoutIds;
    });
    
    // Validate required fields
    const invalidEvents = eventsToInsert.filter(event => {
      return !event.title || !event.artist_name || !event.venue_name || !event.event_date || !event.ticketmaster_event_id;
    });
    
    if (invalidEvents.length > 0) {
      console.warn(`   ⚠️ Found ${invalidEvents.length} events with missing required fields`);
      console.warn(`   Sample invalid event:`, {
        title: invalidEvents[0]?.title,
        artist_name: invalidEvents[0]?.artist_name,
        venue_name: invalidEvents[0]?.venue_name,
        event_date: invalidEvents[0]?.event_date,
        ticketmaster_event_id: invalidEvents[0]?.ticketmaster_event_id
      });
    }
    
    // Remove invalid events
    const validEvents = eventsToInsert.filter(event => {
      return event.title && event.artist_name && event.venue_name && event.event_date && event.ticketmaster_event_id;
    });
    
    console.log(`   ✅ Valid events ready for insertion: ${validEvents.length}`);
    
    if (validEvents.length === 0) {
      return { processed: transformedEvents.length, stored: 0, updated: 0, errors: ['No valid events to insert'] };
    }
    
    // Insert in batches
    const batchSize = 50;
    let stored = 0;
    let updated = 0;
    const errors = [];
    
    for (let i = 0; i < validEvents.length; i += batchSize) {
      const batch = validEvents.slice(i, i + batchSize);
      console.log(`   💾 Inserting batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(validEvents.length/batchSize)} (${batch.length} events)...`);
      
      const { data, error } = await supabase
        .from('jambase_events')
        .upsert(batch, { 
          onConflict: 'ticketmaster_event_id',
          ignoreDuplicates: false 
        })
        .select('id');
      
      if (error) {
        console.error(`   ❌ Batch insert error:`, error.message);
        errors.push(`Batch ${Math.floor(i/batchSize) + 1}: ${error.message}`);
        continue;
      }
      
      // Count new vs updated (rough estimate - if data exists, likely updated)
      stored += batch.length;
      
      console.log(`   ✅ Batch ${Math.floor(i/batchSize) + 1} inserted successfully`);
      
      // Small delay to avoid overwhelming database
      if (i + batchSize < validEvents.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return {
      processed: transformedEvents.length,
      stored: stored,
      updated: updated,
      errors: errors
    };
  } catch (error) {
    console.error(`   ❌ Error processing events:`, error);
    return { processed: 0, stored: 0, updated: 0, errors: [error.message] };
  }
}

// Main execution
async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('🎵 TICKETMASTER MAJOR CITIES EVENT POPULATION');
  console.log('='.repeat(80));
  console.log(`📅 Start Date: ${getStartDateTime()}`);
  console.log(`📊 Cities to process: ${MAJOR_CITIES.length}`);
  console.log('='.repeat(80) + '\n');

  const results = [];
  let totalProcessed = 0;
  let totalStored = 0;
  let totalUpdated = 0;

  for (const city of MAJOR_CITIES) {
    try {
      // Fetch events from Ticketmaster API
      const cityData = await fetchEventsForCity(city);
      
      if (cityData.error) {
        results.push({ city: city.name, error: cityData.error });
        continue;
      }

      // Process and store events via backend
      const processResult = await processEventsForCity(cityData, city);
      
      totalProcessed += processResult.processed || 0;
      totalStored += processResult.stored || 0;
      totalUpdated += processResult.updated || 0;
      
      results.push({
        city: city.name,
        eventsFound: cityData.total,
        apiTotal: cityData.apiTotal,
        processed: processResult.processed,
        stored: processResult.stored,
        updated: processResult.updated,
        errors: processResult.errors
      });

      // Rate limiting - wait between cities to avoid hitting API limits
      if (city !== MAJOR_CITIES[MAJOR_CITIES.length - 1]) {
        console.log(`\n   ⏸️ Waiting 2 seconds before next city...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`❌ Fatal error processing ${city.name}:`, error);
      results.push({ city: city.name, error: error.message });
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 FINAL SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Cities Processed: ${results.length}`);
  console.log(`Total Events Processed: ${totalProcessed}`);
  console.log(`Total Events Stored (New): ${totalStored}`);
  console.log(`Total Events Updated: ${totalUpdated}`);
  console.log('\nPer-City Breakdown:');
  results.forEach(result => {
    console.log(`\n  ${result.city}:`);
    if (result.error) {
      console.log(`    ❌ Error: ${result.error}`);
    } else {
      console.log(`    📊 Found: ${result.eventsFound || 0} (API Total: ${result.apiTotal || 0})`);
      console.log(`    🔄 Processed: ${result.processed || 0}`);
      console.log(`    💾 Stored: ${result.stored || 0}`);
      console.log(`    🔁 Updated: ${result.updated || 0}`);
      if (result.errors && result.errors.length > 0) {
        console.log(`    ⚠️ Errors: ${result.errors.length}`);
      }
    }
  });
  console.log('\n' + '='.repeat(80));
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { fetchEventsForCity, processEventsForCity, MAJOR_CITIES };

