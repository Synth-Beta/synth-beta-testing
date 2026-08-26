/**
 * Web binding for the shared chat data layer.
 *
 * All query and transform logic lives in `@synth/shared` (`chatCore.ts`) so web and
 * mobile cannot drift apart. This file supplies the browser's Supabase client and
 * crypto binding, and keeps the export names existing callers already use.
 */

import { createChatCore, type SharedUserChat, type SharedChatMessage } from '@synth/shared';
import { supabase } from '@/integrations/supabase/client';
import * as chatCrypto from './chatEncryptionService';

/** When true, artist and venue group chats are hidden from the chat list (join-on-follow still works). */
const HIDE_ENTITY_GROUP_CHATS = false;

const chatCore = createChatCore({ supabase, crypto: chatCrypto });

export type UserChat = SharedUserChat;
export type ChatMessage = SharedChatMessage;

export function fetchUserChats(userId: string) {
  return chatCore.fetchUserChats(userId, { hideEntityGroupChats: HIDE_ENTITY_GROUP_CHATS });
}

export function fetchChatMessages(chatId: string, userId: string, limit?: number) {
  return chatCore.fetchChatMessages(chatId, userId, limit);
}

/** Kept under its original name — every call site sends encrypted. */
export function sendEncryptedMessage(
  chatId: string,
  senderId: string,
  content: string,
  replyToId?: string | null
) {
  return chatCore.sendChatMessage(chatId, senderId, content, {
    reply_to_id: replyToId ?? null,
  });
}

export const { fetchChatSenderProfiles, resolveChatDisplayName, leaveChat } = chatCore;

export { decryptChatMessage, isMessageEncrypted } from './chatEncryptionService';
export {
  resolveSenderDisplayName,
  normalizeChatSenderProfile,
  looksLikeOpaquePreview,
  CHAT_SENDER_NAME_FALLBACK,
  type ChatSenderProfile,
} from '@synth/shared';
