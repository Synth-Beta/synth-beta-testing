import { supabase } from '@/integrations/supabase/client';
import type { VenueFollow, VenueFollowWithDetails, VenueFollowStats } from '@/types/venueFollow';

/**
 * Service for managing venue follows
 * Uses NAME-BASED matching (not IDs)
 * Includes city/state for venue uniqueness
 */
export class VenueFollowService {
  /**
   * Normalize venue name for consistent matching
   */
  private static normalizeVenueName(name: string): string {
    return name.trim();
  }

  /**
   * Toggle venue follow status by name
   * @param userId - The user UUID
   * @param venueName - The venue name (will be normalized)
   * @param venueCity - The venue city (optional but recommended)
   * @param venueState - The venue state (optional but recommended)
   * @param following - Whether to follow or unfollow
   */
  static async setVenueFollowByName(
    userId: string,
    venueName: string,
    venueCity?: string,
    venueState?: string,
    following: boolean = true
  ): Promise<void> {
    try {
      const normalizedName = this.normalizeVenueName(venueName);

      // Use SECURITY DEFINER function to avoid recursive RLS
      const { error } = await (supabase as any).rpc('set_venue_follow', {
        p_venue_name: normalizedName,
        p_venue_city: venueCity || null,
        p_venue_state: venueState || null,
        p_following: following
      });

      if (error) throw error;

      console.log(`✅ Venue follow ${following ? 'added' : 'removed'}:`, { 
        userId, 
        venueName: normalizedName,
        venueCity,
        venueState
      });
    } catch (error) {
      console.error('Error setting venue follow:', error);
      throw new Error(`Failed to ${following ? 'follow' : 'unfollow'} venue: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if user is following a venue by name
   * @param venueName - The venue name
   * @param venueCity - The venue city
   * @param venueState - The venue state
   * @param userId - The user UUID
   */
  static async isFollowingVenueByName(
    venueName: string,
    venueCity: string | undefined,
    venueState: string | undefined,
    userId: string
  ): Promise<boolean> {
    try {
      const normalizedName = this.normalizeVenueName(venueName);

      const { data, error } = await (supabase as any).rpc('is_following_venue', {
        p_venue_name: normalizedName,
        p_venue_city: venueCity || null,
        p_venue_state: venueState || null,
        p_user_id: userId
      });

      if (error) throw error;

      return data as boolean;
    } catch (error) {
      console.error('Error checking if following venue:', error);
      return false;
    }
  }

  /**
   * Get follower count for a venue by name
   * @param venueName - The venue name
   * @param venueCity - The venue city
   * @param venueState - The venue state
   */
  static async getFollowerCountByName(
    venueName: string,
    venueCity?: string,
    venueState?: string
  ): Promise<number> {
    try {
      const normalizedName = this.normalizeVenueName(venueName);

      const { data, error } = await (supabase as any).rpc('get_venue_follower_count', {
        p_venue_name: normalizedName,
        p_venue_city: venueCity || null,
        p_venue_state: venueState || null
      });

      if (error) throw error;

      return (data as number) || 0;
    } catch (error) {
      console.error('Error getting venue follower count:', error);
      return 0;
    }
  }

  /**
   * Get venue follow stats by name (follower count + is following)
   * @param venueName - The venue name
   * @param venueCity - The venue city
   * @param venueState - The venue state
   * @param userId - The user UUID (optional)
   */
  static async getVenueFollowStatsByName(
    venueName: string,
    venueCity?: string,
    venueState?: string,
    userId?: string
  ): Promise<VenueFollowStats> {
    try {
      const [followerCount, isFollowing] = await Promise.all([
        this.getFollowerCountByName(venueName, venueCity, venueState),
        userId ? this.isFollowingVenueByName(venueName, venueCity, venueState, userId) : Promise.resolve(false)
      ]);

      return {
        follower_count: followerCount,
        is_following: isFollowing
      };
    } catch (error) {
      console.error('Error getting venue follow stats:', error);
      return {
        follower_count: 0,
        is_following: false
      };
    }
  }

  /**
   * Get all venues that a user follows
   * @param userId - The user UUID
   */
  static async getUserFollowedVenues(userId: string): Promise<VenueFollowWithDetails[]> {
    try {
      const { data, error } = await (supabase as any)
        .from('venue_follows_with_details')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data as VenueFollowWithDetails[]) || [];
    } catch (error) {
      console.error('Error getting followed venues:', error);
      throw new Error(`Failed to get followed venues: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all users following a venue by name
   * @param venueName - The venue name
   * @param venueCity - The venue city
   * @param venueState - The venue state
   */
  static async getVenueFollowersByName(
    venueName: string,
    venueCity?: string,
    venueState?: string
  ): Promise<VenueFollowWithDetails[]> {
    try {
      const normalizedName = this.normalizeVenueName(venueName);

      let query = (supabase as any)
        .from('venue_follows_with_details')
        .select('*')
        .ilike('venue_name', normalizedName);

      if (venueCity) {
        query = query.ilike('venue_city', venueCity);
      }

      if (venueState) {
        query = query.ilike('venue_state', venueState);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      return (data as VenueFollowWithDetails[]) || [];
    } catch (error) {
      console.error('Error getting venue followers:', error);
      throw new Error(`Failed to get venue followers: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Subscribe to venue follow changes for real-time updates
   * @param userId - The user UUID
   * @param onFollowChange - Callback when follow status changes
   */
  static subscribeToVenueFollows(
    userId: string,
    onFollowChange: (follow: VenueFollow, event: 'INSERT' | 'DELETE') => void
  ) {
    const channel = supabase
      .channel('venue-follows')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'venue_follows',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          onFollowChange(payload.new as VenueFollow, 'INSERT');
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'venue_follows',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          onFollowChange(payload.old as VenueFollow, 'DELETE');
        }
      )
      .subscribe();

    return channel;
  }
}

