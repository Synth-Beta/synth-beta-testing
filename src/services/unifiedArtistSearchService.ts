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

      // Step 2: Populate Supabase with all found artists
      const populatedArtists = await this.populateArtistProfiles(jamBaseResults);
      console.log(`💾 Populated ${populatedArtists.length} artists in database`);

      // Step 3: Get fuzzy matched results from Supabase
      const fuzzyResults = await this.getFuzzyMatchedResults(query, limit);
      console.log(`🎯 Found ${fuzzyResults.length} fuzzy matched results from database`);

      // If no fuzzy results from database, return the JamBase results directly
      if (fuzzyResults.length === 0 && jamBaseResults.length > 0) {
        console.log(`🔄 No database results, returning JamBase results directly`);
        return jamBaseResults.map(artist => ({
          id: artist.id,
          name: artist.name,
          identifier: artist.identifier,
          image_url: artist.image,
          genres: artist.genres,
          band_or_musician: artist['x-bandOrMusician'] as 'band' | 'musician',
          num_upcoming_events: artist['x-numUpcomingEvents'],
          match_score: this.calculateFuzzyMatchScore(query, artist.name),
          is_from_database: false,
        }));
      }

      return fuzzyResults;
    } catch (error) {
      console.error('❌ Error in unified artist search:', error);
      throw error;
    }
  }

  /**
   * Search JamBase API for artists using the correct artists endpoint
   */
  private static async searchJamBaseAPI(query: string, limit: number): Promise<any[]> {
    if (!this.API_KEY) {
      console.error('❌ JamBase API key not configured. Environment variable VITE_JAMBASE_API_KEY is missing.');
      throw new Error('JamBase API key not configured. Please check your environment variables.');
    }
    
    console.log(`🔑 Using JamBase API key: ${this.API_KEY.substring(0, 8)}...`);

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
      console.warn('Using fallback data due to API error');
      return this.getFallbackArtists(query, limit);
    }

    const data = await response.json();
    console.log(`📊 JamBase API response data:`, { success: data.success, artistCount: data.artists?.length });
    
    if (!data.success || !data.artists || !Array.isArray(data.artists)) {
      console.warn('Invalid JamBase API response format, using fallback data', data);
      return this.getFallbackArtists(query, limit);
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
  }

  /**
   * Get fallback artists when JamBase API is not available
   */
  private static getFallbackArtists(query: string, limit: number): any[] {
    const fallbackArtists = [
      {
        id: 'phish-1',
        name: 'Phish',
        identifier: 'jambase:194164',
        image: 'https://via.placeholder.com/300x300/4F46E5/FFFFFF?text=Phish',
        genres: ['rock', 'jam band', 'psychedelic rock'],
        'x-bandOrMusician': 'band',
        'x-numUpcomingEvents': 12
      },
      {
        id: 'dead-company-1',
        name: 'Dead & Company',
        identifier: 'jambase:123456',
        image: 'https://via.placeholder.com/300x300/059669/FFFFFF?text=Dead+%26+Company',
        genres: ['rock', 'jam band', 'psychedelic rock'],
        'x-bandOrMusician': 'band',
        'x-numUpcomingEvents': 8
      },
      {
        id: 'grateful-dead-1',
        name: 'Grateful Dead',
        identifier: 'jambase:789012',
        image: 'https://via.placeholder.com/300x300/DC2626/FFFFFF?text=Grateful+Dead',
        genres: ['rock', 'jam band', 'psychedelic rock'],
        'x-bandOrMusician': 'band',
        'x-numUpcomingEvents': 0
      },
      {
        id: 'tame-impala-1',
        name: 'Tame Impala',
        identifier: 'jambase:345678',
        image: 'https://via.placeholder.com/300x300/7C3AED/FFFFFF?text=Tame+Impala',
        genres: ['psychedelic rock', 'indie rock', 'electronic'],
        'x-bandOrMusician': 'band',
        'x-numUpcomingEvents': 15
      },
      {
        id: 'radiohead-1',
        name: 'Radiohead',
        identifier: 'jambase:901234',
        image: 'https://via.placeholder.com/300x300/EA580C/FFFFFF?text=Radiohead',
        genres: ['alternative rock', 'electronic', 'experimental'],
        'x-bandOrMusician': 'band',
        'x-numUpcomingEvents': 6
      }
    ];

    // Filter artists that match the query
    const matchingArtists = fallbackArtists.filter(artist => 
      artist.name.toLowerCase().includes(query.toLowerCase())
    );

    return matchingArtists.slice(0, limit);
  }

  /**
   * Populate Supabase artist_profile table with JamBase results
   */
  private static async populateArtistProfiles(jamBaseArtists: any[]): Promise<ArtistProfile[]> {
    const populatedArtists: ArtistProfile[] = [];

    for (const jamBaseArtist of jamBaseArtists) {
      try {
        const artistId = jamBaseArtist.identifier?.split(':')[1] || jamBaseArtist.identifier;
        
        // Check if artist already exists
        const { data: existingArtist } = await supabase
          .from('artist_profile')
          .select('*')
          .eq('jambase_artist_id', artistId)
          .single();

        if (existingArtist) {
          console.log(`♻️  Artist ${jamBaseArtist.name} already exists in database`);
          populatedArtists.push(existingArtist as any);
          continue;
        }

        // Fetch full artist details from JamBase
        const fullArtistData = await this.fetchFullArtistDetails(artistId);
        
        // Transform and save to database
        const profileData = transformJamBaseArtistToProfile(fullArtistData, 'jambase');
        
        const { data: savedArtist, error } = await supabase
          .from('artist_profile')
          .upsert({
            ...profileData,
            last_synced_at: new Date().toISOString(),
          } as any, {
            onConflict: 'identifier'
          })
          .select()
          .single();

        if (error) {
          console.error(`❌ Error saving artist ${jamBaseArtist.name}:`, error);
          continue;
        }

        console.log(`✅ Saved artist ${jamBaseArtist.name} to database`);
        populatedArtists.push(savedArtist as any);
      } catch (error) {
        console.error(`❌ Error processing artist ${jamBaseArtist.name}:`, error);
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
   * Get fuzzy matched results from Supabase
   */
  private static async getFuzzyMatchedResults(query: string, limit: number): Promise<ArtistSearchResult[]> {
    // Get all artists from database
    const { data: allArtists, error } = await supabase
      .from('artist_profile')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    if (!allArtists || allArtists.length === 0) {
      return [];
    }

    // Calculate fuzzy match scores for all artists
    const scoredArtists = allArtists.map(artist => ({
      id: artist.jambase_artist_id,
      name: artist.name,
      identifier: artist.identifier,
      image_url: artist.image_url,
      genres: artist.genres,
      band_or_musician: artist.band_or_musician as 'band' | 'musician',
      num_upcoming_events: artist.num_upcoming_events,
      match_score: this.calculateFuzzyMatchScore(query, artist.name),
      is_from_database: true,
    }));

    // Filter out very low matches and sort by score
    return scoredArtists
      .filter(artist => artist.match_score > 20) // Only show matches above 20%
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, limit);
  }

  /**
   * Calculate fuzzy match score between query and artist name
   */
  static calculateFuzzyMatchScore(query: string, artistName: string): number {
    const queryLower = query.toLowerCase().trim();
    const nameLower = artistName.toLowerCase().trim();
    
    // Exact match
    if (nameLower === queryLower) {
      return 100;
    }
    
    // Starts with query
    if (nameLower.startsWith(queryLower)) {
      return 95;
    }
    
    // Contains query as whole word
    const queryWords = queryLower.split(/\s+/);
    const nameWords = nameLower.split(/\s+/);
    
    let wholeWordMatches = 0;
    for (const queryWord of queryWords) {
      if (nameWords.includes(queryWord)) {
        wholeWordMatches++;
      }
    }
    
    if (wholeWordMatches > 0) {
      return 85 + (wholeWordMatches / queryWords.length) * 10;
    }
    
    // Contains query as substring
    if (nameLower.includes(queryLower)) {
      return 75;
    }
    
    // Partial word matches
    let partialWordMatches = 0;
    for (const queryWord of queryWords) {
      for (const nameWord of nameWords) {
        if (nameWord.includes(queryWord) || queryWord.includes(nameWord)) {
          partialWordMatches++;
          break;
        }
      }
    }
    
    if (partialWordMatches > 0) {
      return 60 + (partialWordMatches / queryWords.length) * 15;
    }
    
    // Levenshtein distance-based scoring
    const distance = this.levenshteinDistance(queryLower, nameLower);
    const maxLength = Math.max(queryLower.length, nameLower.length);
    const similarity = 1 - (distance / maxLength);
    
    return Math.round(similarity * 50);
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
      .from('artist_profile')
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
      .from('artist_profile')
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
      .from('artist_profile')
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
