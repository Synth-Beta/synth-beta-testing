import { supabase } from '@/integrations/supabase/client';
import { PersonalizedFeedService } from './personalizedFeedService';
import type { JamBaseEvent } from '@/types/eventTypes';

export interface BecauseYouLikeEvent extends JamBaseEvent {
  reason: string;
  sourceArtist?: string;
  sourceVenue?: string;
  sourceGenre?: string;
}

export interface BecauseYouLikeCarousel {
  title: string;
  events: BecauseYouLikeEvent[];
  type: 'artist' | 'venue' | 'genre';
}

export class BecauseYouLikeService {
  /**
   * Get events because user likes a specific artist
   */
  static async getEventsByArtist(
    userId: string,
    artistName: string,
    limit: number = 10
  ): Promise<BecauseYouLikeEvent[]> {
    try {
      // Get user's music profile to find similar artists
      const topArtists = await PersonalizedFeedService.getUserTopArtists(userId, 20);
      
      // Check if this artist is in user's top artists
      const isTopArtist = topArtists.some(a => 
        a.artist_name.toLowerCase() === artistName.toLowerCase()
      );

      if (!isTopArtist) {
        // Get events by this artist
        const { data: events } = await supabase
          .from('events')
          .select('*')
          .ilike('artist_name', `%${artistName}%`)
          .gte('event_date', new Date().toISOString())
          .order('event_date', { ascending: true })
          .limit(limit);

        return (events || []).map(e => ({
          ...e,
          reason: `Because you like ${artistName}`,
          sourceArtist: artistName,
        })) as BecauseYouLikeEvent[];
      }

      // Get events by similar artists (same genre)
      const artistGenres = topArtists
        .filter(a => a.artist_name.toLowerCase() === artistName.toLowerCase())
        .flatMap(a => a.genres || []);

      if (artistGenres.length === 0) {
        // Fallback: just get events by this artist
        const { data: events } = await supabase
          .from('events')
          .select('*')
          .ilike('artist_name', `%${artistName}%`)
          .gte('event_date', new Date().toISOString())
          .order('event_date', { ascending: true })
          .limit(limit);

        return (events || []).map(e => ({
          ...e,
          reason: `Because you like ${artistName}`,
          sourceArtist: artistName,
        })) as BecauseYouLikeEvent[];
      }

      // Get events with similar genres, excluding the original artist
      const { data: events } = await supabase
        .from('events')
        .select('*')
        .gte('event_date', new Date().toISOString())
        .overlaps('genres', artistGenres)
        .not('artist_name', 'ilike', `%${artistName}%`)
        .order('event_date', { ascending: true })
        .limit(limit);

      return (events || []).map(e => ({
        ...e,
        reason: `Similar to ${artistName}`,
        sourceArtist: artistName,
      })) as BecauseYouLikeEvent[];
    } catch (error) {
      console.error('Error getting events by artist:', error);
      return [];
    }
  }

  /**
   * Get events because user rated a venue highly
   */
  static async getEventsByVenue(
    userId: string,
    venueName: string,
    limit: number = 10
  ): Promise<BecauseYouLikeEvent[]> {
    try {
      // Get events at this venue
      const { data: events } = await supabase
        .from('events')
        .select('*')
        .ilike('venue_name', `%${venueName}%`)
        .gte('event_date', new Date().toISOString())
        .order('event_date', { ascending: true })
        .limit(limit);

      return (events || []).map(e => ({
        ...e,
        reason: `At ${venueName} (you rated this venue highly)`,
        sourceVenue: venueName,
      })) as BecauseYouLikeEvent[];
    } catch (error) {
      console.error('Error getting events by venue:', error);
      return [];
    }
  }

  /**
   * Get events because user attends genre shows
   */
  static async getEventsByGenre(
    userId: string,
    genre: string,
    limit: number = 10
  ): Promise<BecauseYouLikeEvent[]> {
    try {
      // Get events with this genre
      const { data: events } = await supabase
        .from('events')
        .select('*')
        .gte('event_date', new Date().toISOString())
        .contains('genres', [genre])
        .order('event_date', { ascending: true })
        .limit(limit);

      return (events || []).map(e => ({
        ...e,
        reason: `Because you attend ${genre} shows`,
        sourceGenre: genre,
      })) as BecauseYouLikeEvent[];
    } catch (error) {
      console.error('Error getting events by genre:', error);
      return [];
    }
  }

  /**
   * Get all "Because You Like" carousels for a user
   */
  static async getAllBecauseYouLike(userId: string): Promise<BecauseYouLikeCarousel[]> {
    try {
      const carousels: BecauseYouLikeCarousel[] = [];

      // Get user's top artists
      const topArtists = await PersonalizedFeedService.getUserTopArtists(userId, 5);
      for (const artist of topArtists.slice(0, 3)) {
        const events = await this.getEventsByArtist(userId, artist.artist_name, 10);
        if (events.length > 0) {
          carousels.push({
            title: `Because you like ${artist.artist_name}`,
            events,
            type: 'artist',
          });
        }
      }

      // Get venues user rated highly (4+ stars) - venue_rating_decimal is in reviews table
      // Query without join first, then fetch venue names separately to avoid query syntax issues
      const { data: venueReviews, error: venueReviewsError } = await supabase
        .from('reviews')
        .select('venue_rating_decimal, event_id')
        .eq('user_id', userId)
        .eq('is_draft', false)
        .gte('venue_rating_decimal', 4)
        .not('venue_rating_decimal', 'is', null)
        .limit(10);
      
      if (venueReviewsError) {
        console.warn('Error fetching venue reviews:', venueReviewsError);
        return carousels;
      }
      
      if (!venueReviews || venueReviews.length === 0) {
        return carousels;
      }
      
      // Fetch venue names for the events
      const eventIds = venueReviews.map((r: any) => r.event_id).filter(Boolean);
      const eventMap = new Map<string, string>();
      
      if (eventIds.length > 0) {
        const { data: events } = await supabase
          .from('events')
          .select('id, venue_name')
          .in('id', eventIds);
        
        (events || []).forEach((e: any) => {
          if (e.venue_name) {
            eventMap.set(e.id, e.venue_name);
          }
        });
      }

      const uniqueVenues = new Set<string>();
      venueReviews.forEach((r: any) => {
        const venueName = eventMap.get(r.event_id);
        if (venueName) {
          uniqueVenues.add(venueName);
        }
      });

      for (const venueName of Array.from(uniqueVenues).slice(0, 2)) {
        const events = await this.getEventsByVenue(userId, venueName, 10);
        if (events.length > 0) {
          carousels.push({
            title: `At ${venueName} (you rated this venue highly)`,
            events,
            type: 'venue',
          });
        }
      }

      // Get genres from user's attendance
      const { data: genreReviews } = await supabase
        .from('reviews')
        .select('events:event_id(genres)')
        .eq('user_id', userId)
        .eq('is_draft', false)
        .not('events.genres', 'is', null)
        .limit(20);

      const genreCounts = new Map<string, number>();
      (genreReviews || []).forEach((r: any) => {
        if (r.events?.genres) {
          (r.events.genres as string[]).forEach((g: string) => {
            genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
          });
        }
      });

      const topGenres = Array.from(genreCounts.entries())
        .sort(([_, a], [__, b]) => b - a)
        .slice(0, 2)
        .map(([genre]) => genre);

      for (const genre of topGenres) {
        const events = await this.getEventsByGenre(userId, genre, 10);
        if (events.length > 0) {
          carousels.push({
            title: `Because you attend ${genre} shows`,
            events,
            type: 'genre',
          });
        }
      }

      return carousels;
    } catch (error) {
      console.error('Error getting all because you like:', error);
      return [];
    }
  }

  /**
   * Dismiss a recommendation (store in user preferences)
   */
  static async dismissRecommendation(
    userId: string,
    type: 'artist' | 'venue' | 'genre',
    entityId: string
  ): Promise<void> {
    try {
      // Store dismissal in user preferences or a separate dismissals table
      // For now, we'll use a simple approach with user metadata
      const { data: userPrefs } = await supabase
        .from('users')
        .select('dismissed_recommendations')
        .eq('user_id', userId)
        .single();

      const dismissed = (userPrefs?.dismissed_recommendations as string[]) || [];
      const dismissalKey = `${type}:${entityId}`;

      if (!dismissed.includes(dismissalKey)) {
        await supabase
          .from('users')
          .update({
            dismissed_recommendations: [...dismissed, dismissalKey],
          })
          .eq('user_id', userId);
      }
    } catch (error) {
      console.error('Error dismissing recommendation:', error);
    }
  }
}

