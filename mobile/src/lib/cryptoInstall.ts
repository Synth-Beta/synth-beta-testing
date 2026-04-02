/**
 * Install Web Crypto-compatible `global.crypto` for chat encryption/decryption.
 * Must run before any code uses `crypto.subtle` (e.g. chatEncryptionService).
 */
export function ensureCryptoInstalled(): boolean {
    // If the runtime already has WebCrypto, do nothing.
    if (globalThis.crypto && 'subtle' in globalThis.crypto && globalThis.crypto.subtle) return true;

    // `react-native-quick-crypto` is a native module. If the installed binary
    // doesn't include it (e.g. older TestFlight build receiving an OTA update),
    // a static import can crash the app at startup. Keep this guarded.
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { install } = require('react-native-quick-crypto') as { install: () => void };
        install();
    } catch {
        return false;
    }

    return !!(globalThis.crypto && 'subtle' in globalThis.crypto && globalThis.crypto.subtle);
}
