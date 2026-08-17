/**
 * Browser + Node isomorphic helpers (no node:crypto).
 */

/** Deterministic hex digest for stable IDs (FNV-1a dual mix). */
export function stableHex(input: string, byteLen = 16): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + ((i + 1) * 2654435761)), 0x01000193) >>> 0;
  }
  let out = '';
  let a = h1;
  let b = h2;
  while (out.length < byteLen * 2) {
    a = Math.imul(a ^ (a >>> 16), 2246822507) >>> 0;
    b = Math.imul(b ^ (b >>> 13), 3266489909) >>> 0;
    out += (a >>> 0).toString(16).padStart(8, '0');
    out += (b >>> 0).toString(16).padStart(8, '0');
  }
  return out.slice(0, byteLen * 2);
}

export function uuidFromSeed(input: string): string {
  const hex = stableHex(input, 16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function newId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return uuidFromSeed(`${Date.now()}-${Math.random()}`);
}
