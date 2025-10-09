import { createClient } from '@supabase/supabase-js';

// Configuration
const SETLIST_FM_API_KEY = 'QxGjjwxk0MUyxyCJa2FADnFRwEqFUy__7wpt';
const SETLIST_FM_BASE_URL = 'https://api.setlist.fm/rest/1.0';
const SUPABASE_URL = 'https://glpiolbrafqikqhnseto.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjkzNzgyNCwiZXhwIjoyMDcyNTEzODI0fQ.cS0y6dQiw2VvGD7tKfKADKqM8whaopJ716G4dexBRGI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Rate limiting: setlist.fm allows ~2 requests per second
const RATE_LIMIT_DELAY = 1000; // ms between requests

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Search for setlists on setlist.fm using general search
 */
async function searchSetlists(params) {
  const queryParams = new URLSearchParams();
  
  if (params.artistName) queryParams.append('artistName', params.artistName);
  if (params.date) queryParams.append('date', params.date);
  if (params.venueName) queryParams.append('venueName', params.venueName);
  if (params.cityName) queryParams.append('cityName', params.cityName);
  if (params.stateCode) queryParams.append('stateCode', params.stateCode);
  
  const url = `${SETLIST_FM_BASE_URL}/search/setlists?${queryParams.toString()}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'x-api-key': SETLIST_FM_API_KEY,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return null; // No setlists found
      }
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error searching setlists:', error);
    return null;
  }
}

/**
 * Get setlists for a specific artist by MBID
 */
async function getArtistSetlists(mbid, page = 1) {
  const url = `${SETLIST_FM_BASE_URL}/artist/${mbid}/setlists?p=${page}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'x-api-key': SETLIST_FM_API_KEY,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return null; // No setlists found
      }
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching artist setlists:', error);
    return null;
  }
}

/**
 * Search for artist by name to get MBID
 */
async function searchArtist(artistName) {
  const queryParams = new URLSearchParams({
    artistName: artistName
  });
  
  const url = `${SETLIST_FM_BASE_URL}/search/artists?${queryParams.toString()}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'x-api-key': SETLIST_FM_API_KEY,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.artist && data.artist.length > 0 ? data.artist[0] : null;
  } catch (error) {
    console.error('Error searching artist:', error);
    return null;
  }
}

/**
 * Format date for setlist.fm API (dd-MM-yyyy)
 */
function formatDateForAPI(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Parse setlist.fm date format (dd-MM-yyyy) to Date object
 */
function parseSetlistDate(dateStr) {
  const [day, month, year] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Check if two dates are the same day (ignoring time)
 */
function isSameDay(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

/**
 * Find exact date match from setlists
 */
function findExactDateMatch(setlists, eventDate) {
  const targetDate = new Date(eventDate);
  const targetDateStr = formatDateForAPI(eventDate);
  
  // First try exact date match
  let exactMatch = setlists.find(setlist => setlist.eventDate === targetDateStr);
  
  if (exactMatch) {
    return exactMatch;
  }
  
  // If no exact match, try same day match (ignoring time)
  return setlists.find(setlist => {
    const setlistDate = parseSetlistDate(setlist.eventDate);
    return isSameDay(targetDate, setlistDate);
  });
}

/**
 * Transform setlist.fm data to our format
 */
function transformSetlist(setlistData) {
  if (!setlistData || !setlistData.sets || !setlistData.sets.set) {
    return null;
  }
  
  const songs = [];
  let songCount = 0;
  
  // Process each set (main set, encore, etc.)
  setlistData.sets.set.forEach((set, setIndex) => {
    if (set.song && Array.isArray(set.song)) {
      set.song.forEach((song, songIndex) => {
        songs.push({
          name: song.name,
          position: songCount + 1,
          setNumber: setIndex + 1,
          setName: set.name || (set.encore ? `Encore ${set.encore}` : `Set ${setIndex + 1}`),
          cover: song.cover ? {
            artist: song.cover.name,
            mbid: song.cover.mbid
          } : null,
          info: song.info || null,
          tape: song.tape || false
        });
        songCount++;
      });
    }
  });
  
  return {
    setlistFmId: setlistData.id,
    versionId: setlistData.versionId,
    eventDate: setlistData.eventDate,
    artist: {
      name: setlistData.artist?.name,
      mbid: setlistData.artist?.mbid
    },
    venue: {
      name: setlistData.venue?.name,
      city: setlistData.venue?.city?.name,
      state: setlistData.venue?.city?.state,
      country: setlistData.venue?.city?.country?.name
    },
    tour: setlistData.tour?.name || null,
    info: setlistData.info || null,
    url: setlistData.url,
    songs: songs,
    songCount: songCount,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Fetch past events that need setlist enrichment
 */
async function getPastEventsToEnrich(limit = 100, offset = 0) {
  const now = new Date().toISOString();
  
  const { data, error } = await supabase
    .from('jambase_events')
    .select('*')
    .lt('event_date', now)
    .or('setlist_enriched.is.null,setlist_enriched.eq.false')
    .order('event_date', { ascending: false })
    .range(offset, offset + limit - 1);
  
  if (error) {
    console.error('Error fetching events:', error);
    return [];
  }
  
  return data || [];
}

/**
 * Get total count of past events that need enrichment
 */
async function getTotalPastEventsCount() {
  const now = new Date().toISOString();
  
  const { count, error } = await supabase
    .from('jambase_events')
    .select('*', { count: 'exact', head: true })
    .lt('event_date', now)
    .or('setlist_enriched.is.null,setlist_enriched.eq.false');
  
  if (error) {
    console.error('Error getting total count:', error);
    return 0;
  }
  
  return count || 0;
}

/**
 * Update event with setlist data - matches exact database schema
 */
async function updateEventSetlist(eventId, setlistData, setlistFmId, setlistFmUrl) {
  const { data, error } = await supabase
    .from('jambase_events')
    .update({
      setlist: setlistData,                    // jsonb field
      setlist_fm_id: setlistFmId,             // text field
      setlist_fm_url: setlistFmUrl,           // text field
      setlist_source: 'setlist.fm',           // text field
      setlist_enriched: true,                 // boolean field
      setlist_song_count: setlistData?.songCount || 0,  // integer field
      setlist_last_updated: new Date().toISOString(),   // timestamp field
      updated_at: new Date().toISOString()    // timestamp field
    })
    .eq('id', eventId)
    .select();
  
  if (error) {
    console.error('Error updating event:', error);
    return false;
  }
  
  return true;
}

/**
 * Mark event as checked (no setlist found)
 */
async function markEventAsChecked(eventId) {
  const { error } = await supabase
    .from('jambase_events')
    .update({
      setlist_enriched: true,
      setlist_last_updated: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', eventId);
  
  if (error) {
    console.error('Error marking event as checked:', error);
    return false;
  }
  
  return true;
}

/**
 * Precise enrichment function with exact date matching
 */
async function enrichEventWithSetlist(event) {
  console.log(`Processing ARTIST: "${event.artist_name}" at ${event.venue_name} on ${event.event_date}`);
  console.log(`  Event title: "${event.title}"`);
  
  // Skip if already enriched
  if (event.setlist_enriched && event.setlist_fm_id) {
    console.log('  Already enriched, skipping');
    return { status: 'skipped', reason: 'already_enriched' };
  }
  
  await sleep(RATE_LIMIT_DELAY);
  
  // Method 1: Try general search with exact date (ONLY artist name + date)
  const searchParams = {
    artistName: event.artist_name,  // ALWAYS use artist_name, never title
    date: formatDateForAPI(event.event_date)
  };
  
  // Removed venue parameters to avoid conflicts - search by artist name only
  
  console.log(`  Searching setlist.fm for ARTIST: "${event.artist_name}" on date: ${formatDateForAPI(event.event_date)}`);
  const searchResults = await searchSetlists(searchParams);
  
  if (searchResults && searchResults.setlist && searchResults.setlist.length > 0) {
    // Find exact date match
    const exactMatch = findExactDateMatch(searchResults.setlist, event.event_date);
    
    if (exactMatch) {
      const transformedSetlist = transformSetlist(exactMatch);
      
      if (transformedSetlist && transformedSetlist.songCount > 0) {
        const success = await updateEventSetlist(
          event.id,
          transformedSetlist,
          exactMatch.id,
          exactMatch.url
        );
        
        if (success) {
          console.log(`  ✓ Updated with ${transformedSetlist.songCount} songs (exact date match)`);
          return { status: 'success', songCount: transformedSetlist.songCount, method: 'exact_date' };
        }
      }
    }
  }
  
  // Method 2: Try artist-specific search with exact date matching
  console.log(`  Trying artist-specific search for ARTIST: "${event.artist_name}"...`);
  await sleep(RATE_LIMIT_DELAY);
  
  const artist = await searchArtist(event.artist_name);
  if (!artist || !artist.mbid) {
    console.log(`  No artist MBID found for "${event.artist_name}"`);
    await markEventAsChecked(event.id);
    return { status: 'not_found' };
  }
  
  console.log(`  Found artist MBID: ${artist.mbid} for "${event.artist_name}"`);
  
  // Get artist's setlists (first page)
  const artistSetlists = await getArtistSetlists(artist.mbid, 1);
  if (!artistSetlists || !artistSetlists.setlist || artistSetlists.setlist.length === 0) {
    console.log('  No artist setlists found for this MBID, trying venue search fallback...');
    
    // Try venue search fallback when artist search fails
    const venueSearchParams = {
      venueName: event.venue_name,
      date: formatDateForAPI(event.event_date)
    };
    
    const venueSearchResults = await searchSetlists(venueSearchParams);
    if (venueSearchResults && venueSearchResults.setlist && venueSearchResults.setlist.length > 0) {
      const exactMatch = findExactDateMatch(venueSearchResults.setlist, event.event_date);
      if (exactMatch) {
        console.log(`  Found setlist via venue search: ${exactMatch.artist?.name} (MBID: ${exactMatch.artist?.mbid})`);
        const transformedSetlist = transformSetlist(exactMatch);
        
        if (transformedSetlist && transformedSetlist.songCount > 0) {
          const success = await updateEventSetlist(
            event.id,
            transformedSetlist,
            exactMatch.id,
            exactMatch.url
          );
          
          if (success) {
            console.log(`  ✓ Updated with ${transformedSetlist.songCount} songs (venue search fallback)`);
            return { status: 'success', songCount: transformedSetlist.songCount, method: 'venue_search_fallback' };
          }
        }
      }
    }
    
    await markEventAsChecked(event.id);
    return { status: 'not_found' };
  }
  
  console.log(`  Found ${artistSetlists.setlist.length} setlists for artist`);
  
  // Find exact date match
  const exactMatch = findExactDateMatch(artistSetlists.setlist, event.event_date);
  
  if (!exactMatch) {
    console.log('  No exact date match found in artist data');
    await markEventAsChecked(event.id);
    return { status: 'not_found' };
  }
  
  console.log(`  Found exact date match: ${exactMatch.eventDate} at ${exactMatch.venue?.name}`);
  
  const transformedSetlist = transformSetlist(exactMatch);
  if (!transformedSetlist || transformedSetlist.songCount === 0) {
    console.log('  Empty setlist, marking as checked');
    await markEventAsChecked(event.id);
    return { status: 'empty_setlist' };
  }
  
  // Update the event
  const success = await updateEventSetlist(
    event.id,
    transformedSetlist,
    exactMatch.id,
    exactMatch.url
  );
  
  if (success) {
    console.log(`  ✓ Updated with ${transformedSetlist.songCount} songs (artist exact date match)`);
    return { status: 'success', songCount: transformedSetlist.songCount, method: 'artist_exact_date' };
  } else {
    console.log('  ✗ Failed to update');
    return { status: 'error' };
  }
}

/**
 * Process ALL past events with comprehensive enrichment
 */
async function processAllPastEvents(batchSize = 50) {
  console.log('🚀 Starting comprehensive setlist enrichment for ALL past events...');
  
  // Get total count first
  const totalEvents = await getTotalPastEventsCount();
  console.log(`📊 Total past events to process: ${totalEvents}`);
  
  if (totalEvents === 0) {
    console.log('✅ No past events found that need enrichment!');
    return { total: 0, success: 0, notFound: 0, empty: 0, skipped: 0, errors: 0 };
  }
  
  let offset = 0;
  let batchNumber = 1;
  let totalProcessed = 0;
  let stats = {
    total: 0,
    success: 0,
    successExactDate: 0,
    successArtistExactDate: 0,
    notFound: 0,
    empty: 0,
    skipped: 0,
    errors: 0
  };
  
  const startTime = Date.now();
  
  while (totalProcessed < totalEvents) {
    const remainingEvents = totalEvents - totalProcessed;
    const currentBatchSize = Math.min(batchSize, remainingEvents);
    
    console.log(`\n=== Batch ${batchNumber} (${totalProcessed + 1}-${totalProcessed + currentBatchSize} of ${totalEvents}) ===`);
    console.log(`Progress: ${((totalProcessed / totalEvents) * 100).toFixed(1)}%`);
    
    const events = await getPastEventsToEnrich(currentBatchSize, offset);
    
    if (events.length === 0) {
      console.log('No more events to process');
      break;
    }
    
    console.log(`Processing ${events.length} events...`);
    
    for (const event of events) {
      stats.total++;
      const result = await enrichEventWithSetlist(event);
      
      switch (result.status) {
        case 'success':
          stats.success++;
          if (result.method === 'exact_date') {
            stats.successExactDate++;
          } else if (result.method === 'artist_exact_date') {
            stats.successArtistExactDate++;
          }
          break;
        case 'not_found':
          stats.notFound++;
          break;
        case 'empty_setlist':
          stats.empty++;
          break;
        case 'skipped':
          stats.skipped++;
          break;
        default:
          stats.errors++;
      }
      
      // Show progress every 10 events
      if (stats.total % 10 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = stats.total / elapsed;
        const eta = remainingEvents > 0 ? (remainingEvents / rate) : 0;
        console.log(`  Progress: ${stats.total}/${totalEvents} (${((stats.total / totalEvents) * 100).toFixed(1)}%) - ETA: ${Math.round(eta / 60)}min`);
      }
    }
    
    offset += currentBatchSize;
    totalProcessed += events.length;
    batchNumber++;
    
    // Brief pause between batches
    await sleep(2000);
  }
  
  const totalTime = (Date.now() - startTime) / 1000;
  const successRate = stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : 0;
  
  console.log('\n🎉 === COMPREHENSIVE SETLIST ENRICHMENT COMPLETED ===');
  console.log(`⏱️  Total processing time: ${Math.round(totalTime / 60)} minutes`);
  console.log(`📊 Total events processed: ${stats.total}`);
  console.log(`✅ Successfully enriched: ${stats.success} (${successRate}%)`);
  console.log(`   - Exact date match: ${stats.successExactDate}`);
  console.log(`   - Artist exact date match: ${stats.successArtistExactDate}`);
  console.log(`❌ Not found: ${stats.notFound}`);
  console.log(`📝 Empty setlists: ${stats.empty}`);
  console.log(`⏭️  Skipped: ${stats.skipped}`);
  console.log(`🚫 Errors: ${stats.errors}`);
  console.log(`⚡ Average processing rate: ${(stats.total / totalTime).toFixed(1)} events/second`);
  
  return stats;
}

/**
 * Process a specific event by artist name and venue (for testing)
 */
async function processSpecificEvent(artistName, venueName) {
  console.log(`🎯 Processing specific event: ${artistName} at ${venueName}`);
  
  const { data, error } = await supabase
    .from('jambase_events')
    .select('*')
    .ilike('artist_name', `%${artistName}%`)
    .ilike('venue_name', `%${venueName}%`)
    .order('event_date', { ascending: false })
    .limit(1);
  
  if (error) {
    console.error('Error fetching specific event:', error);
    return;
  }
  
  if (!data || data.length === 0) {
    console.log('No matching event found');
    return;
  }
  
  const event = data[0];
  console.log(`Found event: ${event.artist_name} at ${event.venue_name} on ${event.event_date}`);
  
  const result = await enrichEventWithSetlist(event);
  console.log('Result:', result);
  return result;
}

// Export functions
export {
  processAllPastEvents,
  getTotalPastEventsCount,
  enrichEventWithSetlist,
  getPastEventsToEnrich,
  processSpecificEvent
};

// Run the comprehensive enrichment
if (import.meta.url === `file://${process.argv[1]}`) {
  processAllPastEvents().catch(console.error);
}
