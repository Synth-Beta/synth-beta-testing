import { decryptMessage, isEncrypted } from './chatEncryptionService';

/**
 * Match web `decryptChatMessage` in `src/services/chatService.ts`.
 */
export async function decryptChatMessage(
    message: { content: string; chat_id: string; is_encrypted?: boolean },
    userId: string
): Promise<string> {
    if (!message?.content) return '[Empty message]';
    if (!message.chat_id || typeof message.chat_id !== 'string') {
        return message.content;
    }
    if (!userId || typeof userId !== 'string') return '[Unable to decrypt message]';

    try {
        const encrypted = message.is_encrypted ?? isEncrypted(message.content);
        if (encrypted) {
            const decrypted = await decryptMessage(message.content, message.chat_id, userId);
            if (!decrypted) return '[Unable to decrypt message]';
            return decrypted;
        }
        return message.content;
    } catch (error) {
        console.warn('[chatDecrypt]', error);
        return '[Unable to decrypt message]';
    }
}
