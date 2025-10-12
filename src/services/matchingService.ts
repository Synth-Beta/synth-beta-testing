/**
 * Matching Service
 * Leverages existing matches and user_swipes tables for concert buddy matching
 */

import { supabase } from '@/integrations/supabase/client';

export interface SwipeAction {
  event_id: string;
  swiped_user_id: string;
  is_interested: boolean;
}

export interface Match {
  id: string;
  user1_id: string;
  user2_id: string;
  event_id: string;
  created_at: string;
  event?: any;
  matched_user?: any;
}

export interface PotentialMatch {
  user_id: string;
  name: string;
  avatar_url?: string;
  bio?: string;
  compatibility_score?: number;
  shared_artists?: string[];
  shared_genres?: string[];
  music_streaming_profile?: any;
}

export class MatchingService {
  /**
   * Record a swipe action
   */
  static async recordSwipe(action: SwipeAction): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      // Record swipe
      const { error } = await supabase
        .from('user_swipes')
        .insert({
          swiper_user_id: user.id,
          swiped_user_id: action.swiped_user_id,
          event_id: action.event_id,
          is_interested: action.is_interested,
        });

      if (error) throw error;

      // Check for mutual interest (match)
      if (action.is_interested) {
        await this.checkForMatch(user.id, action.swiped_user_id, action.event_id);
      }
    } catch (error) {
      console.error('Error recording swipe:', error);
      throw error;
    }
  }

  /**
   * Check if swipe creates a match
   */
  private static async checkForMatch(
    user1_id: string,
    user2_id: string,
    event_id: string
  ): Promise<void> {
    try {
      // Check if other user also swiped right
      const { data: reciprocalSwipe } = await supabase
        .from('user_swipes')
        .select('*')
        .eq('swiper_user_id', user2_id)
        .eq('swiped_user_id', user1_id)
        .eq('event_id', event_id)
        .eq('is_interested', true)
        .single();

      if (reciprocalSwipe) {
        // Create match!
        await supabase.from('matches').insert({
          user1_id,
          user2_id,
          event_id,
        });

        // Send match notifications to both users
        const { data: eventData } = await supabase
          .from('jambase_events')
          .select('title')
          .eq('id', event_id)
          .single();

        const notifications = [
          {
            user_id: user1_id,
            type: 'match',
            title: 'New Concert Buddy Match! 🎉',
            message: `You matched for ${eventData?.title || 'an event'}`,
            data: { match_id: event_id, matched_user_id: user2_id },
          },
          {
            user_id: user2_id,
            type: 'match',
            title: 'New Concert Buddy Match! 🎉',
            message: `You matched for ${eventData?.title || 'an event'}`,
            data: { match_id: event_id, matched_user_id: user1_id },
          },
        ];

        await supabase.from('notifications').insert(notifications);
      }
    } catch (error) {
      console.error('Error checking for match:', error);
      // Don't throw - matching failure shouldn't break the swipe
    }
  }

  /**
   * Get potential matches for an event
   */
  static async getPotentialMatches(eventId: string): Promise<PotentialMatch[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      // Get users interested in the same event, excluding:
      // - Current user
      // - Already swiped users
      // - Already matched users
      // - Blocked users
      const { data, error } = await supabase
        .from('user_jambase_events')
        .select(`
          user_id,
          profiles:user_id (
            user_id,
            name,
            avatar_url,
            bio,
            music_streaming_profile,
            gender,
            birthday
          )
        `)
        .eq('jambase_event_id', eventId)
        .neq('user_id', user.id);

      if (error) throw error;

      // Filter out already swiped and blocked users
      const potentialMatches = await Promise.all(
        (data || []).map(async (item: any) => {
          const profile = item.profiles;
          if (!profile) return null;

          // Check if already swiped
          const { data: existingSwipe } = await supabase
            .from('user_swipes')
            .select('id')
            .eq('swiper_user_id', user.id)
            .eq('swiped_user_id', profile.user_id)
            .eq('event_id', eventId)
            .single();

          if (existingSwipe) return null;

          // Check if blocked
          const { data: isBlocked } = await supabase.rpc('is_user_blocked', {
            p_user_id: profile.user_id,
            p_by_user_id: user.id,
          });

          if (isBlocked) return null;

          // Calculate compatibility (if music data exists)
          const compatibilityScore = await this.calculateCompatibility(
            user.id,
            profile.user_id
          );

          return {
            user_id: profile.user_id,
            name: profile.name,
            avatar_url: profile.avatar_url,
            bio: profile.bio,
            compatibility_score: compatibilityScore,
            music_streaming_profile: profile.music_streaming_profile,
          };
        })
      );

      return potentialMatches.filter((m) => m !== null) as PotentialMatch[];
    } catch (error) {
      console.error('Error getting potential matches:', error);
      throw error;
    }
  }

  /**
   * Calculate music compatibility score
   */
  static async calculateCompatibility(
    user1_id: string,
    user2_id: string
  ): Promise<number> {
    try {
      // Get both users' music taste data
      const [user1Taste, user2Taste] = await Promise.all([
        supabase
          .from('user_music_taste')
          .select('*')
          .eq('user_id', user1_id)
          .single(),
        supabase
          .from('user_music_taste')
          .select('*')
          .eq('user_id', user2_id)
          .single(),
      ]);

      if (!user1Taste.data || !user2Taste.data) return 50; // Default score

      const taste1 = user1Taste.data;
      const taste2 = user2Taste.data;

      // Compare artists, genres, decades
      const sharedArtists = this.calculateOverlap(
        taste1.top_artists || [],
        taste2.top_artists || []
      );
      const sharedGenres = this.calculateOverlap(
        taste1.top_genres || [],
        taste2.top_genres || []
      );

      // Weighted score
      const score = sharedArtists * 0.6 + sharedGenres * 0.4;
      return Math.round(Math.min(100, Math.max(0, score * 100)));
    } catch (error) {
      console.error('Error calculating compatibility:', error);
      return 50; // Default moderate compatibility
    }
  }

  /**
   * Calculate overlap between two arrays
   */
  private static calculateOverlap(arr1: any[], arr2: any[]): number {
    if (!arr1?.length || !arr2?.length) return 0;
    const set1 = new Set(arr1);
    const set2 = new Set(arr2);
    const intersection = [...set1].filter((x) => set2.has(x));
    return intersection.length / Math.max(set1.size, set2.size);
  }

  /**
   * Get user's matches for an event
   */
  static async getEventMatches(eventId: string): Promise<Match[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('matches')
        .select(`
          *,
          event:event_id (
            id,
            title,
            artist_name,
            venue_name,
            event_date
          )
        `)
        .eq('event_id', eventId)
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

      if (error) throw error;

      // Get matched user profiles
      const matchesWithProfiles = await Promise.all(
        (data || []).map(async (match: any) => {
          const matchedUserId =
            match.user1_id === user.id ? match.user2_id : match.user1_id;

          const { data: profile } = await supabase
            .from('profiles')
            .select('user_id, name, avatar_url, bio')
            .eq('user_id', matchedUserId)
            .single();

          return {
            ...match,
            matched_user: profile,
          };
        })
      );

      return matchesWithProfiles;
    } catch (error) {
      console.error('Error getting event matches:', error);
      throw error;
    }
  }

  /**
   * Get all user's matches
   */
  static async getAllMatches(): Promise<Match[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('matches')
        .select(`
          *,
          event:event_id (
            id,
            title,
            artist_name,
            venue_name,
            event_date,
            poster_image_url
          )
        `)
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get matched user profiles
      const matchesWithProfiles = await Promise.all(
        (data || []).map(async (match: any) => {
          const matchedUserId =
            match.user1_id === user.id ? match.user2_id : match.user1_id;

          const { data: profile } = await supabase
            .from('profiles')
            .select('user_id, name, avatar_url, bio, music_streaming_profile')
            .eq('user_id', matchedUserId)
            .single();

          return {
            ...match,
            matched_user: profile,
          };
        })
      );

      return matchesWithProfiles;
    } catch (error) {
      console.error('Error getting all matches:', error);
      throw error;
    }
  }

  /**
   * Check if already swiped on user for event
   */
  static async hasSwipedOn(eventId: string, userId: string): Promise<boolean> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      const { data } = await supabase
        .from('user_swipes')
        .select('id')
        .eq('swiper_user_id', user.id)
        .eq('swiped_user_id', userId)
        .eq('event_id', eventId)
        .single();

      return !!data;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get match count for user
   */
  static async getMatchCount(): Promise<number> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return 0;

      const { count, error } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error getting match count:', error);
      return 0;
    }
  }
}

export default MatchingService;

