/**
 * Synth 2.0 demo: denser DC younger-scene product surface.
 * Reuses existing promotions, scenes, genre chats, and feeds.
 * Flip SYNTH_20_DEMO off to restore catalog-first defaults.
 *
 * Home / Messages user-facing strings: CMO-approved LOI-553 homepage-copy-draft.
 * Do not publish publicly without Board approval via Pam.
 */
export const SYNTH_20_DEMO = true;

/** Washington, DC (approx National Mall / downtown). */
export const SYNTH_20_DC = {
  name: 'Washington, DC',
  latitude: 38.9072,
  longitude: -77.0369,
  /** Demo radius: keep rooms dense, not metro-wide. */
  radiusMiles: 25,
  cityFilters: ['Washington', 'Washington, DC', 'Washington DC', 'DC'],
} as const;

/** Genre chat rooms kept visible in the demo (subset of GENRE_CONFIGS). */
export const SYNTH_20_GENRE_IDS = [
  'indie',
  'hip-hop',
  'edm',
  'jazz',
  'rock',
] as const;

/** Approved Home hero + featured + who's going + chat teaser (LOI-553). */
export const SYNTH_20_HOME = {
  hero: {
    eyebrow: 'DC live music this week',
    headline: "Who's going out",
    support: "See this week's shows, who's going, and jump into the chat.",
    primaryCta: 'See this week',
    secondaryCta: 'Open chats',
  },
  featured: {
    title: 'This week in DC',
    subtitle: '10-15 featured shows. Mixed genres. One city.',
    cardCta: 'Open show',
    goingCount: (n: number) => `${n} going`,
    empty: 'Featured shows for this week land here.',
    seeAll: 'Full week',
    loading: "Loading this week's shows…",
    error: "Couldn't load this week's shows. Try again.",
  },
  whosGoing: {
    title: "Who's going",
    subtitle: 'People headed to tonight and the rest of the week.',
    affordance: "I'm going",
    affordanceDone: "You're going",
    empty: "Say you're going. Friends and the scene show up here.",
    overflow: 'See everyone going',
  },
  chats: {
    showChatCta: 'Open show chat',
    sceneChatCta: 'Join scene chat',
    teaserLabel: "Chats around this week's shows",
    messagesEmpty: 'Scene and show chats open here.',
    showChatsSection: 'Show chats',
    sceneChatsSection: 'Scene chats',
    newThreadHint: 'Pick a featured show or scene, then talk before the door.',
  },
  /** @deprecated use featured.title; kept for older call sites during wire-up */
  title: 'This week in DC',
  /** @deprecated use featured.subtitle */
  subtitle: '10-15 featured shows. Mixed genres. One city.',
  featuredCap: 15,
  featuredTarget: 12,
  featuredMin: 10,
} as const;

export const SYNTH_20_DISCOVER = {
  /** Hide Browse Vibes CTA on Discover. */
  showBrowseVibes: false,
  /** Remount Scenes as the primary Discover browse. */
  showScenes: true,
  showBecauseYouLike: false,
  showMapCalendarTour: false,
  showGenreChats: true,
  genreSectionTitle: 'Scene rooms',
  genreSectionDescription: 'A few always-on chats for the DC week.',
  searchHelper: "Search this week's featured set and scenes.",
} as const;

export const SYNTH_20_MESSAGES = {
  empty: 'Scene and show chats open here.',
  showChatsSection: 'Show chats',
  sceneChatsSection: 'Scene chats',
  newThreadHint: 'Pick a featured show or scene, then talk before the door.',
} as const;

export function isSynth20GenreId(id: string): boolean {
  return (SYNTH_20_GENRE_IDS as readonly string[]).includes(id);
}

export function promotionRank(tier: string | null | undefined, isPromoted?: boolean): number {
  if (tier === 'featured') return 3;
  if (tier === 'premium') return 2;
  if (tier === 'basic' || isPromoted) return 1;
  return 0;
}
