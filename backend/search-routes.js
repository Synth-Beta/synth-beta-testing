// Search routes for concert database
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Utility function to normalize strings for better searching
const normalizeString = (str) => {
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

    // Build the search query
    let searchQuery = supabase
      .from('shows')
      .select('*')
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (query) {
      // General search across artist, venue, and tour
      const normalizedQuery = normalizeString(query);
      searchQuery = searchQuery.or(
        `artist_normalized.ilike.%${normalizedQuery}%,venue_normalized.ilike.%${normalizedQuery}%,tour.ilike.%${query}%`
      );
    }

    if (artist) {
      const normalizedArtist = normalizeString(artist);
      searchQuery = searchQuery.ilike('artist_normalized', `%${normalizedArtist}%`);
    }

    if (venue) {
      const normalizedVenue = normalizeString(venue);
      searchQuery = searchQuery.ilike('venue_normalized', `%${normalizedVenue}%`);
    }

    if (date) {
      searchQuery = searchQuery.eq('date', date);
    }

    if (tour) {
      searchQuery = searchQuery.ilike('tour', `%${tour}%`);
    }

    const { data: concerts, error } = await searchQuery;

    if (error) {
      console.error('Search error:', error);
      return res.status(500).json({
        success: false,
        error: 'Database search failed'
      });
    }

    // Calculate total count for pagination
    let countQuery = supabase
      .from('shows')
      .select('*', { count: 'exact', head: true });

    // Apply same filters for count
    if (query) {
      const normalizedQuery = normalizeString(query);
      countQuery = countQuery.or(
        `artist_normalized.ilike.%${normalizedQuery}%,venue_normalized.ilike.%${normalizedQuery}%,tour.ilike.%${query}%`
      );
    }

    if (artist) {
      const normalizedArtist = normalizeString(artist);
      countQuery = countQuery.ilike('artist_normalized', `%${normalizedArtist}%`);
    }

    if (venue) {
      const normalizedVenue = normalizeString(venue);
      countQuery = countQuery.ilike('venue_normalized', `%${normalizedVenue}%`);
    }

    if (date) {
      countQuery = countQuery.eq('date', date);
    }

    if (tour) {
      countQuery = countQuery.ilike('tour', `%${tour}%`);
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
      error: 'Internal server error during search'
    });
  }
});

// Get concert by ID
router.get('/api/concerts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: concert, error } = await supabase
      .from('shows')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
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
      error: 'Internal server error'
    });
  }
});

// Get recent concerts (for quick access)
router.get('/api/concerts/recent', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const { data: concerts, error } = await supabase
      .from('shows')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) {
      console.error('Recent concerts error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch recent concerts'
      });
    }

    res.json({
      success: true,
      concerts: concerts || []
    });

  } catch (error) {
    console.error('Recent concerts error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get concert statistics
router.get('/api/concerts/stats', async (req, res) => {
  try {
    const { data: stats, error } = await supabase
      .from('shows')
      .select('artist, venue, date, source')
      .then(({ data }) => {
        if (!data) return { data: null, error: null };

        const totalConcerts = data.length;
        const uniqueArtists = new Set(data.map(c => c.artist)).size;
        const uniqueVenues = new Set(data.map(c => c.venue)).size;
        const sourceCounts = data.reduce((acc, c) => {
          acc[c.source] = (acc[c.source] || 0) + 1;
          return acc;
        }, {});

        return {
          data: {
            totalConcerts,
            uniqueArtists,
            uniqueVenues,
            sourceCounts
          },
          error: null
        };
      });

    if (error) {
      console.error('Stats error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch statistics'
      });
    }

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;
