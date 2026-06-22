import { supabase } from '../integrations/supabase/client';
import { ArtistProfile, ArtistProfileSummary, JamBaseArtistResponse, transformJamBaseArtistToProfile } from '../types/artistProfile';

export class ArtistProfileService {
  /**
   * REMOVED: Fetch artist data from JamBase API
   * Frontend no longer has direct API access - use database queries instead
   * Artists are synced via backend sync service
   */
  static async fetchArtistFromJamBase(): Promise<never> {
    throw new Error('Jambase API access removed from frontend. Use database queries instead.');
  }

  /**
   * Create or update artist profile in database
   */
  static async upsertArtistProfile(
    jambaseResponse: JamBaseArtistResponse,
    artistDataSource: string = 'jambase'
  ): Promise<ArtistProfile> {
    const profileData = transformJamBaseArtistToProfile(jambaseResponse, artistDataSource);
    
    // Check if artist profile already exists
    const { data: existingProfile } = await supabase
      .from('artist_profile')
      .select('id')
      .eq('identifier', profileData.identifier)
      .single();
    
    let data;
    if (existingProfile) {
      // Update existing profile
      const { data: updatedData, error } = await supabase
        .from('artist_profile')
        .update({
          ...profileData,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', existingProfile.id)
        .select()
        .single();
      
      if (error) {
        throw new Error(`Failed to update artist profile: ${error.message}`);
      }
      data = updatedData;
    } else {
      // Insert new profile
      const { data: insertedData, error } = await supabase
        .from('artist_profile')
        .insert({
          ...profileData,
          last_synced_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (error) {
        throw new Error(`Failed to insert artist profile: ${error.message}`);
      }
      data = insertedData;
    }

    return data;
  }

  /**
   * Get artist profile by JamBase ID
   */
  static async getArtistProfileByJamBaseId(jambaseArtistId: string): Promise<ArtistProfile | null> {
    // Note: artist_profile table is separate from artists table
    // This service may need refactoring to use normalized schema
    const { data, error } = await supabase
      .from('artist_profile')
      .select('*')
      .eq('jambase_artist_id', jambaseArtistId)
      .maybeSingle();

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
   * REMOVED: Sync artist data from JamBase API
   * Frontend no longer has direct API access - sync happens via backend
   */
  static async syncArtistFromJamBase(): Promise<never> {
    throw new Error('Jambase API sync removed from frontend. Use backend sync service instead.');
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
