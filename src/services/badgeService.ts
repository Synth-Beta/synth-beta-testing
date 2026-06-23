/**
 * Badge Service
 * Manages iOS app icon badge count (red indicator) based on unread notifications and chat messages.
 * When all notifications and chat messages are read, the badge is cleared (set to 0).
 */

import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { NotificationService } from './notificationService';

export class BadgeService {
  /**
   * Calculate total unread count (notifications excluding chat + chat messages)
   * and update iOS badge accordingly.
   * 
   * Chat notifications (type: 'message', 'group_chat_invite') are excluded from notification count
   * because they use the chat icon indicator. Chat messages are counted separately.
   */
  static async updateBadgeCount(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      // Web - no badge support
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        await this.setBadge(0);
        return;
      }

      // Get unread notifications (excludes chat notifications - those use chat icon)
      const unreadNotifications = await NotificationService.getUnreadCount();

      // Get unread chat messages count
      const unreadChatMessages = await this.getUnreadChatCount(user.id);

      // Total badge count = notifications + chat messages
      const totalBadge = unreadNotifications + unreadChatMessages;

      await this.setBadge(totalBadge);
    } catch (error) {
      console.error('Error updating badge count:', error);
    }
  }

  /**
   * Get total unread chat messages count across all chats
   */
  private static async getUnreadChatCount(userId: string): Promise<number> {
    try {
      // Try RPC function first
      const { data, error } = await supabase.rpc('get_unread_message_count', {
        user_id: userId
      });

      if (!error && typeof data === 'number') {
        return data;
      }

      // Fallback: query unread messages directly
      const { data: participantData } = await supabase
        .from('chat_participants')
        .select('chat_id, last_read_at')
        .eq('user_id', userId);

      if (!participantData || participantData.length === 0) {
        return 0;
      }

      let totalUnread = 0;
      for (const participant of participantData) {
        const lastRead = participant.last_read_at || '1970-01-01';
        const { count, error: countError } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('chat_id', participant.chat_id)
          .neq('sender_id', userId)
          .gt('created_at', lastRead);

        if (!countError && typeof count === 'number') {
          totalUnread += count;
        }
      }

      return totalUnread;
    } catch (error) {
      console.error('Error getting unread chat count:', error);
      return 0;
    }
  }

  /**
   * Set iOS app badge count via WKWebView message handler bridge
   */
  private static async setBadge(count: number): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      // Call the native bridge function exposed by AppDelegate.swift
      // The JavaScript function window.setBadgeCount is injected by AppDelegate
      if (typeof (window as any).setBadgeCount === 'function') {
        (window as any).setBadgeCount(count);
      } else {
        // Fallback: try direct webkit message handler if function not available yet
        if ((window as any).webkit?.messageHandlers?.setBadgeCount) {
          (window as any).webkit.messageHandlers.setBadgeCount.postMessage({ count });
        } else {
          console.warn('Badge bridge not available - badge count should be:', count);
        }
      }
    } catch (error) {
      console.error('Failed to set badge count:', error);
    }
  }

  /**
   * Clear badge (set to 0) - called when all notifications and chats are read
   */
  static async clearBadge(): Promise<void> {
    await this.setBadge(0);
  }
}
