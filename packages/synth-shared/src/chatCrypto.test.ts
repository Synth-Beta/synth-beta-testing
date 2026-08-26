/**
 * Wire-compatibility check for the shared chat crypto.
 *
 * The thing that must not break: messages already in the database were written by the
 * old web implementation (crypto.subtle). This proves the new @noble path decrypts
 * them byte-for-byte, and that anything it writes is readable by crypto.subtle too.
 *
 * Run: node --experimental-strip-types packages/synth-shared/src/chatCrypto.test.ts
 */

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createChatCrypto, isEncrypted, isMessageEncrypted } from './chatCrypto.ts';

const subtle = webcrypto.subtle;
const IV_LENGTH = 12;

const SALT = new Uint8Array([
  0x73, 0x79, 0x6e, 0x74, 0x68, 0x2d, 0x63, 0x68,
  0x61, 0x74, 0x2d, 0x6b, 0x65, 0x79, 0x2d, 0x73,
  0x61, 0x6c, 0x74, 0x2d, 0x32, 0x30, 0x32, 0x36,
  0x2d, 0x30, 0x31, 0x2d, 0x32, 0x37, 0x2d, 0x65,
  0x32, 0x65, 0x32, 0x65,
]);

/** Verbatim reimplementation of the pre-refactor web path (src/services/chatEncryptionService.ts). */
async function legacyWebKey(chatId: string): Promise<CryptoKey> {
  const baseKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(chatId),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: SALT, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    256
  );
  return subtle.importKey('raw', derivedBits, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

async function legacyWebEncrypt(message: string, chatId: string): Promise<string> {
  const key = await legacyWebKey(chatId);
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encrypted = await subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    new TextEncoder().encode(message)
  );
  const combined = new Uint8Array(IV_LENGTH + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), IV_LENGTH);
  let binary = '';
  for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]!);
  return btoa(binary);
}

async function legacyWebDecrypt(payload: string, chatId: string): Promise<string> {
  const key = await legacyWebKey(chatId);
  const combined = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv: combined.slice(0, IV_LENGTH), tagLength: 128 },
    key,
    combined.slice(IV_LENGTH)
  );
  return new TextDecoder().decode(decrypted);
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (k: string) => map.get(k) ?? null,
    setItem: async (k: string, v: string) => void map.set(k, v),
    removeItem: async (k: string) => void map.delete(k),
  };
}

async function run() {
  const storage = memoryStorage();
  const crypto = createChatCrypto({
    storage,
    randomBytes: (n) => webcrypto.getRandomValues(new Uint8Array(n)),
  });

  const chatId = '3f6b1a2c-8d4e-4f7a-9b1c-2e5d7a8f0c31';
  const userId = 'cb0f9e21-77aa-4c33-91d8-6b2e4f9a1d55';

  // 1. The one that matters: existing subtle-written rows decrypt on the new path.
  const legacy = await legacyWebEncrypt('see you at the barrier at 8', chatId);
  assert.equal(
    await crypto.decryptMessage(legacy, chatId, userId),
    'see you at the barrier at 8',
    'noble must decrypt payloads written by the old crypto.subtle implementation'
  );

  // 2. And the reverse, so a mobile-written row stays readable by any subtle client.
  const fresh = await crypto.encryptMessage('who has the tickets', chatId, userId);
  assert.equal(await legacyWebDecrypt(fresh, chatId), 'who has the tickets');

  // 3. Round-trip through the shared path, including non-ASCII.
  const unicode = 'Røyksopp 🎧 — 東京';
  assert.equal(
    await crypto.decryptMessage(await crypto.encryptMessage(unicode, chatId, userId), chatId, userId),
    unicode
  );

  // 4. Key cache format must stay JSON number[] of 32 bytes — devices hold these already.
  const cached = JSON.parse(storage.map.get(`chat_key_${chatId}`)!);
  assert.equal(cached.length, 32);
  assert.ok(cached.every((b: number) => Number.isInteger(b) && b >= 0 && b <= 255));

  // 5. A cached key must produce the same result as a freshly derived one.
  const coldStorage = memoryStorage();
  const coldCrypto = createChatCrypto({
    storage: coldStorage,
    randomBytes: (n) => webcrypto.getRandomValues(new Uint8Array(n)),
  });
  assert.equal(await coldCrypto.decryptMessage(fresh, chatId, userId), 'who has the tickets');

  // 6. Wrong chat id must fail, not silently return garbage.
  await assert.rejects(() =>
    crypto.decryptMessage(fresh, '00000000-0000-4000-8000-000000000000', userId)
  );

  // 7. decryptChatMessage never throws and passes plaintext rows through untouched.
  assert.equal(
    await crypto.decryptChatMessage({ content: fresh, chat_id: chatId, is_encrypted: true }, userId),
    'who has the tickets'
  );
  assert.equal(
    await crypto.decryptChatMessage(
      { content: 'plaintext legacy row', chat_id: chatId, is_encrypted: false },
      userId
    ),
    'plaintext legacy row'
  );
  assert.equal(
    await crypto.decryptChatMessage({ content: 'corrupt!!', chat_id: chatId, is_encrypted: true }, userId),
    '[Unable to decrypt message]'
  );
  assert.equal(await crypto.decryptChatMessage({ content: '', chat_id: chatId }, userId), '[Empty message]');

  // 8. Encryption heuristics used when a row has no is_encrypted flag.
  assert.equal(isEncrypted(fresh), true);
  assert.equal(isEncrypted('hey'), false);
  assert.equal(isMessageEncrypted({ is_encrypted: false, content: fresh }), false, 'column wins over heuristic');
  assert.equal(isMessageEncrypted({ content: fresh }), true);

  // 9. Each message gets a unique IV — identical plaintext must not produce identical ciphertext.
  const a = await crypto.encryptMessage('same', chatId, userId);
  const b = await crypto.encryptMessage('same', chatId, userId);
  assert.notEqual(a, b, 'IV must be random per message');

  // 10. deleteChatKey clears the cache and the key still re-derives.
  await crypto.deleteChatKey(chatId, userId);
  assert.equal(storage.map.has(`chat_key_${chatId}`), false);
  assert.equal(await crypto.decryptMessage(fresh, chatId, userId), 'who has the tickets');

  console.log('chatCrypto: 10 checks passed (subtle <-> noble wire compatible)');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
