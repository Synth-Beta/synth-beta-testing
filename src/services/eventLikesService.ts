import { supabase } from '@/integrations/supabase/client';

export interface EventLike {
  id: string;
  user_id: string;
  event_id: string;
  created_at: string;
}

export interface LikerProfile {
  id: string;
  user_id: string;
  name: string;
  avatar_url?: string | null;
}

export class EventLikesService {
  private static async resolveInternalEventId(eventId: string): Promise<string> {
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidV4Regex.test(eventId)) return eventId;
    const { data } = await (supabase as any)
      .from('jambase_events')
      .select('id')
      .eq('jambase_event_id', eventId)
      .limit(1)
      .single();
    return data?.id || eventId;
  }

  static async likeEvent(userId: string, eventId: string): Promise<EventLike | null> {
    const internalEventId = await this.resolveInternalEventId(eventId);
    
    // First check if the user has already liked this event
    const existingLike = await this.isLikedByUser(userId, eventId);
    if (existingLike) {
      // User already liked this event, return the existing like
      const { data } = await (supabase as any)
        .from('event_likes')
        .select('*')
        .eq('user_id', userId)
        .eq('event_id', internalEventId)
        .single();
      return data as EventLike;
    }
    
    const { data, error } = await (supabase as any)
      .from('event_likes')
      .insert({ user_id: userId, event_id: internalEventId })
      .select('*')
      .single();
    if (error) {
      // PGRST205: table not found in schema cache (migration missing)
      if ((error as any).code === 'PGRST205') {
        console.warn('event_likes table not found. Add migration to enable event likes.');
        return null;
      }
      // Handle duplicate key constraint (409 Conflict)
      if ((error as any).code === '23505' || (error as any).status === 409) {
        // Try to get the existing like
        const { data: existingData } = await (supabase as any)
          .from('event_likes')
          .select('*')
          .eq('user_id', userId)
          .eq('event_id', internalEventId)
          .single();
        return existingData as EventLike;
      }
      throw error;
    }
    return data as EventLike;
  }

  static async unlikeEvent(userId: string, eventId: string): Promise<void> {
    const internalEventId = await this.resolveInternalEventId(eventId);
    const { error } = await (supabase as any)
      .from('event_likes')
      .delete()
      .eq('user_id', userId)
      .eq('event_id', internalEventId);
    if (error) {
      if ((error as any).code === 'PGRST205') return; // silent if table missing
      throw error;
    }
  }

  static async getEventLikers(eventId: string): Promise<LikerProfile[]> {
    const internalEventId = await this.resolveInternalEventId(eventId);
    const { data, error } = await (supabase as any)
      .from('event_likes')
      .select('user_id')
      .eq('event_id', internalEventId);
    if (error) {
      if ((error as any).code === 'PGRST205') return [];
      throw error;
    }
    const userIds = (data || []).map((r: any) => r.user_id);
    if (userIds.length === 0) return [];
    const { data: profiles, error: profilesError } = await (supabase as any)
      .from('profiles')
      .select('id, user_id, name, avatar_url')
      .in('user_id', userIds);
    if (profilesError) throw profilesError;
    return (profiles || []) as LikerProfile[];
  }

  static async isLikedByUser(userId: string, eventId: string): Promise<boolean> {
    try {
      const internalEventId = await this.resolveInternalEventId(eventId);
      const { data, error } = await (supabase as any)
        .from('event_likes')
        .select('id')
        .eq('user_id', userId)
        .eq('event_id', internalEventId)
        .limit(1)
        .maybeSingle();
      
      if (error) {
        if ((error as any).code === 'PGRST205') return false; // table not found
        throw error;
      }
      
      return Boolean(data);
    } catch (error) {
      console.error('Error checking if event is liked by user:', error);
      return false;
    }
  }
}


