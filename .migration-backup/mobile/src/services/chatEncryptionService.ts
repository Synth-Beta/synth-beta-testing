/**
 * Same wire format as web `src/services/chatEncryptionService.ts` (AES-256-GCM, PBKDF2-SHA256,
 * IV || ciphertext+tag, base64). Pure JS via @noble/* so TestFlight does not depend on
 * react-native-quick-crypto / Nitro native startup.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoCrypto from 'expo-crypto';
import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

const chatKeyStorage = {
    getItem: (key: string) => AsyncStorage.getItem(key),
    setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
    removeItem: (key: string) => AsyncStorage.removeItem(key),
};

const KEY_LENGTH_BYTES = 32;
const IV_LENGTH = 12;

const KEY_DERIVATION_SALT = new Uint8Array([
    0x73, 0x79, 0x6e, 0x74, 0x68, 0x2d, 0x63, 0x68, 0x61, 0x74, 0x2d, 0x6b, 0x65, 0x79, 0x2d, 0x73, 0x61, 0x6c, 0x74, 0x2d,
    0x32, 0x30, 0x32, 0x36, 0x2d, 0x30, 0x31, 0x2d, 0x32, 0x37, 0x2d, 0x65, 0x32, 0x65, 0x32, 0x65,
]);

async function deriveKeyBytes(chatId: string): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const chatIdData = encoder.encode(chatId);
    return pbkdf2Async(sha256, chatIdData, KEY_DERIVATION_SALT, {
        c: 100_000,
        dkLen: KEY_LENGTH_BYTES,
        asyncTick: 10,
    });
}

/** Raw 32-byte AES key; cached like web (JSON number[]). */
async function getOrCreateChatKeyBytes(chatId: string): Promise<Uint8Array> {
    const storageKey = `chat_key_${chatId}`;

    const storedKeyData = await chatKeyStorage.getItem(storageKey);
    if (storedKeyData) {
        try {
            const keyData = JSON.parse(storedKeyData) as number[];
            const keyArray = new Uint8Array(keyData);
            if (keyArray.length === KEY_LENGTH_BYTES) return keyArray;
        } catch {
            /* fall through */
        }
    }

    const derived = await deriveKeyBytes(chatId);
    try {
        await chatKeyStorage.setItem(storageKey, JSON.stringify(Array.from(derived)));
    } catch {
        /* ignore cache failures */
    }
    return derived;
}

export async function encryptMessage(message: string, chatId: string, userId: string): Promise<string> {
    if (!message || typeof message !== 'string') throw new Error('Message must be a non-empty string');
    if (!chatId || typeof chatId !== 'string') throw new Error('ChatId must be a non-empty string');
    if (!userId || typeof userId !== 'string') throw new Error('UserId must be a non-empty string');

    const key = await getOrCreateChatKeyBytes(chatId);
    const iv = ExpoCrypto.getRandomBytes(IV_LENGTH);
    const messageData = new TextEncoder().encode(message);
    const aes = gcm(key, iv);
    const encryptedData = aes.encrypt(messageData);

    const combined = new Uint8Array(IV_LENGTH + encryptedData.length);
    combined.set(iv, 0);
    combined.set(encryptedData, IV_LENGTH);

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

    const key = await getOrCreateChatKeyBytes(chatId);
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
    const aes = gcm(key, iv);
    const decryptedData = aes.decrypt(ciphertext);
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
