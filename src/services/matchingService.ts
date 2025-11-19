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
  gender?: string;
  birthday?: string;
  instagram_handle?: string;
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

      // Record swipe in engagements table
      const { error } = await supabase
        .from('engagements')
        .insert({
          user_id: user.id,
          entity_type: 'user',
          entity_id: action.swiped_user_id,
          engagement_type: 'swipe',
          engagement_value: action.is_interested ? 'right' : 'left',
          metadata: {
            event_id: action.event_id,
            swiped_user_id: action.swiped_user_id,
            is_interested: action.is_interested
          }
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
        .from('engagements')
        .select('*')
        .eq('user_id', user2_id)
        .eq('entity_type', 'user')
        .eq('entity_id', user1_id)
        .eq('engagement_type', 'swipe')
        .eq('engagement_value', 'right')
        .eq('metadata->>event_id', event_id)
        .single();

      if (reciprocalSwipe) {
        // Create match in relationships table (bidirectional - create 2 rows)
        await supabase.from('relationships').insert([
          {
            user_id: user1_id,
            related_entity_type: 'user',
            related_entity_id: user2_id,
            relationship_type: 'match',
            status: 'accepted',
            metadata: { event_id, matched_user_id: user2_id }
          },
          {
            user_id: user2_id,
            related_entity_type: 'user',
            related_entity_id: user1_id,
            relationship_type: 'match',
            status: 'accepted',
            metadata: { event_id, matched_user_id: user1_id }
          }
        ]);

        // Send match notifications to both users
        const { data: eventData } = await supabase
          .from('events')
          .select('title, artist_name')
          .eq('id', event_id)
          .single();

        // Get user names for personalized notifications
        const [user1Profile, user2Profile] = await Promise.all([
          supabase.from('users').select('name').eq('user_id', user1_id).single(),
          supabase.from('users').select('name').eq('user_id', user2_id).single(),
        ]);

        const user1Name = user1Profile.data?.name || 'Someone';
        const user2Name = user2Profile.data?.name || 'Someone';
        const eventTitle = eventData?.title || 'an event';

        const notifications = [
          {
            user_id: user1_id,
            type: 'match',
            title: '🎉 It\'s a Match!',
            message: `You and ${user2Name} both want to meet up at ${eventTitle}!`,
            data: { 
              match_user_id: user2_id, 
              match_user_name: user2Name,
              event_id: event_id, 
              event_title: eventTitle,
              event_artist: eventData?.artist_name 
            },
            actor_user_id: user2_id,
          },
          {
            user_id: user2_id,
            type: 'match',
            title: '🎉 It\'s a Match!',
            message: `You and ${user1Name} both want to meet up at ${eventTitle}!`,
            data: { 
              match_user_id: user1_id, 
              match_user_name: user1Name,
              event_id: event_id, 
              event_title: eventTitle,
              event_artist: eventData?.artist_name 
            },
            actor_user_id: user1_id,
          },
        ];

        await supabase.from('notifications').insert(notifications);

        // Create a chat for the matched users
        await this.createMatchChat(user1_id, user2_id, event_id);
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
      // First get the user IDs interested in this event
      const { data: eventUsers, error: eventUsersError } = await supabase
        .from('relationships')
        .select('user_id')
        .eq('related_entity_type', 'event')
        .eq('related_entity_id', eventId)
        .in('relationship_type', ['interest', 'going', 'maybe'])
        .neq('user_id', user.id);

      if (eventUsersError) throw eventUsersError;

      if (!eventUsers || eventUsers.length === 0) {
        return [];
      }

      // Then get the profile data for these users
      const userIds = eventUsers.map(item => item.user_id);
      const { data, error } = await supabase
        .from('users')
        .select(`
          user_id,
          name,
          avatar_url,
          bio,
          music_streaming_profile,
          gender,
          birthday,
          instagram_handle
        `)
        .in('user_id', userIds);

      if (error) throw error;

      // Filter out already swiped and blocked users
      const potentialMatches = await Promise.all(
        (data || []).map(async (profile: any) => {
          if (!profile) return null;

          // Check if already swiped
          const { data: existingSwipe } = await supabase
            .from('engagements')
            .select('id')
            .eq('user_id', user.id)
            .eq('entity_type', 'user')
            .eq('entity_id', profile.user_id)
            .eq('engagement_type', 'swipe')
            .eq('metadata->>event_id', eventId)
            .single();

          if (existingSwipe) return null;

          // Check if blocked
          const { data: isBlocked } = await supabase.rpc('is_user_blocked', {
            p_user_id: profile.user_id,
            p_by_user_id: user.id,
          });

          if (isBlocked) return null;

          // Calculate compatibility and get shared preferences
          const compatibilityScore = await this.calculateCompatibility(
            user.id,
            profile.user_id
          );

          // Get shared artists and genres for display
          const sharedPreferences = await this.getSharedPreferences(
            user.id,
            profile.user_id
          );

          return {
            user_id: profile.user_id,
            name: profile.name,
            avatar_url: profile.avatar_url,
            bio: profile.bio,
            gender: profile.gender,
            birthday: profile.birthday,
            instagram_handle: profile.instagram_handle,
            compatibility_score: compatibilityScore,
            shared_artists: sharedPreferences.artists,
            shared_genres: sharedPreferences.genres,
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
      // Get both users' music preference data from user_preferences table
      const [user1Prefs, user2Prefs] = await Promise.all([
        supabase
          .from('user_preferences')
          .select('music_preference_signals')
          .eq('user_id', user1_id)
          .single(),
        supabase
          .from('user_preferences')
          .select('music_preference_signals')
          .eq('user_id', user2_id)
          .single(),
      ]);

      const user1Signals = user1Prefs.data?.music_preference_signals || [];
      const user2Signals = user2Prefs.data?.music_preference_signals || [];

      if (!user1Signals.length || !user2Signals.length) return 50; // Default score

      // Separate artists and genres
      const user1Artists = user1Signals
        .filter((p: any) => p.preference_type === 'artist')
        .map((p: any) => p.preference_value.toLowerCase());
      const user1Genres = user1Signals
        .filter((p: any) => p.preference_type === 'genre')
        .map((p: any) => p.preference_value.toLowerCase());
      
      const user2Artists = user2Signals
        .filter((p: any) => p.preference_type === 'artist')
        .map((p: any) => p.preference_value.toLowerCase());
      const user2Genres = user2Signals
        .filter((p: any) => p.preference_type === 'genre')
        .map((p: any) => p.preference_value.toLowerCase());

      // Calculate overlap
      const sharedArtists = this.calculateOverlap(user1Artists, user2Artists);
      const sharedGenres = this.calculateOverlap(user1Genres, user2Genres);

      // Weighted score: 60% artists, 40% genres
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
   * Get shared artists and genres between two users
   */
  private static async getSharedPreferences(
    user1_id: string,
    user2_id: string
  ): Promise<{ artists: string[]; genres: string[] }> {
    try {
      const [user1Prefs, user2Prefs] = await Promise.all([
        supabase
          .from('user_preferences')
          .select('music_preference_signals')
          .eq('user_id', user1_id)
          .single(),
        supabase
          .from('user_preferences')
          .select('music_preference_signals')
          .eq('user_id', user2_id)
          .single(),
      ]);

      const user1Signals = user1Prefs.data?.music_preference_signals || [];
      const user2Signals = user2Prefs.data?.music_preference_signals || [];

      if (!user1Signals.length || !user2Signals.length) {
        return { artists: [], genres: [] };
      }

      const user1Artists = user1Signals
        .filter((p: any) => p.preference_type === 'artist')
        .map((p: any) => p.preference_value);
      const user1Genres = user1Signals
        .filter((p: any) => p.preference_type === 'genre')
        .map((p: any) => p.preference_value);
      
      const user2Artists = user2Signals
        .filter((p: any) => p.preference_type === 'artist')
        .map((p: any) => p.preference_value);
      const user2Genres = user2Signals
        .filter((p: any) => p.preference_type === 'genre')
        .map((p: any) => p.preference_value);

      // Find intersections
      const sharedArtists = user1Artists.filter(artist => 
        user2Artists.some(a => a.toLowerCase() === artist.toLowerCase())
      );
      const sharedGenres = user1Genres.filter(genre => 
        user2Genres.some(g => g.toLowerCase() === genre.toLowerCase())
      );

      return {
        artists: sharedArtists.slice(0, 5), // Limit to top 5
        genres: sharedGenres.slice(0, 3), // Limit to top 3
      };
    } catch (error) {
      console.error('Error getting shared preferences:', error);
      return { artists: [], genres: [] };
    }
  }

  /**
   * Create a chat for matched users
   */
  private static async createMatchChat(
    user1Id: string,
    user2Id: string,
    eventId: string
  ): Promise<void> {
    try {
      // Check if chat already exists
      const { data: existingChat } = await supabase
        .from('chats')
        .select('id')
        .contains('users', [user1Id, user2Id])
        .eq('is_group_chat', false)
        .single();

      if (existingChat) return; // Chat already exists

      // Get event details for chat name
      const { data: eventData } = await supabase
        .from('events')
        .select('title, artist_name')
        .eq('id', eventId)
        .single();

      const chatName = eventData?.title || 'Concert Chat';

      // Create new chat
      const { data: chat } = await supabase
        .from('chats')
        .insert({
          chat_name: chatName,
          is_group_chat: false,
          users: [user1Id, user2Id],
        })
        .select()
        .single();

      if (chat) {
        // Send welcome message
        await supabase.from('messages').insert({
          chat_id: chat.id,
          sender_id: user1Id, // System message
          content: `🎉 You matched! Start chatting about ${eventData?.title || 'the event'}!`,
        });
      }
    } catch (error) {
      console.error('Error creating match chat:', error);
    }
  }

  /**
   * Get user's matches for an event
   */
  static async getEventMatches(eventId: string): Promise<Match[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      // Get matches from relationships table
      const { data, error } = await supabase
        .from('relationships')
        .select('*')
        .eq('related_entity_type', 'user')
        .eq('relationship_type', 'match')
        .eq('user_id', user.id)
        .eq('metadata->>event_id', eventId);

      if (error) throw error;

      // Get matched user profiles and event data
      const matchesWithProfiles = await Promise.all(
        (data || []).map(async (match: any) => {
          // In relationships table, related_entity_id is the matched user
          const matchedUserId = match.related_entity_id;
          const eventIdFromMetadata = match.metadata?.event_id;

          const [profile, eventData] = await Promise.all([
            supabase
              .from('users')
              .select('user_id, name, avatar_url, bio')
              .eq('user_id', matchedUserId)
              .single(),
            eventIdFromMetadata
              ? supabase
                  .from('events')
                  .select('id, title, artist_name, venue_name, event_date')
                  .eq('id', eventIdFromMetadata)
                  .single()
              : Promise.resolve({ data: null })
          ]);

          return {
            ...match,
            user1_id: match.user_id,
            user2_id: match.related_entity_id,
            event_id: eventIdFromMetadata || eventId,
            matched_user: profile.data,
            event: eventData.data,
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
        .from('relationships')
        .select('*')
        .eq('related_entity_type', 'user')
        .eq('relationship_type', 'match')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get matched user profiles and event data
      const matchesWithProfiles = await Promise.all(
        (data || []).map(async (match: any) => {
          // In relationships table, related_entity_id is the matched user
          const matchedUserId = match.related_entity_id;
          const eventIdFromMetadata = match.metadata?.event_id;

          const [profile, eventData] = await Promise.all([
            supabase
              .from('users')
              .select('user_id, name, avatar_url, bio, music_streaming_profile')
              .eq('user_id', matchedUserId)
              .single(),
            eventIdFromMetadata
              ? supabase
                  .from('events')
                  .select('id, title, artist_name, venue_name, event_date, poster_image_url')
                  .eq('id', eventIdFromMetadata)
                  .single()
              : Promise.resolve({ data: null })
          ]);

          return {
            ...match,
            user1_id: match.user_id,
            user2_id: match.related_entity_id,
            event_id: eventIdFromMetadata || '',
            matched_user: profile.data,
            event: eventData.data,
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
        .from('engagements')
        .select('id')
        .eq('user_id', user.id)
        .eq('entity_type', 'user')
        .eq('entity_id', userId)
        .eq('engagement_type', 'swipe')
        .eq('metadata->>event_id', eventId)
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
        .from('relationships')
        .select('*', { count: 'exact', head: true })
        .eq('related_entity_type', 'user')
        .eq('relationship_type', 'match')
        .eq('user_id', user.id);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error getting match count:', error);
      return 0;
    }
  }

  /**
   * Get user's notifications
   */
  static async getNotifications(limit: number = 20): Promise<any[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('notifications')
        .select(`
          *,
          actor_profile:actor_user_id (
            name,
            avatar_url
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting notifications:', error);
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  static async markNotificationRead(notificationId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) throw error;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Get unread notification count
   */
  static async getUnreadNotificationCount(): Promise<number> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error getting unread notification count:', error);
      return 0;
    }
  }

  /**
   * Get user's chats
   */
  static async getChats(): Promise<any[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('chats')
        .select(`
          *,
          messages (
            id,
            message,
            sender_id,
            created_at
          )
        `)
        .contains('users', [user.id])
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting chats:', error);
      throw error;
    }
  }

  /**
   * Send a message in a chat
   */
  static async sendMessage(chatId: string, message: string): Promise<void> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('messages')
        .insert({
          chat_id: chatId,
          sender_id: user.id,
          content: message,
        });

      if (error) throw error;

      // Update chat's updated_at timestamp
      await supabase
        .from('chats')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', chatId);
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }
}

export default MatchingService;

