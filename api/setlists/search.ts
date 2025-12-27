import type { VercelRequest, VercelResponse } from '@vercel/node';

// Setlist.fm API Key - optional, will return error if not set and endpoint is called
const SETLIST_FM_API_KEY = process.env.SETLIST_FM_API_KEY;
const SETLIST_FM_BASE_URL = 'https://api.setlist.fm/rest/1.0';

// Rate limiting: setlist.fm allows ~2 requests per second
const RATE_LIMIT_DELAY = 1000; // ms between requests
let lastRequestTime = 0;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Format date for Setlist.fm API (DD-MM-YYYY)
 */
function formatDateForAPI(dateString: string): string | null {
  if (!dateString) return null;
  
  try {
    let dateObj: Date;
    
    // Handle different date formats
    if (typeof dateString === 'string' && dateString.includes('-')) {
      const parts = dateString.split('-');
      if (parts.length === 3) {
        // Check if it's DD-MM-YYYY format
        if (parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
          // DD-MM-YYYY format
          dateObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        } else if (parts[0].length === 4) {
          // YYYY-MM-DD format
          dateObj = new Date(dateString);
        } else {
          dateObj = new Date(dateString);
        }
      } else {
        dateObj = new Date(dateString);
      }
    } else {
      dateObj = new Date(dateString);
    }
    
    if (!isNaN(dateObj.getTime())) {
      // Setlist.fm expects DD-MM-YYYY format
      const day = String(dateObj.getDate()).padStart(2, '0');
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const year = dateObj.getFullYear();
      return `${day}-${month}-${year}`;
    }
  } catch (error) {
    console.warn('Date parsing error:', error);
  }
  
  return null;
}

/**
 * Transform setlist.fm data to our format
 */
function transformSetlist(setlist: any) {
  return {
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
    songs: (setlist.sets?.set || []).flatMap((set: any, setIndex: number) => 
      (set.song || []).map((song: any, songIndex: number) => ({
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
      }))
    ),
    songCount: (setlist.sets?.set || []).reduce((total: number, set: any) => 
      total + (set.song?.length || 0), 0),
    lastUpdated: new Date().toISOString()
  };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Enable CORS for all origins (needed for iOS, Android, localhost, and Vercel)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check for API key
  if (!SETLIST_FM_API_KEY) {
    return res.status(503).json({ 
      error: 'Setlist.fm API not configured',
      message: 'SETLIST_FM_API_KEY is not set. Please configure it in Vercel environment variables to use setlist search.'
    });
  }

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

    // Build query string for setlist.fm API
    const queryParams = new URLSearchParams();
    if (artistName && typeof artistName === 'string') {
      queryParams.append('artistName', artistName);
    }
    
    // Format date properly for Setlist.fm API (DD-MM-YYYY)
    if (date && typeof date === 'string') {
      const formattedDate = formatDateForAPI(date);
      if (formattedDate) {
        queryParams.append('date', formattedDate);
      }
    }
    
    if (venueName && typeof venueName === 'string') {
      queryParams.append('venueName', venueName);
    }
    if (cityName && typeof cityName === 'string') {
      queryParams.append('cityName', cityName);
    }
    if (stateCode && typeof stateCode === 'string') {
      queryParams.append('stateCode', stateCode);
    }

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
        return res.status(200).json({ setlist: [] }); // No setlists found
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
    const transformedSetlists = (data.setlist || []).map(transformSetlist);

    return res.status(200).json({ setlist: transformedSetlists });

  } catch (error: any) {
    console.error('❌ Setlist.fm API error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch setlists',
      message: error.message 
    });
  }
}


    return res.status(200).json({ setlist: transformedSetlists });

  } catch (error: any) {
    console.error('❌ Setlist.fm API error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch setlists',
      message: error.message 
    });
  }
}


    return res.status(200).json({ setlist: transformedSetlists });

  } catch (error: any) {
    console.error('❌ Setlist.fm API error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch setlists',
      message: error.message 
    });
  }
}

