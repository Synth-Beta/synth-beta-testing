import type { NormalizedSignal } from '../editorial-sources/types';

const IRRELEVANT_HOST_PATH = [
  /\/europe\//i,
  /\/news\/.*earnings/i,
  /mystics|nationals|blue.?jays|tennis|dc.?open|fraylife|spirit.?week|champion.?teams/i,
];

/** Tokenize subject for relevance matching. */
export function subjectTokens(name: string): string[] {
  const raw = String(name || '')
    .toLowerCase()
    .replace(/[:']/g, ' ')
    .replace(/9\s*30/g, '930')
    .replace(/&/g, ' and ');
  const parts = raw.split(/[^a-z0-9+]+/).filter(Boolean);
  const stop = new Set([
    'the',
    'and',
    'music',
    'house',
    'live',
    'washington',
    'district',
    'columbia',
    'at',
    'with',
  ]);
  const out = parts.filter((t) => t.length >= 2 && !stop.has(t));
  // Keep compact form for venues like "9:30 Club"
  const compact = raw.replace(/[^a-z0-9]/g, '');
  if (compact.length >= 4) out.push(compact.slice(0, 16));
  return [...new Set(out)];
}

/**
 * Keep signals that mention the subject (or venue/artist tokens),
 * or first-party venue calendars for that subject. Drop sports/politics noise.
 */
export function filterSignalsForSubject(
  signals: NormalizedSignal[],
  opts: {
    subjectName: string;
    venueName?: string | null;
    artistName?: string | null;
    eventTitle?: string | null;
  },
): NormalizedSignal[] {
  const tokens = new Set([
    ...subjectTokens(opts.subjectName),
    ...subjectTokens(opts.venueName || ''),
    ...subjectTokens(opts.artistName || ''),
    ...subjectTokens(opts.eventTitle || ''),
  ]);

  // Always keep at least venue/artist name roots
  for (const extra of [opts.venueName, opts.artistName, opts.subjectName]) {
    if (!extra) continue;
    const compact = extra.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (compact.length >= 4) tokens.add(compact.slice(0, 12));
  }

  const tokenList = [...tokens];
  if (!tokenList.length) return signals.slice(0, 20);

  return signals.filter((s) => {
    const blob = `${s.title || ''} ${s.excerpt || ''} ${s.subject || ''} ${s.url || ''}`.toLowerCase();
    const compact = blob.replace(/[^a-z0-9]/g, '');

    for (const bad of IRRELEVANT_HOST_PATH) {
      if (bad.test(blob) && !tokenList.some((t) => blob.includes(t) || compact.includes(t.replace(/[^a-z0-9]/g, '')))) {
        return false;
      }
    }

    // First-party venue pages for matching venue adapters
    if (
      ['imp', 'black_cat', 'songbyrd', 'the_wharf', 'union_stage', 'venue_website_discovery'].includes(s.source) &&
      opts.venueName &&
      (blob.includes(opts.venueName.toLowerCase().split(' ')[0]) ||
        s.subject.toLowerCase().includes(opts.venueName.toLowerCase().split(' ')[0]))
    ) {
      return true;
    }

    return tokenList.some((t) => blob.includes(t) || compact.includes(t.replace(/[^a-z0-9]/g, '')));
  });
}

export function rankSnippetsForBrief<T extends { title?: string | null; excerpt?: string; url?: string | null; platform?: string; confidence?: number | null }>(
  rows: T[],
  limit = 12,
): T[] {
  return [...rows]
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0) || (b.excerpt?.length || 0) - (a.excerpt?.length || 0))
    .slice(0, limit);
}
