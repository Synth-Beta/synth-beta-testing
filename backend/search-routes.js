// Search routes for concert database
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

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
