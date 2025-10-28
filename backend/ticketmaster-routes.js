// Ticketmaster Discovery API routes - based on search-concerts.js structure
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { extractGenres } = require('./genreMapping');
const ngeohash = require('ngeohash');

const router = express.Router();

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL || 'https://glpiolbrafqikqhnseto.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjkzNzgyNCwiZXhwIjoyMDcyNTEzODI0fQ.cS0y6dQiw2VvGD7tKfKADKqM8whaopJ716G4dexBRGI';
const supabase = createClient(supabaseUrl, supabaseKey);

// Ticketmaster API configuration
const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY || 'rM94dPPl7ne1EAkGeZBEq5AH7zLvCAVA';
const TICKETMASTER_BASE_URL = 'https://app.ticketmaster.com/discovery/v2';

// Map Ticketmaster status to our database constraint values
function mapTicketmasterStatus(tmStatus) {
  if (!tmStatus) return 'published';
  
  switch(tmStatus) {
    case 'onsale':
    case 'offsale':
      return 'published';
    case 'cancelled':
      return 'cancelled';
    case 'postponed':
      return 'postponed';
    case 'rescheduled':
      return 'rescheduled';
    default:
      return 'published';
  }
}

// Transform Ticketmaster event to jambase_events schema
// Exported for use in other scripts
function transformTicketmasterEvent(event) {
  const firstAttraction = event._embedded?.attractions?.[0];
  let firstVenue = event._embedded?.venues?.[0];
  
  // Try multiple sources for venue data
  // Ticketmaster sometimes has venue in event.place instead of _embedded.venues
  if (!firstVenue && event.place) {
    firstVenue = {
      name: event.place.name,
      address: event.place.address,
      city: event.place.city,
      state: event.place.state,
      postalCode: event.place.postalCode,
      timezone: event.place.timezone,
      location: event.place.location || (event.place.geo ? {
        latitude: event.place.geo.latitude,
        longitude: event.place.geo.longitude
      } : null)
    };
  }
  
  // Extract venue name with better fallback logic
  let venueName = firstVenue?.name;
  if (!venueName) {
    // Try to extract venue from event name patterns
    const eventName = event.name || '';
    
    // Pattern: "Artist at Venue" → extract "Venue"
    const atMatch = eventName.match(/.+?\s+at\s+(.+)$/i);
    if (atMatch && atMatch[1]) {
      venueName = atMatch[1].trim();
    }
    
    // Pattern: "Event - Venue" or "Venue - Event"
    if (!venueName && eventName.includes(' - ')) {
      const parts = eventName.split(' - ');
      // Try the part that doesn't look like an artist name
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed && 
            !trimmed.toLowerCase().includes('ticket') && 
            !trimmed.toLowerCase().includes('night') &&
            trimmed.length > 3) {
          venueName = trimmed;
          break;
        }
      }
    }
    
    // Use place name if available
    if (!venueName && event.place?.name) {
      venueName = event.place.name;
    }
  }
  
  // Only set to null if we truly can't find venue name - don't use "Unknown Venue"
  venueName = venueName || null;
  
  // Use local date/time to respect venue timezone
  let eventDateTime;
  if (event.dates?.start?.localDate && event.dates?.start?.localTime) {
    // Combine local date and time
    eventDateTime = `${event.dates.start.localDate}T${event.dates.start.localTime}`;
  } else if (event.dates?.start?.localDate) {
    // Just date, no time specified
    eventDateTime = event.dates.start.localDate;
  } else {
    // Fallback to UTC if local not available
    eventDateTime = event.dates?.start?.dateTime || event.dates?.start?.localDate;
  }
  
  const doorTime = event.dates?.doorTime || null;
  
  // Extract artist name properly - fallback to parsing event name if no attraction
  let artistName = firstAttraction?.name;
  if (!artistName) {
    // Try to extract artist from event name using multiple patterns
    const eventName = event.name || '';
    
    // Pattern 1: "Concert Series - Artist Name" → "Artist Name" (e.g., "Saadiyat Nights - John Mayer")
    if (eventName.includes(' - ')) {
      const parts = eventName.split(' - ');
      const lastPart = parts[parts.length - 1].trim();
      // If last part looks like an artist name (not venue info), use it
      if (lastPart && !lastPart.toLowerCase().includes('ticket') && !lastPart.toLowerCase().includes('night')) {
        artistName = lastPart;
      }
    }
    
    // Pattern 2: "Artist at Venue" → "Artist"
    if (!artistName || artistName === 'Unknown Artist') {
      const match = eventName.match(/^(.+?)\s+at\s+.+$/i);
      if (match && match[1]) {
        artistName = match[1].trim();
      }
    }
    
    // Pattern 3: "Artist" alone (simple case)
    if (!artistName || artistName === 'Unknown Artist') {
      artistName = eventName.trim();
    }
    
    // Don't use tribute/cover bands
    if (artistName.toLowerCase().includes('tribute') || artistName.toLowerCase().includes('cover')) {
      artistName = null;
    }
  }
  
  // Ensure required fields are never null (database constraint)
  artistName = artistName || event.name || 'Unknown Artist';
  
  const priceRange = event.priceRanges?.[0];
  // Always populate price_range from structured data for consistency
  let priceRangeString = null;
  if (priceRange) {
    if (priceRange.min && priceRange.max && priceRange.min !== priceRange.max) {
      priceRangeString = `$${priceRange.min} - $${priceRange.max}`;
    } else if (priceRange.min && priceRange.max && priceRange.min === priceRange.max) {
      priceRangeString = `$${priceRange.min}`;
    } else if (priceRange.min) {
      priceRangeString = `$${priceRange.min}+`;
    } else if (priceRange.max) {
      priceRangeString = `Up to $${priceRange.max}`;
    }
  }
  
  // Extract coordinates with fallback to place.geo
  let latitude = null;
  let longitude = null;
  if (firstVenue?.location?.latitude && firstVenue?.location?.longitude) {
    latitude = parseFloat(firstVenue.location.latitude);
    longitude = parseFloat(firstVenue.location.longitude);
  } else if (event.place?.geo?.latitude && event.place?.geo?.longitude) {
    latitude = parseFloat(event.place.geo.latitude);
    longitude = parseFloat(event.place.geo.longitude);
  } else if (event.place?.location?.latitude && event.place?.location?.longitude) {
    latitude = parseFloat(event.place.location.latitude);
    longitude = parseFloat(event.place.location.longitude);
  }
  
  // Ensure venue_name is never null (database constraint)
  // If we can't find venue, use a fallback from location or event name
  if (!venueName) {
    if (firstVenue?.city?.name || event.place?.city?.name) {
      venueName = (firstVenue?.city?.name || event.place?.city?.name) + ' Venue';
    } else if (event.name) {
      // Try to extract venue from event name as last resort
      const atMatch = event.name.match(/.+?\s+at\s+(.+)$/i);
      if (atMatch && atMatch[1]) {
        venueName = atMatch[1].trim();
      } else {
        venueName = 'Venue TBD';
      }
    } else {
      venueName = 'Venue TBD';
    }
    console.warn(`⚠️ No venue name extracted from event: "${event.name}" - Using fallback: "${venueName}"`);
  }
  
  // Log venue extraction for debugging (only in verbose mode)
  // Removed verbose logging to speed up batch processing
  
  // Ensure event_date is valid (required field)
  if (!eventDateTime) {
    console.error(`❌ No event date found for event: "${event.name}"`);
    // Set to tomorrow as fallback to avoid constraint violation
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    eventDateTime = tomorrow.toISOString();
  }
  
  // Ensure title is valid (required field)
  const eventTitle = event.name || `${artistName} Live` || 'Event';
  
  return {
    source: 'ticketmaster',
    ticketmaster_event_id: event.id,
    title: eventTitle,
    artist_name: artistName,
    artist_id: firstAttraction?.id || null,
    venue_name: venueName,
    venue_id: null, // Set to null to avoid UUID conflict
    event_date: eventDateTime,
    doors_time: doorTime,
    description: event.info || event.pleaseNote || (artistName ? `Live performance by ${artistName}` : null),
    genres: extractGenres(event),
    venue_address: firstVenue?.address?.line1 || event.place?.address?.line1 || null,
    venue_city: firstVenue?.city?.name || event.place?.city?.name || null,
    venue_state: firstVenue?.state?.stateCode || event.place?.state?.stateCode || null,
    venue_zip: firstVenue?.postalCode || event.place?.postalCode || null,
    venue_timezone: firstVenue?.timezone || event.place?.timezone || null,
    latitude: latitude,
    longitude: longitude,
    ticket_available: event.dates?.status?.code === 'onsale',
    event_status: mapTicketmasterStatus(event.dates?.status?.code),
    price_min: priceRange?.min || null,
    price_max: priceRange?.max || null,
    price_currency: priceRange?.currency || 'USD',
    // Always set price_range - formatted from price_min/price_max for display consistency
    // If priceRangeString wasn't set above, derive it from min/max now
    price_range: priceRangeString || (priceRange?.min || priceRange?.max 
      ? (priceRange.min && priceRange.max && priceRange.min !== priceRange.max
          ? `$${priceRange.min} - $${priceRange.max}`
          : priceRange.min 
            ? `$${priceRange.min}${priceRange.max ? '+' : ''}`
            : `Up to $${priceRange.max}`)
      : null),
    external_url: event.url || null,
    ticket_urls: event.url ? [event.url] : [],
    attraction_ids: event._embedded?.attractions?.map(a => a.id) || [],
    classifications: event.classifications || [],
    sales_info: {
      public: event.sales?.public || null,
      presales: event.sales?.presales || []
    },
    images: event.images || [],
    tour_name: null,
    setlist: null
  };
  // Note: created_at and updated_at excluded - DB sets timestamps automatically
}

// GET /api/ticketmaster/events - Event search endpoint
router.get('/api/ticketmaster/events', async (req, res) => {
  try {
    const params = new URLSearchParams();
    params.append('apikey', TICKETMASTER_API_KEY);
    
    // Map query parameters
    // NOTE: If latlong is provided, Ticketmaster API may return global results
    // We'll filter by distance on backend, but also try to use geoPoint if available
    if (req.query.keyword) params.append('keyword', req.query.keyword);
    if (req.query.city) params.append('city', req.query.city);
    if (req.query.stateCode) params.append('stateCode', req.query.stateCode);
    if (req.query.countryCode) params.append('countryCode', req.query.countryCode);
    if (req.query.postalCode) params.append('postalCode', req.query.postalCode);
    
    // Location-based search - Use geoPoint (geohash) for better results
    // geoPoint is preferred over deprecated latlong parameter
    if (req.query.latlong) {
      const [lat, lng] = req.query.latlong.split(',').map(Number);
      
      // Convert coordinates to geohash (geoPoint parameter)
      // Using precision 7 for ~150m accuracy (good for city-level searches)
      const geohash = ngeohash.encode(lat, lng, 7);
      params.append('geoPoint', geohash);
      console.log(`\n🔵 NEW CODE RUNNING: Converted (${lat}, ${lng}) to geoPoint: ${geohash}`);
      
      // Also include latlong for backwards compatibility
      params.append('latlong', req.query.latlong);
      
      // Try to infer countryCode from coordinates if not provided
      // Amsterdam is in Netherlands (NL)
      if (!req.query.countryCode && !req.query.city) {
        // Rough check for Netherlands/Europe region
        if (lat >= 50 && lat <= 54 && lng >= 3 && lng <= 7) {
          params.append('countryCode', 'NL');
          console.log('📍 Inferred countryCode=NL for Amsterdam region');
        }
      }
    }
    if (req.query.radius) params.append('radius', req.query.radius);
    if (req.query.unit) params.append('unit', req.query.unit);
    if (req.query.classificationName) params.append('classificationName', req.query.classificationName);
    if (req.query.startDateTime) params.append('startDateTime', req.query.startDateTime);
    if (req.query.endDateTime) params.append('endDateTime', req.query.endDateTime);
    if (req.query.size) params.append('size', req.query.size);
    if (req.query.page) params.append('page', req.query.page);
    if (req.query.sort) params.append('sort', req.query.sort);
    
    const url = `${TICKETMASTER_BASE_URL}/events.json?${params.toString()}`;
    const actualTicketmasterUrl = url;
    const geoPointValue = req.query.latlong ? ngeohash.encode(...req.query.latlong.split(',').map(Number), 7) : 'N/A';
    const countryCodeValue = params.get('countryCode') || 'NOT SET';
    
    console.log('\n🔵🔵🔵 BACKEND CODE RUNNING 🔵🔵🔵');
    console.log('🎫 Calling Ticketmaster API:', actualTicketmasterUrl);
    console.log('🔵 Query params breakdown:');
    console.log('  - geoPoint:', geoPointValue);
    console.log('  - countryCode:', countryCodeValue);
    console.log('  - latlong:', req.query.latlong || 'N/A');
    console.log('  - radius:', req.query.radius || 'N/A');
    console.log('  - Full URL params:', params.toString());
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('❌ Ticketmaster API error:', response.status);
      return res.status(response.status).json({
        success: false,
        error: 'Ticketmaster API error'
      });
    }
    
    const data = await response.json();
    const allEvents = data._embedded?.events || [];
    console.log(`\n🔵 NEW CODE: Received ${allEvents.length} events from Ticketmaster API`);
    
    // Log sample of what Ticketmaster returned
    if (allEvents.length > 0) {
      console.log(`🔵 Sample events from Ticketmaster API:`);
      allEvents.slice(0, 3).forEach((event, i) => {
        const venue = event._embedded?.venues?.[0];
        const venueCity = venue?.city?.name || 'unknown';
        const venueLat = venue?.location?.latitude;
        const venueLng = venue?.location?.longitude;
        console.log(`  ${i + 1}. "${event.name}" in ${venueCity} at (${venueLat}, ${venueLng})`);
      });
    }
    
    // Filter out past events - only keep future events
    const now = new Date();
    const futureEvents = allEvents.filter(event => {
      const eventDate = event.dates?.start?.localDate || event.dates?.start?.dateTime;
      if (!eventDate) return false;
      return new Date(eventDate) >= now;
    });
    
    console.log(`🔵 Filtered to ${futureEvents.length} future events (removed ${allEvents.length - futureEvents.length} past events)`);
    
    // Filter events by location if latlong and radius are provided
    let locationFilteredEvents = futureEvents;
    if (req.query.latlong && req.query.radius) {
      const [lat, lng] = req.query.latlong.split(',').map(Number);
      const radius = parseFloat(req.query.radius);
      const unit = req.query.unit || 'miles';
      
      console.log(`\n🔵 NEW CODE RUNNING: Filtering by location: ${lat}, ${lng} within ${radius} ${unit}`);
      
      locationFilteredEvents = futureEvents.filter(event => {
        const venue = event._embedded?.venues?.[0];
        const eventLat = venue?.location?.latitude ? parseFloat(venue.location.latitude) : null;
        const eventLng = venue?.location?.longitude ? parseFloat(venue.location.longitude) : null;
        
        if (!eventLat || !eventLng) {
          console.log(`⚠️ Event "${event.name}" has no coordinates, skipping`);
          return false;
        }
        
        // Calculate distance using Haversine formula
        const R = unit === 'km' ? 6371 : 3959; // Earth's radius in km or miles
        const dLat = (eventLat - lat) * Math.PI / 180;
        const dLng = (eventLng - lng) * Math.PI / 180;
        const a = 
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat * Math.PI / 180) * Math.cos(eventLat * Math.PI / 180) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        
        if (distance > radius) {
          console.log(`❌ Event "${event.name}" in ${venue?.city?.name || 'unknown'} is ${distance.toFixed(1)} ${unit} away (limit: ${radius} ${unit}), skipping`);
          return false;
        }
        
        return true;
      });
      
      console.log(`📍 Location filtered to ${locationFilteredEvents.length} events within ${radius} ${unit} (removed ${futureEvents.length - locationFilteredEvents.length} events outside radius)`);
      
      // Log a few examples of events that were kept
      if (locationFilteredEvents.length > 0) {
        console.log(`📍 Sample events that PASSED location filter (within ${radius} ${unit}):`);
        locationFilteredEvents.slice(0, 3).forEach((event, i) => {
          const venue = event._embedded?.venues?.[0];
          const eventLat = venue?.location?.latitude ? parseFloat(venue.location.latitude) : null;
          const eventLng = venue?.location?.longitude ? parseFloat(venue.location.longitude) : null;
          if (eventLat && eventLng) {
            // Calculate distance
            const R = unit === 'km' ? 6371 : 3959;
            const dLat = (eventLat - lat) * Math.PI / 180;
            const dLng = (eventLng - lng) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat * Math.PI / 180) * Math.cos(eventLat * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distance = R * c;
            console.log(`  ${i + 1}. "${event.name}" in ${venue?.city?.name || 'unknown'} at (${eventLat}, ${eventLng}) - ${distance.toFixed(1)} ${unit} away`);
          }
        });
      } else {
        console.warn(`⚠️ NO events passed location filter! All ${futureEvents.length} events were outside ${radius} ${unit} radius.`);
      }
    }
    
    const transformedEvents = locationFilteredEvents.map(transformTicketmasterEvent);
    
    console.log(`🎨 Transformed ${transformedEvents.length} events`);
    if (transformedEvents.length > 0) {
      console.log(`🎨 First event artist: ${transformedEvents[0]?.artist_name}`);
      console.log(`🎨 First event city: ${transformedEvents[0]?.venue_city}`);
      console.log(`🎨 First event coords: ${transformedEvents[0]?.latitude}, ${transformedEvents[0]?.longitude}`);
      console.log(`🎨 First event source: ${transformedEvents[0]?.source}`);
    }
    
    // Store in database
    let insertedData = null;
    if (transformedEvents.length > 0) {
      try {
        // Remove 'id' and 'venue_id' fields to avoid UUID conflicts
        // Also set artist_id to null to avoid trigger errors (Ticketmaster IDs aren't in our artists table)
        const eventsToInsert = transformedEvents.map(event => {
          const { id, venue_id, artist_id, ...eventWithoutIds } = event;
          // Ensure venue_id and artist_id are explicitly null
          // This prevents database triggers from trying to look up artists/venues that don't exist
          eventWithoutIds.venue_id = null;
          eventWithoutIds.artist_id = null;
          return eventWithoutIds;
        });
        
        console.log('💾 Attempting to insert events:', eventsToInsert.length);
        if (eventsToInsert.length > 0) {
          console.log('💾 Sample event (first 500 chars):', JSON.stringify(eventsToInsert[0], null, 2).substring(0, 500));
          console.log('💾 Sample event_date format:', eventsToInsert[0]?.event_date);
          console.log('💾 Sample event required fields check:');
          console.log('  - title:', !!eventsToInsert[0]?.title, eventsToInsert[0]?.title || 'MISSING');
          console.log('  - artist_name:', !!eventsToInsert[0]?.artist_name, eventsToInsert[0]?.artist_name || 'MISSING');
          console.log('  - venue_name:', !!eventsToInsert[0]?.venue_name, eventsToInsert[0]?.venue_name || 'MISSING');
          console.log('  - event_date:', !!eventsToInsert[0]?.event_date, eventsToInsert[0]?.event_date || 'MISSING');
          console.log('  - ticketmaster_event_id:', !!eventsToInsert[0]?.ticketmaster_event_id, eventsToInsert[0]?.ticketmaster_event_id || 'MISSING');
          
          // Validate required fields before insertion
          const requiredFields = ['title', 'artist_name', 'venue_name', 'event_date', 'ticketmaster_event_id'];
          const missingFields = requiredFields.filter(field => !eventsToInsert[0]?.[field]);
          if (missingFields.length > 0) {
            console.error('  ❌ MISSING REQUIRED FIELDS:', missingFields);
          } else {
            console.log('  ✅ All required fields present');
          }
        }
        
        
        // Note: Artist profile upsert skipped for Ticketmaster events - table schema requires jambase_artist_id
        // Events will still be stored without populating artist_profile
        
        // Remove created_at and updated_at - let database handle timestamps
        const eventsToInsertClean = eventsToInsert.map(event => {
          const { created_at, updated_at, ...cleanEvent } = event;
          return cleanEvent;
        });
        
        // Upsert events - ticketmaster_event_id handles deduplication automatically
        // Only NEW events will be inserted, existing ones will be updated
        // Note: We're inserting in batches to avoid trigger errors
        console.log('💾 Calling Supabase upsert with', eventsToInsertClean.length, 'events...');
        
        // Try inserting in smaller batches to isolate any trigger issues
        const batchSize = 50;
        let allInsertedData = [];
        let hadErrors = false;
        
        for (let i = 0; i < eventsToInsertClean.length; i += batchSize) {
          const batch = eventsToInsertClean.slice(i, i + batchSize);
          console.log(`💾 Inserting batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(eventsToInsertClean.length/batchSize)} (${batch.length} events)...`);
          
          const { data, error: insertError } = await supabase
            .from('jambase_events')
            .upsert(batch, {
              onConflict: 'ticketmaster_event_id',
              ignoreDuplicates: false
            })
            .select();
          
          if (insertError) {
            console.error(`❌ DATABASE INSERT ERROR in batch ${Math.floor(i/batchSize) + 1}:`, insertError);
            console.error('❌ Error code:', insertError.code);
            console.error('❌ Error message:', insertError.message);
            hadErrors = true;
            
            // Log the error but continue - batch processing should handle partial failures
            console.warn(`⚠️  Batch ${Math.floor(i/batchSize) + 1} had errors, but some events may have been inserted`);
          } else {
            if (data && data.length > 0) {
              allInsertedData = allInsertedData.concat(data);
              console.log(`✅ Batch ${Math.floor(i/batchSize) + 1} inserted: ${data.length} events`);
            }
          }
        }
        
        insertedData = allInsertedData.length > 0 ? allInsertedData : null;
        
        if (insertedData && insertedData.length > 0) {
          const newEventCount = insertedData.filter(e => {
            if (!e.updated_at) return true;
            const updated = new Date(e.updated_at).getTime();
            const now = Date.now();
            return (now - updated) < 10000; // Within last 10 seconds
          }).length || 0;
          console.log(`✅ Successfully stored ${insertedData.length} events in database (${newEventCount} new, ${insertedData.length - newEventCount} updated)`);
          
          // Log sample events to verify coordinates
          if (insertedData && insertedData.length > 0) {
            console.log(`📍 First 3 events stored:`);
            insertedData.slice(0, 3).forEach((event, i) => {
              const distance = req.query.latlong ? (() => {
                const [lat, lng] = req.query.latlong.split(',').map(Number);
                const R = 3959;
                const dLat = (Number(event.latitude) - lat) * Math.PI / 180;
                const dLng = (Number(event.longitude) - lng) * Math.PI / 180;
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat * Math.PI / 180) * Math.cos(Number(event.latitude) * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                return (R * c).toFixed(1);
              })() : 'N/A';
              console.log(`  ${i + 1}. ${event.title} in ${event.venue_city} at (${event.latitude}, ${event.longitude}) [${distance} miles]`);
            });
          } else {
            console.warn('⚠️  Upsert succeeded but returned no data');
          }
        }
      } catch (dbError) {
        console.error('⚠️  Database error:', dbError);
      }
    }
    
    // Return events with database UUIDs (from insertedData) or transformed events as fallback
    // Map insertedData back to transformed events format by matching ticketmaster_event_id
    const eventsWithUuids = transformedEvents.map(transformedEvent => {
      if (insertedData && insertedData.length > 0) {
        const dbEvent = insertedData.find(db => db.ticketmaster_event_id === transformedEvent.ticketmaster_event_id);
        if (dbEvent) {
          // Merge the database UUID (id) into the transformed event
          return {
            ...transformedEvent,
            id: dbEvent.id, // This is the database UUID
            jambase_event_id: dbEvent.jambase_event_id || dbEvent.id
          };
        }
      }
      return transformedEvent;
    });
    
    // Include debug info in response - calculate at the right scope
    let debugLocationFiltered = 'N/A';
    if (req.query.latlong && req.query.radius && typeof locationFilteredEvents !== 'undefined') {
      debugLocationFiltered = locationFilteredEvents.length;
    }
    
    const debugInfo = {
      apiUrlCalled: actualTicketmasterUrl,
      totalEventsReceived: allEvents ? allEvents.length : 0,
      futureEvents: futureEvents ? futureEvents.length : 0,
      locationFilteredEvents: debugLocationFiltered,
      eventsStored: insertedData ? insertedData.length : 0,
      actualTicketmasterUrl: actualTicketmasterUrl,
      geoPoint: geoPointValue,
      countryCode: countryCodeValue,
      latlong: req.query.latlong || 'N/A',
      radius: req.query.radius || 'N/A',
      queryParams: Array.from(params.entries()),
      ticketmasterTotalReturned: data.page?.totalElements || 'N/A'
    };
    
    // ALWAYS include debug - this proves new code is running
    const responseData = {
      success: true,
      events: eventsWithUuids,
      total: data.page?.totalElements || eventsWithUuids.length,
      page: data.page?.number || 0,
      size: data.page?.size || eventsWithUuids.length,
      debug: debugInfo
    };
    
    console.log('\n🔵🔵🔵 SENDING RESPONSE WITH DEBUG 🔵🔵🔵');
    console.log('Debug info:', JSON.stringify(debugInfo, null, 2));
    
    res.json(responseData);
  } catch (error) {
    console.error('❌ Ticketmaster API error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// GET /api/ticketmaster/attractions - Attraction (artist) search endpoint
router.get('/api/ticketmaster/attractions', async (req, res) => {
  try {
    const params = new URLSearchParams();
    params.append('apikey', TICKETMASTER_API_KEY);
    
    if (req.query.keyword) params.append('keyword', req.query.keyword);
    if (req.query.classificationName) params.append('classificationName', req.query.classificationName);
    if (req.query.size) params.append('size', req.query.size);
    if (req.query.page) params.append('page', req.query.page);
    
    const url = `${TICKETMASTER_BASE_URL}/attractions.json?${params.toString()}`;
    console.log('🎯 Calling Ticketmaster Attractions API:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: 'Ticketmaster API error'
      });
    }
    
    const data = await response.json();
    const attractions = data._embedded?.attractions || [];
    
    res.json({
      success: true,
      attractions: attractions,
      total: data.page?.totalElements || attractions.length
    });
    
  } catch (error) {
    console.error('❌ Ticketmaster Attractions API error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/ticketmaster/venues - Venue search endpoint
router.get('/api/ticketmaster/venues', async (req, res) => {
  try {
    const params = new URLSearchParams();
    params.append('apikey', TICKETMASTER_API_KEY);
    
    if (req.query.keyword) params.append('keyword', req.query.keyword);
    if (req.query.city) params.append('city', req.query.city);
    if (req.query.stateCode) params.append('stateCode', req.query.stateCode);
    if (req.query.countryCode) params.append('countryCode', req.query.countryCode);
    if (req.query.size) params.append('size', req.query.size);
    if (req.query.page) params.append('page', req.query.page);
    
    const url = `${TICKETMASTER_BASE_URL}/venues.json?${params.toString()}`;
    console.log('🏢 Calling Ticketmaster Venues API:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: 'Ticketmaster API error'
      });
    }
    
    const data = await response.json();
    const venues = data._embedded?.venues || [];
    
    res.json({
      success: true,
      venues: venues,
      total: data.page?.totalElements || venues.length
    });
    
  } catch (error) {
    console.error('❌ Ticketmaster Venues API error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
module.exports.transformTicketmasterEvent = transformTicketmasterEvent;
module.exports.mapTicketmasterStatus = mapTicketmasterStatus;
