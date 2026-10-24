/**
 * A Spotify sync that returned no profile and no listening data did not work (most
 * often: the account is not on the Spotify app's Development Mode allowlist). Saving
 * it as "completed" made onboarding treat the user as connected with nothing behind
 * it. Callers fail the sync instead so the user is told and can try Apple Music or skip.
 * Mirrored in api/_lib/spotifySync.ts (API functions cannot import this package).
 */
export function isEmptySpotifySync(r: { hasProfile: boolean; artistCount: number; trackCount: number }): boolean {
  return !r.hasProfile && r.artistCount === 0 && r.trackCount === 0;
}

export const SPOTIFY_EMPTY_SYNC_MESSAGE =
  "Spotify didn't share any listening data, so it isn't connected. You can try Apple Music or skip for now.";

/**
 * A streaming_profiles row selected with `a0:profile_data->topArtists->0,
 * t0:profile_data->topTracks->0, me:profile_data->userProfile`. Spotify rows saved by
 * the old empty syncs have none of these and must not count as linked, or those users
 * never see the connect prompt again. Apple Music rows were always real.
 */
export function streamingRowHasData(row: { service_type?: unknown; a0?: unknown; t0?: unknown; me?: unknown }): boolean {
  if (row.service_type !== 'spotify') return true;
  return row.a0 != null || row.t0 != null || row.me != null;
}
