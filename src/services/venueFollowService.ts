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

      // Use relationships table directly (3NF schema)
      // First, try to find venue by name to get UUID
      let venueId: string | null = null;
      
      let venueQuery = supabase
        .from('venues')
        .select('id')
        .ilike('name', normalizedName)
        .limit(1);
      
      if (venueCity) {
        venueQuery = venueQuery.ilike('city', venueCity);
      }
      
      if (venueState) {
        venueQuery = venueQuery.ilike('state', venueState);
      }
      
      const { data: venues } = await venueQuery;
      if (venues && venues.length > 0) {
        venueId = venues[0].id;
      }
      
      // Use venue UUID if found, otherwise use venue name as identifier
      const relatedEntityId = venueId || normalizedName;
      
      if (following) {
        // Insert follow relationship - use insert with error handling to avoid upsert conflicts
        const { error: insertError } = await supabase
          .from('relationships')
          .insert({
            user_id: userId,
            related_entity_type: 'venue',
            relationship_type: 'follow',
            related_entity_id: relatedEntityId,
            status: 'accepted'
          });
        
        // If duplicate, that's fine - relationship already exists
        if (insertError && insertError.code !== '23505') { // 23505 = unique_violation
          throw insertError;
        }
      } else {
        // Delete follow relationship
        const { error } = await supabase
          .from('relationships')
          .delete()
          .eq('user_id', userId)
          .eq('related_entity_type', 'venue')
          .eq('relationship_type', 'follow')
          .eq('related_entity_id', relatedEntityId);
        
        if (error) throw error;
      }

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

      // Use relationships table directly instead of RPC
      // First, find venues matching the name
      let venueQuery = supabase
        .from('venues')
        .select('id')
        .ilike('name', normalizedName);

      if (venueCity) {
        venueQuery = venueQuery.ilike('city', venueCity);
      }

      if (venueState) {
        venueQuery = venueQuery.ilike('state', venueState);
      }

      const { data: venues } = await venueQuery;
      if (!venues || venues.length === 0) {
        // Also try matching by name directly in relationships (for name-based follows)
        const { count } = await supabase
          .from('relationships')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('related_entity_type', 'venue')
          .eq('relationship_type', 'follow')
          .eq('related_entity_id', normalizedName);
        
        return (count || 0) > 0;
      }

      const venueIds = venues.map((v: any) => v.id);

      // Check relationships table for follows
      const { count } = await supabase
        .from('relationships')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('related_entity_type', 'venue')
        .eq('relationship_type', 'follow')
        .in('related_entity_id', venueIds);

      return (count || 0) > 0;
    } catch (error) {
      // Silently fail - feature might not be available
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

      // Use relationships table directly instead of RPC
      // First, find venues matching the name
      let venueQuery = supabase
        .from('venues')
        .select('id')
        .ilike('name', normalizedName);

      if (venueCity) {
        venueQuery = venueQuery.ilike('city', venueCity);
      }

      if (venueState) {
        venueQuery = venueQuery.ilike('state', venueState);
      }

      const { data: venues } = await venueQuery;
      
      let totalCount = 0;

      // Count follows by venue ID
      if (venues && venues.length > 0) {
        const venueIds = venues.map((v: any) => v.id);
        const { count } = await supabase
          .from('relationships')
          .select('*', { count: 'exact', head: true })
          .eq('related_entity_type', 'venue')
          .eq('relationship_type', 'follow')
          .in('related_entity_id', venueIds);
        
        totalCount += (count || 0);
      }

      // Also count follows by name (for name-based follows)
      const { count: nameCount } = await supabase
        .from('relationships')
        .select('*', { count: 'exact', head: true })
        .eq('related_entity_type', 'venue')
        .eq('relationship_type', 'follow')
        .eq('related_entity_id', normalizedName);
      
      totalCount += (nameCount || 0);

      return totalCount;
    } catch (error) {
      // Silently fail - feature might not be available
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
      // Use relationships table directly (venue_follows_with_details view doesn't exist)
      const { data: relationships, error: relationshipsError } = await supabase
        .from('relationships')
        .select('id, user_id, related_entity_id, created_at')
        .eq('user_id', userId)
        .eq('related_entity_type', 'venue')
        .eq('relationship_type', 'follow')
        .order('created_at', { ascending: false });
          
      if (relationshipsError) throw relationshipsError;
      
      if (!relationships || relationships.length === 0) {
        return [];
      }

      // Fetch venue details separately
      // Note: related_entity_id might be venue name (TEXT) or venue ID (UUID)
      const venueIdentifiers = [...new Set(relationships.map((r: any) => r.related_entity_id).filter(Boolean))];
      const venueMap = new Map<string, any>();
      
      if (venueIdentifiers.length > 0) {
        // Check if identifiers are UUIDs or names
        const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        const uuidIds = venueIdentifiers.filter(id => isUUID(id));
        
        // Only query by UUID if we have valid UUIDs
        // Venue follows use name-based matching, so related_entity_id is often a name
        if (uuidIds.length > 0) {
          const { data: venuesById } = await supabase
            .from('venues')
            .select('id, name, image_url, city, state, address')
            .in('id', uuidIds);
          
          if (venuesById) {
            venuesById.forEach((venue: any) => {
              venueMap.set(venue.id, venue);
              // Also map by name for lookup
              if (venue.name) {
                venueMap.set(venue.name, venue);
              }
            });
          }
        }
      }

      // Fetch user details separately
      const { data: userData } = await supabase
        .from('users')
        .select('user_id, name, avatar_url')
        .eq('user_id', userId)
        .maybeSingle();

      // Transform to match expected format
      return relationships.map((item: any) => {
        const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        const identifier = item.related_entity_id;
        const venue = isUUID(identifier) ? venueMap.get(identifier) : null;
        
        // If identifier is a UUID and we found a venue, use venue data
        // If identifier is a name (not UUID), use it directly as venue_name
        return {
          id: item.id,
          user_id: item.user_id,
          venue_id: venue?.id || (isUUID(identifier) ? identifier : null),
          venue_name: venue?.name || (isUUID(identifier) ? null : identifier),
          venue_city: venue?.city || null,
          venue_state: venue?.state || null,
          venue_address: venue?.address || null,
          venue_image_url: venue?.image_url || null,
          num_upcoming_events: null, // Could be calculated separately if needed
          created_at: item.created_at,
          user_name: userData?.name || null,
          user_avatar_url: userData?.avatar_url || null
        } as VenueFollowWithDetails;
      });
    } catch (error) {
      console.error('Error getting followed venues:', error);
      // Return empty array instead of throwing to prevent blocking the UI
      return [];
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

      // First, find venues matching the name
      let venueQuery = supabase
        .from('venues')
        .select('id, name, city, state')
        .ilike('name', normalizedName);

      if (venueCity) {
        venueQuery = venueQuery.ilike('city', venueCity);
      }

      if (venueState) {
        venueQuery = venueQuery.ilike('state', venueState);
      }

      const { data: venues, error: venuesError } = await venueQuery;

      if (venuesError) throw venuesError;

      if (!venues || venues.length === 0) {
        return [];
      }

      const venueIds = venues.map((v: any) => v.id);

      // Get relationships for these venues
      const { data: relationships, error: relationshipsError } = await supabase
        .from('relationships')
        .select('id, user_id, related_entity_id, created_at')
        .in('related_entity_id', venueIds)
        .eq('related_entity_type', 'venue')
        .eq('relationship_type', 'follow')
        .order('created_at', { ascending: false });

      if (relationshipsError) throw relationshipsError;

      if (!relationships || relationships.length === 0) {
        return [];
      }

      // Fetch user details separately
      const userIds = [...new Set(relationships.map((r: any) => r.user_id).filter(Boolean))];
      const userMap = new Map<string, any>();
      
      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('user_id, name, avatar_url')
          .in('user_id', userIds);
        
        if (usersData) {
          usersData.forEach((user: any) => {
            userMap.set(user.user_id, user);
          });
        }
      }

      // Create venue map
      const venueMap = new Map<string, any>();
      venues.forEach((venue: any) => {
        venueMap.set(venue.id, venue);
      });

      // Transform to match expected format
      return relationships.map((item: any) => {
        const venue = venueMap.get(item.related_entity_id) || {};
        const user = userMap.get(item.user_id) || {};
        return {
          id: item.id,
          user_id: item.user_id,
          venue_id: item.related_entity_id,
          venue_name: venue.name || null,
          venue_city: venue.city || null,
          venue_state: venue.state || null,
          venue_image_url: null,
          num_upcoming_events: null,
          created_at: item.created_at,
          user_name: user.name || null,
          user_avatar_url: user.avatar_url || null
        } as VenueFollowWithDetails;
      });
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
    // Use relationships table instead of venue_follows (3NF schema)
    // Note: Real-time subscriptions with multiple filters need to be handled in the callback
    const channel = supabase
      .channel(`venue-follows-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'relationships',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          // Filter for venue follows only
          if (payload.new.related_entity_type === 'venue' && payload.new.relationship_type === 'follow') {
            // Transform relationships table data to VenueFollow format
            const follow: VenueFollow = {
              id: payload.new.id,
              user_id: payload.new.user_id,
              venue_name: payload.new.related_entity_id, // May be venue name or UUID
              venue_city: null,
              venue_state: null,
              created_at: payload.new.created_at
            };
            onFollowChange(follow, 'INSERT');
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'relationships',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          // Filter for venue follows only
          if (payload.old.related_entity_type === 'venue' && payload.old.relationship_type === 'follow') {
            // Transform relationships table data to VenueFollow format
            const follow: VenueFollow = {
              id: payload.old.id,
              user_id: payload.old.user_id,
              venue_name: payload.old.related_entity_id, // May be venue name or UUID
              venue_city: null,
              venue_state: null,
              created_at: payload.old.created_at
            };
            onFollowChange(follow, 'DELETE');
          }
        }
      )
      .subscribe();

    return channel;
  }
}

