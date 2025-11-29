/**
 * In-App Event Sharing Service
 * Handles sharing events directly to friends and groups within PlusOne
 */

import { supabase } from '@/integrations/supabase/client';
import type { JamBaseEvent } from './jambaseEventsService';
import { fetchUserChats } from './chatService';

export interface ShareTarget {
  id: string; // chat_id
  name: string;
  type: 'direct' | 'group';
  users: string[];
  avatar_url?: string | null;
}

export interface EventShareMessage {
  chat_id: string;
  sender_id: string;
  content: string; // Optional custom message
  message_type: 'event_share';
  shared_event_id: string;
  metadata?: {
    custom_message?: string;
    share_context?: string;
  };
}

export interface EventShareResult {
  success: boolean;
  message_id?: string;
  chat_id?: string;
  error?: string;
}

export class InAppShareService {
  /**
   * Get list of available share targets (chats) for the current user
   */
  static async getShareTargets(userId: string): Promise<ShareTarget[]> {
    try {
      // Get user's chats using the existing RPC function
      const { data: chats, error } = await fetchUserChats(userId);

      if (error) {
        console.error('Error fetching share targets:', error);
        throw error;
      }

      // Transform to ShareTarget format
      const targets: ShareTarget[] = (chats || []).map((chat: any) => ({
        id: chat.id,
        name: chat.chat_name,
        type: chat.is_group_chat ? 'group' : 'direct',
        users: chat.users || [],
        avatar_url: null // Can be enhanced to show user avatars for direct chats
      }));

      return targets;
    } catch (error) {
      console.error('Error getting share targets:', error);
      throw new Error(`Failed to get share targets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get friends list for creating new chats to share events
   */
  static async getFriends(userId: string): Promise<Array<{
    user_id: string;
    name: string;
    avatar_url: string | null;
  }>> {
    try {
      // Query friends from the relationships table
      const { data: friendships, error: friendsError } = await supabase
        .from('relationships')
        .select('id, user_id, related_entity_id, created_at')
        .eq('related_entity_type', 'user')
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted')
        .or(`user_id.eq.${userId},related_entity_id.eq.${userId}`)
        .order('created_at', { ascending: false });

      if (friendsError) {
        console.error('Error fetching friends:', friendsError);
        throw friendsError;
      }

      if (!friendships || friendships.length === 0) {
        return [];
      }

      // Get all the user IDs we need to fetch
      const userIds = friendships.map(f => 
        f.user_id === userId ? f.related_entity_id : f.user_id
      );

      // Fetch the profiles for those users
      const { data: profiles, error: profilesError } = await supabase
        .from('users')
        .select('user_id, name, avatar_url')
        .in('user_id', userIds);

      if (profilesError) {
        console.error('Error fetching friend profiles:', profilesError);
        throw profilesError;
      }

      return profiles || [];
    } catch (error) {
      console.error('Error getting friends:', error);
      throw new Error(`Failed to get friends: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Share an event to a specific chat
   */
  static async shareEventToChat(
    eventId: string,
    chatId: string,
    userId: string,
    customMessage?: string
  ): Promise<EventShareResult> {
    try {
      // Verify the event exists
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id, title, artist_name, venue_name, event_date')
        .eq('id', eventId)
        .single();

      if (eventError || !event) {
        return {
          success: false,
          error: 'Event not found'
        };
      }

      // Create the default message content
      const defaultMessage = customMessage || `Check out this event: ${event.title} by ${event.artist_name}!`;

      // Insert the message with event share data
      const { data: message, error: messageError } = await supabase
        .from('messages')
        .insert({
          chat_id: chatId,
          sender_id: userId,
          content: defaultMessage,
          message_type: 'event_share',
          shared_event_id: eventId,
          metadata: {
            custom_message: customMessage,
            share_context: 'in_app_share',
            event_title: event.title,
            artist_name: event.artist_name,
            venue_name: event.venue_name,
            event_date: event.event_date
          }
        })
        .select('id, chat_id')
        .single();

      if (messageError) {
        console.error('Error creating share message:', messageError);
        return {
          success: false,
          error: 'Failed to share event'
        };
      }

      // Track the share for analytics
      await supabase
        .from('event_shares')
        .insert({
          event_id: eventId,
          sharer_user_id: userId,
          chat_id: chatId,
          message_id: message.id,
          share_type: 'direct_chat' // Will be updated based on chat type
        });

      return {
        success: true,
        message_id: message.id,
        chat_id: message.chat_id
      };
    } catch (error) {
      console.error('Error sharing event to chat:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Share an event to multiple chats at once
   */
  static async shareEventToMultipleChats(
    eventId: string,
    chatIds: string[],
    userId: string,
    customMessage?: string
  ): Promise<{
    successCount: number;
    failureCount: number;
    results: EventShareResult[];
  }> {
    const results: EventShareResult[] = [];

    for (const chatId of chatIds) {
      const result = await this.shareEventToChat(eventId, chatId, userId, customMessage);
      results.push(result);
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return {
      successCount,
      failureCount,
      results
    };
  }

  /**
   * Create a new direct chat and share event
   */
  static async shareEventToNewChat(
    eventId: string,
    friendUserId: string,
    currentUserId: string,
    customMessage?: string
  ): Promise<EventShareResult> {
    try {
      // Create or get existing direct chat
      const { data: chatId, error: chatError } = await supabase.rpc('create_direct_chat', {
        user1_id: currentUserId,
        user2_id: friendUserId
      });

      if (chatError || !chatId) {
        return {
          success: false,
          error: 'Failed to create chat'
        };
      }

      // Share the event to the chat
      return await this.shareEventToChat(eventId, chatId, currentUserId, customMessage);
    } catch (error) {
      console.error('Error sharing event to new chat:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get event share statistics for an event
   */
  static async getEventShareStats(eventId: string): Promise<{
    total_shares: number;
    direct_shares: number;
    group_shares: number;
  }> {
    try {
      const { data, error } = await supabase
        .from('event_shares')
        .select('share_type')
        .eq('event_id', eventId);

      if (error) {
        console.error('Error fetching share stats:', error);
        return { total_shares: 0, direct_shares: 0, group_shares: 0 };
      }

      const total_shares = data?.length || 0;
      const direct_shares = data?.filter(s => s.share_type === 'direct_chat').length || 0;
      const group_shares = data?.filter(s => s.share_type === 'group_chat').length || 0;

      return {
        total_shares,
        direct_shares,
        group_shares
      };
    } catch (error) {
      console.error('Error getting event share stats:', error);
      return { total_shares: 0, direct_shares: 0, group_shares: 0 };
    }
  }
}

