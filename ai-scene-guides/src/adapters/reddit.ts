import { getRedditCredentials } from '../config.js';
import type {
  FetchArtistInput,
  FetchEventsInput,
  FetchTopicSignalsInput,
  GroundedFact,
  MusicSourceAdapter,
} from '../types.js';
import { MemoryCache, RateLimiter } from './cache.js';

type RedditListing = {
  data?: { children?: Array<{ data?: Record<string, unknown> }> };
};

/**
 * Approved Reddit Data API — aggregate topic signals only.
 * Never stores usernames, never reproduces verbatim comments, never treats
 * Reddit claims as verified event facts.
 */
export class ApprovedRedditApiAdapter implements MusicSourceAdapter {
  readonly name = 'approved_reddit_api';
  private cache = new MemoryCache();
  private limiter = new RateLimiter(3, 0.5);
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  isConfigured(): boolean {
    return getRedditCredentials() !== null;
  }

  async fetchUpcomingEvents(_input: FetchEventsInput): Promise<GroundedFact[]> {
    return [];
  }

  async fetchArtistFacts(_input: FetchArtistInput): Promise<GroundedFact[]> {
    return [];
  }

  async fetchTopicSignals(input: FetchTopicSignalsInput): Promise<GroundedFact[]> {
    const creds = getRedditCredentials();
    if (!creds) return [];

    const cacheKey = `reddit:topic:${input.genreId}:${input.artistName ?? ''}:${input.venueName ?? ''}`;
    const cached = this.cache.get<GroundedFact[]>(cacheKey);
    if (cached) return cached;

    const token = await this.getToken(creds);
    await this.limiter.take();

    const qParts = [
      input.artistName ? `"${input.artistName}"` : null,
      input.venueName ? `"${input.venueName}"` : null,
      ...(input.queryHints ?? []),
      'concert OR show OR tour OR setlist',
    ].filter(Boolean);
    const q = qParts.join(' ');
    const url = `https://oauth.reddit.com/search?q=${encodeURIComponent(q)}&sort=new&limit=12&t=week`;

    const res = await this.fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': creds.userAgent,
      },
    });
    if (!res.ok) {
      throw new Error(`Reddit search HTTP ${res.status}`);
    }
    const body = (await res.json()) as RedditListing;
    const children = body.data?.children ?? [];

    // Aggregate — no usernames, no verbatim bodies.
    const titles: string[] = [];
    const permalinks: string[] = [];
    for (const child of children) {
      const d = child.data ?? {};
      const title = typeof d.title === 'string' ? d.title.trim() : '';
      const permalink = typeof d.permalink === 'string' ? d.permalink : '';
      if (title) titles.push(title.slice(0, 120));
      if (permalink) permalinks.push(`https://www.reddit.com${permalink}`);
    }

    if (titles.length === 0) {
      this.cache.set(cacheKey, [], 10 * 60_000);
      return [];
    }

    const themes = summarizeThemes(titles);
    const retrievedAt = this.now().toISOString();
    const fact: GroundedFact = {
      id: `reddit-topic-${hashKey(cacheKey)}`,
      kind: 'topic_signal',
      claim: `Aggregate public Reddit discussion recently mentions: ${themes}. This is a topic signal, not a verified fact.`,
      sourceKind: 'approved_reddit_api',
      sourceUrl: permalinks[0] || 'https://www.reddit.com',
      sourceTitle: 'Reddit aggregate topic signal',
      retrievedAt,
      expiresAt: new Date(this.now().getTime() + 24 * 3600_000).toISOString(),
      confidence: Math.min(0.55, 0.25 + titles.length * 0.03),
      rawSourceId: `aggregate:${permalinks.length}`,
      provenanceKey: `reddit:aggregate:${hashKey(cacheKey)}`,
      artistName: input.artistName,
      venueName: input.venueName,
      genreId: input.genreId,
      dataSegment: 'live',
    };

    const out = [fact];
    this.cache.set(cacheKey, out, 10 * 60_000);
    return out;
  }

  private async getToken(creds: {
    clientId: string;
    clientSecret: string;
    userAgent: string;
  }): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - 30_000) {
      return this.token.value;
    }
    const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
    const res = await this.fetchImpl('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': creds.userAgent,
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new Error(`Reddit token HTTP ${res.status}`);
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new Error('Reddit token missing');
    this.token = {
      value: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    };
    return this.token.value;
  }
}

function summarizeThemes(titles: string[]): string {
  const blob = titles.join(' ').toLowerCase();
  const themes: string[] = [];
  if (/setlist|encore|opened with/.test(blob)) themes.push('setlist/encore chatter');
  if (/ticket|sold out|presale/.test(blob)) themes.push('ticket availability talk');
  if (/opener|support act/.test(blob)) themes.push('opener discussion');
  if (/venue|doors|line/.test(blob)) themes.push('venue/logistics discussion');
  if (themes.length === 0) themes.push('general show interest');
  return themes.slice(0, 3).join('; ');
}

function hashKey(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
