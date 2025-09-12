import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

// Type exports for easier use
export type Profile = Tables<'profiles'>;
export type JamBaseEvent = Tables<'jambase_events'>;
export type Match = Tables<'matches'>;
export type Chat = Tables<'chats'>;
export type Message = Tables<'messages'>;
export type UserSwipe = Tables<'user_swipes'>;
export type EventInterest = Tables<'event_interests'>;

export class SupabaseService {
  // ===== PROFILES =====
  static async getProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data;
  }

  static async createProfile(profile: TablesInsert<'profiles'>) {
    const { data, error } = await supabase
      .from('profiles')
      .insert(profile)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateProfile(userId: string, updates: TablesUpdate<'profiles'>) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async searchProfiles(query: string, limit = 10) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .ilike('name', `%${query}%`)
      .limit(limit);

    if (error) throw error;
    return data;
  }

  // ===== JAMBASE EVENTS =====
  static async getEvents(limit = 50, offset = 0) {
    const { data, error } = await supabase
      .from('jambase_events')
      .select('*')
      .order('event_date', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data;
  }

  static async getEventById(id: string) {
    const { data, error } = await supabase
      .from('jambase_events')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  static async searchEvents(query: string, limit = 20) {
    const { data, error } = await supabase
      .from('jambase_events')
      .select('*')
      .or(`title.ilike.%${query}%,artist_name.ilike.%${query}%,venue_name.ilike.%${query}%`)
      .order('event_date', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return data;
  }

  // ===== EVENT INTERESTS =====
  static async getUserEventInterests(userId: string) {
    const { data, error } = await supabase
      .from('event_interests')
      .select(`
        created_at,
        event:jambase_events(
          id,
          title,
          artist_name,
          venue_name,
          venue_city,
          venue_state,
          event_date,
          doors_time
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  static async addEventInterest(userId: string, eventId: number) {
    const { data, error } = await supabase
      .from('event_interests')
      .insert({
        user_id: userId,
        event_id: eventId
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async removeEventInterest(userId: string, eventId: number) {
    const { error } = await supabase
      .from('event_interests')
      .delete()
      .eq('user_id', userId)
      .eq('event_id', eventId);

    if (error) throw error;
  }

  // ===== MATCHES =====
  static async getMatches(userId: string) {
    const { data, error } = await supabase
      .from('matches')
      .select(`
        id,
        event_id,
        user1_id,
        user2_id,
        created_at,
        event:jambase_events(
          id,
          title,
          artist_name,
          venue_name,
          venue_city,
          venue_state,
          event_date,
          doors_time
        ),
        user1:profiles!matches_user1_id_fkey(
          id,
          name,
          avatar_url,
          bio
        ),
        user2:profiles!matches_user2_id_fkey(
          id,
          name,
          avatar_url,
          bio
        )
      `)
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  static async createMatch(match: TablesInsert<'matches'>) {
    const { data, error } = await supabase
      .from('matches')
      .insert(match)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ===== USER SWIPES =====
  static async getUserSwipes(userId: string, eventId?: number) {
    let query = supabase
      .from('user_swipes')
      .select(`
        id,
        swiped_user_id,
        event_id,
        is_interested,
        created_at,
        swiped_user:profiles!user_swipes_swiped_user_id_fkey(
          id,
          name,
          avatar_url,
          bio
        ),
        event:jambase_events(
          id,
          title,
          artist_name,
          venue_name,
          venue_city,
          venue_state,
          event_date
        )
      `)
      .eq('swiper_user_id', userId)
      .order('created_at', { ascending: false });

    if (eventId) {
      query = query.eq('event_id', eventId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data;
  }

  static async createSwipe(swipe: TablesInsert<'user_swipes'>) {
    const { data, error } = await supabase
      .from('user_swipes')
      .insert(swipe)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ===== CHATS =====
  static async getChats(userId: string) {
    const { data, error } = await supabase
      .from('matches')
      .select(`
        id,
        event_id,
        user1_id,
        user2_id,
        created_at,
        event:jambase_events(
          id,
          title,
          artist_name,
          venue_name,
          venue_city,
          venue_state,
          event_date
        ),
        user1:profiles!matches_user1_id_fkey(
          id,
          name,
          avatar_url
        ),
        user2:profiles!matches_user2_id_fkey(
          id,
          name,
          avatar_url
        ),
        chat:chats(
          id,
          created_at,
          updated_at
        )
      `)
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .not('chat', 'is', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  static async createChat(matchId: string) {
    const { data, error } = await supabase
      .from('chats')
      .insert({
        match_id: matchId
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ===== MESSAGES =====
  static async getMessages(chatId: string, limit = 50, offset = 0) {
    const { data, error } = await supabase
      .from('messages')
      .select(`
        id,
        content,
        created_at,
        sender_id,
        sender:profiles!messages_sender_id_fkey(
          id,
          name,
          avatar_url
        )
      `)
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data;
  }

  static async sendMessage(message: TablesInsert<'messages'>) {
    const { data, error } = await supabase
      .from('messages')
      .insert(message)
      .select(`
        id,
        content,
        created_at,
        sender_id,
        sender:profiles!messages_sender_id_fkey(
          id,
          name,
          avatar_url
        )
      `)
      .single();

    if (error) throw error;
    return data;
  }

  // ===== UTILITY METHODS =====
  static async isUserInterestedInEvent(userId: string, eventId: number) {
    const { data, error } = await supabase
      .from('event_interests')
      .select('id')
      .eq('user_id', userId)
      .eq('event_id', eventId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  }

  static async hasUserSwipedOnUser(swiperId: string, swipedId: string, eventId: number) {
    const { data, error } = await supabase
      .from('user_swipes')
      .select('id')
      .eq('swiper_user_id', swiperId)
      .eq('swiped_user_id', swipedId)
      .eq('event_id', eventId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  }

  static async getUsersForEvent(eventId: number, excludeUserId?: string) {
    let query = supabase
      .from('event_interests')
      .select(`
        user_id,
        created_at,
        user:profiles!event_interests_user_id_fkey(
          id,
          name,
          avatar_url,
          bio,
          instagram_handle,
          snapchat_handle
        )
      `)
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });

    if (excludeUserId) {
      query = query.neq('user_id', excludeUserId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data;
  }
}
