/**
 * Chat message encryption — single implementation for web and mobile.
 *
 * Wire format (unchanged from the two implementations this replaces, so every
 * message already in the database still decrypts):
 * - AES-256-GCM, 128-bit tag
 * - Key: PBKDF2-SHA256(chatId, KEY_DERIVATION_SALT, 100_000) -> 32 bytes
 * - Payload: base64( IV(12 bytes) || ciphertext+tag )
 * - Key cache: storage key `chat_key_<chatId>`, value JSON number[] of the 32 raw bytes
 *
 * Pure JS via @noble/* on both platforms: React Native has no `crypto.subtle`, and
 * pulling in react-native-quick-crypto would put a Nitro native module on the app's
 * startup path. Storage and CSPRNG differ per platform, so they are injected.
 *
 * NOTE: this is at-rest obfuscation, not end-to-end encryption. The key derives from
 * the chat id plus a constant salt, both of which the server knows, so anyone with
 * database access can derive every key. Do not build features that assume the server
 * cannot read message content.
 */

import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

const KEY_LENGTH_BYTES = 32;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 100_000;

/** Constant, app-wide. Changing it makes every existing message undecryptable. */
const KEY_DERIVATION_SALT = new Uint8Array([
  0x73, 0x79, 0x6e, 0x74, 0x68, 0x2d, 0x63, 0x68,
  0x61, 0x74, 0x2d, 0x6b, 0x65, 0x79, 0x2d, 0x73,
  0x61, 0x6c, 0x74, 0x2d, 0x32, 0x30, 0x32, 0x36,
  0x2d, 0x30, 0x31, 0x2d, 0x32, 0x37, 0x2d, 0x65,
  0x32, 0x65, 0x32, 0x65,
]);

export interface ChatKeyStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface ChatCryptoDeps {
  /** Per-platform key cache (web: nativeStorage, mobile: AsyncStorage). */
  storage: ChatKeyStorage;
  /** Cryptographically secure random bytes. Must not be Math.random. */
  randomBytes(length: number): Uint8Array;
}

export interface EncryptedMessageRef {
  content: string;
  chat_id: string;
  is_encrypted?: boolean;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

/**
 * Looks encrypted? Base64 that decodes to more bytes than a bare IV.
 * Heuristic only — used as a fallback when a row has no `is_encrypted` flag.
 */
export function isEncrypted(message: string): boolean {
  if (!message || message.length < IV_LENGTH * 2) return false;
  try {
    return atob(message).length > IV_LENGTH;
  } catch {
    return false;
  }
}

export function createChatCrypto(deps: ChatCryptoDeps) {
  const { storage, randomBytes } = deps;

  async function deriveKeyBytes(chatId: string): Promise<Uint8Array> {
    return pbkdf2Async(sha256, new TextEncoder().encode(chatId), KEY_DERIVATION_SALT, {
      c: PBKDF2_ITERATIONS,
      dkLen: KEY_LENGTH_BYTES,
      // Yields to the event loop so 100k iterations don't freeze the UI thread.
      asyncTick: 10,
    });
  }

  /**
   * Key is derived from the chat id alone, so it is the same for every participant
   * and every device. The cache only skips the 100k-iteration derivation.
   */
  async function getChatKey(chatId: string): Promise<Uint8Array> {
    const storageKey = `chat_key_${chatId}`;

    try {
      const cached = await storage.getItem(storageKey);
      if (cached) {
        const bytes = new Uint8Array(JSON.parse(cached) as number[]);
        if (bytes.length === KEY_LENGTH_BYTES) return bytes;
      }
    } catch {
      /* corrupt or unreadable cache — re-derive */
    }

    const derived = await deriveKeyBytes(chatId);
    try {
      await storage.setItem(storageKey, JSON.stringify(Array.from(derived)));
    } catch {
      /* cache write failure is not fatal, derivation just repeats next time */
    }
    return derived;
  }

  /** `userId` is unused — kept because every existing call site passes it. */
  async function encryptMessage(message: string, chatId: string, userId: string): Promise<string> {
    if (!message || typeof message !== 'string') {
      throw new Error('Message must be a non-empty string');
    }
    if (!chatId || typeof chatId !== 'string') {
      throw new Error('ChatId must be a non-empty string');
    }
    if (!userId || typeof userId !== 'string') {
      throw new Error('UserId must be a non-empty string');
    }

    const key = await getChatKey(chatId);
    const iv = randomBytes(IV_LENGTH);
    const ciphertext = gcm(key, iv).encrypt(new TextEncoder().encode(message));

    const combined = new Uint8Array(IV_LENGTH + ciphertext.length);
    combined.set(iv, 0);
    combined.set(ciphertext, IV_LENGTH);
    return toBase64(combined);
  }

  async function decryptMessage(
    encryptedMessage: string,
    chatId: string,
    userId: string
  ): Promise<string> {
    if (!encryptedMessage || typeof encryptedMessage !== 'string') {
      throw new Error('Encrypted message must be a non-empty string');
    }
    if (!chatId || typeof chatId !== 'string') {
      throw new Error('ChatId must be a non-empty string');
    }
    if (!userId || typeof userId !== 'string') {
      throw new Error('UserId must be a non-empty string');
    }
    if (encryptedMessage.length < IV_LENGTH * 2) {
      throw new Error('Encrypted message is too short to be valid');
    }

    let combined: Uint8Array;
    try {
      combined = fromBase64(encryptedMessage);
    } catch {
      throw new Error('Invalid base64 encoding in encrypted message');
    }
    if (combined.length < IV_LENGTH + 1) {
      throw new Error('Decoded encrypted message is too short');
    }

    const key = await getChatKey(chatId);
    const decrypted = gcm(key, combined.slice(0, IV_LENGTH)).decrypt(combined.slice(IV_LENGTH));
    return new TextDecoder().decode(decrypted);
  }

  /**
   * Message-level wrapper: never throws, returns a display string.
   * Plaintext rows (older messages, and mobile's crypto-unavailable fallback)
   * pass through unchanged.
   */
  async function decryptChatMessage(message: EncryptedMessageRef, userId: string): Promise<string> {
    if (!message?.content) return '[Empty message]';
    if (!message.chat_id || typeof message.chat_id !== 'string') return message.content;
    if (!userId || typeof userId !== 'string') return '[Unable to decrypt message]';

    try {
      if (!(message.is_encrypted ?? isEncrypted(message.content))) return message.content;
      const decrypted = await decryptMessage(message.content, message.chat_id, userId);
      return decrypted || '[Unable to decrypt message]';
    } catch (error) {
      console.warn('[chatCrypto] decrypt failed', error);
      return '[Unable to decrypt message]';
    }
  }

  /** Clears the cached key. It re-derives on next use — this does not revoke access. */
  async function deleteChatKey(chatId: string, _userId?: string): Promise<void> {
    await storage.removeItem(`chat_key_${chatId}`);
  }

  return { encryptMessage, decryptMessage, decryptChatMessage, isEncrypted, deleteChatKey };
}

export type ChatCrypto = ReturnType<typeof createChatCrypto>;

/** True when a row is encrypted, preferring the column over the content heuristic. */
export function isMessageEncrypted(message: { is_encrypted?: boolean; content?: string }): boolean {
  if (message.is_encrypted !== undefined) return message.is_encrypted;
  return message.content ? isEncrypted(message.content) : false;
}
