// Vercel API route for JamBase events
import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL || 'https://glpiolbrafqikqhnseto.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjkzNzgyNCwiZXhwIjoyMDcyNTEzODI0fQ.cS0y6dQiw2VvGD7tKfKADKqM8whaopJ716G4dexBRGI';
const supabase = createClient(supabaseUrl, supabaseKey);

// Utility function to normalize strings for better searching
const normalizeString = (str) => {
  if (!str) return '';
  return str.toLowerCase().trim().replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ');
};

// Fetch events from JamBase API
async function fetchFromJamBase(query, options = {}) {
  try {
    const JAMBASE_API_KEY = process.env.JAMBASE_API_KEY || 'e7ed3a9b-e73a-446e-b7c6-a96d1c53a030';
    
    // Use correct JamBase API endpoint
    const baseUrl = `https://www.jambase.com/jb-api/v1/events`;
    
    // Build search parameters
    const params = new URLSearchParams();
    params.append('apikey', JAMBASE_API_KEY);
    
    // Add artist search if query is provided
    if (query) {
      params.append('artistName', query);
    }
    
    // Add other parameters
    if (options.eventType) {
      params.append('eventType', options.eventType);
    }
    if (options.page) {
      params.append('page', options.page.toString());
    }
    if (options.perPage) {
      params.append('perPage', options.perPage.toString());
    }
    
    // Add geo parameters for better results
    params.append('geoRadiusUnits', 'mi');
    
    const endpoint = `${baseUrl}?${params.toString()}`;

    console.log('Calling JamBase API:', endpoint);
    
    const response = await fetch(endpoint);
    
    if (!response.ok) {
      console.log(`JamBase API failed with status: ${response.status}`);
      return [];
    }

    const responseText = await response.text();
    console.log('Response length:', responseText.length);
    
    if (!responseText || responseText.length === 0) {
      console.log('Empty response from JamBase API');
      return [];
    }

    const data = JSON.parse(responseText);
    console.log('Parsed response keys:', Object.keys(data));
    
    // Handle JamBase API response format
    let events = [];
    if (Array.isArray(data)) {
      events = data;
    } else if (data.events && Array.isArray(data.events)) {
      events = data.events;
    } else if (data.data && Array.isArray(data.data)) {
      events = data.data;
    } else if (data.results && Array.isArray(data.results)) {
      events = data.results;
    }

    console.log(`Found ${events.length} events from JamBase API`);
    return events;

  } catch (error) {
    console.error('Error fetching from JamBase API:', error);
    return [];
  }
}

// Transform JamBase event to our database format
function transformJamBaseEvent(event) {
  // Extract event ID
  const eventId = event.identifier?.replace('jambase:', '') || 
                 event.id || 
                 event['@id']?.replace('jambase:', '') || 
                 `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Extract event name
  const eventName = event.name || 
                   event.title || 
                   event.headline || 
                   'Untitled Event';
  
  // Extract artist information
  let artistName = 'Unknown Artist';
  let artistId = '';
  
  if (event.performer && Array.isArray(event.performer) && event.performer.length > 0) {
    artistName = event.performer[0].name || event.performer[0].title || 'Unknown Artist';
    artistId = event.performer[0].identifier?.replace('jambase:', '') || 
              event.performer[0]['@id']?.replace('jambase:', '') || '';
  } else if (event.artist_name) {
    artistName = event.artist_name;
    artistId = event.artist_id || '';
  }
  
  // Extract venue information
  let venueName = 'Unknown Venue';
  let venueId = '';
  let venueAddress = null;
  let venueCity = null;
  let venueState = null;
  let venueZip = null;
  let latitude = null;
  let longitude = null;
  
  if (event.location) {
    venueName = event.location.name || event.location.title || 'Unknown Venue';
    venueId = event.location.identifier?.replace('jambase:', '') || 
             event.location['@id']?.replace('jambase:', '') || '';
    
    if (event.location.address) {
      venueAddress = event.location.address.streetAddress || event.location.address.address || null;
      venueCity = event.location.address.addressLocality || event.location.address.city || null;
      venueState = event.location.address.addressRegion || event.location.address.state || null;
      venueZip = event.location.address.postalCode || event.location.address.zip || null;
    }
    
    if (event.location.geo) {
      latitude = event.location.geo.latitude || null;
      longitude = event.location.geo.longitude || null;
    }
  } else if (event.venue_name) {
    venueName = event.venue_name;
    venueId = event.venue_id || '';
    venueAddress = event.venue_address || null;
    venueCity = event.venue_city || null;
    venueState = event.venue_state || null;
    venueZip = event.venue_zip || null;
    latitude = event.latitude || null;
    longitude = event.longitude || null;
  }
  
  // Extract event date
  const eventDate = event.startDate || 
                   event.event_date || 
                   event.datePublished || 
                   event.start_time ||
                   new Date().toISOString();
  
  // Extract genres
  let genres = [];
  if (event.genre && Array.isArray(event.genre)) {
    genres = event.genre;
  } else if (event.genres && Array.isArray(event.genres)) {
    genres = event.genres;
  } else if (event.genre && typeof event.genre === 'string') {
    genres = [event.genre];
  }
  
  // Extract ticket information
  let ticketAvailable = false;
  let priceRange = null;
  let ticketUrls = [];
  
  if (event.offers && Array.isArray(event.offers)) {
    ticketAvailable = event.offers.some((offer) => offer.availability === 'InStock' || offer.availability === 'InStock');
    priceRange = event.offers.map((offer) => offer.price).filter(Boolean).join(' - ') || null;
    ticketUrls = event.offers.map((offer) => offer.url).filter(Boolean);
  } else if (event.ticket_available !== undefined) {
    ticketAvailable = event.ticket_available;
    priceRange = event.price_range || null;
    ticketUrls = event.ticket_urls || [];
  }
  
  return {
    jambase_event_id: eventId,
    title: eventName,
    artist_name: artistName,
    artist_id: artistId,
    venue_name: venueName,
    venue_id: venueId,
    event_date: eventDate,
    doors_time: event.doorTime || event.doorsTime || event.doors_time || null,
    description: event.description || null,
    genres: genres,
    venue_address: venueAddress,
    venue_city: venueCity,
    venue_state: venueState,
    venue_zip: venueZip,
    latitude: latitude,
    longitude: longitude,
    ticket_available: ticketAvailable,
    price_range: priceRange,
    ticket_urls: ticketUrls,
    setlist: event.setlist || null,
    tour_name: event.tour?.name || event.tour_name || null
  };
}

// Store events in Supabase database
async function storeEventsInDatabase(events) {
  try {
    if (events.length === 0) return [];

    const transformedEvents = events.map(transformJamBaseEvent);
    
    console.log('Storing events in database...');
    
    const { data, error } = await supabase
      .from('jambase_events')
      .upsert(transformedEvents, { 
        onConflict: 'jambase_event_id',
        ignoreDuplicates: false 
      })
      .select();

    if (error) {
      console.error('Error storing events:', error);
      return [];
    }

    console.log(`Successfully stored ${data.length} events in database`);
    return data;

  } catch (error) {
    console.error('Error in storeEventsInDatabase:', error);
    return [];
  }
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Add timeout protection
  const timeoutId = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: 'Request timeout' });
    }
  }, 25000); // 25 second timeout (less than Vercel's 30s limit)

  try {
    const { 
      artistName, 
      artistId, 
      venueName, 
      eventDateFrom, 
      eventDateTo, 
      eventType = 'concerts',
      page = 1, 
      perPage = 20 
    } = req.query;

    console.log('JamBase Events API request:', {
      artistName,
      artistId,
      venueName,
      eventDateFrom,
      eventDateTo,
      page,
      perPage
    });

    // First, try to get events from database
    let query = supabase
      .from('jambase_events')
      .select('*', { count: 'exact' });

    // Apply filters
    if (artistName) {
      // Try multiple matching strategies for better artist name matching
      const searchTerms = [
        artistName,
        artistName.replace(/'/g, "'"), // Try different apostrophe types
        artistName.replace(/'/g, "'"),
        artistName.replace(/['']/g, '') // Try without apostrophes
      ];
      
      // Create OR conditions for all search terms
      const orConditions = searchTerms.map(term => 
        `artist_name.ilike.%${term}%`
      ).join(',');
      
      query = query.or(orConditions);
    }

    if (venueName) {
      query = query.ilike('venue_name', `%${venueName}%`);
    }

    if (eventDateFrom) {
      query = query.gte('event_date', eventDateFrom);
    }

    if (eventDateTo) {
      query = query.lte('event_date', eventDateTo);
    }

    // Apply pagination
    const offset = (parseInt(page) - 1) * parseInt(perPage);
    query = query.range(offset, offset + parseInt(perPage) - 1);

    // Order by date
    query = query.order('event_date', { ascending: true });

    const { data: dbEvents, error: dbError, count } = await query;

    if (dbError) {
      console.error('Database query error:', dbError);
      throw dbError;
    }

    // If we have events in database, return them
    if (dbEvents && dbEvents.length > 0) {
      console.log(`Found ${dbEvents.length} events in database`);
      return res.status(200).json({
        success: true,
        events: dbEvents,
        total: count || dbEvents.length,
        page: parseInt(page),
        perPage: parseInt(perPage),
        hasNextPage: (offset + parseInt(perPage)) < (count || 0),
        hasPreviousPage: parseInt(page) > 1,
        source: 'database'
      });
    }

    // If no database results, fetch from JamBase API
    console.log('No database results, fetching from JamBase API...');
    
    const apiEvents = await fetchFromJamBase(artistName, {
      eventType,
      page,
      perPage
    });

    if (apiEvents.length > 0) {
      // Store events in database
      const storedEvents = await storeEventsInDatabase(apiEvents);
      
      return res.status(200).json({
        success: true,
        events: storedEvents,
        total: storedEvents.length,
        page: parseInt(page),
        perPage: parseInt(perPage),
        hasNextPage: false,
        hasPreviousPage: false,
        source: 'api'
      });
    }

    // No events found
    return res.status(200).json({
      success: true,
      events: [],
      total: 0,
      page: parseInt(page),
      perPage: parseInt(perPage),
      hasNextPage: false,
      hasPreviousPage: false,
      source: 'none'
    });

  } catch (error) {
    console.error('Error in JamBase events API:', error);
    clearTimeout(timeoutId);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      events: [],
      total: 0,
      page: 1,
      perPage: 20,
      hasNextPage: false,
      hasPreviousPage: false
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
