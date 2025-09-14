// Example script demonstrating how to use the artist profile functionality
// This script shows how to fetch artist data from JamBase API and store it in Supabase

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// JamBase API configuration
const JAMBASE_API_KEY = process.env.VITE_JAMBASE_API_KEY;
const JAMBASE_BASE_URL = 'https://www.jambase.com/jb-api/v1';

/**
 * Fetch artist data from JamBase API
 */
async function fetchArtistFromJamBase(artistId, artistDataSource = 'jambase') {
  const url = `${JAMBASE_BASE_URL}/artists/id/${artistDataSource}:${artistId}`;
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'apikey': JAMBASE_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`JamBase API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Transform JamBase API response to our database format
 */
function transformJamBaseArtistToProfile(jambaseResponse, artistDataSource = 'jambase') {
  const artist = jambaseResponse.artist;
  
  return {
    jambase_artist_id: artist.identifier.split(':')[1] || artist.identifier,
    artist_data_source: artistDataSource,
    name: artist.name,
    identifier: artist.identifier,
    url: artist.url,
    image_url: artist.image,
    date_published: artist.datePublished,
    date_modified: artist.dateModified,
    artist_type: artist['@type'],
    band_or_musician: artist['x-bandOrMusician'],
    founding_location: artist.foundingLocation?.name,
    founding_date: artist.foundingDate,
    genres: artist.genre,
    members: artist.member,
    member_of: artist.memberOf,
    external_identifiers: artist['x-externalIdentifiers'],
    same_as: artist.sameAs,
    num_upcoming_events: artist['x-numUpcomingEvents'] || 0,
    raw_jambase_data: jambaseResponse,
    last_synced_at: new Date().toISOString(),
  };
}

/**
 * Save artist profile to Supabase
 */
async function saveArtistProfile(profileData) {
  const { data, error } = await supabase
    .from('artist_profile')
    .upsert(profileData, {
      onConflict: 'identifier'
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save artist profile: ${error.message}`);
  }

  return data;
}

/**
 * Search for artists by name
 */
async function searchArtistsByName(name, limit = 20) {
  const { data, error } = await supabase
    .from('artist_profile_summary')
    .select('*')
    .ilike('name', `%${name}%`)
    .order('name')
    .limit(limit);

  if (error) {
    throw new Error(`Failed to search artists: ${error.message}`);
  }

  return data || [];
}

/**
 * Get artists by genre
 */
async function getArtistsByGenre(genre, limit = 20) {
  const { data, error } = await supabase
    .from('artist_profile_summary')
    .select('*')
    .contains('genres', [genre])
    .order('name')
    .limit(limit);

  if (error) {
    throw new Error(`Failed to get artists by genre: ${error.message}`);
  }

  return data || [];
}

/**
 * Main example function
 */
async function main() {
  try {
    console.log('🎵 Artist Profile Example Script');
    console.log('================================');

    // Example 1: Fetch and save a specific artist
    console.log('\n1. Fetching artist data from JamBase API...');
    const artistId = '194164'; // Example JamBase artist ID
    const jambaseResponse = await fetchArtistFromJamBase(artistId);
    console.log(`✅ Fetched data for: ${jambaseResponse.artist.name}`);

    // Transform the data
    const profileData = transformJamBaseArtistToProfile(jambaseResponse);
    console.log(`📊 Transformed data for: ${profileData.name}`);

    // Save to database
    const savedProfile = await saveArtistProfile(profileData);
    console.log(`💾 Saved to database with ID: ${savedProfile.id}`);

    // Example 2: Search for artists
    console.log('\n2. Searching for artists...');
    const searchResults = await searchArtistsByName('Phish');
    console.log(`🔍 Found ${searchResults.length} artists matching "Phish"`);
    searchResults.forEach(artist => {
      console.log(`   - ${artist.name} (${artist.band_or_musician})`);
    });

    // Example 3: Get artists by genre
    console.log('\n3. Getting artists by genre...');
    const genreResults = await getArtistsByGenre('rock');
    console.log(`🎸 Found ${genreResults.length} rock artists`);
    genreResults.slice(0, 5).forEach(artist => {
      console.log(`   - ${artist.name} (${artist.genres?.join(', ')})`);
    });

    // Example 4: Get artist profile statistics
    console.log('\n4. Getting database statistics...');
    const { data: stats } = await supabase
      .from('artist_profile')
      .select('band_or_musician, genres', { count: 'exact' });

    const totalArtists = stats?.length || 0;
    const bands = stats?.filter(s => s.band_or_musician === 'band').length || 0;
    const musicians = stats?.filter(s => s.band_or_musician === 'musician').length || 0;

    console.log(`📈 Database Statistics:`);
    console.log(`   - Total artists: ${totalArtists}`);
    console.log(`   - Bands: ${bands}`);
    console.log(`   - Musicians: ${musicians}`);

    console.log('\n✅ Example completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the example if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = {
  fetchArtistFromJamBase,
  transformJamBaseArtistToProfile,
  saveArtistProfile,
  searchArtistsByName,
  getArtistsByGenre,
};
