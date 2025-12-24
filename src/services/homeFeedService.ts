import { supabase } from '@/integrations/supabase/client';
import type { PersonalizedEvent } from './personalizedFeedService';

export interface NetworkEvent {
  event_id: string;
  title: string;
  artist_name: string;
  venue_name: string;
  venue_city?: string;
  event_date: string;
  friend_id: string;
  friend_name: string;
  friend_avatar?: string | null;
  action_type: 'reviewed' | 'going' | 'interested' | 'saved';
  connection_degree: 1 | 2;
  review_text?: string;
  rating?: number;
  created_at: string;
  images?: any;
  interested_count?: number;
}

export interface EventList {
  id: string;
  title: string;
  description: string;
  list_type: 'user_created' | 'system_generated';
  events: PersonalizedEvent[];
  created_by?: string;
  created_at: string;
}

export interface TrendingEvent {
  event_id: string;
  title: string;
  artist_name: string;
  venue_name: string;
  venue_city?: string;
  event_date: string;
  trending_score: number;
  save_velocity: number;
  attendance_markings: number;
  network_overlap: number;
  trending_label: string;
  images?: any;
}

export class HomeFeedService {
  /**
   * Get first-degree network events (direct friends) - only interested
   */
  static async getFirstDegreeNetworkEvents(
    userId: string,
    limit: number = 20
  ): Promise<NetworkEvent[]> {
    try {
      // Get direct friends
      const { data: friends, error: friendsError } = await supabase.rpc('get_first_degree_connections', {
        target_user_id: userId,
      });

      if (friendsError) throw friendsError;
      if (!friends || friends.length === 0) return [];

      const friendIds = friends.map((f: any) => f.connected_user_id);

      // Get events where friends clicked "interested" (3NF: user_event_relationships)
      const { data: relationships, error: relError } = await supabase
        .from('user_event_relationships')
        .select(`
          id,
          user_id,
          event_id,
          relationship_type,
          created_at,
          users:user_id (
            user_id,
            name,
            avatar_url
          )
        `)
        .in('user_id', friendIds)
        .eq('relationship_type', 'interest')
        .order('created_at', { ascending: false })
        .limit(limit * 2);

      if (relError) throw relError;
      if (!relationships || relationships.length === 0) return [];

      // Get event details (3NF: events table) with images
      const eventIds = [...new Set((relationships || []).map((r: any) => r.event_id))];

      if (eventIds.length === 0) return [];

      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('id, title, artist_name, venue_name, venue_city, event_date, images')
        .in('id', eventIds);

      if (eventsError) throw eventsError;

      const eventsMap = new Map((events || []).map((e: any) => [e.id, e]));

      // Group by event_id to count interested friends
      const eventFriendMap = new Map<string, any[]>();
      (relationships || []).forEach((rel: any) => {
        const eventId = rel.event_id;
        if (!eventFriendMap.has(eventId)) {
          eventFriendMap.set(eventId, []);
        }
        eventFriendMap.get(eventId)!.push(rel);
      });

      // Create network events with friend counts
      const networkEvents: NetworkEvent[] = [];
      eventFriendMap.forEach((friends, eventId) => {
        const event = eventsMap.get(eventId);
        if (!event) return;

        const primaryFriend = friends[0];
        const user = primaryFriend.users;

        networkEvents.push({
          event_id: event.id,
          title: event.title || event.artist_name || 'Event',
          artist_name: event.artist_name || 'Unknown Artist',
          venue_name: event.venue_name || 'Unknown Venue',
          venue_city: event.venue_city || undefined,
          event_date: event.event_date,
          friend_id: user?.user_id || primaryFriend.user_id,
          friend_name: user?.name || 'Friend',
          friend_avatar: user?.avatar_url || null,
          action_type: 'interested',
          connection_degree: 1,
          created_at: primaryFriend.created_at,
          images: event.images,
          interested_count: friends.length,
        });
      });

      // Sort by created_at
      return networkEvents
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, limit);
    } catch (error) {
      console.error('Error fetching first-degree network events:', error);
      return [];
    }
  }

  /**
   * Get second-degree network events (friends of friends) - only interested
   */
  static async getSecondDegreeNetworkEvents(
    userId: string,
    limit: number = 15
  ): Promise<NetworkEvent[]> {
    try {
      // Get second-degree connections
      const { data: secondDegree, error: secondDegreeError } = await supabase.rpc(
        'get_second_degree_connections',
        {
          target_user_id: userId,
        }
      );

      if (secondDegreeError) throw secondDegreeError;
      if (!secondDegree || secondDegree.length === 0) return [];

      const secondDegreeIds = secondDegree.map((c: any) => c.connected_user_id);

      // Get events where second-degree connections clicked "interested" (3NF: user_event_relationships)
      const { data: relationships, error: relError } = await supabase
        .from('user_event_relationships')
        .select(`
          event_id,
          relationship_type,
          users:user_id (
            user_id,
            name,
            avatar_url
          )
        `)
        .in('user_id', secondDegreeIds)
        .eq('relationship_type', 'interest');

      if (relError) throw relError;
      if (!relationships || relationships.length === 0) return [];

      // Count occurrences to find popular events
      const eventCounts = new Map<string, { count: number; users: any[] }>();

      (relationships || []).forEach((rel: any) => {
        const eventId = rel.event_id;
        const current = eventCounts.get(eventId) || { count: 0, users: [] };
        current.count += 1;
        current.users.push(rel.users);
        eventCounts.set(eventId, current);
      });

      // Get top events
      const topEventIds = Array.from(eventCounts.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, limit)
        .map(([eventId]) => eventId);

      if (topEventIds.length === 0) return [];

      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('id, title, artist_name, venue_name, venue_city, event_date, images')
        .in('id', topEventIds);

      if (eventsError) throw eventsError;

      return (events || []).map((event: any) => {
        const eventData = eventCounts.get(event.id);
        const primaryUser = eventData?.users?.[0];

        return {
          event_id: event.id,
          title: event.title || event.artist_name || 'Event',
          artist_name: event.artist_name || 'Unknown Artist',
          venue_name: event.venue_name || 'Unknown Venue',
          venue_city: event.venue_city || undefined,
          event_date: event.event_date,
          friend_id: primaryUser?.user_id || '',
          friend_name: primaryUser?.name || 'Friend',
          friend_avatar: primaryUser?.avatar_url || null,
          action_type: 'interested' as NetworkEvent['action_type'],
          connection_degree: 2 as const,
          created_at: new Date().toISOString(),
          images: event.images,
          interested_count: eventData?.count || 0,
        };
      });
    } catch (error) {
      console.error('Error fetching second-degree network events:', error);
      return [];
    }
  }

  /**
   * Get trending events based on most interested users and most reviewed artists
   */
  static async getTrendingEvents(
    userId: string,
    cityLat?: number,
    cityLng?: number,
    radiusMiles: number = 50,
    limit: number = 20
  ): Promise<TrendingEvent[]> {
    try {
      // Get events with most interested users (3NF: user_event_relationships)
      const { data: allInterests, error: interestsError } = await supabase
        .from('user_event_relationships')
        .select('event_id')
        .eq('relationship_type', 'interest');

      if (interestsError) throw interestsError;

      // Count interested users per event
      const interestedCounts = new Map<string, number>();
      (allInterests || []).forEach((interest: any) => {
        const eventId = interest.event_id;
        interestedCounts.set(eventId, (interestedCounts.get(eventId) || 0) + 1);
      });

      // Get most reviewed artists
      const { data: reviews, error: reviewsError } = await supabase
        .from('reviews')
        .select(`
          event_id,
          events:event_id (
            artist_name
          )
        `)
        .eq('is_public', true);

      if (reviewsError) throw reviewsError;

      // Count reviews per artist
      const artistReviewCounts = new Map<string, number>();
      (reviews || []).forEach((review: any) => {
        const artistName = review.events?.artist_name;
        if (artistName) {
          artistReviewCounts.set(artistName, (artistReviewCounts.get(artistName) || 0) + 1);
        }
      });

      // Get top reviewed artists (top 10)
      const topArtists = Array.from(artistReviewCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([artistName]) => artistName);

      // Get all unique event IDs from interested users
      const allEventIds = Array.from(interestedCounts.keys());

      if (allEventIds.length === 0) return [];

      // Get event details (3NF: events table) with images
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('id, title, artist_name, venue_name, venue_city, event_date, images, latitude, longitude')
        .in('id', allEventIds)
        .gte('event_date', new Date().toISOString())
        .order('event_date', { ascending: true })
        .limit(limit * 3);

      if (eventsError) throw eventsError;

      // Calculate trending scores
      const trendingEvents: TrendingEvent[] = (events || [])
        .map((event: any) => {
          const interestedCount = interestedCounts.get(event.id) || 0;
          const artistReviewCount = artistReviewCounts.get(event.artist_name) || 0;
          const isTopReviewedArtist = topArtists.includes(event.artist_name);

          // Calculate trending score: weight interested users heavily, boost for top reviewed artists
          const trendingScore = interestedCount * 3 + (isTopReviewedArtist ? artistReviewCount * 2 : 0);

          // Determine trending label
          let trendingLabel = '';
          if (interestedCount >= 10) {
            trendingLabel = 'Trending this weekend';
          } else if (isTopReviewedArtist && interestedCount >= 5) {
            trendingLabel = 'Popular artist';
          } else if (interestedCount >= 5) {
            trendingLabel = 'Getting attention';
          }

          return {
            event_id: event.id,
            title: event.title || event.artist_name || 'Event',
            artist_name: event.artist_name || 'Unknown Artist',
            venue_name: event.venue_name || 'Unknown Venue',
            venue_city: event.venue_city || undefined,
            event_date: event.event_date,
            trending_score: trendingScore,
            save_velocity: interestedCount,
            attendance_markings: 0,
            network_overlap: 0,
            trending_label: trendingLabel,
            images: event.images,
          };
        })
        .filter((te) => te.trending_score > 0)
        .sort((a, b) => b.trending_score - a.trending_score)
        .slice(0, limit);

      return trendingEvents;
    } catch (error) {
      console.error('Error fetching trending events:', error);
      return [];
    }
  }

  /**
   * Get event lists (user-created and system-generated)
   */
  static async getEventLists(
    userId: string,
    limit: number = 5
  ): Promise<EventList[]> {
    try {
      // For now, return system-generated lists
      // TODO: Add user-created lists table and query
      const lists: EventList[] = [];

      // Get user's top rated events for "Shows I'd See Again"
      const { data: topReviews, error: reviewsError } = await supabase
        .from('reviews')
        .select('event_id, rating')
        .eq('user_id', userId)
        .gte('rating', 4)
        .order('rating', { ascending: false })
        .limit(10);

      if (!reviewsError && topReviews && topReviews.length > 0) {
        const eventIds = topReviews.map((r: any) => r.event_id);
        const { data: events } = await supabase
          .from('events')
          .select('*')
          .in('id', eventIds)
          .gte('event_date', new Date().toISOString())
          .limit(10);

        if (events && events.length > 0) {
          lists.push({
            id: 'user-top-rated',
            title: "Shows I'd See Again",
            description: 'Based on your highest-rated reviews',
            list_type: 'user_created',
            events: events.map((e: any) => ({
              id: e.id,
              title: e.title || e.artist_name || 'Event',
              artist_name: e.artist_name || 'Unknown Artist',
              venue_name: e.venue_name || 'Unknown Venue',
              event_date: e.event_date,
              genres: e.genres || [],
            })) as PersonalizedEvent[],
            created_at: new Date().toISOString(),
          });
        }
      }

      // Get network top rated for "Top Rated This Weekend in Your Network"
      const friendIds = await this.getFriendIds(userId);
      if (friendIds.length > 0) {
        const { data: networkReviews } = await supabase
          .from('reviews')
          .select('event_id, rating')
          .in('user_id', friendIds)
          .gte('rating', 4)
          .order('rating', { ascending: false })
          .limit(10);

        if (networkReviews && networkReviews.length > 0) {
          const eventIds = networkReviews.map((r: any) => r.event_id);
          const { data: events } = await supabase
            .from('events')
            .select('*')
            .in('id', eventIds)
            .gte('event_date', new Date().toISOString())
            .lte('event_date', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
            .limit(10);

          if (events && events.length > 0) {
            lists.push({
              id: 'network-weekend',
              title: 'Top Rated This Weekend in Your Network',
              description: 'Highly rated by your friends',
              list_type: 'system_generated',
              events: events.map((e: any) => ({
                id: e.id,
                title: e.title || e.artist_name || 'Event',
                artist_name: e.artist_name || 'Unknown Artist',
                venue_name: e.venue_name || 'Unknown Venue',
                event_date: e.event_date,
                genres: e.genres || [],
              })) as PersonalizedEvent[],
              created_at: new Date().toISOString(),
            });
          }
        }
      }

      return lists.slice(0, limit);
    } catch (error) {
      console.error('Error fetching event lists:', error);
      return [];
    }
  }

  private static async getFriendIds(userId: string): Promise<string[]> {
    try {
      const { data, error } = await supabase.rpc('get_first_degree_connections', {
        target_user_id: userId,
      });

      if (error) throw error;
      return (data || []).map((f: any) => f.connected_user_id);
    } catch (error) {
      console.error('Error getting friend IDs:', error);
      return [];
    }
  }
}

