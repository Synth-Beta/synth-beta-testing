// Search routes for concert database
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// Supabase configuration with defaults
const supabaseUrl = process.env.SUPABASE_URL || 'https://glpiolbrafqikqhnseto.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjkzNzgyNCwiZXhwIjoyMDcyNTEzODI0fQ.cS0y6dQiw2VvGD7tKfKADKqM8whaopJ716G4dexBRGI';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Test Supabase connection on startup
supabase
  .from('jambase_events')
  .select('count')
  .limit(1)
  .then(({ error }) => {
    if (error) {
      console.error('Supabase connection test failed:', error.message);
    } else {
      console.log('Supabase connection successful');
    }
  });

// Utility function to normalize strings for better searching
const normalizeString = (str) => {
  if (!str) return '';
  return str.toLowerCase().trim().replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ');
};

// Fetch events from JamBase API
async function fetchFromJamBase(query, date) {
  try {
    const JAMBASE_API_KEY = process.env.JAMBASE_API_KEY || 'e7ed3a9b-e73a-446e-b7c6-a96d1c53a030';
    
    // Use correct JamBase API endpoint from official documentation
    const baseUrl = `https://www.jambase.com/jb-api/v1/events?apikey=${JAMBASE_API_KEY}`;
    
    // Build search parameters
    const params = new URLSearchParams();
    
    // Add artist search if query is provided
    if (query) {
      // Try different parameter names that might work for artist search
      params.append('artistName', query);
    }
    
    // Add date filtering if provided
    if (date) {
      const dateStr = new Date(date).toISOString().split('T')[0];
      params.append('eventDateFrom', dateStr);
      params.append('eventDateTo', dateStr);
    }
    
    // Set limit
    params.append('limit', '20');
    
    const endpoint = `${baseUrl}&${params.toString()}`;

    console.log('Calling JamBase API:', endpoint);
    
    try {
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
      console.log('Response data:', JSON.stringify(data, null, 2).substring(0, 1000));
      
      // Handle JamBase API response format (JSON-LD)
      let events = [];
      if (Array.isArray(data)) {
        // Response is directly an array of events
        events = data;
      } else if (data.events && Array.isArray(data.events)) {
        events = data.events;
      } else if (data.data && Array.isArray(data.data)) {
        events = data.data;
      } else if (data.results && Array.isArray(data.results)) {
        events = data.results;
      }

      if (events.length > 0) {
        console.log(`Found ${events.length} events from JamBase API`);
        
        // Convert JamBase events to our database format
        return events.map(jambaseEvent => {
          // Handle JSON-LD format from JamBase API
          const headliner = jambaseEvent.performer?.find(p => p['x-isHeadliner']) || jambaseEvent.performer?.[0];
          const venue = jambaseEvent.location;
          const address = venue?.address;
          
          const event = {
            jambase_event_id: jambaseEvent.identifier?.replace('jambase:', '') || jambaseEvent.id,
            title: jambaseEvent.name || `${headliner?.name || 'Unknown Artist'} Live`,
            artist_name: headliner?.name || 'Unknown Artist',
            artist_id: headliner?.identifier?.replace('jambase:', '') || headliner?.id,
            venue_name: venue?.name || 'Unknown Venue',
            venue_id: venue?.identifier?.replace('jambase:', '') || venue?.id,
            event_date: jambaseEvent.startDate || new Date().toISOString(),
            doors_time: jambaseEvent.doorTime && jambaseEvent.doorTime.trim() !== '' 
              ? (jambaseEvent.doorTime.includes('T') || jambaseEvent.doorTime.includes('-') 
                  ? jambaseEvent.doorTime 
                  : `${jambaseEvent.startDate.split('T')[0]}T${jambaseEvent.doorTime}`)
              : null,
            description: jambaseEvent.description || `Live performance by ${headliner?.name || 'Unknown Artist'}`,
            genres: headliner?.genre || [],
            venue_address: address?.streetAddress,
            venue_city: address?.addressLocality,
            venue_state: address?.addressRegion?.name || address?.addressRegion,
            venue_zip: address?.postalCode,
            latitude: venue?.geo?.latitude,
            longitude: venue?.geo?.longitude,
            ticket_available: jambaseEvent.offers && jambaseEvent.offers.length > 0,
            price_range: jambaseEvent.offers?.[0]?.priceSpecification?.price || jambaseEvent.offers?.[0]?.priceSpecification?.minPrice,
            ticket_urls: jambaseEvent.offers?.map(offer => offer.url) || [],
            setlist: null, // Not available in this API response
            tour_name: null, // Not available in this API response
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          
          console.log('Converted event:', JSON.stringify(event, null, 2).substring(0, 500));
          return event;
        });
      } else {
        console.log('No events found in JamBase API response');
        return [];
      }
    } catch (apiError) {
      console.log(`JamBase API error:`, apiError.message);
      return [];
    }
  } catch (error) {
    console.error('Error fetching from JamBase:', error);
    return [];
  }
}

// Search concerts in the database
router.get('/api/concerts/search', async (req, res) => {
  try {
    const { 
      query, 
      artist, 
      venue, 
      date, 
      tour,
      limit = 50,
      offset = 0 
    } = req.query;

    console.log('Search parameters:', { query, artist, venue, date, tour, limit, offset });

    // Build the search query using jambase_events table
    let searchQuery = supabase
      .from('jambase_events')
      .select('*')
      .order('event_date', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    // Apply filters with updated field names
    if (query) {
      const normalizedQuery = normalizeString(query);
      searchQuery = searchQuery.or(
        `artist_name.ilike.%${normalizedQuery}%,venue_name.ilike.%${normalizedQuery}%,tour_name.ilike.%${query}%,title.ilike.%${query}%`
      );
    }

    if (artist) {
      const normalizedArtist = normalizeString(artist);
      searchQuery = searchQuery.ilike('artist_name', `%${normalizedArtist}%`);
    }

    if (venue) {
      const normalizedVenue = normalizeString(venue);
      searchQuery = searchQuery.ilike('venue_name', `%${normalizedVenue}%`);
    }

    if (date) {
      // Handle different date formats
      const dateStr = new Date(date).toISOString().split('T')[0];
      searchQuery = searchQuery.gte('event_date', dateStr)
                              .lt('event_date', dateStr + 'T23:59:59');
    }

    if (tour) {
      searchQuery = searchQuery.ilike('tour_name', `%${tour}%`);
    }

    const { data: concerts, error } = await searchQuery;

    if (error) {
      console.error('Search error:', error);
      return res.status(500).json({
        success: false,
        error: 'Database search failed',
        details: error.message
      });
    }

    console.log(`Found ${concerts?.length || 0} concerts`);

    // If no results found, try to fetch from JamBase API and store
    if ((!concerts || concerts.length === 0) && query) {
      console.log('No results in database, fetching from JamBase API...');
      try {
        const jambaseEvents = await fetchFromJamBase(query, date);
        if (jambaseEvents && jambaseEvents.length > 0) {
          console.log(`Found ${jambaseEvents.length} events from JamBase, storing in database...`);
          
          // Store events in database
          const { data: storedEvents, error: storeError } = await supabase
            .from('jambase_events')
            .insert(jambaseEvents)
            .select();

          if (storeError) {
            console.error('Error storing JamBase events:', storeError);
          } else {
            console.log(`Successfully stored ${storedEvents.length} events from JamBase`);
            // Return the stored events
            return res.json({
              success: true,
              concerts: storedEvents || [],
              total: storedEvents?.length || 0,
              limit: parseInt(limit),
              offset: parseInt(offset),
              hasMore: false,
              source: 'jambase'
            });
          }
        }
      } catch (jambaseError) {
        console.error('JamBase API error:', jambaseError);
        // Continue with empty results
      }
    }

    // Calculate total count for pagination
    let countQuery = supabase
      .from('jambase_events')
      .select('id', { count: 'exact', head: true });

    // Apply same filters for count
    if (query) {
      const normalizedQuery = normalizeString(query);
      countQuery = countQuery.or(
        `artist_name.ilike.%${normalizedQuery}%,venue_name.ilike.%${normalizedQuery}%,tour_name.ilike.%${query}%,title.ilike.%${query}%`
      );
    }

    if (artist) {
      const normalizedArtist = normalizeString(artist);
      countQuery = countQuery.ilike('artist_name', `%${normalizedArtist}%`);
    }

    if (venue) {
      const normalizedVenue = normalizeString(venue);
      countQuery = countQuery.ilike('venue_name', `%${normalizedVenue}%`);
    }

    if (date) {
      const dateStr = new Date(date).toISOString().split('T')[0];
      countQuery = countQuery.gte('event_date', dateStr)
                            .lt('event_date', dateStr + 'T23:59:59');
    }

    if (tour) {
      countQuery = countQuery.ilike('tour_name', `%${tour}%`);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      console.error('Count error:', countError);
    }

    res.json({
      success: true,
      concerts: concerts || [],
      total: count || 0,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: (parseInt(offset) + parseInt(limit)) < (count || 0)
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during search',
      details: error.message
    });
  }
});

// Get concert by ID
router.get('/api/concerts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log('Fetching concert with ID:', id);

    const { data: concert, error } = await supabase
      .from('jambase_events')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Get concert by ID error:', error);
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Concert not found'
        });
      }
      throw error;
    }

    res.json({
      success: true,
      concert
    });

  } catch (error) {
    console.error('Get concert error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Get recent concerts (for quick access)
router.get('/api/concerts/recent', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    console.log('Fetching recent concerts, limit:', limit);

    const { data: concerts, error } = await supabase
      .from('jambase_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) {
      console.error('Recent concerts error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch recent concerts',
        details: error.message
      });
    }

    console.log(`Found ${concerts?.length || 0} recent concerts`);

    res.json({
      success: true,
      concerts: concerts || []
    });

  } catch (error) {
    console.error('Recent concerts error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Get concert statistics
router.get('/api/concerts/stats', async (req, res) => {
  try {
    console.log('Fetching concert statistics');

    const { data: concerts, error } = await supabase
      .from('jambase_events')
      .select('artist_name, venue_name, event_date, created_at');

    if (error) {
      console.error('Stats error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch statistics',
        details: error.message
      });
    }

    if (!concerts) {
      return res.json({
        success: true,
        stats: {
          totalConcerts: 0,
          uniqueArtists: 0,
          uniqueVenues: 0,
          sourceCounts: {}
        }
      });
    }

    const totalConcerts = concerts.length;
    const uniqueArtists = new Set(concerts.map(c => c.artist_name).filter(Boolean)).size;
    const uniqueVenues = new Set(concerts.map(c => c.venue_name).filter(Boolean)).size;
    
    // Basic source counts (you can enhance this by adding a source field to your query)
    const sourceCounts = {
      jambase_api: concerts.filter(c => c.jambase_event_id).length,
      manual: concerts.filter(c => !c.jambase_event_id).length
    };

    console.log('Stats calculated:', { totalConcerts, uniqueArtists, uniqueVenues });

    res.json({
      success: true,
      stats: {
        totalConcerts,
        uniqueArtists,
        uniqueVenues,
        sourceCounts
      }
    });

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Health check endpoint
router.get('/api/concerts/health', async (req, res) => {
  try {
    // Test database connection
    const { data, error } = await supabase
      .from('jambase_events')
      .select('count')
      .limit(1);

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Database connection failed',
        details: error.message
      });
    }

    res.json({
      success: true,
      message: 'Concert API is healthy',
      timestamp: new Date().toISOString(),
      database: 'connected'
    });

  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      details: error.message
    });
  }
});

// Error handling middleware
router.use((error, req, res, next) => {
  console.error('Unhandled route error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

module.exports = router;
