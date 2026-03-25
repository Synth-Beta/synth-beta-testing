import {
    acceptFriendRequest as acceptFriendRequestShared,
    declineFriendRequest as declineFriendRequestShared,
    deleteExpiredFriendAcceptedNotifications as deleteExpiredFriendAcceptedShared,
    deleteFriendRequestNotificationsByRequestId,
    pruneStaleFriendRequestNotifications as pruneStaleFriendRequestsShared,
} from '@synth/shared';
import { supabase } from '../integrations/supabase/client';

export interface Notification {
    id: string;
    type: string;
    actor_name?: string;
    actor_avatar?: string;
    event_title?: string;
    created_at: string;
    is_read: boolean;
    data: any;
}

export class NotificationService {
    static async deleteExpiredFriendAcceptedNotifications(userId: string): Promise<void> {
        await deleteExpiredFriendAcceptedShared(supabase, userId);
    }

    static async getUnreadCount(userId: string): Promise<number> {
        try {
            const { count, error } = await supabase
                .from('notifications')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('is_read', false);
            if (error) throw error;
            return count || 0;
        } catch (error) {
            console.error('Error fetching unread notification count:', error);
            return 0;
        }
    }

    static async getNotifications(userId: string): Promise<Notification[]> {
        try {
            await NotificationService.deleteExpiredFriendAcceptedNotifications(userId);

            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;

            return (data || []).map((n: any) => ({
                id: n.id,
                type: n.type,
                actor_name: n.data?.actor_name || n.actor_user_id, // Fallback
                actor_avatar: n.data?.actor_avatar,
                event_title: n.data?.event_title,
                created_at: n.created_at,
                is_read: n.is_read,
                data: n.data,
            }));
        } catch (error) {
            console.error('Error fetching notifications:', error);
            return [];
        }
    }

    static async markAsRead(notificationId: string): Promise<boolean> {
        try {
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('id', notificationId);
            return !error;
        } catch (error) {
            console.error('Error marking notification as read:', error);
            return false;
        }
    }

    static async deleteFriendRequestNotification(userId: string, requestId: string): Promise<void> {
        const { ok, error } = await deleteFriendRequestNotificationsByRequestId(
            supabase,
            userId,
            requestId
        );
        if (!ok && error) {
            console.error('deleteFriendRequestNotification:', error);
        }
    }

    static async acceptFriendRequest(requestId: string): Promise<{ ok: boolean; error?: string }> {
        return acceptFriendRequestShared(supabase, requestId);
    }

    static async declineFriendRequest(requestId: string): Promise<{ ok: boolean; error?: string }> {
        return declineFriendRequestShared(supabase, requestId);
    }

    static async pruneStaleFriendRequestNotifications(
        userId: string,
        notifications: Notification[]
    ): Promise<Notification[]> {
        return pruneStaleFriendRequestsShared(supabase, userId, notifications);
    }
}
