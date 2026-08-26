/**
 * Mobile binding for the shared chat crypto.
 *
 * The algorithm, wire format, and key cache live in `@synth/shared` so web and mobile
 * cannot drift. This file only supplies AsyncStorage and expo-crypto's CSPRNG.
 *
 * NOTE: not end-to-end encryption — see the note in packages/synth-shared/src/chatCrypto.ts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoCrypto from 'expo-crypto';
import { createChatCrypto } from '@synth/shared';

const chatCrypto = createChatCrypto({
    storage: {
        getItem: (key) => AsyncStorage.getItem(key),
        setItem: (key, value) => AsyncStorage.setItem(key, value),
        removeItem: (key) => AsyncStorage.removeItem(key),
    },
    randomBytes: (length) => ExpoCrypto.getRandomBytes(length),
});

export const { encryptMessage, decryptMessage, decryptChatMessage, deleteChatKey } = chatCrypto;
export { isEncrypted, isMessageEncrypted } from '@synth/shared';
