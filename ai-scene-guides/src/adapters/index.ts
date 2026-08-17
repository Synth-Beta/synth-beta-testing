import { FixtureSourceAdapter } from './fixture.js';
import { JamBaseSourceAdapter } from './jambase.js';
import { ApprovedRedditApiAdapter } from './reddit.js';
import type { MusicSourceAdapter } from '../types.js';

export { FixtureSourceAdapter, JamBaseSourceAdapter, ApprovedRedditApiAdapter };

export function createLiveAdapters(): MusicSourceAdapter[] {
  const adapters: MusicSourceAdapter[] = [];
  const jb = new JamBaseSourceAdapter();
  if (jb.isConfigured()) adapters.push(jb);
  const reddit = new ApprovedRedditApiAdapter();
  if (reddit.isConfigured()) adapters.push(reddit);
  return adapters;
}

export async function gatherFacts(
  adapters: MusicSourceAdapter[],
  input: {
    genreId: string;
    artistName?: string;
    venueName?: string;
    city?: string;
    includeSetlists?: boolean;
  },
) {
  const facts = [];
  for (const adapter of adapters) {
    const events = await adapter.fetchUpcomingEvents({
      genreId: input.genreId,
      city: input.city,
      limit: 20,
    });
    facts.push(...events);

    if (input.artistName) {
      facts.push(...(await adapter.fetchArtistFacts({ artistName: input.artistName, genreId: input.genreId })));
    }

    if (input.includeSetlists && adapter.fetchRecentSetlists && input.artistName) {
      facts.push(
        ...(await adapter.fetchRecentSetlists({ artistName: input.artistName })),
      );
    }

    if (adapter.fetchTopicSignals) {
      facts.push(
        ...(await adapter.fetchTopicSignals({
          genreId: input.genreId,
          artistName: input.artistName,
          venueName: input.venueName,
        })),
      );
    }
  }

  // Deduplicate by provenanceKey
  const seen = new Set<string>();
  return facts.filter((f) => {
    if (seen.has(f.provenanceKey)) return false;
    seen.add(f.provenanceKey);
    return true;
  });
}
