import { ArtistProfileService } from './artistProfileService';
import { ArtistProfile, JamBaseArtistResponse } from '../types/artistProfile';

export interface JamBaseArtistSearchResult {
  id: string;
  name: string;
  identifier: string;
  image_url?: string;
  genres?: string[];
  band_or_musician?: 'band' | 'musician';
  num_upcoming_events?: number;
  match_score?: number;
}

export class JamBaseArtistSearchService {
  private static readonly JAMBASE_SEARCH_URL = 'https://www.jambase.com/jb-api/v1/artists/search';
  private static readonly API_KEY = import.meta.env.VITE_JAMBASE_API_KEY;

  /**
   * Search for artists using JamBase API
   */
  static async searchArtists(
    query: string,
    limit: number = 20
  ): Promise<JamBaseArtistSearchResult[]> {
    if (!this.API_KEY) {
      throw new Error('JamBase API key not configured');
    }

    if (query.length < 2) {
      return [];
    }

    try {
      const params = new URLSearchParams({
        q: query,
        limit: limit.toString(),
        apikey: this.API_KEY,
      });

      const response = await fetch(`${this.JAMBASE_SEARCH_URL}?${params}`, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`JamBase API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success || !data.artists) {
        return [];
      }

      // Transform and return results
      const results: JamBaseArtistSearchResult[] = data.artists.map((artist: any) => ({
        id: artist.identifier?.split(':')[1] || artist.identifier,
        name: artist.name,
        identifier: artist.identifier,
        image_url: artist.image,
        genres: artist.genre,
        band_or_musician: artist['x-bandOrMusician'],
        num_upcoming_events: artist['x-numUpcomingEvents'] || 0,
      }));

      return results;
    } catch (error) {
      console.error('Error searching JamBase artists:', error);
      throw error;
    }
  }

  /**
   * Search for artists with fuzzy matching and populate database
   */
  static async searchAndPopulateArtists(
    query: string,
    limit: number = 20
  ): Promise<JamBaseArtistSearchResult[]> {
    try {
      // First, try to get existing artists from our database
      const existingArtists = await ArtistProfileService.searchArtistsByName(query, limit);
      
      // If we have enough results from database, return them
      if (existingArtists.length >= limit) {
        return existingArtists.map(artist => ({
          id: artist.jambase_artist_id,
          name: artist.name,
          identifier: artist.identifier,
          image_url: artist.image_url,
          genres: artist.genres,
          band_or_musician: artist.band_or_musician,
          num_upcoming_events: artist.num_upcoming_events,
          match_score: this.calculateMatchScore(query, artist.name),
        }));
      }

      // Search JamBase API for additional artists
      const jamBaseResults = await this.searchArtists(query, limit);
      
      // Populate database with new artists
      const populatedArtists: JamBaseArtistSearchResult[] = [];
      
      for (const jamBaseArtist of jamBaseResults) {
        try {
          // Check if artist already exists in our database
          let existingArtist = await ArtistProfileService.getArtistProfileByJamBaseId(jamBaseArtist.id);
          
          if (!existingArtist) {
            // Fetch full artist details and populate database
            const fullArtistData = await ArtistProfileService.fetchArtistFromJamBase(
              jamBaseArtist.id,
              'jambase',
              {
                expandUpcomingEvents: true,
                expandExternalIdentifiers: true
              }
            );
            
            // Save to database
            existingArtist = await ArtistProfileService.upsertArtistProfile(fullArtistData, 'jambase');
          }

          // Add to results with match score
          populatedArtists.push({
            id: existingArtist.jambase_artist_id,
            name: existingArtist.name,
            identifier: existingArtist.identifier,
            image_url: existingArtist.image_url,
            genres: existingArtist.genres,
            band_or_musician: existingArtist.band_or_musician,
            num_upcoming_events: existingArtist.num_upcoming_events,
            match_score: this.calculateMatchScore(query, existingArtist.name),
          });
        } catch (error) {
          console.error(`Error populating artist ${jamBaseArtist.name}:`, error);
          // Still include the artist in results even if database population fails
          populatedArtists.push({
            ...jamBaseArtist,
            match_score: this.calculateMatchScore(query, jamBaseArtist.name),
          });
        }
      }

      // Sort by match score and return
      return populatedArtists
        .sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
        .slice(0, limit);

    } catch (error) {
      console.error('Error in searchAndPopulateArtists:', error);
      throw error;
    }
  }

  /**
   * Calculate fuzzy match score between query and artist name
   */
  private static calculateMatchScore(query: string, artistName: string): number {
    const queryLower = query.toLowerCase();
    const nameLower = artistName.toLowerCase();
    
    // Exact match
    if (nameLower === queryLower) {
      return 100;
    }
    
    // Starts with query
    if (nameLower.startsWith(queryLower)) {
      return 90;
    }
    
    // Contains query
    if (nameLower.includes(queryLower)) {
      return 80;
    }
    
    // Word boundary match
    const queryWords = queryLower.split(/\s+/);
    const nameWords = nameLower.split(/\s+/);
    
    let wordMatches = 0;
    for (const queryWord of queryWords) {
      if (nameWords.some(nameWord => nameWord.includes(queryWord))) {
        wordMatches++;
      }
    }
    
    if (wordMatches > 0) {
      return 70 + (wordMatches / queryWords.length) * 20;
    }
    
    // Levenshtein distance-based scoring
    const distance = this.levenshteinDistance(queryLower, nameLower);
    const maxLength = Math.max(queryLower.length, nameLower.length);
    const similarity = 1 - (distance / maxLength);
    
    return Math.round(similarity * 60);
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
   * Get artist suggestions for autocomplete
   */
  static async getArtistSuggestions(
    query: string,
    limit: number = 10
  ): Promise<Array<{
    id: string;
    title: string;
    subtitle?: string;
    image_url?: string;
    genres?: string[];
    band_or_musician?: 'band' | 'musician';
    num_upcoming_events?: number;
  }>> {
    try {
      const results = await this.searchAndPopulateArtists(query, limit);
      
      return results.map(artist => ({
        id: artist.id,
        title: artist.name,
        subtitle: artist.genres?.slice(0, 2).join(', '),
        image_url: artist.image_url,
        genres: artist.genres,
        band_or_musician: artist.band_or_musician,
        num_upcoming_events: artist.num_upcoming_events,
      }));
    } catch (error) {
      console.error('Error getting artist suggestions:', error);
      return [];
    }
  }
}
