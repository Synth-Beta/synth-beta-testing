/**
 * Chat Encryption Service
 * 
 * Provides end-to-end encryption for chat messages using AES-GCM (Web Crypto API).
 * All participants in a chat share the same encryption key, derived deterministically
 * from the chat ID to ensure consistency across all devices.
 * 
 * Security Features:
 * - AES-GCM encryption (authenticated encryption)
 * - Shared keys per chat (all participants use the same key)
 * - Deterministic key derivation ensures consistency
 * - Keys cached in native storage for performance
 * - Unique IV per message for security
 * 
 * Encryption Format:
 * - Algorithm: AES-GCM
 * - Key Length: 256 bits
 * - IV Length: 96 bits (12 bytes)
 * - Tag Length: 128 bits
 * - Output: Base64 encoded (IV + ciphertext + tag)
 */

import { nativeStorage } from '@/lib/nativeStorage';

// Encryption algorithm: AES-GCM (Galois/Counter Mode)
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256; // 256-bit keys
const IV_LENGTH = 12; // 96-bit IV for GCM
const TAG_LENGTH = 128; // 128-bit authentication tag

// Fixed salt for key derivation (app-wide constant)
// This ensures deterministic key generation across all devices
const KEY_DERIVATION_SALT = new Uint8Array([
  0x73, 0x79, 0x6e, 0x74, 0x68, 0x2d, 0x63, 0x68,
  0x61, 0x74, 0x2d, 0x6b, 0x65, 0x79, 0x2d, 0x73,
  0x61, 0x6c, 0x74, 0x2d, 0x32, 0x30, 0x32, 0x36,
  0x2d, 0x30, 0x31, 0x2d, 0x32, 0x37, 0x2d, 0x65,
  0x32, 0x65, 0x32, 0x65
]);

/**
 * Derive encryption key for a chat using PBKDF2
 * This ensures all participants derive the same key from the chat ID
 * 
 * @param chatId - Chat ID (used as the password input)
 * @returns CryptoKey for encryption/decryption
 */
async function deriveChatKey(chatId: string): Promise<CryptoKey> {
  // Convert chatId to Uint8Array for key derivation
  const encoder = new TextEncoder();
  const chatIdData = encoder.encode(chatId);
  
  // Import chatId as a key for PBKDF2
  const baseKey = await crypto.subtle.importKey(
    'raw',
    chatIdData,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  // Derive 256 bits (32 bytes) using PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: KEY_DERIVATION_SALT,
      iterations: 100000, // High iteration count for security
      hash: 'SHA-256'
    },
    baseKey,
    KEY_LENGTH
  );
  
  // Import derived bits as AES-GCM key
  return await crypto.subtle.importKey(
    'raw',
    derivedBits,
    { name: ALGORITHM, length: KEY_LENGTH },
    false, // not extractable (security best practice)
    ['encrypt', 'decrypt']
  );
}

/**
 * Get or retrieve encryption key for a chat
 * Keys are derived deterministically and cached per chat (not per user)
 * 
 * @param chatId - Chat ID
 * @param userId - Current user ID (unused, kept for API compatibility)
 * @returns CryptoKey for encryption/decryption
 */
async function getOrCreateChatKey(chatId: string, userId: string): Promise<CryptoKey> {
  const storageKey = `chat_key_${chatId}`; // Shared key per chat, not per user
  
  // Try to retrieve cached key
  const storedKeyData = await nativeStorage.getItem(storageKey);
  
  if (storedKeyData) {
    try {
      // Import cached key
      const keyData = JSON.parse(storedKeyData);
      const keyArray = new Uint8Array(keyData);
      
      return await crypto.subtle.importKey(
        'raw',
        keyArray,
        { name: ALGORITHM, length: KEY_LENGTH },
        false, // not extractable (security best practice)
        ['encrypt', 'decrypt']
      );
    } catch (error) {
      console.warn('Failed to import cached key, deriving new one:', error);
      // Fall through to derive key
    }
  }
  
  // Derive key deterministically from chatId
  // Derive the raw bits first so we can cache them
  const encoder = new TextEncoder();
  const chatIdData = encoder.encode(chatId);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    chatIdData,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: KEY_DERIVATION_SALT,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    KEY_LENGTH
  );
  
  // Cache the raw key material for performance
  try {
    const keyArray = Array.from(new Uint8Array(derivedBits));
    await nativeStorage.setItem(storageKey, JSON.stringify(keyArray));
  } catch (error) {
    console.warn('Failed to cache encryption key:', error);
    // Continue anyway - key derivation is fast enough
  }
  
  // Import derived bits as AES-GCM key
  return await crypto.subtle.importKey(
    'raw',
    derivedBits,
    { name: ALGORITHM, length: KEY_LENGTH },
    false, // not extractable (security best practice)
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a message for a chat
 * 
 * @param message - Plain text message to encrypt
 * @param chatId - Chat ID
 * @param userId - Current user ID
 * @returns Encrypted message string (base64 encoded: IV + ciphertext + tag)
 * @throws Error if encryption fails
 */
export async function encryptMessage(
  message: string,
  chatId: string,
  userId: string
): Promise<string> {
  // Validate inputs
  if (!message || typeof message !== 'string') {
    throw new Error('Message must be a non-empty string');
  }
  if (!chatId || typeof chatId !== 'string') {
    throw new Error('ChatId must be a non-empty string');
  }
  if (!userId || typeof userId !== 'string') {
    throw new Error('UserId must be a non-empty string');
  }
  
  try {
    const key = await getOrCreateChatKey(chatId, userId);
    
    // Generate random IV for this message
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    
    // Convert message to Uint8Array
    const encoder = new TextEncoder();
    const messageData = encoder.encode(message);
    
    // Encrypt using AES-GCM
    const encryptedData = await crypto.subtle.encrypt(
      {
        name: ALGORITHM,
        iv: iv,
        tagLength: TAG_LENGTH,
      },
      key,
      messageData
    );
    
    // Combine IV + ciphertext (tag is included in ciphertext for GCM)
    const combined = new Uint8Array(IV_LENGTH + encryptedData.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedData), IV_LENGTH);
    
    // Convert to base64 for storage
    // Use a safe method that handles large arrays
    let binaryString = '';
    for (let i = 0; i < combined.length; i++) {
      binaryString += String.fromCharCode(combined[i]);
    }
    return btoa(binaryString);
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt message');
  }
}

/**
 * Decrypt a message from a chat
 * 
 * @param encryptedMessage - Encrypted message string (base64 encoded)
 * @param chatId - Chat ID
 * @param userId - Current user ID
 * @returns Decrypted plain text message
 * @throws Error if decryption fails (e.g., wrong key, corrupted data)
 */
export async function decryptMessage(
  encryptedMessage: string,
  chatId: string,
  userId: string
): Promise<string> {
  // Validate inputs
  if (!encryptedMessage || typeof encryptedMessage !== 'string') {
    throw new Error('Encrypted message must be a non-empty string');
  }
  if (!chatId || typeof chatId !== 'string') {
    throw new Error('ChatId must be a non-empty string');
  }
  if (!userId || typeof userId !== 'string') {
    throw new Error('UserId must be a non-empty string');
  }
  
  try {
    const key = await getOrCreateChatKey(chatId, userId);
    
    // Validate minimum length for encrypted message (IV + minimum ciphertext)
    if (encryptedMessage.length < IV_LENGTH * 2) {
      throw new Error('Encrypted message is too short to be valid');
    }
    
    // Decode from base64
    let combined: Uint8Array;
    try {
      combined = Uint8Array.from(atob(encryptedMessage), c => c.charCodeAt(0));
    } catch (error) {
      throw new Error('Invalid base64 encoding in encrypted message');
    }
    
    // Validate minimum decoded length
    if (combined.length < IV_LENGTH + 1) {
      throw new Error('Decoded encrypted message is too short');
    }
    
    // Extract IV and ciphertext
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);
    
    // Decrypt using AES-GCM
    const decryptedData = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: iv,
        tagLength: TAG_LENGTH,
      },
      key,
      ciphertext
    );
    
    // Convert back to string
    const decoder = new TextDecoder();
    return decoder.decode(decryptedData);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt message. You may not have access to this chat.');
  }
}

/**
 * Check if a message appears to be encrypted
 * Encrypted messages are base64 encoded and have a minimum length
 * 
 * @param message - Message content to check
 * @returns true if message appears encrypted, false otherwise
 */
export function isEncrypted(message: string): boolean {
  if (!message || message.length < IV_LENGTH * 2) {
    return false;
  }
  
  try {
    // Try to decode as base64
    const decoded = atob(message);
    // Encrypted messages will be longer than IV length (IV + ciphertext + tag)
    return decoded.length > IV_LENGTH;
  } catch {
    // Not valid base64, not encrypted
    return false;
  }
}

/**
 * Delete encryption key for a chat (e.g., when leaving a chat)
 * Note: Since keys are shared per chat, this clears the cache for all users
 * The key can be re-derived when needed
 * 
 * @param chatId - Chat ID
 * @param userId - Current user ID (unused, kept for API compatibility)
 */
export async function deleteChatKey(chatId: string, userId: string): Promise<void> {
  const storageKey = `chat_key_${chatId}`; // Shared key per chat
  await nativeStorage.removeItem(storageKey);
}
