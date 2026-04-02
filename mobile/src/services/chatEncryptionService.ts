/**
 * Mirrors web `src/services/chatEncryptionService.ts` — AES-GCM + PBKDF2
 * so mobile can decrypt messages sent from the web app.
 * Keys are cached under `chat_key_${chatId}` in AsyncStorage (same format as web nativeStorage).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureCryptoInstalled } from '../lib/cryptoInstall';

const chatKeyStorage = {
    getItem: (key: string) => AsyncStorage.getItem(key),
    setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
    removeItem: (key: string) => AsyncStorage.removeItem(key),
};

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const TAG_LENGTH = 128;

const KEY_DERIVATION_SALT = new Uint8Array([
    0x73, 0x79, 0x6e, 0x74, 0x68, 0x2d, 0x63, 0x68, 0x61, 0x74, 0x2d, 0x6b, 0x65, 0x79, 0x2d, 0x73, 0x61, 0x6c, 0x74, 0x2d,
    0x32, 0x30, 0x32, 0x36, 0x2d, 0x30, 0x31, 0x2d, 0x32, 0x37, 0x2d, 0x65, 0x32, 0x65, 0x32, 0x65,
]);

async function getOrCreateChatKey(chatId: string, _userId: string): Promise<CryptoKey> {
    const storageKey = `chat_key_${chatId}`;

    if (!ensureCryptoInstalled()) {
        throw new Error('Crypto unavailable');
    }

    const storedKeyData = await chatKeyStorage.getItem(storageKey);
    if (storedKeyData) {
        try {
            const keyData = JSON.parse(storedKeyData) as number[];
            const keyArray = new Uint8Array(keyData);
            return await crypto.subtle.importKey(
                'raw',
                keyArray,
                { name: ALGORITHM, length: KEY_LENGTH },
                false,
                ['encrypt', 'decrypt']
            );
        } catch {
            /* fall through */
        }
    }

    const encoder = new TextEncoder();
    const chatIdData = encoder.encode(chatId);
    const baseKey = await crypto.subtle.importKey('raw', chatIdData, 'PBKDF2', false, ['deriveBits']);
    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: KEY_DERIVATION_SALT,
            iterations: 100000,
            hash: 'SHA-256',
        },
        baseKey,
        KEY_LENGTH
    );

    try {
        const keyArray = Array.from(new Uint8Array(derivedBits));
        await chatKeyStorage.setItem(storageKey, JSON.stringify(keyArray));
    } catch {
        /* ignore cache failures */
    }

    return await crypto.subtle.importKey(
        'raw',
        derivedBits,
        { name: ALGORITHM, length: KEY_LENGTH },
        false,
        ['encrypt', 'decrypt']
    );
}

export async function encryptMessage(message: string, chatId: string, userId: string): Promise<string> {
    if (!message || typeof message !== 'string') throw new Error('Message must be a non-empty string');
    if (!chatId || typeof chatId !== 'string') throw new Error('ChatId must be a non-empty string');
    if (!userId || typeof userId !== 'string') throw new Error('UserId must be a non-empty string');
    if (!ensureCryptoInstalled()) throw new Error('Crypto unavailable');

    const key = await getOrCreateChatKey(chatId, userId);
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoder = new TextEncoder();
    const messageData = encoder.encode(message);
    const encryptedData = await crypto.subtle.encrypt(
        {
            name: ALGORITHM,
            iv,
            tagLength: TAG_LENGTH,
        },
        key,
        messageData
    );

    const combined = new Uint8Array(IV_LENGTH + encryptedData.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedData), IV_LENGTH);

    let binaryString = '';
    for (let i = 0; i < combined.length; i++) {
        binaryString += String.fromCharCode(combined[i]!);
    }
    return btoa(binaryString);
}

export async function decryptMessage(encryptedMessage: string, chatId: string, userId: string): Promise<string> {
    if (!encryptedMessage || typeof encryptedMessage !== 'string') {
        throw new Error('Encrypted message must be a non-empty string');
    }
    if (!chatId || typeof chatId !== 'string') throw new Error('ChatId must be a non-empty string');
    if (!userId || typeof userId !== 'string') throw new Error('UserId must be a non-empty string');
    if (!ensureCryptoInstalled()) throw new Error('Crypto unavailable');

    const key = await getOrCreateChatKey(chatId, userId);
    if (encryptedMessage.length < IV_LENGTH * 2) throw new Error('Encrypted message is too short to be valid');

    let combined: Uint8Array;
    try {
        combined = Uint8Array.from(atob(encryptedMessage), c => c.charCodeAt(0));
    } catch {
        throw new Error('Invalid base64 encoding in encrypted message');
    }
    if (combined.length < IV_LENGTH + 1) throw new Error('Decoded encrypted message is too short');

    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);
    const decryptedData = await crypto.subtle.decrypt(
        {
            name: ALGORITHM,
            iv,
            tagLength: TAG_LENGTH,
        },
        key,
        ciphertext
    );
    return new TextDecoder().decode(decryptedData);
}

export function isEncrypted(message: string): boolean {
    if (!message || message.length < IV_LENGTH * 2) return false;
    try {
        const decoded = atob(message);
        return decoded.length > IV_LENGTH;
    } catch {
        return false;
    }
}

export async function deleteChatKey(chatId: string, _userId: string): Promise<void> {
    await chatKeyStorage.removeItem(`chat_key_${chatId}`);
}
