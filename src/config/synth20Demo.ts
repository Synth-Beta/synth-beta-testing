/**
 * Synth 2.0 demo: denser DC younger-scene product surface.
 * Reuses existing promotions, scenes, genre chats, and feeds.
 * Flip SYNTH_20_DEMO off to restore catalog-first defaults.
 *
 * User-facing Home + Messages strings: CMO-approved draft on LOI-553
 * (homepage-copy-draft). Do not invent claim language; escalate to CMO.
 * Campus strings stay in GTM only (never render in product UI).
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

/** Exact CMO-approved Home + Messages copy (LOI-553). */
export const SYNTH_20_COPY = {
  hero: {
    eyebrow: 'DC live music this week',
    headline: "Who's going out",
    support: "See this week's shows, who's going, and jump into the chat.",
    primaryCta: 'See this week',
    secondaryCta: 'Open chats',
  },
  featured: {
    sectionTitle: 'This week in DC',
    sectionSub: '10-15 featured shows. Mixed genres. One city.',
    /** Pattern: [Day] · [Venue] · [Neighborhood] */
    goingCount: (n: number) => `${n} going`,
    cardCta: 'Open show',
    empty: 'Featured shows for this week land here.',
    seeAll: 'Full week',
    loading: "Loading this week's shows…",
    error: "Couldn't load this week's shows. Try again.",
  },
  whosGoing: {
    sectionTitle: "Who's going",
    sectionSub: 'People headed to tonight and the rest of the week.',
    /** Pattern: [Name] · [Show] · [Day] */
    affordance: "I'm going",
    affordanceDone: "You're going",
    empty: "Say you're going. Friends and the scene show up here.",
    overflow: 'See everyone going',
  },
  chats: {
    showChatCta: 'Open show chat',
    sceneChatCta: 'Join scene chat',
    homeTeaserLabel: "Chats around this week's shows",
    /** Pattern: [Show or scene] · [N] messages */
    teaserRow: (label: string, n: number) => `${label} · ${n} messages`,
    messagesEmpty: 'Scene and show chats open here.',
    messagesShowSection: 'Show chats',
    messagesSceneSection: 'Scene chats',
    newThreadHint: 'Pick a featured show or scene, then talk before the door.',
  },
  tabs: {
    home: 'Home',
    discover: 'Discover',
    post: 'Post',
    messages: 'Messages',
    profile: 'Profile',
  },
  discoverHelper: "Search this week's featured set and scenes.",
  /**
   * Soft campus GTM invite — distribution / org creative only.
   * Never render on hero, App Store, or in-product Home/Messages UI.
   */
  campusGtmOnly: {
    softInvite: 'Campus night tonight? See DC shows this week on Home.',
    altInvite: 'After campus, the weekly DC list is on Home.',
  },
} as const;

/** @deprecated Prefer SYNTH_20_COPY.featured — kept for existing imports. */
export const SYNTH_20_HOME = {
  title: SYNTH_20_COPY.featured.sectionTitle,
  subtitle: SYNTH_20_COPY.featured.sectionSub,
  featuredCap: 15,
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
  helper: SYNTH_20_COPY.discoverHelper,
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

export function navigateSynthView(view: 'chat' | 'discover' | 'feed' | 'notifications', chatId?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('synth-navigate', {
      detail: { view, ...(chatId ? { chatId } : {}) },
    })
  );
}
