// Vercel API route for JamBase artists
import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL || 'https://glpiolbrafqikqhnseto.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjkzNzgyNCwiZXhwIjoyMDcyNTEzODI0fQ.cS0y6dQiw2VvGD7tKfKADKqM8whaopJ716G4dexBRGI';
const supabase = createClient(supabaseUrl, supabaseKey);

// Fetch artists from JamBase API
async function fetchFromJamBase(query, options = {}) {
  try {
    const JAMBASE_API_KEY = process.env.JAMBASE_API_KEY || 'e7ed3a9b-e73a-446e-b7c6-a96d1c53a030';
    
    // Use correct JamBase API endpoint for artists
    const baseUrl = `https://www.jambase.com/jb-api/v1/artists`;
    
    // Build search parameters
    const params = new URLSearchParams();
    params.append('apikey', JAMBASE_API_KEY);
    
    // Add artist search if query is provided
    if (query) {
      params.append('artistName', query);
    }
    
    // Add other parameters
    if (options.perPage) {
      params.append('perPage', options.perPage.toString());
    }
    if (options.page) {
      params.append('page', options.page.toString());
    }
    
    const endpoint = `${baseUrl}?${params.toString()}`;

    console.log('Calling JamBase Artists API:', endpoint);
    
    const response = await fetch(endpoint);
    
    if (!response.ok) {
      console.log(`JamBase Artists API failed with status: ${response.status}`);
      return [];
    }

    const responseText = await response.text();
    console.log('Response length:', responseText.length);
    
    if (!responseText || responseText.length === 0) {
      console.log('Empty response from JamBase Artists API');
      return [];
    }

    const data = JSON.parse(responseText);
    console.log('Parsed response keys:', Object.keys(data));
    
    // Handle JamBase API response format
    let artists = [];
    if (Array.isArray(data)) {
      artists = data;
    } else if (data.artists && Array.isArray(data.artists)) {
      artists = data.artists;
    } else if (data.data && Array.isArray(data.data)) {
      artists = data.data;
    } else if (data.results && Array.isArray(data.results)) {
      artists = data.results;
    }

    console.log(`Found ${artists.length} artists from JamBase API`);
    return artists;

  } catch (error) {
    console.error('Error fetching from JamBase Artists API:', error);
    return [];
  }
}

// Transform JamBase artist to our format
function transformJamBaseArtist(artist) {
  // Extract artist ID
  const artistId = artist.identifier?.replace('jambase:', '') || 
                 artist.id || 
                 artist['@id']?.replace('jambase:', '') || 
                 `artist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Extract artist name
  const artistName = artist.name || 
                   artist.title || 
                   'Unknown Artist';
  
  // Extract description
  const description = artist.description || 
                    artist.bio || 
                    `Artist: ${artistName}`;
  
  // Extract genres
  let genres = [];
  if (artist.genre && Array.isArray(artist.genre)) {
    genres = artist.genre;
  } else if (artist.genres && Array.isArray(artist.genres)) {
    genres = artist.genres;
  } else if (artist.genre && typeof artist.genre === 'string') {
    genres = [artist.genre];
  }
  
  // Extract image URL
  const imageUrl = artist.image || 
                  artist.photo || 
                  artist.thumbnail || 
                  null;
  
  // Extract popularity score
  const popularityScore = artist['x-numUpcomingEvents'] || 
                         artist.upcomingEvents || 
                         0;
  
  return {
    id: artistId,
    jambase_artist_id: artistId,
    name: artistName,
    description: description,
    genres: genres,
    image_url: imageUrl,
    popularity_score: popularityScore,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
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
      perPage = 20,
      page = 1
    } = req.query;

    console.log('JamBase Artists API request:', {
      artistName,
      perPage,
      page
    });

    // First, try to get artists from database
    let query = supabase
      .from('jambase_events')
      .select('artist_name, artist_id, genres', { count: 'exact' })
      .not('artist_name', 'is', null);

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

    // Apply pagination
    const offset = (parseInt(page) - 1) * parseInt(perPage);
    query = query.range(offset, offset + parseInt(perPage) - 1);

    const { data: dbArtists, error: dbError, count } = await query;

    if (dbError) {
      console.error('Database query error:', dbError);
      throw dbError;
    }

    // If we have artists in database, return them
    if (dbArtists && dbArtists.length > 0) {
      console.log(`Found ${dbArtists.length} artists in database`);
      
      // Convert events to artist format
      const uniqueArtists = new Map();
      dbArtists.forEach(event => {
        if (event.artist_name && !uniqueArtists.has(event.artist_name.toLowerCase())) {
          uniqueArtists.set(event.artist_name.toLowerCase(), {
            id: event.artist_id || `db-${event.artist_name.toLowerCase().replace(/\s+/g, '-')}`,
            jambase_artist_id: event.artist_id,
            name: event.artist_name,
            description: `Artist found in our database`,
            genres: event.genres || [],
            image_url: null,
            popularity_score: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            source: 'database'
          });
        }
      });

      const artists = Array.from(uniqueArtists.values());
      
      return res.status(200).json({
        success: true,
        artists: artists,
        total: artists.length,
        page: parseInt(page),
        perPage: parseInt(perPage),
        hasNextPage: (offset + parseInt(perPage)) < (count || 0),
        hasPreviousPage: parseInt(page) > 1,
        source: 'database'
      });
    }

    // If no database results, fetch from JamBase API
    console.log('No database results, fetching from JamBase API...');
    
    const apiArtists = await fetchFromJamBase(artistName, {
      perPage,
      page
    });

    if (apiArtists.length > 0) {
      const transformedArtists = apiArtists.map(transformJamBaseArtist);
      
      return res.status(200).json({
        success: true,
        artists: transformedArtists,
        total: transformedArtists.length,
        page: parseInt(page),
        perPage: parseInt(perPage),
        hasNextPage: false,
        hasPreviousPage: false,
        source: 'api'
      });
    }

    // No artists found
    return res.status(200).json({
      success: true,
      artists: [],
      total: 0,
      page: parseInt(page),
      perPage: parseInt(perPage),
      hasNextPage: false,
      hasPreviousPage: false,
      source: 'none'
    });

  } catch (error) {
    console.error('Error in JamBase artists API:', error);
    clearTimeout(timeoutId);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      artists: [],
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
