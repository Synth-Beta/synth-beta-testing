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
 * Format date for setlist.fm API (DD-MM-YYYY)
 */
function formatDateForAPI(dateString) {
  if (!dateString) return null;
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}-${month}-${year}`;
}

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
 * Parse setlist.fm date format (dd-MM-yyyy) to Date object
 */
function parseSetlistDate(dateStr) {
  if (!dateStr) return null;
  const [day, month, year] = dateStr.split('-').map(Number);
  if (!day || !month || !year) return null;
  return new Date(year, month - 1, day);
}

/**
 * Check if two dates are the same day (ignoring time)
 */
function isSameDay(date1, date2) {
  if (!date1 || !date2) return false;
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

/**
 * Find exact date match from setlist results
 */
function findExactDateMatch(setlists, eventDate) {
  if (!setlists || setlists.length === 0 || !eventDate) return null;
  
  const targetDate = new Date(eventDate);
  const targetDateStr = formatDateForAPI(eventDate);
  
  // First try exact date string match (dd-MM-yyyy format)
  let exactMatch = setlists.find(setlist => setlist.eventDate === targetDateStr);
  
  if (exactMatch) {
    return exactMatch;
  }
  
  // If no exact match, try same day match (ignoring time)
  return setlists.find(setlist => {
    if (!setlist.eventDate) return false;
    const setlistDate = parseSetlistDate(setlist.eventDate);
    if (!setlistDate) return false;
    return isSameDay(targetDate, setlistDate);
  });
}

/**
 * Transform setlist.fm format to our format
 */
function transformSetlist(setlist) {
  if (!setlist || !setlist.sets || !setlist.sets.set) return null;
  
  const songs = [];
  let position = 1;
  
  // Handle both single set and multiple sets
  const sets = Array.isArray(setlist.sets.set) ? setlist.sets.set : [setlist.sets.set];
  
  for (const set of sets) {
    if (!set.song) continue;
    
    const setSongs = Array.isArray(set.song) ? set.song : [set.song];
    
    for (const song of setSongs) {
      if (song.name) {
        songs.push({
          name: song.name,
          position: position++,
          cover: song.cover ? {
            artist: song.cover.artist?.name || song.cover.name,
            mbid: song.cover.mbid
          } : undefined,
          info: song.info,
          tape: song.tape || false
        });
      }
    }
  }
  
  return {
    id: setlist.id,
    url: setlist.url,
    eventDate: setlist.eventDate,
    artist: {
      name: setlist.artist?.name,
      mbid: setlist.artist?.mbid
    },
    venue: {
      name: setlist.venue?.name,
      city: setlist.venue?.city?.name,
      state: setlist.venue?.city?.state,
      country: setlist.venue?.city?.country?.name
    },
    songs,
    songCount: songs.length,
    lastUpdated: setlist.lastUpdated || new Date().toISOString()
  };
}

/**
 * Update review with setlist data
 */
async function updateReviewSetlist(reviewId, setlistData) {
  const { data, error } = await supabase
    .from('reviews')
    .update({
      setlist: setlistData,
      updated_at: new Date().toISOString()
    })
    .eq('id', reviewId)
    .select();
  
  if (error) {
    console.error('Error updating review:', error);
    return false;
  }
  
  return true;
}

/**
 * Update event with setlist data (for reference)
 */
async function updateEventSetlist(eventId, setlistData) {
  const { data, error } = await supabase
    .from('events')
    .update({
      setlist: setlistData,
      updated_at: new Date().toISOString()
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
 * Enrich review with setlist data
 */
async function enrichReviewEventWithSetlist(review) {
  console.log(`\n🎵 Processing Review ID: ${review.id}`);
  console.log(`   Artist: "${review.artist_name}"`);
  console.log(`   Venue: "${review.venue_name}"`);
  console.log(`   Date: ${review.event_date}`);
  
  // Skip if review already has setlist data
  if (review.setlist && review.setlist.songCount > 0) {
    console.log('   ⏭️  Review already has setlist data, skipping');
    return { status: 'skipped', reason: 'already_has_setlist' };
  }
  
  if (!review.artist_name || !review.event_date) {
    console.log('   ⚠️  Missing artist name or event date, skipping');
    return { status: 'skipped', reason: 'missing_data' };
  }
  
  await sleep(RATE_LIMIT_DELAY);
  
  // Search setlist.fm by artist name and date
  const searchParams = {
    artistName: review.artist_name,
    date: formatDateForAPI(review.event_date)
  };
  
  console.log(`   🔍 Searching setlist.fm for "${review.artist_name}" on ${formatDateForAPI(review.event_date)}`);
  const searchResults = await searchSetlists(searchParams);
  
  if (searchResults && searchResults.setlist && searchResults.setlist.length > 0) {
    console.log(`   📋 Found ${searchResults.setlist.length} setlist(s) from search`);
    
    // Find exact date match
    const exactMatch = findExactDateMatch(searchResults.setlist, review.event_date);
    
    if (exactMatch) {
      console.log(`   ✅ Found exact date match: ${exactMatch.eventDate}`);
      const transformedSetlist = transformSetlist(exactMatch);
      
      if (transformedSetlist && transformedSetlist.songCount > 0) {
        // Update the review's setlist column
        const reviewSuccess = await updateReviewSetlist(review.id, transformedSetlist);
        
        // Also update the event's setlist column for reference
        const eventSuccess = await updateEventSetlist(review.event_id, transformedSetlist);
        
        if (reviewSuccess) {
          console.log(`   ✅ Updated review with ${transformedSetlist.songCount} songs${eventSuccess ? ' (event also updated)' : ' (event update failed)'}`);
          return { status: 'success', songCount: transformedSetlist.songCount };
        } else {
          console.log('   ❌ Failed to update review');
          return { status: 'error', reason: 'update_failed' };
        }
      } else {
        console.log('   ⚠️  Setlist found but empty or invalid');
        return { status: 'not_found', reason: 'empty_setlist' };
      }
    } else {
      // Try venue search as fallback
      if (review.venue_name) {
        console.log(`   🔍 Trying venue search fallback for "${review.venue_name}"`);
        await sleep(RATE_LIMIT_DELAY);
        
        const venueSearchParams = {
          venueName: review.venue_name,
          date: formatDateForAPI(review.event_date)
        };
        
        const venueSearchResults = await searchSetlists(venueSearchParams);
        
        if (venueSearchResults && venueSearchResults.setlist && venueSearchResults.setlist.length > 0) {
          console.log(`   📋 Found ${venueSearchResults.setlist.length} setlist(s) from venue search`);
          const venueMatch = findExactDateMatch(venueSearchResults.setlist, review.event_date);
          
          if (venueMatch) {
            console.log(`   ✅ Found match via venue search: ${venueMatch.artist?.name} on ${venueMatch.eventDate}`);
            const transformedSetlist = transformSetlist(venueMatch);
            
            if (transformedSetlist && transformedSetlist.songCount > 0) {
              // Update the review's setlist column
              const reviewSuccess = await updateReviewSetlist(review.id, transformedSetlist);
              
              // Also update the event's setlist column for reference
              const eventSuccess = await updateEventSetlist(review.event_id, transformedSetlist);
              
              if (reviewSuccess) {
                console.log(`   ✅ Updated review with ${transformedSetlist.songCount} songs (venue search)${eventSuccess ? ' (event also updated)' : ' (event update failed)'}`);
                return { status: 'success', songCount: transformedSetlist.songCount };
              }
            }
          }
        }
      }
      
      console.log(`   ⚠️  No exact date match found (checked ${searchResults.setlist.length} results)`);
      return { status: 'not_found', reason: 'no_date_match' };
    }
  } else {
    console.log('   ⚠️  No setlists found on setlist.fm');
    return { status: 'not_found', reason: 'no_results' };
  }
}

/**
 * Process all reviews and enrich their events with setlist data
 */
async function processAllReviews() {
  console.log('🚀 Starting setlist.fm enrichment for all reviews...\n');
  
  let offset = 0;
  const batchSize = 50;
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalNotFound = 0;
  let totalErrors = 0;
  
  while (true) {
    // Get reviews with event data and their own setlist
    const { data: reviews, error } = await supabase
      .from('reviews')
      .select(`
        id,
        event_id,
        setlist,
        events!inner (
          id,
          artist_name,
          venue_name,
          event_date
        )
      `)
      .eq('is_draft', false)
      .order('created_at', { ascending: false })
      .range(offset, offset + batchSize - 1);
    
    if (error) {
      console.error('❌ Error fetching reviews:', error);
      break;
    }
    
    if (!reviews || reviews.length === 0) {
      console.log('\n✅ No more reviews to process');
      break;
    }
    
    console.log(`\n📦 Processing batch: ${offset + 1} to ${offset + reviews.length} reviews`);
    
    for (const review of reviews) {
      const event = review.events;
      if (!event) {
        console.log(`   ⚠️  Review ${review.id} has no event data, skipping`);
        totalSkipped++;
        continue;
      }
      
      const result = await enrichReviewEventWithSetlist({
        id: review.id,
        event_id: event.id,
        artist_name: event.artist_name,
        venue_name: event.venue_name,
        event_date: event.event_date,
        setlist: review.setlist // Use review's setlist, not event's
      });
      
      totalProcessed++;
      
      if (result.status === 'success') {
        totalUpdated++;
      } else if (result.status === 'skipped') {
        totalSkipped++;
      } else if (result.status === 'not_found') {
        totalNotFound++;
      } else {
        totalErrors++;
      }
      
      // Rate limiting
      await sleep(RATE_LIMIT_DELAY);
    }
    
    offset += batchSize;
    
    // Progress summary
    console.log(`\n📊 Progress Summary:`);
    console.log(`   Total Processed: ${totalProcessed}`);
    console.log(`   ✅ Updated: ${totalUpdated}`);
    console.log(`   ⏭️  Skipped: ${totalSkipped}`);
    console.log(`   ⚠️  Not Found: ${totalNotFound}`);
    console.log(`   ❌ Errors: ${totalErrors}`);
  }
  
  console.log('\n🎉 Enrichment complete!');
  console.log(`\n📊 Final Summary:`);
  console.log(`   Total Processed: ${totalProcessed}`);
  console.log(`   ✅ Updated: ${totalUpdated}`);
  console.log(`   ⏭️  Skipped: ${totalSkipped}`);
  console.log(`   ⚠️  Not Found: ${totalNotFound}`);
  console.log(`   ❌ Errors: ${totalErrors}`);
}

// Run the script
processAllReviews().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

