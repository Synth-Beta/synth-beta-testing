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
    const { data } = await supabase
      .from('events')
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
    // Get or create entity for this event
    const { data: entityId, error: entityError } = await supabase.rpc('get_or_create_entity', {
      p_entity_type: 'event',
      p_entity_uuid: internalEventId,
      p_entity_text_id: null,
    });

    if (entityError) throw entityError;

    if (existingLike) {
      // User already liked this event, return the existing like
      const { data, error: fetchError } = await supabase
        .from('engagements')
        .select('*')
        .eq('user_id', userId)
        .eq('entity_id', entityId)
        .eq('engagement_type', 'like')
        .single();
      
      if (fetchError || !data) {
        console.error('Error fetching existing like:', fetchError);
        // Return null if fetch fails rather than returning invalid data
        return null;
      }
      
      // Transform engagements table result to EventLike interface
      return {
        id: data.id,
        user_id: data.user_id,
        event_id: internalEventId, // Add event_id for EventLike interface compatibility
        created_at: data.created_at,
      } as EventLike;
    }
    
    const { data, error } = await supabase
      .from('engagements')
      .insert({ 
        user_id: userId, 
        entity_id: entityId, // FK to entities.id (replaces entity_type + entity_id)
        engagement_type: 'like'
      })
      .select('*')
      .single();
    if (error) {
      // PGRST205: table not found in schema cache (migration missing)
      if ((error as any).code === 'PGRST205') {
        console.warn('engagements table not found. Add migration to enable event likes.');
        return null;
      }
      // Handle duplicate key constraint (409 Conflict)
      if ((error as any).code === '23505' || (error as any).status === 409) {
        // Try to get the existing like from engagements table
        const { data: existingData, error: fetchError } = await supabase
          .from('engagements')
          .select('*')
          .eq('user_id', userId)
          .eq('entity_id', entityId) // Use entity_id instead of event_id
          .eq('engagement_type', 'like')
          .single();
        
        if (fetchError) {
          console.error('Error fetching existing like after duplicate key error:', fetchError);
          throw error; // Re-throw original error if fetch fails
        }
        
        // Transform engagements table result to EventLike interface
        return {
          id: existingData.id,
          user_id: existingData.user_id,
          event_id: internalEventId, // Add event_id for EventLike interface compatibility
          created_at: existingData.created_at,
        } as EventLike;
      }
      throw error;
    }
    
    // Transform engagements table result to EventLike interface (add event_id for compatibility)
    return {
      id: data.id,
      user_id: data.user_id,
      event_id: internalEventId, // Add event_id field required by EventLike interface
      created_at: data.created_at,
    } as EventLike;
  }

  static async unlikeEvent(userId: string, eventId: string): Promise<void> {
    const internalEventId = await this.resolveInternalEventId(eventId);
    
    // Get entity_id for this event
    const { data: entityData } = await supabase
      .from('entities')
      .select('id')
      .eq('entity_type', 'event')
      .eq('entity_uuid', internalEventId)
      .single();

    if (!entityData?.id) {
      return; // Entity not found, nothing to delete
    }

    const { error } = await supabase
      .from('engagements')
      .delete()
      .eq('user_id', userId)
      .eq('entity_id', entityData.id)
      .eq('engagement_type', 'like');
    if (error) {
      if ((error as any).code === 'PGRST205') return; // silent if table missing
      throw error;
    }
  }

  static async getEventLikers(eventId: string): Promise<LikerProfile[]> {
    const internalEventId = await this.resolveInternalEventId(eventId);
    
    // Get entity_id for this event
    const { data: entityData } = await supabase
      .from('entities')
      .select('id')
      .eq('entity_type', 'event')
      .eq('entity_uuid', internalEventId)
      .single();

    if (!entityData?.id) {
      return []; // Entity not found, return empty array
    }

    const { data, error } = await supabase
      .from('engagements')
      .select('user_id')
      .eq('entity_id', entityData.id)
      .eq('engagement_type', 'like');
    if (error) {
      if ((error as any).code === 'PGRST205') return [];
      throw error;
    }
    const userIds = (data || []).map((r: any) => r.user_id);
    if (userIds.length === 0) return [];
    const { data: profiles, error: profilesError } = await supabase
      .from('users')
      .select('id, user_id, name, avatar_url')
      .in('user_id', userIds);
    if (profilesError) throw profilesError;
    return (profiles || []) as LikerProfile[];
  }

  static async isLikedByUser(userId: string, eventId: string): Promise<boolean> {
    try {
      const internalEventId = await this.resolveInternalEventId(eventId);
      
      // Get entity_id for this event
      const { data: entityData } = await supabase
        .from('entities')
        .select('id')
        .eq('entity_type', 'event')
        .eq('entity_uuid', internalEventId)
        .single();

      if (!entityData?.id) {
        return false; // Entity not found, so like doesn't exist
      }

      const { data, error } = await supabase
        .from('engagements')
        .select('id')
        .eq('user_id', userId)
        .eq('entity_id', entityData.id)
        .eq('engagement_type', 'like')
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


