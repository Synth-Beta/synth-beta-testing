import {
  axiosDcAdapter,
  blackCatAdapter,
  blueskyAdapter,
  capitalBopAdapter,
  dcMusicLiveAdapter,
  dcMusicReviewAdapter,
  districtFrayAdapter,
  googlePlacesAdapter,
  impAdapter,
  jambaseAdapter,
  localNewsAdapter,
  musicbrainzAdapter,
  redditAdapter,
  setlistFmAdapter,
  songbyrdAdapter,
  theWharfAdapter,
  ticketmasterAdapter,
  tripadvisorMentionsAdapter,
  unionStageAdapter,
  venueWebsiteDiscoveryAdapter,
  washingtonOrgAdapter,
  washingtonianAdapter,
  wtopAdapter,
  yelpAdapter,
} from './adapters/index';
import type { SourceAdapter } from './types';

/** Canonical registry shared by Vercel + Supabase editorial-research. */
export const SOURCE_REGISTRY: SourceAdapter[] = [
  jambaseAdapter,
  ticketmasterAdapter,
  impAdapter,
  unionStageAdapter,
  blackCatAdapter,
  songbyrdAdapter,
  theWharfAdapter,
  dcMusicLiveAdapter,
  capitalBopAdapter,
  districtFrayAdapter,
  washingtonOrgAdapter,
  redditAdapter,
  blueskyAdapter,
  // Audience sentiment pack (reviews + local/news)
  googlePlacesAdapter,
  yelpAdapter,
  localNewsAdapter,
  tripadvisorMentionsAdapter,
  setlistFmAdapter,
  musicbrainzAdapter,
  washingtonianAdapter,
  axiosDcAdapter,
  dcMusicReviewAdapter,
  wtopAdapter,
  venueWebsiteDiscoveryAdapter,
];

export function getAdapter(id: string): SourceAdapter | undefined {
  return SOURCE_REGISTRY.find((a) => a.id === id);
}

export function listAdapterMeta() {
  return SOURCE_REGISTRY.map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    requiresEnv: a.requiresEnv || [],
    hasDiscover: Boolean(a.discover),
    hasEnrich: Boolean(a.enrich),
  }));
}
