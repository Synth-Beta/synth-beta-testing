const express = require('express');
const router = express.Router();
const { getApiKey, reportKeyFailure } = require('./config/apiKeys');
const { createRateLimiter } = require('./middleware/rateLimiter');
const { validateQuery } = require('./middleware/validateInput');
const { createSanitizationMiddleware } = require('./middleware/sanitizeInput');
const { setlistSearchQuerySchema } = require('./validation/schemas');

const SETLIST_FM_BASE_URL = 'https://api.setlist.fm/rest/1.0';

// Sanitization middleware
const sanitize = createSanitizationMiddleware({ sanitizeQuery: true });

/**
 * Proxy route to search setlists on setlist.fm
 * This avoids CORS issues by making the request from the backend
 * 
 * Note: Setlist.fm API has its own rate limit of ~2 requests per second.
 * Our middleware rate limiting prevents abuse, and we respect Setlist.fm's limits.
 */
router.get('/api/setlists/search',
  sanitize,
  createRateLimiter('strict'), // Strict rate limiting for search endpoints
  validateQuery(setlistSearchQuerySchema),
  async (req, res) => {
    try {
      // Get API key using rotation framework
      let apiKey;
      try {
        apiKey = getApiKey('setlistFm', false); // Don't throw if missing
        if (!apiKey) {
          return res.status(503).json({
            success: false,
            error: 'Setlist.fm API key not configured',
            message: 'Setlist service is unavailable'
          });
        }
      } catch (error) {
        return res.status(503).json({
          success: false,
          error: 'Setlist.fm API key error',
          message: error.message
        });
      }

      // Extract validated query parameters
      const { artistName, date, venueName, cityName, stateCode } = req.query;

    // Build query string
    const queryParams = new URLSearchParams();
    if (artistName) queryParams.append('artistName', artistName);
    
    // Format date properly for Setlist.fm API (DD-MM-YYYY)
    if (date) {
      console.log('🎵 Raw date parameter received:', date, typeof date);
      try {
        let dateObj;
        // Handle DD-MM-YYYY format (from frontend)
        if (typeof date === 'string' && date.includes('-')) {
          const parts = date.split('-');
          if (parts.length === 3) {
            // Check if it's DD-MM-YYYY format
            if (parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
              // DD-MM-YYYY format
              dateObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
            } else if (parts[0].length === 4) {
              // YYYY-MM-DD format - parse as UTC to avoid timezone issues
              // Parse as YYYY-MM-DD and create date in UTC to avoid timezone shifts
              dateObj = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
            } else {
              dateObj = new Date(date);
            }
          } else {
            dateObj = new Date(date);
          }
        } else {
          dateObj = new Date(date);
        }
        
        console.log('🎵 Parsed date object:', dateObj, 'UTC:', dateObj.toUTCString());
        if (!isNaN(dateObj.getTime())) {
          // Setlist.fm expects DD-MM-YYYY format
          // Use UTC methods to avoid timezone issues
          const day = String(dateObj.getUTCDate()).padStart(2, '0');
          const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
          const year = dateObj.getUTCFullYear();
          const formattedDate = `${day}-${month}-${year}`;
          queryParams.append('date', formattedDate);
          console.log('🎵 Date formatted for Setlist.fm:', formattedDate, '(from input:', date, ')');
        } else {
          console.warn('🎵 Invalid date format, skipping:', date);
        }
      } catch (error) {
        console.warn('🎵 Date parsing error, skipping:', date, error);
      }
    } else {
      console.log('🎵 No date parameter provided');
    }
    
    if (venueName) queryParams.append('venueName', venueName);
    if (cityName) queryParams.append('cityName', cityName);
    if (stateCode) queryParams.append('stateCode', stateCode);


    const url = `${SETLIST_FM_BASE_URL}/search/setlists?${queryParams.toString()}`;
    
    console.log('🎵 Setlist.fm API request:', url);

    // Make request to Setlist.fm API
    let response;
    try {
      response = await fetch(url, {
        headers: {
          'x-api-key': apiKey,
          'Accept': 'application/json',
          'User-Agent': 'PlusOne/1.0 (https://plusone.app)'
        }
      });
    } catch (fetchError) {
      console.error('❌ Setlist.fm API fetch error:', fetchError);
      return res.status(503).json({
        success: false,
        error: 'Failed to connect to Setlist.fm API',
        message: 'External service unavailable'
      });
    }

    // Handle API key failures (401/403) with rotation
    if (response.status === 401 || response.status === 403) {
      const alternativeKey = reportKeyFailure('setlistFm', apiKey, new Error(`API key failed with status ${response.status}`));
      if (alternativeKey) {
        // Retry with alternative key (one retry only)
        console.log('🔄 Retrying Setlist.fm request with alternative key');
        response = await fetch(url, {
          headers: {
            'x-api-key': alternativeKey,
            'Accept': 'application/json',
            'User-Agent': 'PlusOne/1.0 (https://plusone.app)'
          }
        });
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Setlist.fm API error response:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText.substring(0, 500), // Limit error log size
        url: url
      });
      
      if (response.status === 404) {
        return res.json({ setlist: [] }); // No setlists found
      }
      
      // Return generic error (don't expose API details)
      return res.status(response.status >= 500 ? 503 : response.status).json({
        success: false,
        error: 'Setlist.fm API error',
        message: response.status === 429 
          ? 'Rate limit exceeded. Please try again later.'
          : 'Failed to fetch setlists from external service'
      });
    }

    const data = await response.json();
    
    console.log('🎵 Setlist.fm API response:', {
      total: data.setlist?.length || 0,
      artistName,
      date,
      venueName
    });

    // Transform setlist.fm data to our format
    const transformedSetlists = (data.setlist || []).map((setlist) => ({
      setlistFmId: setlist.id,
      versionId: setlist.versionId,
      eventDate: setlist.eventDate,
      artist: {
        name: setlist.artist.name,
        mbid: setlist.artist.mbid
      },
      venue: {
        name: setlist.venue.name,
        city: setlist.venue.city.name,
        state: setlist.venue.city.state || '',
        country: setlist.venue.city.country.name
      },
      tour: setlist.tour?.name,
      info: setlist.info,
      url: setlist.url,
      songs: setlist.sets?.set?.flatMap((set, setIndex) => 
        set.song?.map((song, songIndex) => ({
          name: song.name,
          position: songIndex + 1,
          setNumber: setIndex + 1,
          setName: set.name || `Set ${setIndex + 1}`,
          cover: song.cover ? {
            artist: song.cover.name,
            mbid: song.cover.mbid
          } : undefined,
          info: song.info,
          tape: song.tape || false
        })) || []
      ) || [],
      songCount: setlist.sets?.set?.reduce((total, set) => 
        total + (set.song?.length || 0), 0) || 0,
      lastUpdated: new Date().toISOString()
    }));

    res.json({ setlist: transformedSetlists });

  } catch (error) {
    console.error('❌ Setlist.fm API error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch setlists',
      message: error.message 
    });
  }
});

/**
 * Health check endpoint for setlist service
 */
router.get('/api/setlists/health',
  createRateLimiter('lenient'),
  (req, res) => {
    res.json({ 
      status: 'ok', 
      service: 'setlist-proxy',
      timestamp: new Date().toISOString()
    });
  }
);

module.exports = router;
