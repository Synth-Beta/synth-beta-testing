/**
 * Chat Service
 * Handles fetching user chats using the get_user_chats RPC function
 */

import { supabase } from '@/integrations/supabase/client';
import { encryptMessage, decryptMessage, isEncrypted } from './chatEncryptionService';

/** When true, artist and venue associated group chats are excluded from chat list (join-on-follow still works). Flip to false when ready to show them. */
const HIDE_ENTITY_GROUP_CHATS = false;

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
  entity_type?: 'event' | 'artist' | 'venue' | null;
  entity_uuid?: string | null;
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
      if (participantsError.code === '42P17' || participantsError.message?.includes('infinite recursion')) {
        console.error('RLS recursion in chat_participants – migration 20260120120201 (is_user_chat_participant SECURITY DEFINER) should prevent this.', participantsError);
      } else {
        console.error('Error fetching chat participants:', participantsError);
      }
      return { data: null, error: participantsError };
    }

    if (!participants || participants.length === 0) {
      return { data: [], error: null };
    }

    const chatIds = participants.map(p => p.chat_id);

    // Get chats with latest message info (entity_type/entity_uuid for filtering verified/artist chats)
    const { data: chats, error: chatsError } = await supabase
      .from('chats')
      .select(`
        id,
        chat_name,
        is_group_chat,
        entity_type,
        entity_uuid,
        latest_message_id,
        group_admin_id,
        created_at,
        updated_at,
        messages!latest_message_id (
          id,
          content,
          is_encrypted,
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

    // Transform to UserChat format and decrypt latest messages
    const userChats = await Promise.all((chats || []).map(async (chat: any) => {
      let latestMessageContent = chat.messages?.content || '';
      
      // Decrypt latest message if encrypted
      if (chat.messages?.is_encrypted && latestMessageContent) {
        try {
          latestMessageContent = await decryptChatMessage(
            {
              content: latestMessageContent,
              chat_id: chat.id,
              is_encrypted: chat.messages.is_encrypted
            },
            userId
          );
        } catch (error) {
          console.warn('Failed to decrypt latest message for chat:', chat.id, error);
          latestMessageContent = '[Encrypted message]';
        }
      }
      
      return {
        id: chat.id,
        chat_name: chat.chat_name,
        is_group_chat: chat.is_group_chat,
        users: participantsMap.get(chat.id) || [],
        latest_message_id: chat.latest_message_id,
        latest_message: latestMessageContent,
        latest_message_created_at: chat.messages?.created_at || null,
        latest_message_sender_name: chat.messages?.users?.name || null,
        group_admin_id: chat.group_admin_id,
        entity_type: chat.entity_type ?? null,
        entity_uuid: chat.entity_uuid ?? null,
        created_at: chat.created_at,
        updated_at: chat.updated_at,
      };
    }));

    // Hide artist and venue group chats from list until feature is deployed (users are still joined on follow)
    const filtered = HIDE_ENTITY_GROUP_CHATS
      ? userChats.filter((c) => !(c.is_group_chat && (c.entity_type === 'artist' || c.entity_type === 'venue')))
      : userChats;

    return { data: filtered, error: null };
  } catch (error) {
    console.error('Error in fetchUserChats:', error);
    return { data: null, error };
  }
}

/**
 * Send an encrypted message to a chat
 * Encrypts the message content before storing it in the database
 * 
 * @param chatId - Chat ID
 * @param senderId - Sender user ID
 * @param content - Plain text message content to encrypt and send
 * @returns Promise with inserted message data or error
 */
export async function sendEncryptedMessage(
  chatId: string,
  senderId: string,
  content: string
): Promise<{ data: any; error: any }> {
  // Validate inputs
  if (!content || typeof content !== 'string') {
    return { data: null, error: new Error('Message content must be a non-empty string') };
  }
  if (!chatId || typeof chatId !== 'string') {
    return { data: null, error: new Error('ChatId must be a non-empty string') };
  }
  if (!senderId || typeof senderId !== 'string') {
    return { data: null, error: new Error('SenderId must be a non-empty string') };
  }
  
  try {
    // Encrypt the message content before sending
    const encryptedContent = await encryptMessage(content, chatId, senderId);
    
    // Verify encryption worked (encrypted content should be different and longer)
    if (encryptedContent === content || encryptedContent.length <= content.length) {
      console.warn('⚠️ Encryption may have failed - encrypted content matches original');
    }
    
    // Send encrypted message to database
    const { data, error } = await supabase
      .from('messages')
      .insert({
        chat_id: chatId,
        sender_id: senderId,
        content: encryptedContent,
        is_encrypted: true
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error sending encrypted message:', error);
      return { data: null, error };
    }
    
    // Verify the message was saved with encryption flag
    if (data && !data.is_encrypted) {
      console.warn('⚠️ Message saved but is_encrypted flag is false');
    }
    
    return { data, error: null };
  } catch (error) {
    console.error('Error encrypting/sending message:', error);
    return { data: null, error };
  }
}

/**
 * Decrypt a chat message if it's encrypted
 * Returns the message content decrypted, or original content if not encrypted
 * 
 * @param message - Message object with content and chat_id
 * @param userId - Current user ID for decryption
 * @returns Decrypted message content or error message
 */
export async function decryptChatMessage(
  message: { content: string; chat_id: string; is_encrypted?: boolean },
  userId: string
): Promise<string> {
  // Validate inputs
  if (!message || !message.content) {
    return '[Empty message]';
  }
  if (!message.chat_id || typeof message.chat_id !== 'string') {
    console.warn('Invalid chat_id in decryptChatMessage');
    return message.content; // Return as-is if chat_id is invalid
  }
  if (!userId || typeof userId !== 'string') {
    console.warn('Invalid userId in decryptChatMessage');
    return '[Unable to decrypt message]';
  }
  
  try {
    // Check if message is encrypted (use flag if available, otherwise check content)
    const encrypted = message.is_encrypted ?? isEncrypted(message.content);
    
    if (encrypted) {
      const decrypted = await decryptMessage(message.content, message.chat_id, userId);
      // Verify decryption worked (decrypted should not be empty for valid encrypted messages)
      if (!decrypted) {
        console.warn('⚠️ Decryption returned empty string');
        return '[Unable to decrypt message]';
      }
      return decrypted;
    }
    
    // Return as-is if not encrypted (backward compatibility)
    return message.content;
  } catch (error) {
    // decryptMessage throws on failure, catch and return error message
    console.error('Error decrypting message:', error);
    return '[Unable to decrypt message]';
  }
}

/**
 * Check if a message is encrypted
 * 
 * @param message - Message object with is_encrypted flag or content
 * @returns true if message is encrypted, false otherwise
 */
export function isMessageEncrypted(message: { is_encrypted?: boolean; content?: string }): boolean {
  if (message.is_encrypted !== undefined) {
    return message.is_encrypted;
  }
  
  if (message.content) {
    return isEncrypted(message.content);
  }
  
  return false;
}

export const CHAT_SENDER_NAME_FALLBACK = 'Unknown';

export type ChatSenderProfile = {
  user_id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  account_type: string | null;
};

/** Single normalization path for chat sender/participant profile rows. */
export function normalizeChatSenderProfile(row: {
  user_id: string;
  name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  account_type?: string | null;
}): ChatSenderProfile {
  const trimmedName = row.name?.trim() ?? '';
  const trimmedUsername = row.username?.trim() ?? '';
  return {
    user_id: row.user_id,
    name: trimmedName || trimmedUsername || CHAT_SENDER_NAME_FALLBACK,
    avatar_url: row.avatar_url ?? null,
    bio: row.bio ?? null,
    account_type: row.account_type ?? null,
  };
}

/** Resolve display name from profile row and optional message metadata (bot seed fallback). */
export function resolveSenderDisplayName(
  profile: { name?: string | null; username?: string | null } | undefined,
  metadata?: Record<string, unknown> | null
): string {
  const fromMeta =
    typeof metadata?.sender_display_name === 'string' ? metadata.sender_display_name.trim() : '';
  if (fromMeta) return fromMeta;

  const name = typeof profile?.name === 'string' ? profile.name.trim() : '';
  if (name) return name;

  const username = typeof profile?.username === 'string' ? profile.username.trim() : '';
  if (username) return username.startsWith('@') ? username : `@${username}`;

  return 'Unknown';
}

/**
 * Fetch sender profiles for a chat (includes bot co-participants after RLS fix).
 * Uses get_chat_sender_profiles RPC when available; falls back to direct users SELECT.
 */
export async function fetchChatSenderProfiles(
  chatId: string,
  senderIds: string[]
): Promise<Map<string, ChatSenderProfile>> {
  const map = new Map<string, ChatSenderProfile>();
  const unique = [...new Set(senderIds.filter(Boolean))];
  if (!unique.length || !chatId) return map;

  const { data: rpcData, error: rpcError } = await supabase.rpc('get_chat_sender_profiles', {
    p_chat_id: chatId,
    p_sender_ids: unique,
  });

  if (!rpcError && rpcData?.length) {
    for (const row of rpcData as Array<{
      user_id: string;
      name: string | null;
      username: string | null;
      avatar_url: string | null;
      bio?: string | null;
      account_type?: string | null;
    }>) {
      map.set(row.user_id, normalizeChatSenderProfile(row));
    }
    if (map.size >= unique.length) return map;
  }

  const missing = unique.filter((id) => !map.has(id));
  if (missing.length === 0) return map;

  const { data: direct } = await supabase
    .from('users')
    .select('user_id, name, username, avatar_url, bio, account_type')
    .in('user_id', missing);

  for (const u of direct || []) {
    map.set(u.user_id, normalizeChatSenderProfile(u));
  }

  return map;
}
