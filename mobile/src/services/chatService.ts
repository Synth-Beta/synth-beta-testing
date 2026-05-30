import { getOrCreateDirectChat } from '@synth/shared';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { supabase } from '../integrations/supabase/client';
import { encryptMessage } from './chatEncryptionService';
import { decryptChatMessage } from './chatDecrypt';

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

export type ChatMessageType = 'text' | 'event_share' | 'review_share' | 'system' | 'image';

export interface Message {
    id: string;
    content: string;
    sender_id: string;
    created_at: string;
    is_mine: boolean;
    message_type: ChatMessageType;
    shared_event_id?: string | null;
    shared_review_id?: string | null;
    metadata?: Record<string, unknown> | null;
}

async function resolveChatDisplayName(
    chat: { id: string; chat_name: string | null; is_group_chat: boolean | null },
    userId: string
): Promise<string> {
    const isGroup = !!chat.is_group_chat;
    let title = (chat.chat_name || '').trim() || 'Chat';

    if (!isGroup) {
        const { data: parts } = await supabase
            .from('chat_participants')
            .select('user_id')
            .eq('chat_id', chat.id)
            .neq('user_id', userId)
            .limit(1);

        const otherUid = parts?.[0]?.user_id as string | undefined;
        if (otherUid) {
            const { data: userRow } = await supabase
                .from('users')
                .select('name, username')
                .eq('user_id', otherUid)
                .maybeSingle();
            const peerName =
                (typeof userRow?.name === 'string' && userRow.name.trim()) ||
                (typeof userRow?.username === 'string' && userRow.username.trim()
                    ? `@${userRow.username.trim()}`
                    : '');
            if (peerName) title = peerName;
            else if (UUID_RE.test(title)) title = 'Direct Chat';
        } else if (UUID_RE.test(title)) {
            title = 'Direct Chat';
        }
    } else if (!title || title === 'Chat') {
        title = 'Group Chat';
    }

    return title;
}

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
            return resolveChatDisplayName(chat, userId);
        } catch {
            return 'Chat';
        }
    }

    /**
     * Get all chat threads for user
     */
    static async getChats(userId: string): Promise<ChatThread[]> {
        try {
            const { data: participants } = await supabase
                .from('chat_participants')
                .select('chat_id')
                .eq('user_id', userId);

            if (!participants || participants.length === 0) return [];

            const chatIds = participants.map((p: { chat_id: string }) => p.chat_id);

            const { data: chats, error } = await supabase
                .from('chats')
                .select(
                    `
          id,
          chat_name,
          is_group_chat,
          updated_at,
          latest_message_id,
          messages!latest_message_id (
            id,
            content,
            created_at,
            is_encrypted,
            message_type,
            sender_id,
            users!messages_sender_id_fkey (
              user_id,
              name
            )
          )
        `
                )
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

            const rows = await Promise.all(
                list.map(async (chat: any) => {
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
                    // Re-resolve when list batch didn't have peer names (username-only accounts, etc.)
                    if (!isGroup && (title === 'Chat' || title === 'Direct Chat' || UUID_RE.test(String(title)))) {
                        title = await resolveChatDisplayName(chat, userId);
                    } else if (isGroup && (!chat.chat_name || !String(chat.chat_name).trim())) {
                        title = await resolveChatDisplayName(chat, userId);
                    }

                    const latestMsg = chat.messages as {
                        content?: string;
                        is_encrypted?: boolean;
                        message_type?: string;
                    } | null;
                    const rawType = latestMsg?.message_type;
                    let preview = latestMsg?.content as string | undefined;
                    if (rawType === 'image') {
                        preview = 'Photo';
                    } else if (rawType === 'event_share') {
                        preview = 'Shared an event';
                    } else if (rawType === 'review_share') {
                        preview = 'Shared a review';
                    } else if (latestMsg?.is_encrypted && preview) {
                        try {
                            preview = await decryptChatMessage(
                                {
                                    content: preview,
                                    chat_id: chat.id,
                                    is_encrypted: latestMsg.is_encrypted,
                                },
                                userId
                            );
                        } catch {
                            preview = '[Encrypted message]';
                        }
                    } else if (preview && looksLikeOpaquePreview(preview)) {
                        preview = 'Message';
                    }
                    if (!preview?.trim()) preview = 'No messages yet';

                    return {
                        id: chat.id,
                        chat_name: title,
                        latest_message: preview,
                        latest_message_at: chat.messages?.created_at || chat.updated_at,
                        unread_count: 0,
                    };
                })
            );

            return rows;
        } catch (error) {
            console.error('Error fetching chats:', error);
            return [];
        }
    }

    /**
     * Get messages for a specific chat (most recent window, chronological order).
     * Web loads full history with no limit; mobile caps at MESSAGE_LIMIT but must
     * fetch newest rows — ascending + limit alone only returns the oldest messages.
     */
    static async getMessages(chatId: string, userId: string): Promise<Message[]> {
        const MESSAGE_LIMIT = 300;
        try {
            const { data, error } = await supabase
                .from('messages')
                .select(
                    'id, chat_id, sender_id, content, is_encrypted, created_at, message_type, shared_event_id, shared_review_id, metadata'
                )
                .eq('chat_id', chatId)
                .order('created_at', { ascending: false })
                .limit(MESSAGE_LIMIT);

            if (error) throw error;

            const rows = (data || []).slice().reverse();
            const messageIds = rows.map((m: { id: string }) => m.id);
            let eventIdByMessageId = new Map<string, string>();
            if (messageIds.length > 0) {
                const { data: shares } = await supabase
                    .from('event_shares')
                    .select('message_id, event_id')
                    .eq('chat_id', chatId)
                    .in('message_id', messageIds);
                eventIdByMessageId = new Map(
                    (shares || []).map((s: { message_id: string; event_id: string }) => [s.message_id, s.event_id])
                );
            }

            const parseMeta = (raw: unknown): Record<string, unknown> | null => {
                if (raw == null) return null;
                if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
                if (typeof raw === 'string') {
                    try {
                        const p = JSON.parse(raw) as unknown;
                        return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, unknown>) : null;
                    } catch {
                        return null;
                    }
                }
                return null;
            };

            const mapped = await Promise.all(
                rows.map(async (msg: any) => {
                    const meta = parseMeta(msg.metadata);
                    const fallbackEvent = eventIdByMessageId.get(msg.id);
                    const eventId =
                        msg.shared_event_id ??
                        (meta?.event_id != null ? String(meta.event_id) : null) ??
                        fallbackEvent ??
                        null;
                    const rawType = msg.message_type as string | null | undefined;
                    const isEncryptedFlag = Boolean(msg.is_encrypted);

                    let rawContent = typeof msg.content === 'string' ? msg.content : '';
                    let content = rawContent;

                    if (rawType === 'image') {
                        content = '[Image]';
                    } else if (isEncryptedFlag) {
                        content = await decryptChatMessage(
                            {
                                content: rawContent,
                                chat_id: chatId,
                                is_encrypted: true,
                            },
                            userId
                        );
                    } else if (looksLikeOpaquePreview(content)) {
                        content = 'Message';
                    }

                    const reviewId =
                        msg.shared_review_id != null && String(msg.shared_review_id).trim().length > 0
                            ? String(msg.shared_review_id).trim()
                            : meta?.review_id != null && String(meta.review_id).trim().length > 0
                              ? String(meta.review_id).trim()
                              : null;

                    const isEventShare =
                        rawType !== 'system' &&
                        rawType !== 'review_share' &&
                        !reviewId &&
                        (rawType === 'event_share' ||
                            (eventId != null && (rawType === 'text' || rawType == null || rawType === '')));

                    let messageType: ChatMessageType;
                    if (rawType === 'system') {
                        messageType = 'system';
                    } else if (rawType === 'image') {
                        messageType = 'image';
                    } else if (reviewId) {
                        messageType = 'review_share';
                    } else if (isEventShare && eventId) {
                        messageType = 'event_share';
                    } else {
                        messageType = 'text';
                    }

                    return {
                        id: msg.id,
                        content,
                        sender_id: msg.sender_id,
                        created_at: msg.created_at,
                        is_mine: msg.sender_id === userId,
                        message_type: messageType,
                        // Canonical ids on the client (matches web merged fields; metadata fallbacks already folded into eventId/reviewId)
                        shared_event_id:
                            messageType === 'event_share' && eventId != null ? String(eventId) : null,
                        shared_review_id:
                            messageType === 'review_share' && reviewId != null ? String(reviewId) : null,
                        metadata: meta,
                    } satisfies Message;
                })
            );

            return mapped;
        } catch (error) {
            console.error('Error fetching messages:', error);
            return [];
        }
    }

    /**
     * Send a message (encrypted, matches web `sendEncryptedMessage`).
     */
    static async sendMessage(chatId: string, userId: string, content: string): Promise<boolean> {
        try {
            let payload: { chat_id: string; sender_id: string; content: string; is_encrypted: boolean };
            try {
                const encryptedContent = await encryptMessage(content, chatId, userId);
                payload = {
                    chat_id: chatId,
                    sender_id: userId,
                    content: encryptedContent,
                    is_encrypted: true,
                };
            } catch {
                // If crypto isn't available in the installed binary, don't crash or block chat entirely.
                // This keeps the app usable until a new native build ships.
                payload = {
                    chat_id: chatId,
                    sender_id: userId,
                    content,
                    is_encrypted: false,
                };
            }

            const { error } = await supabase.from('messages').insert(payload);

            if (!error) {
                await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId);
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

    /**
     * Upload an image file to the chat-images bucket and return its public URL.
     * @param uri Local file URI from expo-image-picker
     * @param userId The uploader's user id (used as folder prefix for RLS)
     */
    static async uploadChatImage(
        uri: string,
        userId: string,
        meta?: { mimeType?: string | null; fileName?: string | null }
    ): Promise<string | null> {
        try {
            const { ext, contentType } = resolveChatImageType(uri, meta);
            const fileName = `${Date.now()}.${ext}`;
            const storagePath = `${userId}/${fileName}`;

            // On native, fetch(file://) often returns an empty blob — use RN file upload instead.
            if (Platform.OS !== 'web') {
                const rnFile: ReactNativeUploadFile = { uri, name: fileName, type: contentType };
                const { data, error } = await supabase.storage
                    .from('chat-images')
                    .upload(storagePath, rnFile as unknown as Blob, { contentType, upsert: false });

                if (!error && data) {
                    const { data: urlData } = supabase.storage.from('chat-images').getPublicUrl(data.path);
                    return urlData.publicUrl ?? null;
                }

                console.warn('[ChatService] uploadChatImage: RN file upload failed, trying bytes', error);
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

            const { data, error } = await supabase.storage
                .from('chat-images')
                .upload(storagePath, uploadBody, { contentType: resolvedType, upsert: false });

            if (error || !data) {
                console.error('[ChatService] uploadChatImage:', error);
                return null;
            }

            const { data: urlData } = supabase.storage.from('chat-images').getPublicUrl(data.path);
            return urlData.publicUrl ?? null;
        } catch (e) {
            console.error('[ChatService] uploadChatImage exception:', e);
            return null;
        }
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
