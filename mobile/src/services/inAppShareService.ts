/**
 * In-App Share Service (mobile) — mirrors web src/services/inAppShareService.ts
 * Sends events and reviews as chat messages with proper message_type, shared_event_id,
 * shared_review_id, and metadata so the chat thread renders the rich preview cards.
 */

import { supabase } from '../integrations/supabase/client';
import { encryptMessage } from './chatEncryptionService';
import { getOrCreateDirectChat } from '@synth/shared';

export interface ShareTarget {
    id: string; // chat_id for groups, 'friend-<user_id>' for friends
    name: string;
    type: 'group' | 'friend';
    avatar_url?: string | null;
    user_id?: string; // only set for friend targets
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
     * Returns the user's existing group chats as share targets.
     * Direct chats are excluded — friends are handled via the friends picker.
     */
    static async getGroupChatTargets(userId: string): Promise<ShareTarget[]> {
        try {
            const { data: participantRows } = await supabase
                .from('chat_participants')
                .select('chat_id')
                .eq('user_id', userId);

            if (!participantRows?.length) return [];

            const chatIds = participantRows.map((p: { chat_id: string }) => p.chat_id);

            const { data: chats } = await supabase
                .from('chats')
                .select('id, chat_name, is_group_chat')
                .in('id', chatIds)
                .eq('is_group_chat', true)
                .order('updated_at', { ascending: false });

            return (chats || []).map((c: any) => ({
                id: c.id,
                name: (typeof c.chat_name === 'string' && c.chat_name.trim()) || 'Group Chat',
                type: 'group' as const,
                avatar_url: null,
            }));
        } catch (err) {
            console.error('[InAppShare] getGroupChatTargets', err);
            return [];
        }
    }

    /**
     * Returns accepted friends as share targets.
     */
    static async getFriendTargets(userId: string): Promise<ShareTarget[]> {
        try {
            const { data: friendships } = await supabase
                .from('user_relationships')
                .select('user_id, related_user_id')
                .eq('relationship_type', 'friend')
                .eq('status', 'accepted')
                .or(`user_id.eq.${userId},related_user_id.eq.${userId}`);

            if (!friendships?.length) return [];

            const friendUserIds = friendships.map((f: any) =>
                f.user_id === userId ? f.related_user_id : f.user_id
            );

            const { data: profiles } = await supabase
                .from('users')
                .select('user_id, name, avatar_url')
                .in('user_id', friendUserIds);

            return (profiles || []).map((p: any) => ({
                id: `friend-${p.user_id}`,
                name: p.name || 'Friend',
                type: 'friend' as const,
                avatar_url: p.avatar_url || null,
                user_id: p.user_id,
            }));
        } catch (err) {
            console.error('[InAppShare] getFriendTargets', err);
            return [];
        }
    }

    /**
     * Share an event to an existing chat by chat_id.
     * Encrypts the optional custom message and inserts with message_type='event_share'.
     */
    static async shareEventToChat(
        eventId: string,
        chatId: string,
        userId: string,
        customMessage?: string
    ): Promise<EventShareResult> {
        try {
            const text = customMessage?.trim() || 'Check out this event!';
            let content = text;
            let isEncrypted = false;
            try {
                content = await encryptMessage(text, chatId, userId);
                isEncrypted = true;
            } catch {
                // crypto not available in current binary — send plain
            }

            const { data: inserted, error } = await supabase
                .from('messages')
                .insert({
                    chat_id: chatId,
                    sender_id: userId,
                    content,
                    is_encrypted: isEncrypted,
                    message_type: 'event_share',
                    shared_event_id: null, // web uses metadata.event_id as primary source
                    metadata: {
                        custom_message: customMessage?.trim() || undefined,
                        share_context: 'in_app_share',
                        event_id: eventId,
                    },
                })
                .select('id, chat_id')
                .single();

            if (error || !inserted) {
                return { success: false, error: error?.message || 'Insert failed' };
            }

            // Best-effort analytics row (non-critical)
            supabase.from('event_shares').insert({
                event_id: eventId,
                sharer_user_id: userId,
                chat_id: chatId,
                message_id: inserted.id,
                share_type: 'direct_chat',
            }).then(() => {}).catch(() => {});

            // Bump chat updated_at so it sorts to top of list
            supabase.from('chats').update({ updated_at: new Date().toISOString() })
                .eq('id', chatId).then(() => {}).catch(() => {});

            return { success: true, message_id: inserted.id, chat_id: chatId };
        } catch (err) {
            console.error('[InAppShare] shareEventToChat', err);
            return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
        }
    }

    /**
     * Share an event to a friend (creates DM if needed).
     */
    static async shareEventToFriend(
        eventId: string,
        friendUserId: string,
        currentUserId: string,
        customMessage?: string
    ): Promise<EventShareResult> {
        try {
            const { chatId, error } = await getOrCreateDirectChat(supabase, currentUserId, friendUserId);
            if (error || !chatId) return { success: false, error: 'Could not open DM' };
            return this.shareEventToChat(eventId, chatId, currentUserId, customMessage);
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
        }
    }

    /**
     * Share a review to an existing chat by chat_id.
     * Inserts with message_type='review_share' and shared_review_id.
     */
    static async shareReviewToChat(
        reviewId: string,
        chatId: string,
        userId: string,
        customMessage?: string
    ): Promise<ReviewShareResult> {
        try {
            const text = customMessage?.trim() || 'Check out this review!';

            const { data: inserted, error } = await supabase
                .from('messages')
                .insert({
                    chat_id: chatId,
                    sender_id: userId,
                    content: text,
                    is_encrypted: false,
                    message_type: 'review_share',
                    shared_review_id: reviewId,
                    metadata: {
                        custom_message: customMessage?.trim() || undefined,
                        share_context: 'in_app_share',
                        review_id: reviewId, // fallback if FK fails
                    },
                })
                .select('id, chat_id')
                .single();

            if (error) {
                // FK constraint failure — retry without shared_review_id FK
                if (error.code === '23503' || error.code === '42703' || error.message?.includes('foreign key')) {
                    const { data: retry, error: retryErr } = await supabase
                        .from('messages')
                        .insert({
                            chat_id: chatId,
                            sender_id: userId,
                            content: text,
                            is_encrypted: false,
                            message_type: 'review_share',
                            shared_review_id: null,
                            metadata: {
                                custom_message: customMessage?.trim() || undefined,
                                share_context: 'in_app_share',
                                review_id: reviewId,
                            },
                        })
                        .select('id, chat_id')
                        .single();
                    if (retryErr || !retry) {
                        return { success: false, error: retryErr?.message || 'Retry failed' };
                    }
                    supabase.from('chats').update({ updated_at: new Date().toISOString() })
                        .eq('id', chatId).then(() => {}).catch(() => {});
                    return { success: true, message_id: retry.id, chat_id: chatId };
                }
                return { success: false, error: error.message };
            }

            if (!inserted) return { success: false, error: 'No data returned' };

            supabase.from('chats').update({ updated_at: new Date().toISOString() })
                .eq('id', chatId).then(() => {}).catch(() => {});

            return { success: true, message_id: inserted.id, chat_id: chatId };
        } catch (err) {
            console.error('[InAppShare] shareReviewToChat', err);
            return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
        }
    }

    /**
     * Share a review to a friend (creates DM if needed).
     */
    static async shareReviewToFriend(
        reviewId: string,
        friendUserId: string,
        currentUserId: string,
        customMessage?: string
    ): Promise<ReviewShareResult> {
        try {
            const { chatId, error } = await getOrCreateDirectChat(supabase, currentUserId, friendUserId);
            if (error || !chatId) return { success: false, error: 'Could not open DM' };
            return this.shareReviewToChat(reviewId, chatId, currentUserId, customMessage);
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
        }
    }
}
