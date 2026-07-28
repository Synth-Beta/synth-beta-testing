const express = require('express');
const router = express.Router();

// Setlist.fm API Configuration
const SETLIST_FM_API_KEY = 'QxGjjwxk0MUyxyCJa2FADnFRwEqFUy__7wpt';
const SETLIST_FM_BASE_URL = 'https://api.setlist.fm/rest/1.0';

// Rate limiting: setlist.fm allows ~2 requests per second
const RATE_LIMIT_DELAY = 1000; // ms between requests
let lastRequestTime = 0;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Proxy route to search setlists on setlist.fm
 * This avoids CORS issues by making the request from the backend
 */
router.get('/api/setlists/search', async (req, res) => {
  try {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
      await sleep(RATE_LIMIT_DELAY - timeSinceLastRequest);
    }
    lastRequestTime = Date.now();

    // Extract query parameters
    const { artistName, date, venueName, cityName, stateCode } = req.query;

    // Build query string
    const queryParams = new URLSearchParams();
    if (artistName) queryParams.append('artistName', artistName);
    
    // Format date properly for Setlist.fm API (YYYY-MM-DD)
    if (date) {
      console.log('🎵 Raw date parameter received:', date, typeof date);
      try {
        const dateObj = new Date(date);
        console.log('🎵 Parsed date object:', dateObj);
        if (!isNaN(dateObj.getTime())) {
          // Setlist.fm expects DD-MM-YYYY format, not YYYY-MM-DD
          const day = String(dateObj.getDate()).padStart(2, '0');
          const month = String(dateObj.getMonth() + 1).padStart(2, '0');
          const year = dateObj.getFullYear();
          const formattedDate = `${day}-${month}-${year}`;
          queryParams.append('date', formattedDate);
          console.log('🎵 Date formatted for Setlist.fm:', formattedDate);
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
    const response = await fetch(url, {
      headers: {
        'x-api-key': SETLIST_FM_API_KEY,
        'Accept': 'application/json',
        'User-Agent': 'PlusOne/1.0 (https://plusone.app)'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Setlist.fm API error response:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        url: url
      });
      
      if (response.status === 404) {
        return res.json({ setlist: [] }); // No setlists found
      }
      
      // Return more specific error information
      return res.status(response.status).json({
        error: 'Setlist.fm API error',
        message: `Setlist.fm returned ${response.status}: ${response.statusText}`,
        details: errorText
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
router.get('/api/setlists/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'setlist-proxy',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
