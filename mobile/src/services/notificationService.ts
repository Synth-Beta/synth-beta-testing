import {
    acceptFriendRequest as acceptFriendRequestShared,
    declineFriendRequest as declineFriendRequestShared,
    deleteExpiredFriendAcceptedNotifications as deleteExpiredFriendAcceptedShared,
    deleteFriendRequestNotificationsByRequestId,
    pruneStaleFriendRequestNotifications as pruneStaleFriendRequestsShared,
} from '@synth/shared';
import { supabase } from '../integrations/supabase/client';

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string | undefined | null): s is string {
    return typeof s === 'string' && UUID_RE.test(s);
}

export interface Notification {
    id: string;
    type: string;
    actor_name?: string;
    actor_avatar?: string;
    /** Populated when actor_name was missing / was a raw id */
    actor_user_id?: string | null;
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

            const base = (data || []).map((n: any) => {
                const fromRow = n.actor_user_id as string | undefined;
                const fromData = n.data?.actor_user_id as string | undefined;
                const actorUserId = fromRow || fromData || null;
                let actorName = (n.data?.actor_name as string | undefined) || undefined;
                if (actorName && isUuid(actorName)) actorName = undefined;
                return {
                    id: n.id,
                    type: n.type,
                    actor_name: actorName,
                    actor_user_id: actorUserId,
                    actor_avatar: n.data?.actor_avatar,
                    event_title: n.data?.event_title,
                    created_at: n.created_at,
                    is_read: n.is_read,
                    data: n.data,
                } as Notification;
            });

            const needNames = new Set<string>();
            for (const row of base) {
                if (!row.actor_name || row.actor_name === 'Someone') {
                    if (row.actor_user_id && isUuid(row.actor_user_id)) needNames.add(row.actor_user_id);
                }
            }

            if (needNames.size > 0) {
                const { data: users } = await supabase
                    .from('users')
                    .select('user_id, name, avatar_url')
                    .in('user_id', Array.from(needNames));
                const byId = new Map<string, { name: string | null; avatar_url: string | null }>();
                users?.forEach((u: any) => byId.set(u.user_id, { name: u.name, avatar_url: u.avatar_url }));
                return base.map(row => {
                    if (row.actor_name && row.actor_name !== 'Someone') return row;
                    const uid = row.actor_user_id;
                    if (!uid || !isUuid(uid)) return row;
                    const u = byId.get(uid);
                    if (!u?.name) return row;
                    return {
                        ...row,
                        actor_name: u.name,
                        actor_avatar: row.actor_avatar || u.avatar_url || undefined,
                    };
                });
            }

            return base;
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
