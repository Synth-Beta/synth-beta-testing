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
      // Use SECURITY DEFINER function to avoid recursive RLS
      const { error } = await (supabase as any).rpc('set_artist_follow', {
        p_artist_id: artistId,
        p_following: following
      });

      if (error) throw error;

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
      const { data, error } = await (supabase as any).rpc('is_following_artist', {
        p_artist_id: artistId,
        p_user_id: userId
      });

      if (error) throw error;

      return data as boolean;
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
      const { data, error } = await (supabase as any).rpc('get_artist_follower_count', {
        p_artist_id: artistId
      });

      if (error) throw error;

      return (data as number) || 0;
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
      // Try the view first, fallback to direct query if view doesn't exist
      const { data, error } = await (supabase as any)
        .from('artist_follows_with_details')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        // If view doesn't exist, fallback to base table
        console.warn('⚠️ artist_follows_with_details view not found, using artist_follows table');
        const { data: fallbackData, error: fallbackError } = await (supabase as any)
          .from('artist_follows')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
          
        if (fallbackError) throw fallbackError;
        return (fallbackData || []) as ArtistFollowWithDetails[];
      }

      return (data as ArtistFollowWithDetails[]) || [];
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
      // Try artist_profile table first (more reliable)
      let { data, error } = await supabase
        .from('artist_profile')
        .select('id')
        .eq('jambase_artist_id', jambaseArtistId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.warn('Artist profile table query failed:', error);
      } else if (data) {
        return data.id;
      }

      // Try artists table as fallback
      ({ data, error } = await supabase
        .from('artists')
        .select('id')
        .eq('jambase_artist_id', jambaseArtistId)
        .maybeSingle());

      if (error) {
        console.warn('Artists table query failed:', error);
        return null;
      }
      
      if (data) return data.id;

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
      // Try artist_profile table first (more reliable)
      let { data, error } = await supabase
        .from('artist_profile')
        .select('id')
        .ilike('name', artistName)
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.warn('Artist profile table query failed:', error);
      } else if (data) {
        return data.id;
      }

      // Try artists table as fallback
      ({ data, error } = await supabase
        .from('artists')
        .select('id')
        .ilike('name', artistName)
        .limit(1)
        .maybeSingle());

      if (error) {
        console.warn('Artists table query failed:', error);
        return null;
      }
      
      if (data) return data.id;

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
          table: 'artist_follows',
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
          table: 'artist_follows',
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

