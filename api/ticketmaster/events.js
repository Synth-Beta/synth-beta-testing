// Vercel serverless function for Ticketmaster events API
// This file should be in api/ticketmaster/events.js to be accessible at /api/ticketmaster/events
const { createClient } = require('@supabase/supabase-js');
const ngeohash = require('ngeohash');

// Import genre mapping from backend (copy needed logic)
function extractGenres(ticketmasterEvent) {
  const genres = [];
  if (ticketmasterEvent.classifications && Array.isArray(ticketmasterEvent.classifications)) {
    for (const classification of ticketmasterEvent.classifications) {
      if (classification.genre?.name) {
        const genre = classification.genre.name;
        if (genre && !genres.includes(genre)) {
          genres.push(genre);
        }
      }
    }
  }
  return genres.length > 0 ? genres : ['Other'];
}

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

function transformTicketmasterEvent(event) {
  const firstAttraction = event._embedded?.attractions?.[0];
  let firstVenue = event._embedded?.venues?.[0];
  
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
  
  let venueName = firstVenue?.name;
  if (!venueName) {
    const eventName = event.name || '';
    const atMatch = eventName.match(/.+?\s+at\s+(.+)$/i);
    if (atMatch && atMatch[1]) {
      venueName = atMatch[1].trim();
    } else if (event.place?.name) {
      venueName = event.place.name;
    }
  }
  
  if (!venueName) {
    if (firstVenue?.city?.name || event.place?.city?.name) {
      venueName = (firstVenue?.city?.name || event.place?.city?.name) + ' Venue';
    } else {
      venueName = 'Venue TBD';
    }
  }
  
  let eventDateTime;
  if (event.dates?.start?.localDate && event.dates?.start?.localTime) {
    eventDateTime = `${event.dates.start.localDate}T${event.dates.start.localTime}`;
  } else if (event.dates?.start?.localDate) {
    eventDateTime = event.dates.start.localDate;
  } else {
    eventDateTime = event.dates?.start?.dateTime || event.dates?.start?.localDate;
  }
  
  if (!eventDateTime) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    eventDateTime = tomorrow.toISOString();
  }
  
  let artistName = firstAttraction?.name;
  if (!artistName) {
    const eventName = event.name || '';
    if (eventName.includes(' - ')) {
      const parts = eventName.split(' - ');
      const lastPart = parts[parts.length - 1].trim();
      if (lastPart && !lastPart.toLowerCase().includes('ticket')) {
        artistName = lastPart;
      }
    }
    
    if (!artistName) {
      const match = eventName.match(/^(.+?)\s+at\s+.+$/i);
      if (match && match[1]) {
        artistName = match[1].trim();
      }
    }
    
    if (!artistName) {
      artistName = eventName.trim();
    }
  }
  
  if (artistName?.toLowerCase().includes('tribute') || artistName?.toLowerCase().includes('cover')) {
    artistName = null;
  }
  
  artistName = artistName || event.name || 'Unknown Artist';
  
  const priceRange = event.priceRanges?.[0];
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
  
  let latitude = null;
  let longitude = null;
  if (firstVenue?.location?.latitude && firstVenue?.location?.longitude) {
    latitude = parseFloat(firstVenue.location.latitude);
    longitude = parseFloat(firstVenue.location.longitude);
  } else if (event.place?.geo?.latitude && event.place?.geo?.longitude) {
    latitude = parseFloat(event.place.geo.latitude);
    longitude = parseFloat(event.place.geo.longitude);
  }
  
  const eventTitle = event.name || `${artistName} Live` || 'Event';
  
  return {
    source: 'ticketmaster',
    ticketmaster_event_id: event.id,
    title: eventTitle,
    artist_name: artistName,
    artist_id: firstAttraction?.id || null,
    venue_name: venueName,
    venue_id: null,
    event_date: eventDateTime,
    doors_time: event.dates?.doorTime || null,
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
}

module.exports = async (req, res) => {
  // Handle CORS
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://synth-beta-testing.vercel.app',
    'https://synth-beta-testing-main.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:8080'
  ];
  
  if (origin && (allowedOrigins.includes(origin) || origin.includes('vercel.app'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }
  
  try {
    console.log('Ticketmaster API function invoked with query:', req.query);
    // Supabase configuration
    const supabaseUrl = process.env.SUPABASE_URL || 'https://glpiolbrafqikqhnseto.supabase.co';
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjkzNzgyNCwiZXhwIjoyMDcyNTEzODI0fQ.cS0y6dQiw2VvGD7tKfKADKqM8whaopJ716G4dexBRGI';
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Ticketmaster API configuration
    const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY || 'rM94dPPl7ne1EAkGeZBEq5AH7zLvCAVA';
    const TICKETMASTER_BASE_URL = 'https://app.ticketmaster.com/discovery/v2';
    
    const params = new URLSearchParams();
    params.append('apikey', TICKETMASTER_API_KEY);
    
    if (req.query.keyword) params.append('keyword', req.query.keyword);
    if (req.query.city) params.append('city', req.query.city);
    if (req.query.stateCode) params.append('stateCode', req.query.stateCode);
    if (req.query.countryCode) params.append('countryCode', req.query.countryCode);
    if (req.query.postalCode) params.append('postalCode', req.query.postalCode);
    
    if (req.query.latlong) {
      const [lat, lng] = req.query.latlong.split(',').map(Number);
      const geohash = ngeohash.encode(lat, lng, 7);
      params.append('geoPoint', geohash);
      params.append('latlong', req.query.latlong);
      
      if (!req.query.countryCode && !req.query.city) {
        if (lat >= 50 && lat <= 54 && lng >= 3 && lng <= 7) {
          params.append('countryCode', 'NL');
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
    console.log('Calling Ticketmaster API:', url.replace(TICKETMASTER_API_KEY, '***'));
    
    let response;
    try {
      response = await fetch(url);
    } catch (fetchError) {
      console.error('Fetch error:', fetchError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch from Ticketmaster API',
        details: fetchError.message
      });
    }
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('Ticketmaster API error:', response.status, errorText);
      return res.status(response.status).json({
        success: false,
        error: `Ticketmaster API error: ${response.status} ${response.statusText}`,
        details: errorText.substring(0, 500)
      });
    }
    
    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      console.error('JSON parse error:', jsonError);
      return res.status(500).json({
        success: false,
        error: 'Failed to parse Ticketmaster API response',
        details: jsonError.message
      });
    }
    // Check if Ticketmaster returned an error in the response
    if (data.errors && data.errors.length > 0) {
      console.error('Ticketmaster API returned errors:', data.errors);
      return res.status(400).json({
        success: false,
        error: 'Ticketmaster API returned errors',
        details: data.errors
      });
    }
    
    const allEvents = data._embedded?.events || [];
    console.log(`Ticketmaster returned ${allEvents.length} total events`);
    
    // Filter out past events
    const now = new Date();
    const futureEvents = allEvents.filter(event => {
      const eventDate = event.dates?.start?.localDate || event.dates?.start?.dateTime;
      if (!eventDate) return false;
      return new Date(eventDate) >= now;
    });
    console.log(`${futureEvents.length} events are in the future`);
    
    // Filter events by location if latlong and radius are provided
    let locationFilteredEvents = futureEvents;
    if (req.query.latlong && req.query.radius) {
      const [lat, lng] = req.query.latlong.split(',').map(Number);
      const radius = parseFloat(req.query.radius);
      const unit = req.query.unit || 'miles';
      
      locationFilteredEvents = futureEvents.filter(event => {
        const venue = event._embedded?.venues?.[0];
        const eventLat = venue?.location?.latitude ? parseFloat(venue.location.latitude) : null;
        const eventLng = venue?.location?.longitude ? parseFloat(venue.location.longitude) : null;
        
        if (!eventLat || !eventLng) return false;
        
        const R = unit === 'km' ? 6371 : 3959;
        const dLat = (eventLat - lat) * Math.PI / 180;
        const dLng = (eventLng - lng) * Math.PI / 180;
        const a = 
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat * Math.PI / 180) * Math.cos(eventLat * Math.PI / 180) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        
        return distance <= radius;
      });
    }
    
    const transformedEvents = locationFilteredEvents.map(transformTicketmasterEvent);
    
    // Store in database
    let insertedData = null;
    if (transformedEvents.length > 0) {
      try {
        const eventsToInsert = transformedEvents.map(event => {
          const { id, venue_id, artist_id, ...eventWithoutIds } = event;
          eventWithoutIds.venue_id = null;
          eventWithoutIds.artist_id = null;
          return eventWithoutIds;
        });
        
        const batchSize = 50;
        let allInsertedData = [];
        
        for (let i = 0; i < eventsToInsert.length; i += batchSize) {
          const batch = eventsToInsert.slice(i, i + batchSize);
          try {
            const { data, error } = await supabase
              .from('jambase_events')
              .upsert(batch, {
                onConflict: 'ticketmaster_event_id',
                ignoreDuplicates: false
              })
              .select();
            
            if (error) {
              console.error(`Database error on batch ${i / batchSize + 1}:`, error);
            } else if (data) {
              allInsertedData = allInsertedData.concat(data);
            }
          } catch (batchError) {
            console.error(`Error processing batch ${i / batchSize + 1}:`, batchError);
            // Continue with next batch even if this one fails
          }
        }
        
        insertedData = allInsertedData.length > 0 ? allInsertedData : null;
      } catch (dbError) {
        console.error('Database error:', dbError);
        // Don't fail the entire request if database insert fails - return events anyway
      }
    }
    
    // Map insertedData back to transformed events
    const eventsWithUuids = transformedEvents.map(transformedEvent => {
      if (insertedData && insertedData.length > 0) {
        const dbEvent = insertedData.find(db => db.ticketmaster_event_id === transformedEvent.ticketmaster_event_id);
        if (dbEvent) {
          return {
            ...transformedEvent,
            id: dbEvent.id,
            jambase_event_id: dbEvent.jambase_event_id || dbEvent.id
          };
        }
      }
      return transformedEvent;
    });
    
    res.json({
      success: true,
      events: eventsWithUuids,
      total: data.page?.totalElements || eventsWithUuids.length,
      page: data.page?.number || 0,
      size: data.page?.size || eventsWithUuids.length
    });
  } catch (error) {
    console.error('Ticketmaster API error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

