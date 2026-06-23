import type { VercelRequest, VercelResponse } from '@vercel/node';

// Setlist.fm API Key - optional, will return error if not set and endpoint is called
const SETLIST_FM_API_KEY = process.env.SETLIST_FM_API_KEY;
const SETLIST_FM_BASE_URL = 'https://api.setlist.fm/rest/1.0';

const MAX_QUERY_LEN = 200;
const STATE_CODE_PATTERN = /^[A-Za-z]{2}$/;

function sanitizeQueryString(value: unknown, maxLen = MAX_QUERY_LEN): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return undefined;
  return trimmed;
}

/** Security: Validate setlist search query params before calling paid Setlist.fm API. */
function parseSetlistSearchQuery(query: VercelRequest['query']) {
  const artistName = sanitizeQueryString(query.artistName);
  const date = sanitizeQueryString(query.date, 32);
  const venueName = sanitizeQueryString(query.venueName);
  const cityName = sanitizeQueryString(query.cityName);
  const stateRaw = sanitizeQueryString(query.stateCode, 2);
  const stateCode = stateRaw && STATE_CODE_PATTERN.test(stateRaw) ? stateRaw.toUpperCase() : undefined;

  if (!artistName && !date && !venueName && !cityName && !stateCode) {
    return { ok: false as const, error: 'At least one search parameter is required' };
  }

  return {
    ok: true as const,
    params: { artistName, date, venueName, cityName, stateCode },
  };
}

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
  // Always set JSON content type
  res.setHeader('Content-Type', 'application/json');
  
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
    console.error('❌ SETLIST_FM_API_KEY is not set in environment variables');
    return res.status(503).json({ 
      error: 'Setlist.fm API not configured',
      message: 'SETLIST_FM_API_KEY is not set. Please configure it in Vercel environment variables to use setlist search.'
    });
  }

  try {
    const parsed = parseSetlistSearchQuery(req.query);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }

    const { artistName, date, venueName, cityName, stateCode } = parsed.params;

    // Build query string for setlist.fm API
    const queryParams = new URLSearchParams();
    if (artistName) {
      queryParams.append('artistName', artistName);
    }
    
    // Format date properly for Setlist.fm API (DD-MM-YYYY)
    if (date) {
      const formattedDate = formatDateForAPI(date);
      if (formattedDate) {
        queryParams.append('date', formattedDate);
      }
    }
    
    if (venueName) {
      queryParams.append('venueName', venueName);
    }
    if (cityName) {
      queryParams.append('cityName', cityName);
    }
    if (stateCode) {
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
      
      // Security: Do not expose upstream response body to clients.
      return res.status(response.status >= 500 ? 502 : response.status).json({
        error: 'Setlist.fm API error',
        message: `Setlist.fm returned ${response.status}: ${response.statusText}`,
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
    // Ensure we return JSON even on errors
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json');
    }
    return res.status(500).json({ 
      error: 'Failed to fetch setlists',
      message: process.env.NODE_ENV === 'development' ? (error?.message || 'Unknown error') : 'Something went wrong',
    });
  }
}

