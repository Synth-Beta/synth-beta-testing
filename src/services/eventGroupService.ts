/**
 * Event Group Service
 * Handles event-based community groups with integrated chat
 */

import { supabase } from '@/integrations/supabase/client';

export interface CreateGroupRequest {
  event_id: string;
  name: string;
  description?: string;
  is_public?: boolean;
  max_members?: number;
}

export interface EventGroup {
  id: string;
  event_id: string;
  name: string;
  description?: string;
  created_by_user_id: string;
  creator_name: string;
  creator_avatar_url?: string;
  is_public: boolean;
  member_count: number;
  max_members?: number;
  cover_image_url?: string;
  is_member: boolean;
  chat_id?: string;
  created_at: string;
}

export class EventGroupService {
  /**
   * Create a new event group
   */
  static async createGroup(request: CreateGroupRequest): Promise<string> {
    try {
      const { data, error } = await supabase.rpc('create_event_group', {
        p_event_id: request.event_id,
        p_name: request.name,
        p_description: request.description || null,
        p_is_public: request.is_public ?? true,
        p_max_members: request.max_members || null,
      });

      if (error) throw error;
      return data; // Returns group_id
    } catch (error) {
      console.error('Error creating group:', error);
      throw error;
    }
  }

  /**
   * Get groups for an event
   */
  static async getEventGroups(eventId: string): Promise<EventGroup[]> {
    try {
      const { data, error } = await supabase.rpc('get_event_groups', {
        p_event_id: eventId,
      });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting event groups:', error);
      throw error;
    }
  }

  /**
   * Join a group
   */
  static async joinGroup(groupId: string): Promise<void> {
    try {
      const { error } = await supabase.rpc('join_event_group', {
        p_group_id: groupId,
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error joining group:', error);
      throw error;
    }
  }

  /**
   * Leave a group
   */
  static async leaveGroup(groupId: string): Promise<void> {
    try {
      const { error } = await supabase.rpc('leave_event_group', {
        p_group_id: groupId,
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error leaving group:', error);
      throw error;
    }
  }

  /**
   * Get group members
   */
  static async getGroupMembers(groupId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('event_group_members')
        .select(`
          *,
          user:profiles!event_group_members_user_id_fkey (
            user_id,
            name,
            avatar_url,
            bio
          )
        `)
        .eq('group_id', groupId)
        .order('joined_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting group members:', error);
      throw error;
    }
  }

  /**
   * Get user's groups
   */
  static async getUserGroups(): Promise<EventGroup[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('event_group_members')
        .select(`
          group:event_groups (
            *,
            event:jambase_events (
              id,
              title,
              artist_name,
              event_date,
              poster_image_url
            ),
            creator:profiles!event_groups_created_by_user_id_fkey (
              name,
              avatar_url
            )
          )
        `)
        .eq('user_id', user.id)
        .order('joined_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((item: any) => item.group).filter(Boolean);
    } catch (error) {
      console.error('Error getting user groups:', error);
      throw error;
    }
  }

  /**
   * Update group
   */
  static async updateGroup(
    groupId: string,
    updates: Partial<CreateGroupRequest>
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('event_groups')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', groupId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating group:', error);
      throw error;
    }
  }

  /**
   * Delete group
   */
  static async deleteGroup(groupId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('event_groups')
        .delete()
        .eq('id', groupId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting group:', error);
      throw error;
    }
  }

  /**
   * Check if user is member of group
   */
  static async isMember(groupId: string): Promise<boolean> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return false;

      const { data } = await supabase
        .from('event_group_members')
        .select('id')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .single();

      return !!data;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get group by ID
   */
  static async getGroup(groupId: string): Promise<EventGroup | null> {
    try {
      const { data, error } = await supabase
        .from('event_groups')
        .select(`
          *,
          event:jambase_events (
            id,
            title,
            artist_name,
            venue_name,
            event_date,
            poster_image_url
          ),
          creator:profiles!event_groups_created_by_user_id_fkey (
            name,
            avatar_url
          )
        `)
        .eq('id', groupId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting group:', error);
      throw error;
    }
  }
}

export default EventGroupService;

