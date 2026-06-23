import { supabase } from '@/integrations/supabase/client';

export interface EventComment {
  id: string;
  user_id: string;
  event_id: string;
  parent_comment_id?: string | null;
  comment_text: string;
  created_at: string;
  updated_at: string;
}

export interface EventCommentWithUser extends EventComment {
  user: {
    id: string;
    name: string;
    avatar_url?: string;
  };
}

export class EventCommentsService {
  /**
   * Resolve internal event UUID from external JamBase id if needed
   */
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
  static async getEventComments(eventId: string, limit: number = 20, offset: number = 0): Promise<{ comments: EventCommentWithUser[]; total: number; hasMore: boolean }> {
    const internalEventId = await this.resolveInternalEventId(eventId);
    
    // Get entity_id for this event
    const { data: entityData, error: entityError } = await supabase
      .from('entities')
      .select('id')
      .eq('entity_type', 'event')
      .eq('entity_uuid', internalEventId)
      .single();
    
    if (entityError && (entityError as any).code !== 'PGRST116') {
      throw entityError;
    }

    if (!entityData?.id) {
      // Entity not found, return empty results
      return { comments: [], total: 0, hasMore: false };
    }

    const entityId = entityData.id;
    
    // Get total count
    const { count, error: countError } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('entity_id', entityId);
    
    if (countError && (countError as any).code !== 'PGRST205') {
      throw countError;
    }
    
    const total = count || 0;
    
    // Get comments with pagination
    const { data: comments, error: commentsError } = await supabase
      .from('comments')
      .select('*')
      .eq('entity_id', entityId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);
    
    if (commentsError) {
      // Gracefully handle missing table in environments where migration hasn't run
      if ((commentsError as any).code === 'PGRST205') {
        console.warn('comments table not found. Did you run the consolidation migration?');
        return { comments: [], total: 0, hasMore: false };
      }
      throw commentsError;
    }
    if (!comments || comments.length === 0) return { comments: [], total, hasMore: false };

    const userIds = [...new Set(comments.map((c: any) => c.user_id))];
    const { data: profiles, error: profilesError } = await supabase
      .from('users')
      .select('id, name, avatar_url, user_id')
      .in('user_id', userIds);

    if (profilesError) throw profilesError;

    const profileMap = new Map<string, { id: string; name: string; avatar_url?: string }>();
    profiles?.forEach((p: any) => {
      profileMap.set(p.user_id, { id: p.id, name: p.name, avatar_url: p.avatar_url || undefined });
    });

    // Map comments - use internalEventId since all comments are for this event
    // Note: comments now use entity_id (FK to entities.id) instead of event_id
    const withUsers: EventCommentWithUser[] = (comments as any[]).map((c) => ({
      id: c.id,
      user_id: c.user_id,
      event_id: internalEventId, // Use the resolved internal event ID (entity_uuid from entities table)
      parent_comment_id: c.parent_comment_id ?? null,
      comment_text: c.comment_text,
      created_at: c.created_at,
      updated_at: c.updated_at,
      user: profileMap.get(c.user_id) || { id: c.user_id, name: 'Unknown User' }
    }));

    const hasMoreComments = offset + comments.length < total;
    
    return { comments: withUsers, total, hasMore: hasMoreComments };
  }

  static async addEventComment(
    userId: string,
    eventId: string,
    commentText: string,
    parentCommentId?: string
  ): Promise<EventComment> {
    const internalEventId = await this.resolveInternalEventId(eventId);
    
    // Get or create entity for this event
    const { data: entityId, error: entityError } = await supabase.rpc('get_or_create_entity', {
      p_entity_type: 'event',
      p_entity_uuid: internalEventId,
      p_entity_text_id: null,
    });

    if (entityError) {
      throw entityError as unknown;
    }

    const { data, error } = await supabase
      .from('comments')
      .insert({
        user_id: userId,
        entity_id: entityId, // FK to entities.id (replaces entity_type + entity_id)
        comment_text: commentText,
        parent_comment_id: parentCommentId
      })
      .select()
      .single();
    
    if (error) {
      if ((error as any).code === 'PGRST205') {
        throw new Error('Event comments are not yet enabled. Please apply the consolidation migration.');
      }
      // Fix: Cast error to unknown first before throwing, to avoid type issues.
      throw error as unknown;
    }
    
    // Transform database result to EventComment interface (add event_id for compatibility)
    return {
      id: data.id,
      user_id: data.user_id,
      event_id: internalEventId, // Add event_id field required by EventComment interface
      parent_comment_id: data.parent_comment_id ?? null,
      comment_text: data.comment_text,
      created_at: data.created_at,
      updated_at: data.updated_at,
    } as EventComment;
  }
}

