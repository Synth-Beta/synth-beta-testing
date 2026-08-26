/**
 * Mobile binding for the shared chat data layer.
 *
 * All query and transform logic lives in `@synth/shared` (`chatCore.ts`) so web and
 * mobile cannot drift apart. What stays here is genuinely native: Expo image upload
 * and the `ChatService` static-method surface the screens already call.
 */

import { getOrCreateDirectChat, createChatCore, type SharedChatMessage } from '@synth/shared';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { uploadChatImageAndGetMetadata } from '@/utils/chatImageStorage';
import { supabase } from '../integrations/supabase/client';
import * as chatCrypto from './chatEncryptionService';

const chatCore = createChatCore({ supabase, crypto: chatCrypto });

const CHAT_IMAGE_ALLOWED_MIME = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
]);

/** React Native file object accepted by supabase-js storage uploads. */
type ReactNativeUploadFile = {
    uri: string;
    name: string;
    type: string;
};

function decodeBase64ToBytes(b64: string): Uint8Array {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function resolveChatImageType(
    uri: string,
    meta?: { mimeType?: string | null; fileName?: string | null }
): { ext: string; contentType: string } {
    const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        heic: 'image/heic',
    };

    let contentType = meta?.mimeType?.trim().toLowerCase() || '';
    if (contentType === 'image/jpg') contentType = 'image/jpeg';

    const fromName = meta?.fileName?.split('.').pop()?.toLowerCase();
    const fromUri = uri.split('?')[0]?.split('.').pop()?.toLowerCase();
    const fromMime = contentType.split('/').pop()?.toLowerCase();
    const rawExt = fromName ?? fromUri ?? fromMime ?? 'jpg';
    let ext = rawExt === 'jpeg' ? 'jpg' : rawExt;

    if (!contentType || !CHAT_IMAGE_ALLOWED_MIME.has(contentType)) {
        contentType = mimeMap[ext] ?? 'image/jpeg';
    }

    if (contentType === 'image/heic') ext = 'heic';
    if (contentType === 'image/jpeg') ext = 'jpg';
    if (contentType === 'image/png') ext = 'png';
    if (contentType === 'image/webp') ext = 'webp';

    if (!mimeMap[ext]) {
        ext = 'jpg';
        contentType = 'image/jpeg';
    }

    return { ext, contentType };
}

export interface ChatThread {
    id: string;
    chat_name: string;
    latest_message?: string;
    latest_message_at?: string;
    image_url?: string;
    unread_count: number;
}

export type { ChatMessageType } from '@synth/shared';

/** Mobile message shape: the shared row plus the `is_mine` flag the list renderer uses. */
export type Message = SharedChatMessage & { is_mine: boolean };

export class ChatService {
    /** Display name for a thread header (peer name, group name, etc.). */
    static async getChatDisplayName(chatId: string, userId: string): Promise<string> {
        try {
            const { data: chat, error } = await supabase
                .from('chats')
                .select('id, chat_name, is_group_chat')
                .eq('id', chatId)
                .maybeSingle();

            if (error || !chat) return 'Chat';
            return chatCore.resolveChatDisplayName(chat, userId);
        } catch {
            return 'Chat';
        }
    }

    /** All chat threads for a user, newest activity first. */
    static async getChats(userId: string): Promise<ChatThread[]> {
        const { data, error } = await chatCore.fetchUserChats(userId);
        if (error || !data) return [];

        return data.map((chat) => ({
            id: chat.id,
            chat_name: chat.display_name,
            latest_message: chat.latest_message ?? 'No messages yet',
            latest_message_at: chat.latest_message_created_at ?? chat.updated_at,
            // ponytail: unread is still computed by useUnreadMessageCount, not here.
            unread_count: 0,
        }));
    }

    /** Most recent window of messages, chronological order. */
    static async getMessages(chatId: string, userId: string): Promise<Message[]> {
        const { data } = await chatCore.fetchChatMessages(chatId, userId);
        return data.map((msg) => ({ ...msg, is_mine: msg.sender_id === userId }));
    }

    /** Send an encrypted message. Returns false if encryption or insert failed. */
    static async sendMessage(
        chatId: string,
        userId: string,
        content: string,
        replyToId?: string | null
    ): Promise<boolean> {
        const { error } = await chatCore.sendChatMessage(chatId, userId, content, {
            reply_to_id: replyToId ?? null,
        });
        return !error;
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

    /**
     * Upload an image to the private chat-images bucket.
     * Security: Returns storage_path + signed URL — never uses public URLs.
     */
    static async uploadChatImage(
        uri: string,
        userId: string,
        meta?: { mimeType?: string | null; fileName?: string | null }
    ): Promise<{ storage_path: string; image_url: string } | null> {
        try {
            const { ext, contentType } = resolveChatImageType(uri, meta);
            const fileName = `${Date.now()}.${ext}`;
            const storagePath = `${userId}/${fileName}`;

            if (Platform.OS !== 'web') {
                const rnFile: ReactNativeUploadFile = { uri, name: fileName, type: contentType };
                const uploaded = await uploadChatImageAndGetMetadata(
                    storagePath,
                    rnFile as unknown as Blob,
                    contentType
                );
                if (uploaded) return uploaded;

                console.warn('[ChatService] uploadChatImage: RN file upload failed, trying bytes');
            }

            let uploadBody: Blob | Uint8Array;
            let resolvedType = contentType;

            try {
                const base64 = await FileSystem.readAsStringAsync(uri, {
                    encoding: FileSystem.EncodingType.Base64,
                });
                if (!base64?.length) {
                    throw new Error('empty base64 read');
                }
                uploadBody = decodeBase64ToBytes(base64);
            } catch (fsErr) {
                const res = await fetch(uri);
                if (!res.ok) {
                    throw new Error(`fetch status ${res.status}`);
                }
                const blob = await res.blob();
                if (!blob.size) {
                    throw new Error('empty blob from fetch');
                }
                uploadBody = blob;
                if (blob.type && CHAT_IMAGE_ALLOWED_MIME.has(blob.type)) {
                    resolvedType = blob.type;
                }
                console.warn('[ChatService] uploadChatImage: used fetch fallback', fsErr);
            }

            if (!CHAT_IMAGE_ALLOWED_MIME.has(resolvedType)) {
                resolvedType = contentType;
            }

            return uploadChatImageAndGetMetadata(storagePath, uploadBody, resolvedType);
        } catch (e) {
            console.error('[ChatService] uploadChatImage exception:', e);
            return null;
        }
    }

    /** Remove current user from a chat (same as trash / leave in mobile list UI). */
    static async leaveChat(chatId: string, userId: string): Promise<boolean> {
        return chatCore.leaveChat(chatId, userId);
    }
}
