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
      
      // Use the helper function that handles state matching
      venueId = await this.getVenueIdByName(normalizedName, venueCity, venueState);
      
      // Must have venue UUID to follow (3NF requires FK)
      if (!venueId) {
        throw new Error(`Venue not found: ${normalizedName}. Cannot follow venue that doesn't exist in database.`);
      }
      
      // Return venueId so caller can use it for chat joining
      // Store it in a way that can be accessed after the function completes
      
      if (following) {
        // Insert follow relationship in user_venue_relationships (3NF compliant)
        const { error: insertError } = await supabase
          .from('user_venue_relationships')
          .insert({
            user_id: userId,
            venue_id: venueId
          });
        
        // If duplicate, that's fine - relationship already exists
        if (insertError && insertError.code !== '23505') { // 23505 = unique_violation
          throw insertError;
        }
      } else {
        // Delete follow relationship
        const { error } = await supabase
          .from('user_venue_relationships')
          .delete()
          .eq('user_id', userId)
          .eq('venue_id', venueId);
        
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
   * Get venue ID by name (helper for chat joining)
   * @param venueName - The venue name
   * @param venueCity - The venue city (optional)
   * @param venueState - The venue state (optional)
   * @returns Venue UUID or null if not found
   */
  static async getVenueIdByName(
    venueName: string,
    venueCity?: string,
    venueState?: string
  ): Promise<string | null> {
    try {
      const normalizedName = this.normalizeVenueName(venueName);
      
      // Query venues table - use state column (which exists) but not city (which doesn't)
      let venueQuery = supabase
        .from('venues')
        .select('id, state')
        .ilike('name', `%${normalizedName}%`)
        .limit(10);
      
      // Only filter by state if provided (city column doesn't exist in venues table)
      if (venueState) {
        venueQuery = venueQuery.ilike('state', `%${venueState}%`);
      }
      
      const { data: venues, error } = await venueQuery;
      
      if (error) {
        console.warn('Error querying venues by name:', error);
        return null;
      }
      
      if (!venues || venues.length === 0) {
        return null;
      }
      
      // If we have city filter, try to match via events table
      // (venues table doesn't have city, but events table has venue_city)
      if (venueCity) {
        const venueIds = venues.map(v => v.id);
        
        // Query events to find which venue_id matches the city
        const { data: matchingEvents } = await supabase
          .from('events')
          .select('venue_id')
          .in('venue_id', venueIds)
          .ilike('venue_city', `%${venueCity}%`)
          .limit(100);
        
        if (matchingEvents && matchingEvents.length > 0) {
          // Find the most common venue_id in matching events
          const venueIdCounts = new Map<string, number>();
          matchingEvents.forEach((e: any) => {
            if (e.venue_id) {
              venueIdCounts.set(e.venue_id, (venueIdCounts.get(e.venue_id) || 0) + 1);
            }
          });
          
          // Return the venue_id with most matching events
          let maxCount = 0;
          let bestVenueId: string | null = null;
          venueIdCounts.forEach((count, vid) => {
            if (count > maxCount) {
              maxCount = count;
              bestVenueId = vid;
            }
          });
          
          if (bestVenueId) {
            return bestVenueId;
          }
        }
      }
      
      // Return first match if no city filter or no match found
      return venues[0].id;
    } catch (error) {
      console.error('Error getting venue ID by name:', error);
      return null;
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
      // First, find venues matching the name (venues table doesn't have city column)
      let venueQuery = supabase
        .from('venues')
        .select('id')
        .ilike('name', normalizedName);

      // Only filter by state (city column doesn't exist in venues table)
      if (venueState) {
        venueQuery = venueQuery.ilike('state', venueState);
      }

      let { data: venues } = await venueQuery;
      
      // If we have city filter, use events table to narrow down
      if (venueCity && venues && venues.length > 0) {
        const venueIds = venues.map((v: any) => v.id);
        const { data: matchingEvents } = await supabase
          .from('events')
          .select('venue_id')
          .in('venue_id', venueIds)
          .ilike('venue_city', `%${venueCity}%`)
          .limit(100);
        
        if (matchingEvents && matchingEvents.length > 0) {
          const matchedVenueIds = new Set(matchingEvents.map((e: any) => e.venue_id));
          venues = venues.filter((v: any) => matchedVenueIds.has(v.id));
        }
      }
      
      if (!venues || venues.length === 0) {
        // Venue doesn't exist in database, so user can't be following it
        return false;
      }

      const venueIds = venues.map((v: any) => v.id);

      // Check user_venue_relationships table for follows (3NF compliant)
      const { count } = await supabase
        .from('user_venue_relationships')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('venue_id', venueIds);

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
      // First, find venues matching the name (venues table doesn't have city column)
      let venueQuery = supabase
        .from('venues')
        .select('id')
        .ilike('name', normalizedName);

      // Only filter by state (city column doesn't exist in venues table)
      if (venueState) {
        venueQuery = venueQuery.ilike('state', venueState);
      }

      let { data: venues } = await venueQuery;
      
      // If we have city filter, use events table to narrow down
      if (venueCity && venues && venues.length > 0) {
        const venueIds = venues.map((v: any) => v.id);
        const { data: matchingEvents } = await supabase
          .from('events')
          .select('venue_id')
          .in('venue_id', venueIds)
          .ilike('venue_city', `%${venueCity}%`)
          .limit(100);
        
        if (matchingEvents && matchingEvents.length > 0) {
          const matchedVenueIds = new Set(matchingEvents.map((e: any) => e.venue_id));
          venues = venues.filter((v: any) => matchedVenueIds.has(v.id));
        }
      }
      
      let totalCount = 0;

      // Count follows by venue ID (3NF compliant)
      if (venues && venues.length > 0) {
        const venueIds = venues.map((v: any) => v.id);
        const { count } = await supabase
          .from('user_venue_relationships')
          .select('*', { count: 'exact', head: true })
          .in('venue_id', venueIds);
        
        totalCount += (count || 0);
      }

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
      // Query user_venue_relationships table (3NF compliant)
      const { data: follows, error: followsError } = await supabase
        .from('user_venue_relationships')
        .select('id, user_id, venue_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
          
      if (followsError) throw followsError;
      
      if (!follows || follows.length === 0) {
        return [];
      }

      // Extract venue IDs (all are UUIDs now)
      const venueIds = [...new Set(follows.map((f: any) => f.venue_id).filter(Boolean))];
      const venueMap = new Map<string, any>();
      
      if (venueIds.length > 0) {
        const { data: venues } = await supabase
          .from('venues')
          .select('id, name, image_url, street_address, state, country, zip')
          .in('id', venueIds);
        
        if (venues) {
          venues.forEach((venue: any) => {
            venueMap.set(venue.id, venue);
          });
        }
      }

      // Fetch user details separately
      const { data: userData } = await supabase
        .from('users')
        .select('user_id, name, avatar_url')
        .eq('user_id', userId)
        .maybeSingle();

      // Transform to match expected format
      return follows.map((follow: any) => {
        const venue = venueMap.get(follow.venue_id);
        
        return {
          id: follow.id,
          user_id: follow.user_id,
          venue_id: follow.venue_id,
          venue_name: venue?.name || null,
          venue_city: null, // Venues table doesn't have city column
          venue_state: venue?.state || null,
          venue_address: venue?.street_address || null,
          venue_image_url: venue?.image_url || null,
          num_upcoming_events: null, // Could be calculated separately if needed
          created_at: follow.created_at,
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

      // First, find venues matching the name (venues table doesn't have city column)
      let venueQuery = supabase
        .from('venues')
        .select('id, name, state')
        .ilike('name', normalizedName);

      // Only filter by state (city column doesn't exist in venues table)
      if (venueState) {
        venueQuery = venueQuery.ilike('state', venueState);
      }

      let { data: venues, error: venuesError } = await venueQuery;
      
      // If we have city filter, use events table to narrow down
      if (venueCity && venues && venues.length > 0) {
        const venueIds = venues.map((v: any) => v.id);
        const { data: matchingEvents } = await supabase
          .from('events')
          .select('venue_id')
          .in('venue_id', venueIds)
          .ilike('venue_city', `%${venueCity}%`)
          .limit(100);
        
        if (matchingEvents && matchingEvents.length > 0) {
          const matchedVenueIds = new Set(matchingEvents.map((e: any) => e.venue_id));
          venues = venues.filter((v: any) => matchedVenueIds.has(v.id));
        }
      }

      if (venuesError) throw venuesError;

      if (!venues || venues.length === 0) {
        return [];
      }

      const venueIds = venues.map((v: any) => v.id);

      // Get follows for these venues from user_venue_relationships (3NF compliant)
      const { data: follows, error: followsError } = await supabase
        .from('user_venue_relationships')
        .select('id, user_id, venue_id, created_at')
        .in('venue_id', venueIds)
        .order('created_at', { ascending: false });

      if (followsError) throw followsError;

      if (!follows || follows.length === 0) {
        return [];
      }

      // Fetch user details separately
      const userIds = [...new Set(follows.map((f: any) => f.user_id).filter(Boolean))];
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
      return follows.map((follow: any) => {
        const venue = venueMap.get(follow.venue_id) || {};
        const user = userMap.get(follow.user_id) || {};
        return {
          id: follow.id,
          user_id: follow.user_id,
          venue_id: follow.venue_id,
          venue_name: venue.name || null,
          venue_city: venue.city || null,
          venue_state: venue.state || null,
          venue_image_url: venue.image_url || null,
          num_upcoming_events: null,
          created_at: follow.created_at,
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
   * 
   * IMPORTANT: Due to Supabase realtime architecture limitations, callbacks must execute synchronously.
   * Venue details are fetched asynchronously, so `onFollowChange` will be called asynchronously
   * after the database change occurs. This means:
   * - There may be a slight delay between the database change and the UI update
   * - Multiple rapid changes may be processed out of order
   * - If venue fetch fails, `onFollowChange` is still called with minimal data (null venue fields)
   * - Errors during async operations are logged but not propagated (no caller to propagate to)
   * 
   * If synchronous behavior is required, consider fetching venue details separately or
   * denormalizing venue data into the relationship table.
   * 
   * @param userId - The user UUID
   * @param onFollowChange - Callback when follow status changes (called asynchronously for INSERT events)
   */
  static subscribeToVenueFollows(
    userId: string,
    onFollowChange: (follow: VenueFollow, event: 'INSERT' | 'DELETE') => void
  ) {
    // Use user_venue_relationships table (3NF compliant)
    const channel = supabase
      .channel(`venue-follows-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_venue_relationships',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          // NOTE: Realtime callbacks must execute synchronously and return quickly.
          // Async operations (like fetching venue details) are handled via .then()/.catch()
          // which means onFollowChange will be called asynchronously after the callback returns.
          // This is the correct pattern for Supabase realtime, but means there may be a slight
          // delay between the database change and the UI update with complete venue details.
          const fetchVenueDetails = () => {
            supabase
              .from('venues')
              .select('name, address, city, state')
              .eq('id', payload.new.venue_id)
              .maybeSingle()
              .then(({ data: venue }) => {
                const follow: VenueFollow = {
                  id: payload.new.id,
                  user_id: payload.new.user_id,
                  venue_name: venue?.name || null,
                  venue_city: venue?.city || null,
                  venue_state: venue?.state || null,
                  created_at: payload.new.created_at,
                  updated_at: payload.new.updated_at || payload.new.created_at
                };
                onFollowChange(follow, 'INSERT');
              })
              .catch((error) => {
                console.error('Error fetching venue details in realtime callback:', error);
                // Still create follow object with minimal data when venue fetch fails
                const follow: VenueFollow = {
                  id: payload.new.id,
                  user_id: payload.new.user_id,
                  venue_name: null,
                  venue_city: null,
                  venue_state: null,
                  created_at: payload.new.created_at,
                  updated_at: payload.new.updated_at || payload.new.created_at
                };
                onFollowChange(follow, 'INSERT');
              });
          };
          
          // Execute async operation (callback returns immediately)
          fetchVenueDetails();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'user_venue_relationships',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          // For DELETE, we only have the old payload, so venue details may not be available
          const follow: VenueFollow = {
            id: payload.old.id,
            user_id: payload.old.user_id,
            venue_name: null, // Can't fetch from deleted record
            venue_city: null,
            venue_state: null,
            created_at: payload.old.created_at,
            updated_at: payload.old.updated_at || payload.old.created_at
          };
          onFollowChange(follow, 'DELETE');
        }
      )
      .subscribe();

    return channel;
  }
}

