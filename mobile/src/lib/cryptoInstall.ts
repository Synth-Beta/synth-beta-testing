/**
 * Install Web Crypto-compatible `global.crypto` for chat encryption/decryption.
 * Must run before any code uses `crypto.subtle` (e.g. chatEncryptionService).
 */
import { install } from 'react-native-quick-crypto';

install();
