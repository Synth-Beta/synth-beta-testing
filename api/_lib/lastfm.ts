/**
 * Last.fm reads by username (public profile data, no user OAuth). Shaped like a Spotify
 * sync's profile_data so the artist-signals trigger and stats screens read it as-is:
 *   short_term <- 1month, medium_term <- 6month, long_term <- overall
 */

const LASTFM_API = 'https://ws.audioscrobbler.com/2.0/';
const TOP_LIMIT = 50;

/** Last.fm usernames: 2-15 chars, start with a letter, then letters/digits/_/-. */
const USERNAME_RE = /^[A-Za-z][A-Za-z0-9_-]{1,14}$/;

export class LastfmError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Accepts "name", "@name" or a pasted profile URL (last.fm/user/name). */
export function normalizeLastfmUsername(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim().replace(/^@/, '');
  const fromUrl = trimmed.match(/last\.fm\/(?:[a-z]{2}\/)?user\/([^/?#\s]+)/i)?.[1];
  const name = fromUrl ? decodeURIComponent(fromUrl) : trimmed;
  return USERNAME_RE.test(name) ? name : null;
}

async function lastfm(apiKey: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = `${LASTFM_API}?${new URLSearchParams({ ...params, api_key: apiKey, format: 'json' })}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Synth/1.0 (getsynth.app)' } });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof data.error === 'number') {
    // 6 = user not found, 17 = profile is private ("Login: User required to be logged in")
    if (data.error === 6) throw new LastfmError("We couldn't find that Last.fm username.", 404);
    if (data.error === 17) {
      throw new LastfmError(
        'That Last.fm profile is private. In Last.fm settings → Privacy, turn off "Hide recent listening", then try again.',
        403
      );
    }
    if (data.error === 29) throw new LastfmError('Last.fm is busy right now. Try again in a minute.', 503);
    throw new LastfmError(`Last.fm error: ${String(data.message ?? data.error)}`, 502);
  }
  if (!res.ok) throw new LastfmError(`Last.fm is unavailable (HTTP ${res.status}). Try again later.`, 502);
  return data;
}

type RawList = Record<string, unknown> | undefined;

function list(container: unknown, key: string): Array<Record<string, unknown>> {
  const items = (container as RawList)?.[key];
  if (Array.isArray(items)) return items as Array<Record<string, unknown>>;
  // Last.fm returns a bare object instead of an array when there is exactly one item.
  return items && typeof items === 'object' ? [items as Record<string, unknown>] : [];
}

function toArtist(a: Record<string, unknown>) {
  return { name: String(a.name ?? '').trim(), playcount: Number(a.playcount) || 0, url: a.url, mbid: a.mbid || undefined };
}

function toTrack(t: Record<string, unknown>) {
  const artist = t.artist as Record<string, unknown> | undefined;
  const artistName = String(artist?.name ?? artist?.['#text'] ?? '').trim();
  return {
    name: String(t.name ?? '').trim(),
    artists: artistName ? [{ name: artistName }] : [],
    playcount: Number(t.playcount) || 0,
    duration_ms: (Number(t.duration) || 0) * 1000,
    url: t.url,
  };
}

export async function fetchLastfmProfile(apiKey: string, username: string) {
  const info = await lastfm(apiKey, { method: 'user.getinfo', user: username });
  const user = (info.user ?? {}) as Record<string, unknown>;

  const topArtists = (period: string) =>
    lastfm(apiKey, { method: 'user.gettopartists', user: username, period, limit: String(TOP_LIMIT) }).then((d) =>
      list(d.topartists, 'artist')
    );
  const topTracks = (period: string) =>
    lastfm(apiKey, { method: 'user.gettoptracks', user: username, period, limit: String(TOP_LIMIT) }).then((d) =>
      list(d.toptracks, 'track')
    );

  const [aShort, aMed, aLong, tShort, tMed, tLong, recent] = await Promise.all([
    topArtists('1month'),
    topArtists('6month'),
    topArtists('overall'),
    topTracks('1month'),
    topTracks('6month'),
    topTracks('overall'),
    lastfm(apiKey, { method: 'user.getrecenttracks', user: username, limit: '50' })
      .then((d) => list(d.recenttracks, 'track'))
      .catch(() => []),
  ]);

  const artists = (rows: Array<Record<string, unknown>>) => rows.map(toArtist).filter((a) => a.name);
  const tracks = (rows: Array<Record<string, unknown>>) => rows.map(toTrack).filter((t) => t.name);
  const byRangeArtists = { short_term: artists(aShort), medium_term: artists(aMed), long_term: artists(aLong) };
  const byRangeTracks = { short_term: tracks(tShort), medium_term: tracks(tMed), long_term: tracks(tLong) };
  const profileUrl = typeof user.url === 'string' ? user.url : `https://www.last.fm/user/${encodeURIComponent(username)}`;

  return {
    profileUrl,
    profileData: {
      source: 'lastfm',
      username: typeof user.name === 'string' ? user.name : username,
      topArtists: [...byRangeArtists.short_term, ...byRangeArtists.medium_term, ...byRangeArtists.long_term],
      topArtistsByTimeRange: byRangeArtists,
      topTracks: [...byRangeTracks.short_term, ...byRangeTracks.medium_term, ...byRangeTracks.long_term],
      topTracksByTimeRange: byRangeTracks,
      recentlyPlayed: tracks(recent),
      userProfile: { name: user.name, url: profileUrl, playcount: Number(user.playcount) || 0 },
      display_name: user.realname || user.name || username,
      external_urls: { lastfm: profileUrl },
    },
  };
}
