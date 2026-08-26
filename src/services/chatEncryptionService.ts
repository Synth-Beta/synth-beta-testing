/**
 * Web binding for the shared chat crypto.
 *
 * The algorithm, wire format, and key cache live in `@synth/shared` so web and mobile
 * cannot drift. This file only supplies the browser's storage and CSPRNG.
 *
 * NOTE: not end-to-end encryption — see the note in packages/synth-shared/src/chatCrypto.ts.
 */

import { createChatCrypto } from '@synth/shared';
import { nativeStorage } from '@/lib/nativeStorage';

const chatCrypto = createChatCrypto({
  storage: nativeStorage,
  randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
});

export const { encryptMessage, decryptMessage, decryptChatMessage, deleteChatKey } = chatCrypto;
export { isEncrypted, isMessageEncrypted } from '@synth/shared';
