import { createHmac, timingSafeEqual } from 'crypto';

export function secureEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function verifySlackSignature(params: {
  signingSecret: string;
  signature: string | undefined | null;
  timestamp: string | undefined | null;
  rawBody: string;
  maxAgeSeconds?: number;
}): boolean {
  const { signingSecret, signature, timestamp, rawBody, maxAgeSeconds = 60 * 5 } = params;
  if (!signature || !timestamp || !rawBody) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (age > maxAgeSeconds) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const digest = createHmac('sha256', signingSecret).update(base, 'utf8').digest('hex');
  const expected = `v0=${digest}`;
  return secureEquals(expected, signature);
}

export function isReviewerAllowed(userId: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return false;
  return allowlist.includes(userId);
}

/** In-memory replay cache for request timestamps (process-local). */
const seen = new Map<string, number>();

export function rejectReplay(key: string, ttlMs = 5 * 60_000): boolean {
  const now = Date.now();
  for (const [k, t] of seen) {
    if (now - t > ttlMs) seen.delete(k);
  }
  if (seen.has(key)) return true;
  seen.set(key, now);
  return false;
}
