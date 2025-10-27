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
    const { data } = await (supabase as any)
      .from('jambase_events')
      .select('id')
      .eq('jambase_event_id', eventId)
      .limit(1)
      .single();
    return data?.id || eventId;
  }
  static async getEventComments(eventId: string, limit: number = 20, offset: number = 0): Promise<{ comments: EventCommentWithUser[]; total: number; hasMore: boolean }> {
    const internalEventId = await this.resolveInternalEventId(eventId);
    
    // Get total count
    const { count, error: countError } = await supabase
      .from('event_comments' as any)
      .select('*', { count: 'exact', head: true })
      .eq('event_id', internalEventId);
    
    if (countError && (countError as any).code !== 'PGRST205') {
      throw countError;
    }
    
    const total = count || 0;
    
    // Get comments with pagination
    const { data: comments, error: commentsError } = await supabase
      .from('event_comments' as any)
      .select('*')
      .eq('event_id', internalEventId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);
    
    if (commentsError) {
      // Gracefully handle missing table in environments where migration hasn't run
      if ((commentsError as any).code === 'PGRST205') {
        console.warn('event_comments table not found. Did you run the migration 20250923_add_event_comments.sql?');
        return { comments: [], total: 0, hasMore: false };
      }
      throw commentsError;
    }
    if (!comments || comments.length === 0) return { comments: [], total, hasMore: false };

    const userIds = [...new Set(comments.map((c: any) => c.user_id))];
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, name, avatar_url, user_id')
      .in('user_id', userIds);

    if (profilesError) throw profilesError;

    const profileMap = new Map<string, { id: string; name: string; avatar_url?: string }>();
    profiles?.forEach((p: any) => {
      profileMap.set(p.user_id, { id: p.id, name: p.name, avatar_url: p.avatar_url || undefined });
    });

    const withUsers: EventCommentWithUser[] = (comments as any[]).map((c) => ({
      id: c.id,
      user_id: c.user_id,
      event_id: c.event_id,
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
    const { data, error } = await supabase
      .from('event_comments' as any)
      .insert({
        user_id: userId,
        event_id: internalEventId,
        comment_text: commentText,
        parent_comment_id: parentCommentId
      })
      .select()
      .single();
    
    if (error) {
      if ((error as any).code === 'PGRST205') {
        throw new Error('Event comments are not yet enabled. Please apply the Supabase migration 20250923_add_event_comments.sql.');
      }
      // Fix: Cast error to unknown first before throwing, to avoid type issues.
      throw error as unknown;
    }
    return data as unknown as EventComment;
  }
}

