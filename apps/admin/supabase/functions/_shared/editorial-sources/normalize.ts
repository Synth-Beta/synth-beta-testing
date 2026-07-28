import type { NormalizedSignal, Sentiment, SignalType } from './types';

const EXCERPT_MAX = 280;

export function shortExcerpt(text: string | null | undefined, max = EXCERPT_MAX): string {
  const cleaned = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\u2014/g, '.')
    .replace(/\u2013/g, '-')
    .trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trim()}…`;
}

export function canonicalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    u.hash = '';
    // drop tracking params
    [...u.searchParams.keys()].forEach((k) => {
      if (/^utm_|^fbclid$|^gclid$/i.test(k)) u.searchParams.delete(k);
    });
    let path = u.pathname.replace(/\/+$/, '');
    if (!path) path = '/';
    u.pathname = path;
    return u.toString().toLowerCase();
  } catch {
    return url.trim().toLowerCase() || null;
  }
}

export async function contentHash(parts: Array<string | null | undefined>): Promise<string> {
  const payload = parts.map((p) => String(p || '').trim().toLowerCase()).join('|');
  const data = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function guessSentiment(text: string): Sentiment {
  const t = text.toLowerCase();
  const pos = (
    t.match(
      /\b(love|loved|great|amazing|excellent|fantastic|incredible|sold.?out|must.?see|favorite|favourite|worth it|killer|fire|underrated|intimate|perfect|nails it|blew me away)\b/g,
    ) || []
  ).length;
  const neg = (
    t.match(
      /\b(hate|hated|awful|terrible|cancel|cancelled|boring|worst|avoid|overrated|mid|meh|too loud|bad sound|long line|rip.?off|skip)\b/g,
    ) || []
  ).length;
  if (pos && neg) return 'mixed';
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

export async function normalizeSignal(input: {
  source: string;
  url?: string | null;
  title?: string | null;
  excerpt: string;
  published_at?: string | null;
  subject: string;
  signal_type?: SignalType;
  sentiment?: Sentiment;
  confidence?: number;
  raw?: Record<string, unknown>;
}): Promise<NormalizedSignal> {
  const url = input.url || null;
  const canonical = canonicalUrl(url);
  const excerpt = shortExcerpt(input.excerpt);
  const fetched_at = new Date().toISOString();
  const hash = await contentHash([canonical, input.title, excerpt]);
  return {
    source: input.source,
    url,
    canonical_url: canonical,
    title: input.title ? shortExcerpt(input.title, 160) : null,
    excerpt,
    published_at: input.published_at || null,
    fetched_at,
    subject: input.subject,
    signal_type: input.signal_type || 'other',
    sentiment: input.sentiment || guessSentiment(excerpt),
    confidence: Math.max(0, Math.min(1, input.confidence ?? 0.5)),
    content_hash: hash,
    raw: input.raw,
  };
}

export function dedupeSignals(signals: NormalizedSignal[]): NormalizedSignal[] {
  const byKey = new Map<string, NormalizedSignal>();
  for (const s of signals) {
    const key = s.canonical_url || s.content_hash;
    const existing = byKey.get(key);
    if (!existing || (s.confidence ?? 0) > (existing.confidence ?? 0)) {
      byKey.set(key, s);
    }
  }
  return [...byKey.values()];
}
