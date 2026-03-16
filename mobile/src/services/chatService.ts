import { supabase } from '../integrations/supabase/client';

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
          updated_at,
          latest_message_id,
          messages!latest_message_id (
            content,
            created_at
          )
        `)
                .in('id', chatIds)
                .order('updated_at', { ascending: false });

            if (error) throw error;

            return (chats || []).map((chat: any) => ({
                id: chat.id,
                chat_name: chat.chat_name || 'Group Chat',
                latest_message: chat.messages?.content || 'No messages yet',
                latest_message_at: chat.messages?.created_at || chat.updated_at,
                unread_count: 0, // Simplified
            }));
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
}
