/**
 * A Spotify sync that returned no profile and no listening data did not work (most
 * often: the account is not on the Spotify app's Development Mode allowlist). Saving
 * it as "completed" made onboarding treat the user as connected with nothing behind
 * it. Callers fail the sync instead so the user is told and can try Apple Music or skip.
 * Copy of packages/synth-shared/src/spotifySyncGuard.ts (API functions cannot import the
 * shared barrel; see api/share.ts). Keep the two in sync.
 */
export function isEmptySpotifySync(r: { hasProfile: boolean; artistCount: number; trackCount: number }): boolean {
  return !r.hasProfile && r.artistCount === 0 && r.trackCount === 0;
}

export const SPOTIFY_EMPTY_SYNC_MESSAGE =
  "Spotify didn't share any listening data, so it isn't connected. You can try Apple Music or skip for now.";
