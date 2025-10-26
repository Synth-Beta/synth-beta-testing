import { supabase } from '../integrations/supabase/client';
import { ArtistProfile, JamBaseArtistResponse, transformJamBaseArtistToProfile } from '../types/artistProfile';

export interface ArtistSearchResult {
  id: string;
  name: string;
  identifier: string;
  image_url?: string;
  genres?: string[];
  band_or_musician?: 'band' | 'musician';
  num_upcoming_events?: number;
  match_score: number;
  combinedScore?: number;
  is_from_database: boolean;
}

export class UnifiedArtistSearchService {
  private static readonly JAMBASE_ARTISTS_URL = '/api/jambase/artists';
  private static readonly JAMBASE_ARTIST_URL = '/api/jambase/artists/id';
  private static readonly API_KEY = import.meta.env.VITE_JAMBASE_API_KEY || 'e7ed3a9b-e73a-446e-b7c6-a96d1c53a030';

  /**
   * Main search function that implements the complete flow:
   * 1. User searches band
   * 2. API is called to find that artist
   * 3. All fuzzy matches populate Supabase artist_profile table
   * 4. Fuzzy matched results are shown from Supabase
   */
  static async searchArtists(query: string, limit: number = 20): Promise<ArtistSearchResult[]> {
    if (!query || query.length < 2) {
      return [];
    }

    try {
      console.log(`🔍 Searching for artists: "${query}"`);

      // Step 1: Search JamBase API for artists
      const jamBaseResults = await this.searchJamBaseAPI(query, limit);
      console.log(`📡 Found ${jamBaseResults.length} artists from JamBase API`);

      // Step 2: Populate Supabase with all found artists (optional, won't fail if it doesn't work)
      let populatedArtists: any[] = [];
      try {
        populatedArtists = await this.populateArtistProfiles(jamBaseResults);
        console.log(`💾 Populated ${populatedArtists.length} artists in database`);
      } catch (populateError) {
        console.warn('⚠️  Could not populate database, continuing with API results:', populateError);
      }

      // Step 3: Get fuzzy matched results from Supabase (optional, won't fail if it doesn't work)
      let fuzzyResults: ArtistSearchResult[] = [];
      try {
        fuzzyResults = await this.getFuzzyMatchedResults(query, limit);
        console.log(`🎯 Found ${fuzzyResults.length} fuzzy matched results from database`);
      } catch (fuzzyError) {
        console.warn('⚠️  Could not get fuzzy results from database, continuing with API results:', fuzzyError);
      }

      // If no fuzzy results from database, filter and return JamBase results
      if (fuzzyResults.length === 0 && jamBaseResults.length > 0) {
        console.log(`🔄 No database results, filtering JamBase results`);
        const filteredJamBaseResults = jamBaseResults
          .map(artist => ({
            id: artist.id,
            name: artist.name,
            identifier: artist.identifier,
            image_url: artist.image,
            genres: artist.genres,
            band_or_musician: artist['x-bandOrMusician'] as 'band' | 'musician',
            num_upcoming_events: artist['x-numUpcomingEvents'] || 0,
            match_score: this.calculateFuzzyMatchScore(query, artist.name),
            is_from_database: false,
          }))
          .filter(artist => artist.match_score > 15) // Original threshold for better artist matching
          .sort((a, b) => b.match_score - a.match_score)
          .slice(0, limit);
        
        console.log(`🎯 Filtered JamBase results: ${filteredJamBaseResults.length} matches`);
        return filteredJamBaseResults;
      }

      // If we have fuzzy results, return them
      if (fuzzyResults.length > 0) {
        return fuzzyResults;
      }

      // If no results from any source, return empty array instead of fallback data
      console.log('📭 No results found from any source, returning empty results');
      return [];
    } catch (error) {
      console.error('❌ Error in unified artist search:', error);
      // Return empty results instead of fallback data
      console.log('🔄 Returning empty results due to error');
      return [];
    }
  }

  /**
   * Search JamBase API for artists using the correct artists endpoint
   */
  private static async searchJamBaseAPI(query: string, limit: number): Promise<any[]> {
    if (!this.API_KEY) {
      console.error('❌ JamBase API key not configured. Environment variable VITE_JAMBASE_API_KEY is missing.');
      console.warn('Returning empty results due to missing API key');
      return [];
    }
    
    console.log(`🔑 Using JamBase API key: ${this.API_KEY.substring(0, 8)}...`);

    try {
      // Use the correct JamBase artists endpoint
      const params = new URLSearchParams({
        artistName: query,
        perPage: Math.min(limit, 100).toString(), // Max 100 per page
        apikey: this.API_KEY,
      });

      const response = await fetch(`${this.JAMBASE_ARTISTS_URL}?${params}`, {
        headers: {
          'Accept': 'application/json',
        },
      });

      console.log(`📡 JamBase API response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`JamBase API error: ${response.status} ${response.statusText}`, errorText);
        console.warn('Returning empty results due to API error');
        return [];
      }

      const data = await response.json();
      console.log(`📊 JamBase API response data:`, { success: data.success, artistCount: data.artists?.length });
      
      if (!data.success || !data.artists || !Array.isArray(data.artists)) {
        console.warn('Invalid JamBase API response format, returning empty results', data);
        return [];
      }

      // Transform JamBase artists to our format
      return data.artists.map((artist: any) => ({
        id: artist.identifier?.replace('jambase:', '') || artist.name.toLowerCase().replace(/\s+/g, '-'),
        name: artist.name,
        identifier: artist.identifier,
        image: artist.image,
        genres: artist.genre || [],
        'x-bandOrMusician': artist['x-bandOrMusician'] || 'band',
        'x-numUpcomingEvents': artist['x-numUpcomingEvents'] || 0,
        foundingLocation: artist.foundingLocation?.name,
        foundingDate: artist.foundingDate,
        url: artist.url,
        sameAs: artist.sameAs,
        datePublished: artist.datePublished,
        dateModified: artist.dateModified,
        member: artist.member,
        memberOf: artist.memberOf,
        'x-externalIdentifiers': artist['x-externalIdentifiers']
      }));
    } catch (error) {
      console.error('❌ JamBase API search error:', error);
      console.warn('Returning empty results due to API error');
      return [];
    }
  }

  /**
   * Get fallback artists when JamBase API is not available
   */
  private static getFallbackArtists(query: string, limit: number): any[] {
    const fallbackArtists = [
      {
        id: 'cage-the-elephant-1',
        name: 'Cage The Elephant',
        identifier: 'jambase:cage-the-elephant-1',
        image: 'https://picsum.photos/300/300?random=1',
        genres: ['alternative rock', 'indie rock', 'garage rock'],
        'x-bandOrMusician': 'band',
        'x-numUpcomingEvents': 12
      },
      {
        id: 'goose-1',
        name: 'Goose',
        identifier: 'jambase:goose-1',
        image: 'https://picsum.photos/300/300?random=2',
        genres: ['jam band', 'rock', 'funk'],
        'x-bandOrMusician': 'band',
        'x-numUpcomingEvents': 25
      },
      {
        id: 'phish-1',
        name: 'Phish',
        identifier: 'jambase:194164',
        image: 'https://picsum.photos/300/300?random=3',
        genres: ['rock', 'jam band', 'psychedelic rock'],
        'x-bandOrMusician': 'band',
        'x-numUpcomingEvents': 12
      },
      {
        id: 'dead-company-1',
        name: 'Dead & Company',
        identifier: 'jambase:123456',
        image: 'https://picsum.photos/300/300?random=4',
        genres: ['rock', 'jam band', 'psychedelic rock'],
        'x-bandOrMusician': 'band',
        'x-numUpcomingEvents': 8
      },
      {
        id: 'grateful-dead-1',
        name: 'Grateful Dead',
        identifier: 'jambase:789012',
        image: 'https://picsum.photos/300/300?random=5',
        genres: ['rock', 'jam band', 'psychedelic rock'],
        'x-bandOrMusician': 'band',
        'x-numUpcomingEvents': 0
      },
      {
        id: 'tame-impala-1',
        name: 'Tame Impala',
        identifier: 'jambase:345678',
        image: 'https://picsum.photos/300/300?random=6',
        genres: ['psychedelic rock', 'indie rock', 'electronic'],
        'x-bandOrMusician': 'band',
        'x-numUpcomingEvents': 15
      },
      {
        id: 'radiohead-1',
        name: 'Radiohead',
        identifier: 'jambase:901234',
        image: 'https://picsum.photos/300/300?random=7',
        genres: ['alternative rock', 'electronic', 'experimental'],
        'x-bandOrMusician': 'band',
        'x-numUpcomingEvents': 6
      },
      {
        id: 'taylor-swift-1',
        name: 'Taylor Swift',
        identifier: 'jambase:taylor-swift-1',
        image: 'https://picsum.photos/300/300?random=8',
        genres: ['pop', 'country', 'folk'],
        'x-bandOrMusician': 'musician',
        'x-numUpcomingEvents': 50
      },
      {
        id: 'drake-1',
        name: 'Drake',
        identifier: 'jambase:drake-1',
        image: 'https://picsum.photos/300/300?random=9',
        genres: ['hip-hop', 'r&b', 'pop'],
        'x-bandOrMusician': 'musician',
        'x-numUpcomingEvents': 30
      },
      {
        id: 'joe-russo-1',
        name: 'Joe Russo',
        identifier: 'jambase:joe-russo-1',
        image: 'https://picsum.photos/300/300?random=10',
        genres: ['rock', 'jam band', 'drummer'],
        'x-bandOrMusician': 'musician',
        'x-numUpcomingEvents': 5
      },
      {
        id: 'joe-russo-almost-dead-1',
        name: 'Joe Russo\'s Almost Dead',
        identifier: 'jambase:joe-russo-almost-dead-1',
        image: 'https://picsum.photos/300/300?random=11',
        genres: ['jam band', 'rock', 'grateful dead'],
        'x-bandOrMusician': 'band',
        'x-numUpcomingEvents': 15
      }
    ];

    // Filter artists that match the query using fuzzy matching
    const scoredArtists = fallbackArtists.map(artist => ({
      ...artist,
      match_score: this.calculateFuzzyMatchScore(query, artist.name)
    }));

    // Only return artists with good matches (above 15% similarity)
    const matchingArtists = scoredArtists
      .filter(artist => artist.match_score > 15)
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, limit);

    console.log(`🎯 Fallback search for "${query}": ${matchingArtists.length} matches found`);
    return matchingArtists;
  }

  /**
   * Populate Supabase artist_profile table with JamBase results
   */
  private static async populateArtistProfiles(jamBaseArtists: any[]): Promise<ArtistProfile[]> {
    const populatedArtists: ArtistProfile[] = [];

    // Skip database population if no artists to process
    if (!jamBaseArtists || jamBaseArtists.length === 0) {
      return populatedArtists;
    }

    for (const jamBaseArtist of jamBaseArtists) {
      try {
        const artistId = jamBaseArtist.identifier?.split(':')[1] || jamBaseArtist.identifier;
        
        // Check if artist already exists
        const { data: existingArtist, error: checkError } = await supabase
          .from('artists')
          .select('*')
          .eq('jambase_artist_id', artistId)
          .single();

        if (existingArtist && !checkError) {
          console.log(`♻️  Artist ${jamBaseArtist.name} already exists in database`);
          populatedArtists.push(existingArtist as any);
          continue;
        }

        // If table doesn't exist or other database error, skip database operations
        if (checkError && checkError.code !== 'PGRST116') {
          console.warn(`⚠️  Database error checking artist ${jamBaseArtist.name}:`, checkError);
          // Still add the artist to results even if we can't store it
          populatedArtists.push({
            id: jamBaseArtist.id,
            jambase_artist_id: artistId,
            name: jamBaseArtist.name,
            identifier: jamBaseArtist.identifier,
            url: jamBaseArtist.url,
            image_url: jamBaseArtist.image,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          } as any);
          continue;
        }

        // Save to database using the actual 'artists' table schema
        const artistData = {
          jambase_artist_id: artistId,
          name: jamBaseArtist.name,
          identifier: jamBaseArtist.identifier,
          url: jamBaseArtist.url || null,
          image_url: jamBaseArtist.image || null,
          date_published: new Date().toISOString(),
          date_modified: new Date().toISOString()
        };
        
        // Check if artist already exists
        const { data: existingArtistRecord } = await supabase
          .from('artists')
          .select('id')
          .eq('jambase_artist_id', jamBaseArtist.id)
          .single();
        
        let savedArtist;
        if (existingArtistRecord) {
          // Update existing artist
          const { data, error } = await supabase
            .from('artists')
            .update(artistData)
            .eq('id', existingArtistRecord.id)
            .select()
            .single();
          
          if (error) {
            console.error(`❌ Error updating artist ${jamBaseArtist.name}:`, error);
            savedArtist = existingArtistRecord;
          } else {
            savedArtist = data;
          }
        } else {
          // Insert new artist
          const { data, error } = await supabase
            .from('artists')
            .insert(artistData)
            .select()
            .single();
          
          if (error) {
            console.error(`❌ Error inserting artist ${jamBaseArtist.name}:`, error);
            savedArtist = null;
          } else {
            savedArtist = data;
          }
        }

        if (!savedArtist) {
          console.error(`❌ Failed to save artist ${jamBaseArtist.name}`);
          continue;
        }

        console.log(`✅ Saved artist ${jamBaseArtist.name} to database`);
        populatedArtists.push(savedArtist as any);
      } catch (error) {
        console.error(`❌ Error processing artist ${jamBaseArtist.name}:`, error);
        // Still add the artist to results even if we can't process it fully
        populatedArtists.push({
          id: jamBaseArtist.id,
          jambase_artist_id: jamBaseArtist.identifier?.split(':')[1] || jamBaseArtist.identifier,
          name: jamBaseArtist.name,
          description: jamBaseArtist.description || `Artist: ${jamBaseArtist.name}`,
          genres: jamBaseArtist.genres || [],
          image_url: jamBaseArtist.image,
          popularity_score: jamBaseArtist['x-numUpcomingEvents'] || 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          identifier: jamBaseArtist.identifier,
          band_or_musician: jamBaseArtist['x-bandOrMusician'] || 'band',
          num_upcoming_events: jamBaseArtist['x-numUpcomingEvents'] || 0,
          last_synced_at: new Date().toISOString()
        } as any);
        continue;
      }
    }

    return populatedArtists;
  }

  /**
   * Fetch full artist details from JamBase API
   */
  private static async fetchFullArtistDetails(artistId: string): Promise<JamBaseArtistResponse> {
    const url = `${this.JAMBASE_ARTIST_URL}/jambase:${artistId}?expandUpcomingEvents=true&expandExternalIdentifiers=true&apikey=${this.API_KEY}`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`JamBase API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get fuzzy matched results from Supabase by searching events table
   */
  private static async getFuzzyMatchedResults(query: string, limit: number): Promise<ArtistSearchResult[]> {
    try {
      // Get events from database to extract unique artists
      const { data: events, error } = await (supabase as any)
        .from('jambase_events')
        .select('artist_name, artist_id, genres')
        .ilike('artist_name', `%${query}%`)
        .order('event_date', { ascending: false })
        .limit(Math.max(100, limit * 10)); // Get more events to find unique artists

      if (error) {
        console.warn(`⚠️  Database error getting events: ${error.message}`);
        return [];
      }

      if (!events || events.length === 0) {
        console.log('📭 No events found in database for artist search');
        return [];
      }

      // Get unique artists and count their events
      const artistMap = new Map<string, any>();
      
      events.forEach(event => {
        if (event.artist_name) {
          const artistName = event.artist_name;
          if (!artistMap.has(artistName)) {
            artistMap.set(artistName, {
              id: event.artist_id || artistName.toLowerCase().replace(/\s+/g, '-'),
              name: artistName,
              identifier: `jambase:${event.artist_id || artistName.toLowerCase().replace(/\s+/g, '-')}`,
              image_url: null,
              genres: event.genres || [],
              band_or_musician: 'band' as 'band' | 'musician',
              num_upcoming_events: 0,
              eventCount: 0
            });
          }
          artistMap.get(artistName)!.eventCount++;
        }
      });

      // Convert to array and calculate match scores
      const artists = Array.from(artistMap.values()).map(artist => ({
        id: artist.id,
        name: artist.name,
        identifier: artist.identifier,
        image_url: artist.image_url,
        genres: artist.genres,
        band_or_musician: artist.band_or_musician,
        num_upcoming_events: artist.eventCount,
        match_score: this.calculateFuzzyMatchScore(query, artist.name),
        is_from_database: true,
      }));

      // Filter out very low matches and sort by score
      return artists
        .filter(artist => artist.match_score > 15) // Original threshold for better artist matching
        .sort((a, b) => b.match_score - a.match_score)
        .slice(0, limit);
    } catch (error) {
      console.error('❌ Error getting fuzzy matched results:', error);
      return [];
    }
  }

  /**
   * Calculate fuzzy match score between query and artist name
   * Enhanced algorithm to handle band names with apostrophes and special cases
   */
  static calculateFuzzyMatchScore(query: string, artistName: string): number {
    const queryLower = query.toLowerCase().trim();
    const nameLower = artistName.toLowerCase().trim();
    
    // Exact match
    if (nameLower === queryLower) {
      return 100;
    }
    
    // Starts with query (high priority)
    if (nameLower.startsWith(queryLower)) {
      return 95;
    }
    
    // Contains query as substring (boosted priority for band names)
    if (nameLower.includes(queryLower)) {
      const coverage = queryLower.length / nameLower.length;
      // Higher score when query is contained in artist name (like "Joe Russo" in "Joe Russo's Almost Dead")
      if (coverage >= 0.3) {
        return 85 + Math.round(coverage * 10);
      } else {
        return 70 + Math.round(coverage * 15);
      }
    }
    
    // Handle word-based matching with special characters
    const queryWords = queryLower.split(/[\s']+/).filter(w => w.length > 0);
    const nameWords = nameLower.split(/[\s']+/).filter(w => w.length > 0);
    
    if (queryWords.length > 1) {
      let wordMatches = 0;
      for (const queryWord of queryWords) {
        if (nameWords.includes(queryWord)) {
          wordMatches++;
        }
      }
      
      // For multi-word queries, require at least 50% word match
      if (wordMatches >= Math.ceil(queryWords.length * 0.5)) {
        return 80 + (wordMatches / queryWords.length) * 15;
      }
    }
    
    // Single word exact match in multi-word artist name
    if (queryWords.length === 1 && nameWords.includes(queryWords[0])) {
      return 85;
    }
    
    // Partial word matches (more permissive)
    let partialMatches = 0;
    for (const queryWord of queryWords) {
      for (const nameWord of nameWords) {
        if (nameWord.includes(queryWord) || queryWord.includes(nameWord)) {
          partialMatches++;
          break;
        }
      }
    }
    
    if (partialMatches > 0) {
      return 50 + (partialMatches / queryWords.length) * 30;
    }
    
    // Levenshtein distance (more permissive)
    const distance = this.levenshteinDistance(queryLower, nameLower);
    const maxLength = Math.max(queryLower.length, nameLower.length);
    const similarity = 1 - (distance / maxLength);
    
    if (similarity > 0.5) {
      return Math.round(similarity * 60);
    }
    
    return 0;
  }

  /**
   * Search for all content types (artists, events, users) based on query
   */
  static async searchAllContent(query: string, limit: number = 20): Promise<{
    artists: ArtistSearchResult[];
    events: any[];
    users: any[];
  }> {
    try {
      console.log(`🔍 Searching all content for: "${query}" with limit: ${limit}`);

      // Search artists
      console.log(`🎤 Searching artists with limit: ${Math.floor(limit * 0.5)}`);
      const artists = await this.searchArtists(query, Math.floor(limit * 0.5));
      
      // Search events (from jambase_events table)
      console.log(`🎵 Searching events with limit: ${Math.floor(limit * 0.3)}`);
      const events = await this.searchEvents(query, Math.floor(limit * 0.3));
      
      // Search users (from profiles table)
      console.log(`👤 Searching users with limit: ${Math.floor(limit * 0.2)}`);
      const users = await this.searchUsers(query, Math.floor(limit * 0.2));

      console.log(`📊 Search results summary:`, {
        artists: artists.length,
        events: events.length,
        users: users.length
      });

      return { artists, events, users };
    } catch (error) {
      console.error('❌ Error searching all content:', error);
      return { artists: [], events: [], users: [] };
    }
  }

  /**
   * Search for events by artist name or venue
   */
  private static async searchEvents(query: string, limit: number): Promise<any[]> {
    try {
      console.log(`🎵 Searching events for: "${query}" with limit: ${limit}`);
      
      const { data: events, error } = await (supabase as any)
        .from('jambase_events')
        .select('*')
        .or(`artist_name.ilike.%${query}%,venue_name.ilike.%${query}%,title.ilike.%${query}%`)
        .order('event_date', { ascending: true })
        .limit(limit);

      if (error) {
        console.warn('⚠️  Error searching events:', error);
        return [];
      }

      console.log(`🎵 Found ${events?.length || 0} events:`, events?.map(e => e.title || e.artist_name));
      return events || [];
    } catch (error) {
      console.error('❌ Error searching events:', error);
      return [];
    }
  }

  /**
   * Search for users by name or bio
   */
  private static async searchUsers(query: string, limit: number): Promise<any[]> {
    try {
      console.log(`👤 Searching users for: "${query}" with limit: ${limit}`);
      
      const { data: users, error } = await (supabase as any)
        .from('profiles')
        .select('user_id, name, bio, avatar_url, instagram_handle')
        .or(`name.ilike.%${query}%,bio.ilike.%${query}%,instagram_handle.ilike.%${query}%`)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.warn('⚠️  Error searching users:', error);
        return [];
      }

      console.log(`👤 Found ${users?.length || 0} users:`, users?.map(u => u.name));
      return users || [];
    } catch (error) {
      console.error('❌ Error searching users:', error);
      return [];
    }
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }
    
    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Get artist suggestions for autocomplete (simplified version)
   */
  static async getArtistSuggestions(query: string, limit: number = 10): Promise<ArtistSearchResult[]> {
    return this.searchArtists(query, limit);
  }

  /**
   * Get artist by ID from database
   */
  static async getArtistById(artistId: string): Promise<ArtistProfile | null> {
    const { data, error } = await supabase
      .from('artists')
      .select('*')
      .eq('jambase_artist_id', artistId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error(`Database error: ${error.message}`);
    }

    return data as any;
  }

  /**
   * Get all artists from database (for debugging)
   */
  static async getAllArtists(limit: number = 50): Promise<ArtistProfile[]> {
    const { data, error } = await supabase
      .from('artists')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return (data || []) as any;
  }

  /**
   * Clear all artists from database (for testing)
   */
  static async clearAllArtists(): Promise<void> {
    const { error } = await supabase
      .from('artists')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }
  }

  /**
   * Test JamBase API connection
   */
  static async testJamBaseAPI(): Promise<{ success: boolean; message: string; data?: any }> {
    console.log(`🔍 Testing JamBase API with key: ${this.API_KEY ? this.API_KEY.substring(0, 8) + '...' : 'NOT SET'}`);
    
    if (!this.API_KEY) {
      return {
        success: false,
        message: 'JamBase API key not configured. Please set VITE_JAMBASE_API_KEY environment variable.'
      };
    }

    try {
      const params = new URLSearchParams({
        artistName: 'test',
        perPage: '1',
        apikey: this.API_KEY,
      });

      const response = await fetch(`${this.JAMBASE_ARTISTS_URL}?${params}`, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          message: `JamBase API error: ${response.status} ${response.statusText}`
        };
      }

      const data = await response.json();
      
      return {
        success: true,
        message: 'JamBase API connection successful',
        data: data
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}
