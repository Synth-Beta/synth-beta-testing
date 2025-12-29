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
    const { data, error } = await supabase.rpc('get_user_chats', {
      user_id: userId,
    });

    if (error) {
      console.error('Error fetching user chats:', error);
      return { data: null, error };
    }

    return { data: data as UserChat[], error: null };
  } catch (error) {
    console.error('Error in fetchUserChats:', error);
    return { data: null, error };
  }
}
