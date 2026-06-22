/**
 * In-App Event Sharing Service
 * Handles sharing events directly to friends and groups within PlusOne
 */

import { supabase } from '@/integrations/supabase/client';
import type { JamBaseEvent } from '@/types/eventTypes';
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

export interface ReviewShareResult {
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

      // Transform to ShareTarget format.
      // IMPORTANT: We intentionally exclude direct chats here.
      // Direct chats are handled via the "friends" picker (which can create/resolve DMs),
      // and direct chats often have a placeholder chat_name like "Direct Chat".
      const targets: ShareTarget[] = (chats || [])
        .filter((chat: any) => Boolean(chat?.is_group_chat))
        .map((chat: any) => {
          const rawName = typeof chat.chat_name === 'string' ? chat.chat_name.trim() : '';
          const name = rawName || 'Group Chat';

          return {
            id: chat.id,
            name,
            type: 'group',
            users: chat.users || [], // Populated by chatService from chat_participants
            avatar_url: null // Can be enhanced to show group/event avatars
          };
        });

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
      // Query friends from the user_relationships table (3NF compliant)
      const { data: friendships, error: friendsError } = await supabase
        .from('user_relationships')
        .select('id, user_id, related_user_id, created_at')
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted')
        .or(`user_id.eq.${userId},related_user_id.eq.${userId}`)
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
        f.user_id === userId ? f.related_user_id : f.user_id
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
   * Share an event to a specific chat.
   * Inserts the message in ONE write with message_type and metadata set so the event card always displays (no update step to fail or race).
   */
  static async shareEventToChat(
    eventId: string,
    chatId: string,
    userId: string,
    customMessage?: string
  ): Promise<EventShareResult> {
    try {
      const defaultMessage = customMessage || `Check out this event!`;
      const metadata = {
        custom_message: customMessage,
        share_context: 'in_app_share',
        event_id: eventId
      };

      const { encryptMessage } = await import('./chatEncryptionService');
      const encryptedContent = await encryptMessage(defaultMessage, chatId, userId);

      // Single insert with message_type and metadata so the event card can render immediately (no follow-up update)
      const insertPayload = {
        chat_id: chatId,
        sender_id: userId,
        content: encryptedContent,
        is_encrypted: true,
        message_type: 'event_share' as const,
        shared_event_id: null,
        metadata
      };
      
      const { data: inserted, error: insertError } = await supabase
        .from('messages')
        .insert(insertPayload)
        .select('id, chat_id')
        .single();

      if (insertError || !inserted?.id) {
        console.error('Error inserting event share message:', insertError);
        return {
          success: false,
          error: insertError?.message || 'Failed to create message'
        };
      }

      try {
        await supabase.from('event_shares').insert({
          event_id: eventId,
          sharer_user_id: userId,
          chat_id: chatId,
          message_id: inserted.id,
          share_type: 'direct_chat'
        });
      } catch (analyticsError) {
        console.warn('Failed to track event share (non-critical):', analyticsError);
      }

      return {
        success: true,
        message_id: inserted.id,
        chat_id: chatId
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

  /**
   * Share a review to a specific chat
   */
  static async shareReviewToChat(
    reviewId: string,
    chatId: string,
    userId: string,
    customMessage?: string
  ): Promise<ReviewShareResult> {
    try {
      // Verify the review exists and get its details
      const { data: review, error: reviewError } = await supabase
        .from('reviews')
        .select('id, review_text, rating, event_id, user_id')
        .eq('id', reviewId)
        .single();

      if (reviewError || !review) {
        return {
          success: false,
          error: 'Review not found'
        };
      }

      // Don't query event details - just use a generic message
      // The event data will be available via the review's event_id FK join when displaying
      // This avoids column name issues and database query errors
      const defaultMessage = customMessage || `Check out this review!`;

      // Insert the message with review share data
      // 3NF COMPLIANT: Only store message-specific metadata, not duplicated review/event data
      // Review and event data should be retrieved via shared_review_id FK join
      const { data: message, error: messageError } = await supabase
        .from('messages')
        .insert({
          chat_id: chatId,
          sender_id: userId,
          content: defaultMessage,
          message_type: 'review_share',
          shared_review_id: reviewId,
          metadata: {
            custom_message: customMessage,
            share_context: 'in_app_share'
            // DO NOT store: review_text, rating, artist_name, venue_name, event_title
            // These are available via shared_review_id FK join with reviews/events tables
          }
        })
        .select('id, chat_id')
        .single();

      if (messageError) {
        console.error('Error creating review share message:', messageError);
        
        // If it's a foreign key constraint error, try without the FK (store in metadata instead)
        if (messageError.code === '23503' || messageError.message?.includes('foreign key') || messageError.code === '42703') {
          console.warn('FK constraint or column error, retrying without shared_review_id FK');
          const { data: retryMessage, error: retryError } = await supabase
            .from('messages')
            .insert({
              chat_id: chatId,
              sender_id: userId,
              content: defaultMessage,
              message_type: 'review_share',
              shared_review_id: null, // Set to null to bypass FK constraint
              metadata: {
                custom_message: customMessage,
                share_context: 'in_app_share',
                review_id: reviewId // Store in metadata as fallback
              }
            })
            .select('id, chat_id')
            .single();
            
          if (retryError) {
            return {
              success: false,
              error: 'Failed to share review: ' + (retryError.message || 'Unknown error')
            };
          }
          
          return {
            success: true,
            message_id: retryMessage.id,
            chat_id: retryMessage.chat_id
          };
        }
        
        return {
          success: false,
          error: 'Failed to share review: ' + (messageError.message || 'Unknown error')
        };
      }

      // Share is tracked in messages table (3NF compliant - no redundant data)
      // Analytics can be queried directly from messages table where message_type = 'review_share'

      return {
        success: true,
        message_id: message.id,
        chat_id: message.chat_id
      };
    } catch (error) {
      console.error('Error sharing review to chat:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Share a review to multiple chats at once
   */
  static async shareReviewToMultipleChats(
    reviewId: string,
    chatIds: string[],
    userId: string,
    customMessage?: string
  ): Promise<{
    successCount: number;
    failureCount: number;
    results: ReviewShareResult[];
  }> {
    const results: ReviewShareResult[] = [];

    for (const chatId of chatIds) {
      const result = await this.shareReviewToChat(reviewId, chatId, userId, customMessage);
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
   * Create a new direct chat and share review
   */
  static async shareReviewToNewChat(
    reviewId: string,
    friendUserId: string,
    currentUserId: string,
    customMessage?: string
  ): Promise<ReviewShareResult> {
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

      // Share the review to the chat
      return await this.shareReviewToChat(reviewId, chatId, currentUserId, customMessage);
    } catch (error) {
      console.error('Error sharing review to new chat:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

