/**
 * Synth 2.0 demo: denser DC younger-scene product surface.
 * Mirror of src/config/synth20Demo.ts for Expo (separate module graph).
 */
export const SYNTH_20_DEMO = true;

export const SYNTH_20_DC = {
  name: 'Washington, DC',
  latitude: 38.9072,
  longitude: -77.0369,
  radiusMiles: 25,
  cityFilters: ['Washington', 'Washington, DC', 'Washington DC', 'DC'],
} as const;

export const SYNTH_20_GENRE_IDS = [
  'indie',
  'hip-hop',
  'edm',
  'jazz',
  'rock',
] as const;

export const SYNTH_20_HOME = {
  title: 'This week in DC',
  subtitle:
    'Featured shows for the younger live-music scene. Pick a night, see who’s going, jump in the chat.',
  featuredCap: 15,
} as const;

export const SYNTH_20_DISCOVER = {
  showBrowseVibes: false,
  showScenes: true,
  showBecauseYouLike: false,
  showMapCalendarTour: false,
  showGenreChats: true,
  genreSectionTitle: 'Scene rooms',
  genreSectionDescription:
    'A few always-on chats for the DC week — not every genre on earth.',
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
