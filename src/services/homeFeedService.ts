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
  event_media_url?: string;
}

export interface NetworkReview {
  id: string;
  author: {
    id: string;
    name: string;
    avatar_url?: string;
  };
  created_at: string;
  rating?: number;
  content?: string;
  photos?: string[];
  event_info?: {
    artist_name?: string;
    venue_name?: string;
    event_date?: string;
  };
  connection_degree: 1 | 2;
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
        .select('id, title, venue_city, event_date, images, artist_id, artists(name), venue_id, venues(name)')
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
          title: event.title || (event.artists?.name) || 'Event',
          artist_name: (event.artists?.name) || 'Unknown Artist',
          venue_name: (event.venues?.name) || 'Unknown Venue',
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
        .select('id, title, venue_city, event_date, images, artist_id, artists(name), venue_id, venues(name)')
        .in('id', topEventIds);

      if (eventsError) throw eventsError;

      return (events || []).map((event: any) => {
        const eventData = eventCounts.get(event.id);
        const primaryUser = eventData?.users?.[0];

        return {
          event_id: event.id,
          title: event.title || (event.artists?.name) || 'Event',
          artist_name: (event.artists?.name) || 'Unknown Artist',
          venue_name: (event.venues?.name) || 'Unknown Venue',
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
    limit: number = 20,
    city?: string
  ): Promise<TrendingEvent[]> {
    console.log('🔥 [TRENDING SERVICE] getTrendingEvents called:', {
      userId,
      cityLat,
      cityLng,
      radiusMiles,
      limit,
      city,
    });
    
    try {
      // Get events with most interested users (3NF: user_event_relationships)
      console.log('🔥 [TRENDING SERVICE] Fetching user_event_relationships...');
      const { data: allInterests, error: interestsError } = await supabase
        .from('user_event_relationships')
        .select('event_id')
        .eq('relationship_type', 'interest');

      if (interestsError) {
        console.error('❌ [TRENDING SERVICE] Error fetching interests:', interestsError);
        throw interestsError;
      }
      
      console.log('🔥 [TRENDING SERVICE] Fetched interests:', { count: allInterests?.length || 0 });

      // Count interested users per event
      const interestedCounts = new Map<string, number>();
      (allInterests || []).forEach((interest: any) => {
        const eventId = interest.event_id;
        interestedCounts.set(eventId, (interestedCounts.get(eventId) || 0) + 1);
      });
      console.log('🔥 [TRENDING SERVICE] Interested counts calculated:', { uniqueEvents: interestedCounts.size });

      // Get most reviewed artists - query reviews and events separately to avoid FK syntax issues
      console.log('🔥 [TRENDING SERVICE] Fetching reviews...');
      const { data: reviews, error: reviewsError } = await supabase
        .from('reviews')
        .select('event_id')
        .eq('is_public', true);

      if (reviewsError) {
        console.error('❌ [TRENDING SERVICE] Error fetching reviews:', reviewsError);
        throw reviewsError;
      }
      
      console.log('🔥 [TRENDING SERVICE] Fetched reviews:', { 
        count: reviews?.length || 0,
        reviews: reviews?.map((r: any) => ({
          id: r.id,
          event_id: r.event_id,
          artist_id: r.artist_id,
          venue_id: r.venue_id,
          rating: r.rating,
          created_at: r.created_at
        }))
      });

      // Get unique event IDs from reviews, filtering out null/undefined values
      const reviewEventIds = [...new Set((reviews || []).map((r: any) => r.event_id).filter((id: any) => id != null))];
      console.log('🔥 [TRENDING SERVICE] Review event IDs:', { count: reviewEventIds.length, ids: reviewEventIds });
      
      // Also check for artist_id and venue_id in reviews (for artist/venue reviews)
      const reviewArtistIds = [...new Set((reviews || []).map((r: any) => r.artist_id).filter((id: any) => id != null))];
      const reviewVenueIds = [...new Set((reviews || []).map((r: any) => r.venue_id).filter((id: any) => id != null))];
      console.log('🔥 [TRENDING SERVICE] Review artist/venue IDs:', { 
        artistIds: reviewArtistIds.length, 
        venueIds: reviewVenueIds.length 
      });
      
      // Query events to get artist names (and check if they're upcoming)
      let artistReviewCounts = new Map<string, number>();
      if (reviewEventIds.length > 0) {
        console.log('🔥 [TRENDING SERVICE] Fetching events for reviews (checking dates)...');
        const { data: eventsWithArtists, error: eventsError } = await supabase
          .from('events')
          .select('id, title, event_date, venue_city, latitude, longitude, artist_id, artists(name), venue_id, venues(name)')
          .in('id', reviewEventIds);

        if (eventsError) {
          console.error('❌ [TRENDING SERVICE] Error fetching events for reviews:', eventsError);
        } else {
          const now = new Date().toISOString();
          const upcoming = eventsWithArtists?.filter((e: any) => e.event_date >= now) || [];
          const past = eventsWithArtists?.filter((e: any) => e.event_date < now) || [];
          console.log('🔥 [TRENDING SERVICE] Events with reviews:', { 
            total: eventsWithArtists?.length || 0,
            upcoming: upcoming.length,
            past: past.length,
            events: eventsWithArtists?.map((e: any) => ({ 
              id: e.id, 
              title: e.title, 
              event_date: e.event_date,
              isUpcoming: e.event_date >= now
            }))
          });
        }

        if (!eventsError && eventsWithArtists) {
          // Count reviews per artist
          (eventsWithArtists || []).forEach((event: any) => {
            const artistName = (event.artists?.name) || event.title?.split(' at ')[0] || event.title || 'Unknown Artist';
            if (artistName) {
              // Count how many reviews this event has
              const reviewCountForEvent = (reviews || []).filter((r: any) => r.event_id === event.id).length;
              artistReviewCounts.set(artistName, (artistReviewCounts.get(artistName) || 0) + reviewCountForEvent);
            }
          });
          console.log('🔥 [TRENDING SERVICE] Artist review counts:', Object.fromEntries(artistReviewCounts));
        }
      }

      // Get top reviewed artists (top 10)
      const topArtists = Array.from(artistReviewCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([artistName]) => artistName);

      // Get all unique event IDs from both interests AND reviews
      const eventIdsFromInterests = Array.from(interestedCounts.keys());
      const eventIdsFromReviews = reviewEventIds;
      const allEventIds = Array.from(new Set([...eventIdsFromInterests, ...eventIdsFromReviews]));
      console.log('🔥 [TRENDING SERVICE] Event IDs combined:', { 
        fromInterests: eventIdsFromInterests.length,
        fromReviews: eventIdsFromReviews.length,
        total: allEventIds.length
      });

      if (allEventIds.length === 0) {
        console.log('🔥 [TRENDING SERVICE] No events with interests or reviews, trying fallback to recent upcoming events...');
        
        // Fallback: Get recent upcoming events if no trending data exists
        // Use two-stage filtering for performance: bounding box first with limit, then exact distance
        let fallbackQuery = supabase
          .from('events')
          .select('id, title, venue_city, venue_state, event_date, event_media_url, latitude, longitude, genres, artist_id, artists(name), venue_id, venues(name)')
          .gte('event_date', new Date().toISOString())
          .order('event_date', { ascending: true });
        
        // Apply location filtering if provided (bounding box first for index usage)
        if (cityLat && cityLng && radiusMiles) {
          const latDelta = (radiusMiles / 69.0) * 1.1; // 1.1x safety margin
          const lngDelta = (radiusMiles / (69.0 * Math.cos(cityLat * Math.PI / 180))) * 1.1;
          fallbackQuery = fallbackQuery
            .not('latitude', 'is', null)
            .not('longitude', 'is', null)
            .gte('latitude', cityLat - latDelta)
            .lte('latitude', cityLat + latDelta)
            .gte('longitude', cityLng - lngDelta)
            .lte('longitude', cityLng + lngDelta)
            .limit(300); // Aggressive limit for bounding box stage
        } else {
          fallbackQuery = fallbackQuery.limit(limit * 3); // If no location filter, use a reasonable limit
        }
        
        const { data: fallbackEvents, error: fallbackError } = await fallbackQuery;
        
        if (fallbackError) {
          console.error('❌ [TRENDING SERVICE] Error fetching fallback events:', fallbackError);
          return [];
        }
        
        if (!fallbackEvents || fallbackEvents.length === 0) {
          console.log('🔥 [TRENDING SERVICE] No fallback events found either');
          return [];
        }
        
        console.log('🔥 [TRENDING SERVICE] Using fallback events (before exact distance filter):', { count: fallbackEvents.length });
        
        // Apply exact distance filtering if location coordinates provided (second stage)
        let filteredFallback = fallbackEvents;
        if (cityLat && cityLng && radiusMiles && fallbackEvents) {
          const { LocationService } = await import('@/services/locationService');
          filteredFallback = fallbackEvents.filter((event: any) => {
            if (!event.latitude || !event.longitude) return false;
            const distance = LocationService.calculateDistance(
              cityLat,
              cityLng,
              Number(event.latitude),
              Number(event.longitude)
            );
            return distance <= radiusMiles;
          });
          console.log('🔥 [TRENDING SERVICE] After exact distance filter:', { before: fallbackEvents.length, after: filteredFallback.length });
        }
        
        // Return fallback events with zero scores (they're just recent events, not trending)
        return filteredFallback.slice(0, limit).map((event: any) => ({
          event_id: event.id,
          title: event.title || (event.artists?.name) || 'Event',
          artist_name: (event.artists?.name) || 'Unknown Artist',
          venue_name: (event.venues?.name) || 'Unknown Venue',
          venue_city: event.venue_city || undefined,
          event_date: event.event_date,
          trending_score: 0,
          save_velocity: 0,
          attendance_markings: 0,
          network_overlap: 0,
          trending_label: undefined,
          event_media_url: event.event_media_url || undefined,
        }));
      }

      // Get event details (3NF: events table) with images
      console.log('🔥 [TRENDING SERVICE] Fetching event details for', allEventIds.length, 'events...');
      const now = new Date().toISOString();
      console.log('🔥 [TRENDING SERVICE] Filtering for events after:', now);
      
      let eventsQuery = supabase
        .from('events')
        .select('id, title, venue_city, venue_state, event_date, event_media_url, latitude, longitude, genres, artist_id, artists(name), venue_id, venues(name)')
        .in('id', allEventIds)
        .gte('event_date', now);
      
      // Apply location filtering if coordinates provided (bounding box first, then we'll filter by distance)
      if (cityLat && cityLng && radiusMiles) {
        // Convert radius to approximate degrees (1 degree lat ≈ 69 miles, 1 degree lng ≈ 69 * cos(lat) miles)
        const latDelta = (radiusMiles / 69.0) * 1.1; // 1.1x safety margin
        const lngDelta = (radiusMiles / (69.0 * Math.cos(cityLat * Math.PI / 180))) * 1.1;
        
        eventsQuery = eventsQuery
          .gte('latitude', cityLat - latDelta)
          .lte('latitude', cityLat + latDelta)
          .gte('longitude', cityLng - lngDelta)
          .lte('longitude', cityLng + lngDelta);
        console.log('🔥 [TRENDING SERVICE] Applied bounding box filter:', { cityLat, cityLng, radiusMiles, latDelta, lngDelta });
        // No city name filtering - only coordinate-based filtering
      }
      
      const { data: events, error: eventsError } = await eventsQuery
        .order('event_date', { ascending: true })
        .limit(limit * 3);

      if (eventsError) {
        console.error('❌ [TRENDING SERVICE] Error fetching events:', eventsError);
        throw eventsError;
      }
      
      console.log('🔥 [TRENDING SERVICE] Fetched events:', { count: events?.length || 0, events: events?.map((e: any) => ({ 
        id: e.id, 
        title: e.title, 
        event_date: e.event_date,
        venue_city: e.venue_city,
        hasCoords: !!(e.latitude && e.longitude)
      })) });
      
      // Filter by exact distance if location coordinates provided
      let filteredEvents = events || [];
      if (cityLat && cityLng && radiusMiles && events) {
        console.log('🔥 [TRENDING SERVICE] Applying exact distance filter...');
        const { LocationService } = await import('@/services/locationService');
        filteredEvents = events.filter((event: any) => {
          if (!event.latitude || !event.longitude) {
            console.log('🔥 [TRENDING SERVICE] Event missing coordinates:', event.id, event.title);
            return false;
          }
          const distance = LocationService.calculateDistance(
            cityLat,
            cityLng,
            Number(event.latitude),
            Number(event.longitude)
          );
          const withinRadius = distance <= radiusMiles;
          if (!withinRadius) {
            console.log('🔥 [TRENDING SERVICE] Event outside radius:', event.id, event.title, { distance, radiusMiles });
          }
          return withinRadius;
        });
        console.log('🔥 [TRENDING SERVICE] After exact distance filter:', { 
          before: events.length,
          after: filteredEvents.length,
          radiusMiles
        });
      } else {
        console.log('🔥 [TRENDING SERVICE] Skipping distance filter:', { cityLat, cityLng, radiusMiles, hasEvents: !!events });
      }

      // Count reviews per event
      const reviewCountsByEvent = new Map<string, number>();
      (reviews || []).forEach((review: any) => {
        if (review.event_id) {
          reviewCountsByEvent.set(review.event_id, (reviewCountsByEvent.get(review.event_id) || 0) + 1);
        }
      });
      
      // Calculate average rating per event
      const eventRatings = new Map<string, { sum: number; count: number }>();
      (reviews || []).forEach((review: any) => {
        if (review.event_id && review.rating) {
          const existing = eventRatings.get(review.event_id) || { sum: 0, count: 0 };
          eventRatings.set(review.event_id, {
            sum: existing.sum + Number(review.rating),
            count: existing.count + 1
          });
        }
      });
      const avgRatingsByEvent = new Map<string, number>();
      eventRatings.forEach((value, eventId) => {
        avgRatingsByEvent.set(eventId, value.sum / value.count);
      });

      // Calculate trending scores
      console.log('🔥 [TRENDING SERVICE] Calculating trending scores...');
      const trendingEvents: TrendingEvent[] = filteredEvents
        .map((event: any) => {
          const interestedCount = interestedCounts.get(event.id) || 0;
          const reviewCount = reviewCountsByEvent.get(event.id) || 0;
          const avgRating = avgRatingsByEvent.get(event.id) || 0;
          const artistName = (event.artists?.name) || event.title?.split(' at ')[0] || 'Unknown Artist';
          const artistReviewCount = artistReviewCounts.get(artistName) || 0;
          const isTopReviewedArtist = topArtists.includes(artistName);

          // Calculate trending score: combine interests and reviews
          // Interest velocity (weighted by recency) + review quality
          const interestScore = interestedCount * 3;
          const reviewScore = reviewCount > 0 
            ? (reviewCount * 2) + (avgRating * 5) + (isTopReviewedArtist ? artistReviewCount * 2 : 0)
            : 0;
          const trendingScore = interestScore + reviewScore;

          // Determine trending label
          let trendingLabel = '';
          if (interestedCount >= 15) {
            trendingLabel = '🔥 Very Hot';
          } else if (interestedCount >= 10) {
            trendingLabel = '🔥 Trending';
          } else if (reviewCount >= 10 && avgRating >= 4.0) {
            trendingLabel = '⭐ Highly Reviewed';
          } else if (isTopReviewedArtist && (interestedCount >= 5 || reviewCount >= 3)) {
            trendingLabel = '✨ Popular';
          } else if (interestedCount >= 5) {
            trendingLabel = '📈 Getting Attention';
          } else if (reviewCount >= 5) {
            trendingLabel = '💬 Well Reviewed';
          }

          return {
            event_id: event.id,
            title: event.title || artistName || 'Event',
            artist_name: artistName,
            venue_name: (event.venues?.name) || 'Unknown Venue',
            venue_city: event.venue_city || undefined,
            event_date: event.event_date,
            trending_score: trendingScore,
            save_velocity: interestedCount,
            attendance_markings: 0,
            network_overlap: 0,
            trending_label: trendingLabel || undefined,
            event_media_url: event.event_media_url || undefined,
          };
        })
        .filter((te) => te.trending_score > 0) // Only include events with some signal
        .sort((a, b) => b.trending_score - a.trending_score)
        .slice(0, limit);

      console.log('🔥 [TRENDING SERVICE] Final trending events:', { count: trendingEvents.length, events: trendingEvents });
      return trendingEvents;
    } catch (error) {
      console.error('❌ [TRENDING SERVICE] Error fetching trending events:', error);
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
            .select('id, title, venue_city, event_date, images, genres, artist_id, artists(name), venue_id, venues(name)')
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
              title: e.title || (e.artists?.name) || 'Event',
              artist_name: (e.artists?.name) || 'Unknown Artist',
              venue_name: (e.venues?.name) || 'Unknown Venue',
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
            .select('id, title, venue_city, event_date, images, genres, artist_id, artists(name), venue_id, venues(name)')
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

  /**
   * Get reviews from network (first and second degree connections)
   */
  static async getNetworkReviews(
    userId: string,
    limit: number = 20
  ): Promise<NetworkReview[]> {
    try {
      // Get first and second degree connections
      const [firstDegreeResult, secondDegreeResult] = await Promise.all([
        supabase.rpc('get_first_degree_connections', { target_user_id: userId }),
        supabase.rpc('get_second_degree_connections', { target_user_id: userId }),
      ]);

      if (firstDegreeResult.error) throw firstDegreeResult.error;
      if (secondDegreeResult.error) throw secondDegreeResult.error;

      const firstDegreeIds = (firstDegreeResult.data || []).map((c: any) => c.connected_user_id);
      const secondDegreeIds = (secondDegreeResult.data || []).map((c: any) => c.connected_user_id);
      const allConnectionIds = [...firstDegreeIds, ...secondDegreeIds];

      if (allConnectionIds.length === 0) return [];

      // Get reviews from connections
      const { data: reviews, error: reviewsError } = await supabase
        .from('reviews')
        .select(`
          id,
          user_id,
          event_id,
          rating,
          review_text,
          photos,
          created_at,
          users:user_id (
            user_id,
            name,
            avatar_url
          ),
          events:event_id (
            id,
            title,
            event_date,
            artist_id,
            artists:artist_id (
              name
            ),
            venue_id,
            venues:venue_id (
              name
            )
          )
        `)
        .in('user_id', allConnectionIds)
        .eq('is_draft', false)
        .order('created_at', { ascending: false })
        .limit(limit * 2); // Get more to filter properly

      if (reviewsError) throw reviewsError;
      if (!reviews || reviews.length === 0) return [];

      // Create a map for quick lookup of connection degree
      const firstDegreeMap = new Set(firstDegreeIds);
      
      // Transform reviews to NetworkReview format
      const networkReviews: NetworkReview[] = (reviews || [])
        .filter((review: any) => review.users && review.events) // Filter out any with missing joins
        .map((review: any) => {
          const connectionDegree = firstDegreeMap.has(review.user_id) ? 1 : 2;
          const event = review.events;
          const artistName = event.artists?.name || null;
          const venueName = event.venues?.name || null;

          return {
            id: review.id,
            author: {
              id: review.users.user_id,
              name: review.users.name || 'User',
              avatar_url: review.users.avatar_url || undefined,
            },
            created_at: review.created_at,
            rating: review.rating || undefined,
            content: review.review_text || undefined,
            photos: review.photos || undefined,
            event_info: {
              artist_name: artistName || undefined,
              venue_name: venueName || undefined,
              event_date: event.event_date || undefined,
            },
            connection_degree: connectionDegree as 1 | 2,
          };
        });

      // Sort by connection degree (first degree first) then by date
      networkReviews.sort((a, b) => {
        if (a.connection_degree !== b.connection_degree) {
          return a.connection_degree - b.connection_degree;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      return networkReviews.slice(0, limit);
    } catch (error) {
      console.error('Error fetching network reviews:', error);
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

