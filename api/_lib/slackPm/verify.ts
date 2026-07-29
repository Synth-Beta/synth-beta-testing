/**
 * Slack request signature verification (classic Slack apps).
 * Must use the exact raw request bytes Slack sent.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { IncomingMessage } from 'http';

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

/** Buffer an IncomingMessage stream (requires bodyParser: false). */
export async function bufferIncomingMessage(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function parseFormBody(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const k = eq === -1 ? part : part.slice(0, eq);
    const v = eq === -1 ? '' : part.slice(eq + 1);
    out[decodeURIComponent(k.replace(/\+/g, ' '))] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return out;
}

export function headerValue(
  headers: Record<string, string | string[] | undefined> | Headers,
  name: string,
): string | undefined {
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) || undefined;
  }
  const h = headers as Record<string, string | string[] | undefined>;
  const v = h[name] ?? h[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}
