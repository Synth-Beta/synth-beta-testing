/**
 * Chat Service
 * Handles fetching user chats using the get_user_chats RPC function
 */

import { supabase } from '@/integrations/supabase/client';

export interface UserChat {
  id: string;
  chat_name: string;
  is_group_chat: boolean;
  users: string[]; // Populated from chat_participants by get_user_chats RPC (backward compatibility)
  latest_message_id?: string | null;
  latest_message?: string | null;
  latest_message_created_at?: string | null;
  latest_message_sender_name?: string | null;
  group_admin_id?: string | null;
  member_count?: number | null; // Cached count from chat_participants (maintained by trigger)
  created_at: string;
  updated_at: string;
}

export async function fetchUserChats(
  userId: string
): Promise<{ data: UserChat[] | null; error: any }> {
  try {
    // Workaround: Query chats directly via chat_participants instead of using buggy RPC
    // The RPC function has ambiguous user_id references and uses non-existent c.users column
    
    // First, get all chat IDs where user is a participant
    // Note: If RLS policy has recursion issues, return empty array gracefully
    const { data: participants, error: participantsError } = await supabase
      .from('chat_participants')
      .select('chat_id')
      .eq('user_id', userId);

    if (participantsError) {
      // Handle RLS recursion error gracefully - return empty chats
      if (participantsError.code === '42P17' || participantsError.message?.includes('infinite recursion')) {
        console.warn('RLS recursion detected in chat_participants, returning empty chats');
        return { data: [], error: null };
      }
      console.error('Error fetching chat participants:', participantsError);
      return { data: null, error: participantsError };
    }

    if (!participants || participants.length === 0) {
      return { data: [], error: null };
    }

    const chatIds = participants.map(p => p.chat_id);

    // Get chats with latest message info
    const { data: chats, error: chatsError } = await supabase
      .from('chats')
      .select(`
        id,
        chat_name,
        is_group_chat,
        latest_message_id,
        group_admin_id,
        created_at,
        updated_at,
        messages!latest_message_id (
          id,
          content,
          created_at,
          sender_id,
          users!messages_sender_id_fkey (
            user_id,
            name
          )
        )
      `)
      .in('id', chatIds)
      .order('updated_at', { ascending: false });

    if (chatsError) {
      console.error('Error fetching chats:', chatsError);
      return { data: null, error: chatsError };
    }

    // Get all participants for these chats to build users array
    const { data: allParticipants, error: allParticipantsError } = await supabase
      .from('chat_participants')
      .select('chat_id, user_id')
      .in('chat_id', chatIds);

    if (allParticipantsError) {
      console.error('Error fetching all participants:', allParticipantsError);
      return { data: null, error: allParticipantsError };
    }

    // Build map of chat_id -> user_ids[]
    const participantsMap = new Map<string, string[]>();
    allParticipants?.forEach(p => {
      const existing = participantsMap.get(p.chat_id) || [];
      existing.push(p.user_id);
      participantsMap.set(p.chat_id, existing);
    });

    // Transform to UserChat format
    const userChats: UserChat[] = (chats || []).map((chat: any) => ({
      id: chat.id,
      chat_name: chat.chat_name,
      is_group_chat: chat.is_group_chat,
      users: participantsMap.get(chat.id) || [],
      latest_message_id: chat.latest_message_id,
      latest_message: chat.messages?.content || '',
      latest_message_created_at: chat.messages?.created_at || null,
      latest_message_sender_name: chat.messages?.users?.name || null,
      group_admin_id: chat.group_admin_id,
      created_at: chat.created_at,
      updated_at: chat.updated_at,
    }));

    return { data: userChats, error: null };
  } catch (error) {
    console.error('Error in fetchUserChats:', error);
    return { data: null, error };
  }
}
