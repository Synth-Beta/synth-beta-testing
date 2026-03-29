import { getOrCreateDirectChat } from '@synth/shared';
import { supabase } from '../integrations/supabase/client';

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function looksLikeOpaquePreview(text: string): boolean {
    const t = text.trim();
    if (t.length > 72 && !/\s/.test(t)) return true;
    if (UUID_RE.test(t)) return true;
    return false;
}

export interface ChatThread {
    id: string;
    chat_name: string;
    latest_message?: string;
    latest_message_at?: string;
    image_url?: string;
    unread_count: number;
}

export interface Message {
    id: string;
    content: string;
    sender_id: string;
    created_at: string;
    is_mine: boolean;
}

export class ChatService {
    /**
     * Get all chat threads for user
     */
    static async getChats(userId: string): Promise<ChatThread[]> {
        try {
            // First get chat IDs where user is participant
            const { data: participants } = await supabase
                .from('chat_participants')
                .select('chat_id')
                .eq('user_id', userId);

            if (!participants || participants.length === 0) return [];

            const chatIds = participants.map((p: { chat_id: string }) => p.chat_id);

            // Get chats with latest messages
            const { data: chats, error } = await supabase
                .from('chats')
                .select(`
          id,
          chat_name,
          is_group_chat,
          updated_at,
          latest_message_id,
          messages!latest_message_id (
            content,
            created_at,
            is_encrypted
          )
        `)
                .in('id', chatIds)
                .order('updated_at', { ascending: false });

            if (error) throw error;

            const list = chats || [];
            const directIds = list.filter((c: any) => !c.is_group_chat).map((c: any) => c.id);
            const chatToOtherUserId = new Map<string, string>();
            const userIdToName = new Map<string, string>();

            if (directIds.length > 0) {
                const { data: parts } = await supabase
                    .from('chat_participants')
                    .select('chat_id, user_id')
                    .in('chat_id', directIds)
                    .neq('user_id', userId);

                const otherIds = new Set<string>();
                parts?.forEach((p: { chat_id: string; user_id: string }) => {
                    chatToOtherUserId.set(p.chat_id, p.user_id);
                    otherIds.add(p.user_id);
                });

                if (otherIds.size > 0) {
                    const { data: users } = await supabase
                        .from('users')
                        .select('user_id, name')
                        .in('user_id', Array.from(otherIds));
                    users?.forEach((u: { user_id: string; name: string | null }) => {
                        if (u.name) userIdToName.set(u.user_id, u.name);
                    });
                }
            }

            return list.map((chat: any) => {
                const isGroup = !!chat.is_group_chat;
                let title = chat.chat_name || 'Chat';
                if (!isGroup) {
                    const otherUid = chatToOtherUserId.get(chat.id);
                    const peerName = otherUid ? userIdToName.get(otherUid) : undefined;
                    if (peerName) {
                        title = peerName;
                    } else if (UUID_RE.test(String(title))) {
                        title = 'Direct Chat';
                    }
                } else if (!title) {
                    title = 'Group Chat';
                }

                let preview = chat.messages?.content as string | undefined;
                if (chat.messages?.is_encrypted || (preview && looksLikeOpaquePreview(preview))) {
                    preview = 'Message';
                }
                if (!preview) preview = 'No messages yet';

                return {
                    id: chat.id,
                    chat_name: title,
                    latest_message: preview,
                    latest_message_at: chat.messages?.created_at || chat.updated_at,
                    unread_count: 0,
                };
            });
        } catch (error) {
            console.error('Error fetching chats:', error);
            return [];
        }
    }

    /**
     * Get messages for a specific chat
     */
    static async getMessages(chatId: string, userId: string): Promise<Message[]> {
        try {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('chat_id', chatId)
                .order('created_at', { ascending: true })
                .limit(50);

            if (error) throw error;

            return (data || []).map((msg: any) => ({
                id: msg.id,
                content: msg.content,
                sender_id: msg.sender_id,
                created_at: msg.created_at,
                is_mine: msg.sender_id === userId,
            }));
        } catch (error) {
            console.error('Error fetching messages:', error);
            return [];
        }
    }

    /**
     * Send a message
     */
    static async sendMessage(chatId: string, userId: string, content: string): Promise<boolean> {
        try {
            const { error } = await supabase
                .from('messages')
                .insert({
                    chat_id: chatId,
                    sender_id: userId,
                    content: content,
                    is_encrypted: false, // Simplified for now
                });

            if (!error) {
                // Update chat latest message
                await supabase
                    .from('chats')
                    .update({ updated_at: new Date().toISOString() })
                    .eq('id', chatId);
            }

            return !error;
        } catch (error) {
            console.error('Error sending message:', error);
            return false;
        }
    }

    /** Existing 1:1 chat between two users, if any (non-group). */
    static async findDirectChatId(userId: string, peerUserId: string): Promise<string | null> {
        try {
            const { data: mine } = await supabase.from('chat_participants').select('chat_id').eq('user_id', userId);
            const ids = (mine || []).map((m: { chat_id: string }) => m.chat_id);
            if (ids.length === 0) return null;
            const { data: overlap } = await supabase
                .from('chat_participants')
                .select('chat_id')
                .eq('user_id', peerUserId)
                .in('chat_id', ids)
                .limit(5);
            if (!overlap?.length) return null;
            for (const row of overlap) {
                const { data: chat } = await supabase
                    .from('chats')
                    .select('id, is_group_chat')
                    .eq('id', row.chat_id)
                    .maybeSingle();
                if (chat && !(chat as { is_group_chat?: boolean }).is_group_chat) {
                    return row.chat_id;
                }
            }
            return null;
        } catch {
            return null;
        }
    }

    /** Open or create 1:1 chat (friends-only enforcement is server-side in RPC). */
    static async ensureDirectChat(userId: string, peerUserId: string): Promise<string | null> {
        const existing = await this.findDirectChatId(userId, peerUserId);
        if (existing) return existing;
        const { chatId, error } = await getOrCreateDirectChat(supabase, userId, peerUserId);
        if (error || !chatId) {
            console.warn('[ChatService] ensureDirectChat:', error);
            return null;
        }
        return chatId;
    }

    /** Remove current user from a chat (same as trash / leave in mobile list UI). */
    static async leaveChat(chatId: string, userId: string): Promise<boolean> {
        try {
            const { error } = await supabase.from('chat_participants').delete().eq('chat_id', chatId).eq('user_id', userId);
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error leaving chat:', error);
            return false;
        }
    }
}
