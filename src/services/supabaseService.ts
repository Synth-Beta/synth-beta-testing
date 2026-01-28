import { supabase } from '@/integrations/supabase/client';
// Note: Types will need to be regenerated after migration
// Using any for now until types.ts is regenerated from Supabase
type Tables<T extends string> = any;
type TablesInsert<T extends string> = any;
type TablesUpdate<T extends string> = any;

// Type exports for easier use
export type Profile = Tables<'users'>;
export type JamBaseEvent = Tables<'events'>;
export type Match = Tables<'user_relationships'>; // matches migrated to user_relationships (3NF compliant)
export type Chat = Tables<'chats'>;
export type Message = Tables<'messages'>;
export type UserSwipe = Tables<'engagements'>; // user_swipes migrated to engagements
export type EventInterest = Tables<'user_event_relationships'>; // user_jambase_events migrated to user_event_relationships (3NF compliant)

export class SupabaseService {
  // Feature flags to gracefully disable functionality when the backing
  // tables or views are not available in the current Supabase project.
  private static engagementsAvailable = true;
  // ===== USERS (formerly profiles) =====
  static async getProfile(userId: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data;
  }

  static async createProfile(profile: TablesInsert<'users'>) {
    const { data, error } = await supabase
      .from('users')
      .insert(profile)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateProfile(userId: string, updates: TablesUpdate<'users'>) {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async searchProfiles(query: string, limit = 10) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('name', `%${query}%`)
      .limit(limit);

    if (error) throw error;
    return data;
  }

  // ===== EVENTS (formerly jambase_events) =====
  static async getEvents(limit = 50, offset = 0) {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data;
  }

  static async getEventById(id: string) {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Try UUID-based lookup first
    if (uuidPattern.test(id)) {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single();

      if (!error && data) return data;
    }

    // Fallback: treat input as JamBase external ID
    const { data: byJambase, error: byJambaseError } = await supabase
      .from('events')
      .select('*')
      .eq('jambase_event_id', id)
      .single();

    if (byJambaseError) throw byJambaseError;
    return byJambase;
  }

  static async searchEvents(query: string, limit = 20) {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .or(`title.ilike.%${query}%,artist_name.ilike.%${query}%,venue_name.ilike.%${query}%`)
      .order('event_date', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return data;
  }

  // ===== EVENT INTERESTS (3NF compliant - user_event_relationships) =====
  static async getUserEventInterests(userId: string) {
    const { data, error } = await supabase
      .from('user_event_relationships')
      .select(`
        user_id,
        event_id,
        created_at,
        relationship_type,
        events:events!user_event_relationships_event_id_fkey(
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
      .in('relationship_type', ['interested', 'going', 'maybe'])
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  static async addEventInterest(userId: string, eventId: string) {
    const { data, error } = await supabase
      .from('user_event_relationships')
      .insert({
        user_id: userId,
        event_id: eventId,
        relationship_type: 'interested'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async removeEventInterest(userId: string, eventId: string) {
    const { error } = await supabase
      .from('user_event_relationships')
      .delete()
      .eq('user_id', userId)
      .eq('event_id', eventId)
      .in('relationship_type', ['interested', 'going', 'maybe']);

    if (error) throw error;
  }

  // ===== MATCHES (3NF compliant - user_relationships) =====
  static async getMatches(userId: string) {
    const { data, error } = await supabase
      .from('user_relationships')
      .select(`
        id,
        related_user_id,
        metadata,
        created_at,
        user1:users!user_id(
          user_id,
          name,
          avatar_url,
          bio
        ),
        user2:users!related_user_id(
          user_id,
          name,
          avatar_url,
          bio
        )
      `)
      .eq('relationship_type', 'match')
      .or(`user_id.eq.${userId},related_user_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  static async createMatch(user1Id: string, user2Id: string, eventId: string) {
    // Create bidirectional match relationships (3NF compliant)
    const { data: data1, error: error1 } = await supabase
      .from('user_relationships')
      .insert({
        user_id: user1Id,
        related_user_id: user2Id,
        relationship_type: 'match',
        status: 'accepted',
        metadata: { event_id: eventId, matched_user_id: user2Id }
      })
      .select()
      .single();

    if (error1) throw error1;

    const { data: data2, error: error2 } = await supabase
      .from('user_relationships')
      .insert({
        user_id: user2Id,
        related_user_id: user1Id,
        relationship_type: 'match',
        status: 'accepted',
        metadata: { event_id: eventId, matched_user_id: user1Id }
      })
      .select()
      .single();

    if (error2) throw error2;
    return data1;
  }

  // ===== USER SWIPES (migrated to engagements) =====
  static async getUserSwipes(userId: string, eventId?: string) {
    // If we already detected that the engagements table/schema isn't
    // available, short‑circuit to avoid repeated 400 spam.
    if (!this.engagementsAvailable) {
      return [];
    }

    try {
      let query = supabase
        .from('engagements')
        .select(`
          id,
          entity_id,
          engagement_value,
          metadata,
          created_at
        `)
        .eq('user_id', userId)
        .eq('engagement_type', 'swipe')
        .order('created_at', { ascending: false });

      // Filter to "user" swipes via metadata instead of legacy entity_type
      // to be compatible with newer 3NF schema (where entity_type column
      // may no longer exist).
      if (eventId) {
        query = query.contains('metadata', { event_id: eventId });
      }

      const { data, error } = await query;

      if (error) {
        // Gracefully handle schema/config mismatches so local/dev projects
        // without the engagements table (or with different FKs) don't flood
        // the console and still allow the rest of the app to work.
        const code = (error as any).code;
        const status = (error as any).status;
        if (
          status === 400 ||
          code === 'PGRST205' || // table not in schema cache
          code === '42P01' || // relation does not exist
          code === 'PGRST204' // view or table not found
        ) {
          console.warn(
            '⚠️ SupabaseService.getUserSwipes: engagements table/view not available; disabling swipe fetches.',
            error
          );
          this.engagementsAvailable = false;
          return [];
        }

        throw error;
      }

      return data ?? [];
    } catch (err) {
      console.error('❌ SupabaseService.getUserSwipes failed:', err);
      return [];
    }
  }

  static async createSwipe(swiperUserId: string, swipedUserId: string, eventId: string, isInterested: boolean) {
    // Get or create entity for this user
    const { data: entityId, error: entityError } = await supabase.rpc('get_or_create_entity', {
      p_entity_type: 'user',
      p_entity_uuid: swipedUserId,
      p_entity_text_id: null,
    });

    if (entityError) throw entityError;

    const { data, error } = await supabase
      .from('engagements')
      .insert({
        user_id: swiperUserId,
        entity_id: entityId, // FK to entities.id (replaces entity_type + entity_id)
        engagement_type: 'swipe',
        engagement_value: isInterested ? 'right' : 'left',
        metadata: { event_id: eventId, is_interested: isInterested }
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ===== CHATS =====
  static async getChats(userId: string) {
    const { data, error } = await supabase
      .from('user_relationships')
      .select(`
        id,
        related_user_id,
        metadata,
        created_at,
        user1:users!user_id(
          user_id,
          name,
          avatar_url
        ),
        user2:users!related_user_id(
          user_id,
          name,
          avatar_url
        ),
        chat:chats(
          id,
          created_at,
          updated_at
        )
      `)
      .eq('relationship_type', 'match')
      .or(`user_id.eq.${userId},related_user_id.eq.${userId}`)
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
        sender:users!messages_sender_id_fkey(
          user_id,
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
        sender:users!messages_sender_id_fkey(
          user_id,
          name,
          avatar_url
        )
      `)
      .single();

    if (error) throw error;
    return data;
  }

  // ===== UTILITY METHODS =====
  static async isUserInterestedInEvent(userId: string, eventId: string) {
    const { data, error } = await supabase
      .from('user_event_relationships')
      .select('user_id, event_id, relationship_type')
      .eq('user_id', userId)
      .eq('event_id', eventId)
      .in('relationship_type', ['interested', 'going', 'maybe'])
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  }

  static async hasUserSwipedOnUser(swiperId: string, swipedId: string, eventId: string) {
    const { data, error } = await supabase
      .from('engagements')
      .select('id')
      .eq('user_id', swiperId)
      .eq('entity_type', 'user')
      .eq('entity_id', swipedId)
      .eq('engagement_type', 'swipe')
      .contains('metadata', { event_id: eventId })
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  }

  static async getUsersForEvent(eventId: string, excludeUserId?: string) {
    let query = supabase
      .from('user_event_relationships')
      .select(`
        user_id,
        created_at,
        users:users!user_event_relationships_user_id_fkey(
          user_id,
          name,
          avatar_url,
          bio,
          instagram_handle
        )
      `)
      .eq('event_id', eventId)
      .in('relationship_type', ['interested', 'going', 'maybe'])
      .order('created_at', { ascending: false });

    if (excludeUserId) {
      query = query.neq('user_id', excludeUserId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data;
  }
}
