import { supabase } from '../integrations/supabase/client';
import { ArtistProfile, ArtistProfileSummary, JamBaseArtistResponse, transformJamBaseArtistToProfile } from '../types/artistProfile';

export class ArtistProfileService {
  /**
   * Fetch artist data from JamBase API
   */
  static async fetchArtistFromJamBase(
    artistId: string, 
    artistDataSource: string = 'jambase',
    options: {
      excludeEventPerformers?: boolean;
      expandExternalIdentifiers?: boolean;
      expandPastEvents?: boolean;
      expandUpcomingEvents?: boolean;
      expandUpcomingStreams?: boolean;
    } = {}
  ): Promise<JamBaseArtistResponse> {
    const params = new URLSearchParams();
    
    if (options.excludeEventPerformers !== undefined) {
      params.append('excludeEventPerformers', options.excludeEventPerformers.toString());
    }
    if (options.expandExternalIdentifiers !== undefined) {
      params.append('expandExternalIdentifiers', options.expandExternalIdentifiers.toString());
    }
    if (options.expandPastEvents !== undefined) {
      params.append('expandPastEvents', options.expandPastEvents.toString());
    }
    if (options.expandUpcomingEvents !== undefined) {
      params.append('expandUpcomingEvents', options.expandUpcomingEvents.toString());
    }
    if (options.expandUpcomingStreams !== undefined) {
      params.append('expandUpcomingStreams', options.expandUpcomingStreams.toString());
    }

    const queryString = params.toString();
    const url = `https://www.jambase.com/jb-api/v1/artists/id/${artistDataSource}:${artistId}${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'apikey': import.meta.env.VITE_JAMBASE_API_KEY || '',
      },
    });

    if (!response.ok) {
      throw new Error(`JamBase API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Create or update artist profile in database
   */
  static async upsertArtistProfile(
    jambaseResponse: JamBaseArtistResponse,
    artistDataSource: string = 'jambase'
  ): Promise<ArtistProfile> {
    const profileData = transformJamBaseArtistToProfile(jambaseResponse, artistDataSource);
    
    const { data, error } = await supabase
      .from('artist_profile')
      .upsert({
        ...profileData,
        last_synced_at: new Date().toISOString(),
      }, {
        onConflict: 'identifier'
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to upsert artist profile: ${error.message}`);
    }

    return data;
  }

  /**
   * Get artist profile by JamBase ID
   */
  static async getArtistProfileByJamBaseId(jambaseArtistId: string): Promise<ArtistProfile | null> {
    const { data, error } = await supabase
      .from('artist_profile')
      .select('*')
      .eq('jambase_artist_id', jambaseArtistId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error(`Failed to get artist profile: ${error.message}`);
    }

    return data;
  }

  /**
   * Get artist profile by identifier
   */
  static async getArtistProfileByIdentifier(identifier: string): Promise<ArtistProfile | null> {
    const { data, error } = await supabase
      .from('artist_profile')
      .select('*')
      .eq('identifier', identifier)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error(`Failed to get artist profile: ${error.message}`);
    }

    return data;
  }

  /**
   * Search artists by name
   */
  static async searchArtistsByName(
    name: string, 
    limit: number = 20
  ): Promise<ArtistProfileSummary[]> {
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
  static async getArtistsByGenre(
    genre: string, 
    limit: number = 20
  ): Promise<ArtistProfileSummary[]> {
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
   * Get artists by type (band or musician)
   */
  static async getArtistsByType(
    type: 'band' | 'musician', 
    limit: number = 20
  ): Promise<ArtistProfileSummary[]> {
    const { data, error } = await supabase
      .from('artist_profile_summary')
      .select('*')
      .eq('band_or_musician', type)
      .order('name')
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get artists by type: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get all artist profiles with pagination
   */
  static async getAllArtistProfiles(
    page: number = 0, 
    pageSize: number = 20
  ): Promise<{ data: ArtistProfileSummary[]; total: number }> {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await supabase
      .from('artist_profile_summary')
      .select('*', { count: 'exact' })
      .order('name')
      .range(from, to);

    if (error) {
      throw new Error(`Failed to get artist profiles: ${error.message}`);
    }

    return {
      data: data || [],
      total: count || 0,
    };
  }

  /**
   * Sync artist data from JamBase API and save to database
   */
  static async syncArtistFromJamBase(
    artistId: string,
    artistDataSource: string = 'jambase',
    options: {
      excludeEventPerformers?: boolean;
      expandExternalIdentifiers?: boolean;
      expandPastEvents?: boolean;
      expandUpcomingEvents?: boolean;
      expandUpcomingStreams?: boolean;
    } = {}
  ): Promise<ArtistProfile> {
    // Fetch from JamBase API
    const jambaseResponse = await this.fetchArtistFromJamBase(artistId, artistDataSource, options);
    
    // Save to database
    return this.upsertArtistProfile(jambaseResponse, artistDataSource);
  }

  /**
   * Delete artist profile
   */
  static async deleteArtistProfile(artistId: string): Promise<void> {
    const { error } = await supabase
      .from('artist_profile')
      .delete()
      .eq('id', artistId);

    if (error) {
      throw new Error(`Failed to delete artist profile: ${error.message}`);
    }
  }

  /**
   * Get artist profile statistics
   */
  static async getArtistProfileStats(): Promise<{
    total_artists: number;
    bands: number;
    musicians: number;
    genres_count: { genre: string; count: number }[];
  }> {
    // Get total count
    const { count: totalArtists } = await supabase
      .from('artist_profile')
      .select('*', { count: 'exact', head: true });

    // Get bands vs musicians count
    const { data: typeData } = await supabase
      .from('artist_profile')
      .select('band_or_musician')
      .not('band_or_musician', 'is', null);

    const bands = typeData?.filter(item => item.band_or_musician === 'band').length || 0;
    const musicians = typeData?.filter(item => item.band_or_musician === 'musician').length || 0;

    // Get genre counts (this is a simplified approach)
    const { data: genreData } = await supabase
      .from('artist_profile')
      .select('genres')
      .not('genres', 'is', null);

    const genreCounts: { [key: string]: number } = {};
    genreData?.forEach(item => {
      item.genres?.forEach(genre => {
        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
      });
    });

    const genresCount = Object.entries(genreCounts)
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count);

    return {
      total_artists: totalArtists || 0,
      bands,
      musicians,
      genres_count: genresCount,
    };
  }
}
