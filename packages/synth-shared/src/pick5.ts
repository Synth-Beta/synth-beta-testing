/** Pick5 (setlist-prediction partner) bands and links, shared by web and Expo. */
export const PICK5_ORIGIN = 'https://www.pick5.io';

export interface Pick5Band {
  name: string;
  slug: string;
}

// Keep in step with v_pick5_artist_names in get_personalized_feed_v5.
export const PICK5_BANDS: Pick5Band[] = [
  { name: 'Goose', slug: 'goose' },
  { name: 'Billy Strings', slug: 'billy-strings' },
  { name: 'Widespread Panic', slug: 'widespread-panic' },
  { name: 'Phish', slug: 'phish' },
];

/**
 * Pick5's public /bands/{slug}/shows/{YYYY-MM-DD} pages only exist once a setlist is
 * posted (they 404 for upcoming shows), so upcoming shows link to the band page,
 * where fans make their picks.
 */
export const pick5BandUrl = (slug: string, campaign = 'home_feed') =>
  `${PICK5_ORIGIN}/bands/${slug}?utm_source=synth&utm_medium=partner&utm_campaign=${campaign}`;

export const findPick5Band = (artistName?: string | null) =>
  artistName ? PICK5_BANDS.find((b) => b.name.toLowerCase() === artistName.trim().toLowerCase()) : undefined;
