import { getJamBaseCredentials } from '../config.js';
import type {
  FetchArtistInput,
  FetchEventsInput,
  FetchSetlistsInput,
  FetchTopicSignalsInput,
  GroundedFact,
  MusicSourceAdapter,
} from '../types.js';
import { MemoryCache, RateLimiter } from './cache.js';

type JamBaseEvent = {
  identifier?: string;
  name?: string;
  startDate?: string;
  location?: { name?: string; address?: { addressLocality?: string } };
  performer?: Array<{ name?: string; identifier?: string }>;
  url?: string;
};

/**
 * JamBase Data API v3 adapter.
 * Setlists are NOT available on this project's contracted event responses —
 * fetchRecentSetlists always returns [].
 */
export class JamBaseSourceAdapter implements MusicSourceAdapter {
  readonly name = 'jambase';
  private cache = new MemoryCache();
  private limiter = new RateLimiter(5, 1);

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  isConfigured(): boolean {
    return getJamBaseCredentials() !== null;
  }

  async fetchUpcomingEvents(input: FetchEventsInput): Promise<GroundedFact[]> {
    const creds = getJamBaseCredentials();
    if (!creds) return [];

    const cacheKey = `jb:events:${input.genreId}:${input.city ?? ''}:${input.fromIso ?? ''}`;
    const cached = this.cache.get<GroundedFact[]>(cacheKey);
    if (cached) return cached;

    await this.limiter.take();
    const params = new URLSearchParams({
      apikey: creds.apiKey,
      perPage: String(input.limit ?? 20),
    });
    if (input.city) params.set('geoCityExpand', 'true');
    // Genre is mapped client-side; JamBase genre filters vary by plan.
    const url = `https://api.data.jambase.com/v3/events?${params.toString()}`;
    const res = await this.fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
        'User-Agent': creds.userAgent,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`JamBase events HTTP ${res.status}`);
    }
    const body = (await res.json()) as { events?: JamBaseEvent[]; data?: JamBaseEvent[] };
    const events = body.events ?? body.data ?? [];
    const retrievedAt = this.now().toISOString();
    const expiresAt = new Date(this.now().getTime() + 48 * 3600_000).toISOString();

    const facts: GroundedFact[] = [];
    for (const ev of events.slice(0, input.limit ?? 20)) {
      const id = String(ev.identifier ?? '');
      if (!id) continue;
      const artist = ev.performer?.[0]?.name;
      const venue = ev.location?.name;
      const city = ev.location?.address?.addressLocality;
      const claimParts = [
        artist || ev.name || 'Artist',
        venue ? `at ${venue}` : null,
        city ? `in ${city}` : null,
        ev.startDate ? `on ${ev.startDate}` : null,
      ].filter(Boolean);
      facts.push({
        id: `jb-event-${id}`,
        kind: 'event',
        claim: `${claimParts.join(' ')} (JamBase listing).`,
        sourceKind: 'jambase',
        sourceUrl: ev.url || `https://www.jambase.com/show/${id}`,
        sourceTitle: `JamBase — ${ev.name || artist || id}`,
        occurredAt: ev.startDate,
        retrievedAt,
        expiresAt,
        confidence: 0.9,
        rawSourceId: id,
        provenanceKey: `jambase:event:${id}`,
        artistName: artist,
        eventId: id,
        venueName: venue,
        genreId: input.genreId,
        city,
        dataSegment: 'live',
      });
    }

    this.cache.set(cacheKey, facts, 15 * 60_000);
    return facts;
  }

  /** Intentionally empty — JamBase event contract in this repo has setlist: null. */
  async fetchRecentSetlists(_input: FetchSetlistsInput): Promise<GroundedFact[]> {
    return [];
  }

  async fetchArtistFacts(input: FetchArtistInput): Promise<GroundedFact[]> {
    const events = await this.fetchUpcomingEvents({
      genreId: input.genreId ?? 'indie',
      limit: 50,
    });
    return events.filter(
      (f) => f.artistName?.toLowerCase() === input.artistName.toLowerCase(),
    );
  }

  async fetchTopicSignals(_input: FetchTopicSignalsInput): Promise<GroundedFact[]> {
    return [];
  }
}
