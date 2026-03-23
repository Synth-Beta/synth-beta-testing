// Location-based search routes for JamBase API integration
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { getSupabaseConfig, getApiKey, reportKeyFailure } = require('./config/apiKeys');
const { createRateLimiter } = require('./middleware/rateLimiter');
const { validateQuery } = require('./middleware/validateInput');
const { createSanitizationMiddleware } = require('./middleware/sanitizeInput');
const { jambaseLocationSearchGetQuerySchema } = require('./validation/schemas');

const router = express.Router();

// Initialize Supabase client using secure configuration
const supabaseConfig = getSupabaseConfig('anon', false); // Don't throw if missing
const supabase = supabaseConfig ? createClient(supabaseConfig.url, supabaseConfig.key) : null;

// Sanitization middleware
const sanitize = createSanitizationMiddleware({ sanitizeQuery: true, sanitizeBody: true });

// Major cities for location search
const CITY_COORDINATES = {
  'new york': { name: 'New York', lat: 40.7128, lng: -74.0060, state: 'NY' },
  'los angeles': { name: 'Los Angeles', lat: 34.0522, lng: -118.2437, state: 'CA' },
  'chicago': { name: 'Chicago', lat: 41.8781, lng: -87.6298, state: 'IL' },
  'houston': { name: 'Houston', lat: 29.7604, lng: -95.3698, state: 'TX' },
  'phoenix': { name: 'Phoenix', lat: 33.4484, lng: -112.0740, state: 'AZ' },
  'philadelphia': { name: 'Philadelphia', lat: 39.9526, lng: -75.1652, state: 'PA' },
  'san antonio': { name: 'San Antonio', lat: 29.4241, lng: -98.4936, state: 'TX' },
  'san diego': { name: 'San Diego', lat: 32.7157, lng: -117.1611, state: 'CA' },
  'dallas': { name: 'Dallas', lat: 32.7767, lng: -96.7970, state: 'TX' },
  'austin': { name: 'Austin', lat: 30.2672, lng: -97.7431, state: 'TX' },
  'washington dc': { name: 'Washington DC', lat: 38.9072, lng: -77.0369, state: 'DC' },
  'boston': { name: 'Boston', lat: 42.3601, lng: -71.0589, state: 'MA' },
  'denver': { name: 'Denver', lat: 39.7392, lng: -104.9903, state: 'CO' },
  'seattle': { name: 'Seattle', lat: 47.6062, lng: -122.3321, state: 'WA' },
  'san francisco': { name: 'San Francisco', lat: 37.7749, lng: -122.4194, state: 'CA' },
  'miami': { name: 'Miami', lat: 25.7617, lng: -80.1918, state: 'FL' },
  'atlanta': { name: 'Atlanta', lat: 33.7490, lng: -84.3880, state: 'GA' },
  'nashville': { name: 'Nashville', lat: 36.1627, lng: -86.7816, state: 'TN' },
  'portland': { name: 'Portland', lat: 45.5152, lng: -122.6784, state: 'OR' },
  'las vegas': { name: 'Las Vegas', lat: 36.1699, lng: -115.1398, state: 'NV' }
};

// Search for a city by name
function searchCity(cityName) {
  const searchKey = cityName.toLowerCase().trim();
  return CITY_COORDINATES[searchKey] || null;
}

// Fetch events from JamBase API by location
async function fetchEventsFromJamBaseByLocation(lat, lng, radius = 25, limit = 50) {
  try {
    const { getApiKey, reportKeyFailure } = require('./config/apiKeys');
    let apiKey;
    try {
      apiKey = getApiKey('jambase');
    } catch (error) {
      throw new Error(`JamBase API key not configured: ${error.message}`);
    }
    
    // JamBase API endpoint for events
    const baseUrl = `https://www.jambase.com/jb-api/v1/events?apikey=${apiKey}`;
    
    // Build search parameters for location-based search
    const params = new URLSearchParams();
    params.append('geoLatitude', lat.toString());
    params.append('geoLongitude', lng.toString());
    params.append('geoRadiusAmount', radius.toString());
    params.append('geoRadiusUnits', 'mi');
    params.append('perPage', Math.min(limit, 100).toString());
    params.append('eventType', 'concerts');
    
    const finalUrl = `${baseUrl}&${params.toString()}`;
    console.log('🔍 JamBase location API URL:', finalUrl);
    
    const response = await fetch(finalUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'PlusOneEventCrew/1.0'
      }
    });
    
    console.log('📡 JamBase API response status:', response.status, response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('JamBase API error:', response.status, response.statusText, errorText);
      throw new Error(`JamBase API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('📊 JamBase API response data:', { 
      success: data.success, 
      eventCount: data.events?.length,
      total: data.total 
    });
    
    if (!data.success || !data.events || !Array.isArray(data.events)) {
      console.warn('Invalid JamBase API response format:', data);
      return [];
    }
    
    // Transform JamBase events to our format
    return data.events.map(event => ({
      id: event.identifier?.replace('jambase:', '') || `jambase-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      jambase_event_id: event.identifier?.replace('jambase:', '') || event.identifier || '',
      title: event.name || event.title || 'Untitled Event',
      artist_name: event.performer?.[0]?.name || event.artist_name || 'Unknown Artist',
      artist_id: event.performer?.[0]?.identifier?.replace('jambase:', '') || event.artist_id || '',
      venue_name: event.location?.name || event.venue_name || 'Unknown Venue',
      venue_id: event.location?.identifier?.replace('jambase:', '') || event.venue_id || '',
      event_date: event.startDate || event.event_date || new Date().toISOString(),
      doors_time: (event.doorTime || event.doors_time) ? 
        (event.doorTime || event.doors_time).includes('T') ? 
          (event.doorTime || event.doors_time) : 
          new Date().toISOString().split('T')[0] + 'T' + (event.doorTime || event.doors_time) + 'Z' : 
        null,
      description: event.description || null,
      genres: event.genre || event.genres || [],
      venue_address: event.location?.address?.streetAddress || event.venue_address || null,
      venue_city: event.location?.address?.addressLocality || event.venue_city || null,
      venue_state: event.location?.address?.addressRegion || event.venue_state || null,
      venue_zip: event.location?.address?.postalCode || event.venue_zip || null,
      latitude: event.location?.geo?.latitude || event.latitude || null,
      longitude: event.location?.geo?.longitude || event.longitude || null,
      ticket_available: event.offers?.some(offer => offer.availability === 'InStock') || event.ticket_available || false,
      price_range: event.offers?.map(offer => offer.price).filter(Boolean).join(' - ') || event.price_range || null,
      ticket_urls: event.offers?.map(offer => offer.url).filter(Boolean) || event.ticket_urls || [],
      setlist: event.setlist || null,
      tour_name: event.tour?.name || event.tour_name || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
    
  } catch (error) {
    console.error('❌ Error fetching events from JamBase API:', error);
    return [];
  }
}

// Store events in Supabase database
async function storeEventsInSupabase(events) {
  if (!events || events.length === 0) {
    return [];
  }
  
  if (!supabase) {
    console.warn('⚠️  Supabase not configured, skipping event storage');
    return [];
  }
  
  try {
    console.log(`💾 Storing ${events.length} events in Supabase...`);
    
    // Use upsert to avoid duplicates
    const { data, error } = await supabase
      .from('jambase_events')
      .upsert(events, {
        onConflict: 'jambase_event_id'
      })
      .select();
    
    if (error) {
      console.error('❌ Error storing events in Supabase:', error);
      throw error;
    }
    
    console.log(`✅ Successfully stored ${data?.length || events.length} events in Supabase`);
    return data || events;
    
  } catch (error) {
    console.error('❌ Error in storeEventsInSupabase:', error);
    throw error;
  }
}

// Search events from database by location
async function searchEventsFromDatabase(lat, lng, radius = 25, limit = 50) {
  if (!supabase) {
    console.warn('⚠️  Supabase not configured, skipping database search');
    return [];
  }

  try {
    // Convert radius from miles to degrees (approximate)
    const latDelta = radius / 69;
    const lngDelta = radius / (69 * Math.cos(lat * Math.PI / 180));
    
    const minLat = lat - latDelta;
    const maxLat = lat + latDelta;
    const minLng = lng - lngDelta;
    const maxLng = lng + lngDelta;

    const { data: events, error } = await supabase
      .from('jambase_events')
      .select('*')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .gte('latitude', minLat)
      .lte('latitude', maxLat)
      .gte('longitude', minLng)
      .lte('longitude', maxLng)
      .gte('event_date', new Date().toISOString())
      .order('event_date', { ascending: true })
      .limit(limit);

    if (error) throw error;

    return events || [];
  } catch (error) {
    console.error('Error searching events from database:', error);
    return [];
  }
}

/**
 * Shared JamBase + DB location search (POST supports string city or { lat, lng }; GET only supports string city).
 */
async function runJambaseLocationSearch(location, radius, limit, res) {
  if (!location) {
    return res.status(400).json({
      success: false,
      error: 'Location parameter is required',
    });
  }

  let searchCoords;
  let locationName;

  if (typeof location === 'string') {
    const cityCoords = searchCity(location);
    if (!cityCoords) {
      return res.status(400).json({
        success: false,
        error: `City "${location}" not found. Try a major city like "New York" or "Los Angeles"`,
      });
    }
    searchCoords = { lat: cityCoords.lat, lng: cityCoords.lng };
    locationName = cityCoords.name;
  } else if (location.lat != null && location.lng != null) {
    searchCoords = location;
    locationName = `${Number(location.lat).toFixed(4)}, ${Number(location.lng).toFixed(4)}`;
  } else {
    return res.status(400).json({
      success: false,
      error: 'Invalid location format. Provide city name or {lat, lng} coordinates',
    });
  }

  console.log(`🔍 Searching for events near ${locationName} (${searchCoords.lat}, ${searchCoords.lng})`);

  let events = [];
  let source = 'database';

  try {
    console.log('📡 Calling JamBase API for location-based events...');
    events = await fetchEventsFromJamBaseByLocation(searchCoords.lat, searchCoords.lng, radius, limit);

    if (events.length > 0) {
      console.log(`✅ Found ${events.length} events from JamBase API`);
      await storeEventsInSupabase(events);
      source = 'jambase';
    } else {
      console.log('📭 No events found from JamBase API, trying database...');
    }
  } catch (apiError) {
    console.warn('⚠️ JamBase API failed, trying database fallback:', apiError.message);
  }

  if (events.length === 0) {
    console.log('🗄️ Searching database for events near location...');
    events = await searchEventsFromDatabase(searchCoords.lat, searchCoords.lng, radius, limit);
    if (events.length > 0) {
      console.log(`✅ Found ${events.length} events from database`);
    } else {
      console.log('📭 No events found in database either');
    }
  }

  return res.json({
    success: true,
    events,
    total: events.length,
    location: {
      name: locationName,
      lat: searchCoords.lat,
      lng: searchCoords.lng,
      radius,
    },
    source,
  });
}

function toBoundedInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const bounded = Math.max(min, Math.min(max, Math.trunc(n)));
  return bounded;
}

// POST /api/jambase/location-search
router.post('/api/jambase/location-search',
  sanitize,
  createRateLimiter('strict'),
  async (req, res) => {
    try {
      const { location, radius = 25, limit = 50 } = req.body;
      await runJambaseLocationSearch(location, radius, limit, res);
    } catch (error) {
      console.error('❌ Error in location search:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message,
      });
    }
  }
);

// GET /api/jambase/location-search — same cost as POST; must be rate-limited and validated (was unprotected).
router.get(
  '/api/jambase/location-search',
  sanitize,
  createRateLimiter('strict'),
  validateQuery(jambaseLocationSearchGetQuerySchema),
  async (req, res) => {
    try {
      const q = req.validatedQuery || req.query;
      const location = q?.location;
      // Defensive coercion in case validation middleware is bypassed or altered.
      const radius = toBoundedInt(q?.radius, 25, 1, 500);
      const limit = toBoundedInt(q?.limit, 50, 1, 100);
      await runJambaseLocationSearch(location, radius, limit, res);
    } catch (error) {
      console.error('❌ Error in GET location search:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message,
      });
    }
  }
);

module.exports = router;
