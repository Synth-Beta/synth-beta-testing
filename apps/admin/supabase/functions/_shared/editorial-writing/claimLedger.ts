import type {
  ClaimLedgerEntry,
  ClaimType,
  ForumRulesRecord,
  Platform,
  SentimentMethodRecord,
} from './types';

const FIRST_PARTY_SOURCES = new Set([
  'imp',
  'union_stage',
  'black_cat',
  'songbyrd',
  'the_wharf',
  'venue_website_discovery',
  'jambase',
  'ticketmaster',
]);

const TIER_MAP: Record<string, 1 | 2 | 3 | 4 | 5 | 6> = {
  jambase: 1,
  ticketmaster: 1,
  imp: 1,
  union_stage: 1,
  black_cat: 1,
  songbyrd: 1,
  the_wharf: 1,
  venue_website_discovery: 1,
  washington_org: 2,
  capitalbop: 4,
  district_fray: 4,
  dc_music_live: 4,
  dc_music_review: 4,
  washingtonian: 3,
  axios_dc: 3,
  wtop: 3,
  reddit: 5,
  bluesky: 5,
  google_places: 5,
  setlistfm: 4,
  musicbrainz: 4,
};

const BANNED_INTERNAL = /\b\d+\s+positive\s+signals?\b|\bsignals?\s+from\s+various\b|\bsentiment\s+analysis\s+shows\b/i;

function isSearchResultsUrl(url: string | null): boolean {
  if (!url) return true;
  try {
    const u = new URL(url);
    if (/google\.[^/]+$/i.test(u.hostname) && u.pathname.includes('/search')) return true;
    if (/bing\.com$/i.test(u.hostname) && u.pathname.includes('/search')) return true;
    if (/duckduckgo\.com$/i.test(u.hostname)) return true;
    return false;
  } catch {
    return true;
  }
}

function claimTypeFromSignal(signalType: string | null | undefined): ClaimType {
  switch (signalType) {
    case 'listing':
    case 'calendar':
      return 'listing';
    case 'review':
    case 'social':
      return 'sentiment_theme';
    case 'setlist':
    case 'profile':
    case 'place':
    case 'website':
      return 'current_fact';
    case 'news':
      return 'observation';
    default:
      return 'other';
  }
}

function shortClaim(title: string | null, excerpt: string): string {
  const t = (title || '').trim();
  const e = (excerpt || '').trim();
  if (t && e && !e.toLowerCase().startsWith(t.toLowerCase())) {
    return `${t}: ${e}`.slice(0, 240);
  }
  return (t || e || 'Untitled research note').slice(0, 240);
}

export interface SnippetRow {
  id?: string;
  platform: string;
  url: string | null;
  title: string | null;
  excerpt: string;
  polarity?: string | null;
  published_at?: string | null;
  fetched_at?: string | null;
  signal_type?: string | null;
  confidence?: number | null;
  sentiment?: string | null;
  raw?: Record<string, unknown> | null;
}

/** Convert research snippets into a claim ledger with public_use gates. */
export function buildClaimLedger(opts: {
  subjectId: string;
  subjectName: string;
  snippets: SnippetRow[];
  sentimentMethod?: SentimentMethodRecord | null;
}): { ledger: ClaimLedgerEntry[]; unusable: Array<{ text: string; reason: string }> } {
  const ledger: ClaimLedgerEntry[] = [];
  const unusable: Array<{ text: string; reason: string }> = [];
  const method = opts.sentimentMethod;
  let n = 0;

  for (const sn of opts.snippets) {
    n += 1;
    const id = `C${n}`;
    const source = sn.platform || 'web';
    const url = sn.url || (sn.raw?.canonical_url as string) || null;
    const excerpt = String(sn.excerpt || '').slice(0, 280);
    const claim = shortClaim(sn.title, excerpt);
    const confidence = typeof sn.confidence === 'number' ? sn.confidence : 0.45;
    const signalType = sn.signal_type || (sn.raw?.signal_type as string) || null;
    const claim_type = claimTypeFromSignal(signalType);
    const tier = TIER_MAP[source] || 6;
    const isSentiment =
      claim_type === 'sentiment_theme' ||
      source === 'reddit' ||
      source === 'bluesky' ||
      source === 'google_places';

    let public_use = true;
    let public_use_reason: string | undefined;

    if (BANNED_INTERNAL.test(claim) || BANNED_INTERNAL.test(excerpt)) {
      public_use = false;
      public_use_reason = 'Internal retrieval/sentiment count language';
    } else if (isSearchResultsUrl(url)) {
      public_use = false;
      public_use_reason = 'Search results URL is not a citable source';
    } else if (!excerpt || excerpt.length < 12) {
      public_use = false;
      public_use_reason = 'Excerpt too thin to support a public claim';
    } else if (isSentiment && !(method && method.complete)) {
      public_use = false;
      public_use_reason =
        'Sentiment/community theme lacks complete method (window, denominator, sources, limitations)';
    } else if (confidence < 0.35) {
      public_use = false;
      public_use_reason = 'Confidence below public threshold';
    } else if (tier === 6) {
      public_use = false;
      public_use_reason = 'Discovery-only source; verify elsewhere before public use';
    }

    const entry: ClaimLedgerEntry = {
      id,
      claim,
      claim_type,
      source_name: source,
      source_url: url,
      source_tier: tier,
      published_at: sn.published_at || null,
      fetched_at: sn.fetched_at || new Date().toISOString(),
      excerpt,
      is_first_party: FIRST_PARTY_SOURCES.has(source),
      is_promotional: Boolean(sn.raw?.is_promotional),
      freshness:
        claim_type === 'historical_fact'
          ? 'evergreen'
          : claim_type === 'listing'
            ? 'check_before_publish'
            : isSentiment
              ? 'time_bound'
              : 'unknown',
      confidence,
      corroborated_by: [],
      public_use,
      public_use_reason,
      allowed_uses: public_use
        ? (['instagram', 'linkedin', 'substack', 'reddit'] as Platform[])
        : [],
    };

    if (!public_use) {
      unusable.push({ text: claim, reason: public_use_reason || 'Not cleared for public use' });
    }
    ledger.push(entry);
  }

  // Subject identity claim (always usable as framing, not a fact assertion)
  ledger.unshift({
    id: 'C0',
    claim: `Subject under review: ${opts.subjectName}`,
    claim_type: 'current_fact',
    source_name: 'synth_editorial',
    source_url: null,
    source_tier: 1,
    published_at: null,
    fetched_at: new Date().toISOString(),
    excerpt: opts.subjectName,
    is_first_party: true,
    is_promotional: false,
    freshness: 'check_before_publish',
    confidence: 1,
    corroborated_by: [],
    public_use: true,
    allowed_uses: ['instagram', 'linkedin', 'substack', 'reddit'],
  });

  return { ledger, unusable };
}

export function usableClaims(ledger: ClaimLedgerEntry[]): ClaimLedgerEntry[] {
  return ledger.filter((c) => c.public_use && c.id !== 'C0');
}

export function defaultForumRules(forum = 'r/washingtondc'): ForumRulesRecord {
  return {
    target_forum: forum,
    rules_checked_at: new Date().toISOString(),
    self_promotion_allowed: true,
    link_allowed: false,
    required_flair: 'Discussion',
    account_disclosure_required: true,
    editor_must_reverify: true,
  };
}

/** Sentiment is only complete when method fields exist. Counts alone are never enough. */
export function parseSentimentMethod(raw: unknown): SentimentMethodRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const method = (o.sentiment_method || o.sentimentMethod || o) as Record<string, unknown>;
  const window_start = (method.window_start as string) || null;
  const window_end = (method.window_end as string) || null;
  const sources = Array.isArray(method.sources) ? (method.sources as string[]) : [];
  const unique = Number(method.unique_mentions);
  const total = Number(method.raw_mentions ?? method.total_mentions);
  const limitations = Array.isArray(method.limitations) ? (method.limitations as string[]) : [];
  const complete = Boolean(
    window_start &&
      window_end &&
      sources.length >= 1 &&
      Number.isFinite(unique) &&
      Number.isFinite(total) &&
      limitations.length >= 1 &&
      method.classification_method,
  );
  return {
    query: method.query as string | undefined,
    window_start,
    window_end,
    sources,
    raw_mentions: Number.isFinite(total) ? total : undefined,
    unique_mentions: Number.isFinite(unique) ? unique : undefined,
    positive: typeof method.positive === 'number' ? method.positive : undefined,
    neutral: typeof method.neutral === 'number' ? method.neutral : undefined,
    negative: typeof method.negative === 'number' ? method.negative : undefined,
    top_positive_themes: Array.isArray(method.top_positive_themes)
      ? (method.top_positive_themes as string[])
      : undefined,
    top_negative_themes: Array.isArray(method.top_negative_themes)
      ? (method.top_negative_themes as string[])
      : undefined,
    limitations,
    classification_method: method.classification_method as string | undefined,
    complete,
  };
}
