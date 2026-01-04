import { supabase } from '@/integrations/supabase/client';
import type { ArtistFollow, ArtistFollowWithDetails, ArtistFollowStats } from '@/types/artistFollow';

/**
 * Service for managing artist follows
 * Similar to UserEventService for event interest
 */
export class ArtistFollowService {
  /**
   * Toggle artist follow status
   * @param userId - The user ID
   * @param artistId - The artist UUID (not jambase_artist_id)
   * @param following - Whether to follow or unfollow
   */
  static async setArtistFollow(
    userId: string,
    artistId: string,
    following: boolean
  ): Promise<void> {
    try {
      // Try RPC function first (preferred method)
      const { error: rpcError } = await (supabase as any).rpc('set_artist_follow', {
        p_artist_id: artistId,
        p_following: following
      });

      // Check if RPC function doesn't exist or has issues (404, function not found, or table not found errors)
      const isRpcNotFound = rpcError && (
        rpcError.code === '42883' || // Function does not exist
        rpcError.code === 'PGRST404' || // PostgREST 404
        rpcError.code === '42P01' || // Table does not exist (error in function)
        rpcError.message?.includes('404') ||
        rpcError.message?.includes('does not exist') ||
        rpcError.message?.includes('function') ||
        rpcError.message?.includes('relation')
      );

      // If RPC function doesn't exist or has table issues, fallback to direct table operations
      if (isRpcNotFound) {
        console.warn('⚠️ RPC function set_artist_follow not available, using direct table operations');
        
        if (following) {
          // Insert follow record in artist_follows table (3NF compliant)
          const { error: insertError } = await supabase
            .from('artist_follows')
            .insert({
              user_id: userId,
              artist_id: artistId
            });

          // Ignore unique constraint errors (already following)
          if (insertError && insertError.code !== '23505') {
            throw insertError;
          }
        } else {
          // Delete follow record from artist_follows table
          const { error: deleteError } = await supabase
            .from('artist_follows')
            .delete()
            .eq('user_id', userId)
            .eq('artist_id', artistId);

          if (deleteError) throw deleteError;
        }
      } else if (rpcError) {
        // Other RPC errors should be thrown
        throw rpcError;
      }

      console.log(`✅ Artist follow ${following ? 'added' : 'removed'}:`, { userId, artistId });
    } catch (error) {
      console.error('Error setting artist follow:', error);
      throw new Error(`Failed to ${following ? 'follow' : 'unfollow'} artist: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Toggle artist follow status by artist name (creates artist if needed)
   * @param userId - The user UUID
   * @param artistName - The artist name
   * @param jambaseArtistId - Optional JamBase artist ID
   * @param following - Whether to follow (true) or unfollow (false)
   */
  static async setArtistFollowByName(
    userId: string, 
    artistName: string, 
    jambaseArtistId?: string, 
    following: boolean = true
  ): Promise<void> {
    try {
      // First, try to find or create the artist
      let artistId: string | null = null;

      // Try to find existing artist by name
      const { data: existingArtist, error: searchError } = await supabase
        .from('artists')
        .select('id')
        .ilike('name', artistName)
        .limit(1)
        .maybeSingle();

      if (searchError) {
        console.warn('Error searching for existing artist:', searchError);
        // Continue with creating new artist
      }

      if (existingArtist) {
        artistId = existingArtist.id;
      } else {
        // Create a new artist entry
        const { data: newArtist, error: createError } = await supabase
          .from('artists')
          .insert({
            name: artistName,
            jambase_artist_id: jambaseArtistId || `manual:${artistName.toLowerCase().replace(/\s+/g, '-')}`,
            identifier: jambaseArtistId || `manual:${artistName.toLowerCase().replace(/\s+/g, '-')}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select('id')
          .single();

        if (createError) throw createError;
        artistId = newArtist.id;
      }

      if (!artistId) {
        throw new Error('Failed to find or create artist');
      }

      // Now follow/unfollow the artist
      await this.setArtistFollow(userId, artistId, following);
    } catch (error) {
      console.error('Error setting artist follow by name:', error);
      throw new Error(`Failed to ${following ? 'follow' : 'unfollow'} artist: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if user is following an artist
   * @param artistId - The artist UUID
   * @param userId - The user UUID
   */
  static async isFollowingArtist(artistId: string, userId: string): Promise<boolean> {
    try {
      // Query artist_follows table directly (3NF compliant)
      const { data, error } = await supabase
        .from('artist_follows')
        .select('id')
        .eq('user_id', userId)
        .eq('artist_id', artistId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking if following artist:', error);
        return false;
      }

      return !!data;
    } catch (error) {
      console.error('Error checking if following artist:', error);
      return false;
    }
  }

  /**
   * Get follower count for an artist
   * @param artistId - The artist UUID
   */
  static async getFollowerCount(artistId: string): Promise<number> {
    try {
      // Query artist_follows table directly (3NF compliant)
      const { count, error } = await supabase
        .from('artist_follows')
        .select('*', { count: 'exact', head: true })
        .eq('artist_id', artistId);

      if (error) {
        console.error('Error getting follower count:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('Error getting follower count:', error);
      return 0;
    }
  }

  /**
   * Get artist follow stats (follower count + is following)
   * @param artistId - The artist UUID
   * @param userId - The user UUID (optional)
   */
  static async getArtistFollowStats(artistId: string, userId?: string): Promise<ArtistFollowStats> {
    try {
      const [followerCount, isFollowing] = await Promise.all([
        this.getFollowerCount(artistId),
        userId ? this.isFollowingArtist(artistId, userId) : Promise.resolve(false)
      ]);

      return {
        follower_count: followerCount,
        is_following: isFollowing
      };
    } catch (error) {
      console.error('Error getting artist follow stats:', error);
      return {
        follower_count: 0,
        is_following: false
      };
    }
  }

  /**
   * Get artist follow stats by artist name
   * @param artistName - The artist name
   * @param userId - The user UUID (optional)
   */
  static async getArtistFollowStatsByName(artistName: string, userId?: string): Promise<ArtistFollowStats> {
    try {
      // First try to find the artist
      const { data: artist, error: searchError } = await supabase
        .from('artists')
        .select('id')
        .ilike('name', artistName)
        .limit(1)
        .maybeSingle();

      if (searchError) {
        console.warn('Error searching for artist in getArtistFollowStatsByName:', searchError);
        // Return default stats if search fails
        return {
          follower_count: 0,
          is_following: false
        };
      }

      if (!artist) {
        // Artist doesn't exist, so not following
        return {
          follower_count: 0,
          is_following: false
        };
      }

      // Get stats for the found artist
      return await this.getArtistFollowStats(artist.id, userId);
    } catch (error) {
      console.error('Error getting artist follow stats by name:', error);
      return {
        follower_count: 0,
        is_following: false
      };
    }
  }

  /**
   * Get all artists that a user follows
   * @param userId - The user UUID
   */
  static async getUserFollowedArtists(userId: string): Promise<ArtistFollowWithDetails[]> {
    try {
      console.log('🔍 Getting followed artists for user:', userId);
      
      // Query artist_follows table (3NF compliant)
      const { data: follows, error: followsError } = await supabase
        .from('artist_follows')
        .select('id, artist_id, user_id, created_at, updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      console.log('🔍 ArtistFollowService query result:', {
        followsLength: follows?.length || 0,
        error: followsError,
        firstFollow: follows?.[0]
      });

      if (followsError) {
        console.error('❌ Error fetching artist follows:', followsError);
        console.error('❌ Error details:', JSON.stringify(followsError, null, 2));
        return [];
      }

      if (!follows || follows.length === 0) {
        console.log('⚠️ No artist follows found for user:', userId);
        return [];
      }

      console.log(`✅ Found ${follows.length} artist follows`);

      // Extract artist IDs
      const artistIds = follows.map((follow: any) => follow.artist_id).filter(Boolean);
      console.log('Artist IDs to fetch:', artistIds.length);

      if (artistIds.length === 0) {
        return [];
      }

      // Fetch artist details
      const { data: artists, error: artistsError } = await supabase
        .from('artists')
        .select('id, name, image_url, jambase_artist_id')
        .in('id', artistIds);

      if (artistsError) {
        console.error('Error fetching artist details:', artistsError);
        return [];
      }

      // Create a map of artist_id -> artist data
      const artistsMap = new Map((artists || []).map((a: any) => [a.id, a]));

      // Transform to match expected format
      const result = follows.map((follow: any) => {
        const artist = artistsMap.get(follow.artist_id);
        return {
          id: follow.id,
          user_id: userId,
          artist_id: follow.artist_id,
          created_at: follow.created_at,
          artist_name: artist?.name || null,
          artist_image_url: artist?.image_url || null,
          jambase_artist_id: artist?.jambase_artist_id || null,
          num_upcoming_events: null,
          genres: null,
          user_name: null,
          user_avatar_url: null
        } as ArtistFollowWithDetails;
      });

      console.log('✅ Followed artists fetched:', result.length);
      return result;
    } catch (error) {
      console.error('Error getting followed artists:', error);
      // Return empty array instead of throwing to prevent blocking the UI
      return [];
    }
  }

  /**
   * Get all users following an artist
   * @param artistId - The artist UUID
   */
  static async getArtistFollowers(artistId: string): Promise<ArtistFollowWithDetails[]> {
    try {
      const { data, error } = await (supabase as any)
        .from('artist_follows_with_details')
        .select('*')
        .eq('artist_id', artistId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data as ArtistFollowWithDetails[]) || [];
    } catch (error) {
      console.error('Error getting artist followers:', error);
      throw new Error(`Failed to get artist followers: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get artist UUID from jambase_artist_id
   * Searches both artists and artist_profile tables
   * @param jambaseArtistId - The JamBase artist ID
   */
  static async getArtistUuidByJambaseId(jambaseArtistId: string): Promise<string | null> {
    try {
      // Use helper function to get UUID from external ID (normalized schema)
      const { data: uuidResult, error: uuidError } = await supabase
        .rpc('get_entity_uuid_by_external_id', {
          p_external_id: jambaseArtistId,
          p_source: 'jambase',
          p_entity_type: 'artist'
        });

      if (!uuidError && uuidResult) {
        return uuidResult;
      }

      // Fallback: try helper view for backward compatibility
      const { data, error } = await supabase
        .from('artists_with_external_ids')
        .select('id')
        .eq('jambase_artist_id', jambaseArtistId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.warn('Artists table query failed:', error);
      } else if (data) {
        return data.id;
      }

      return null;
    } catch (error) {
      console.error('Error getting artist UUID:', error);
      return null;
    }
  }

  /**
   * Get artist UUID from artist name
   * Searches both artists and artist_profile tables
   * @param artistName - The artist name
   */
  static async getArtistUuidByName(artistName: string): Promise<string | null> {
    try {
      // Try artists table first (more reliable, always available)
      let { data, error } = await supabase
        .from('artists')
        .select('id')
        .ilike('name', artistName)
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.warn('Artists table query failed:', error);
      } else if (data) {
        return data.id;
      }

      // Do not query artist_profile in this environment; table may not exist

      return null;
    } catch (error) {
      console.error('Error getting artist UUID by name:', error);
      return null;
    }
  }

  /**
   * Subscribe to artist follow changes for real-time updates
   * @param userId - The user UUID
   * @param onFollowChange - Callback when follow status changes
   */
  static subscribeToArtistFollows(
    userId: string,
    onFollowChange: (follow: ArtistFollow, event: 'INSERT' | 'DELETE') => void
  ) {
    const channel = supabase
      .channel('artist-follows')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'artist_follows',  // Use existing artist_follows table
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          onFollowChange(payload.new as ArtistFollow, 'INSERT');
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'artist_follows',  // Use existing artist_follows table
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          onFollowChange(payload.old as ArtistFollow, 'DELETE');
        }
      )
      .subscribe();

    return channel;
  }
}

