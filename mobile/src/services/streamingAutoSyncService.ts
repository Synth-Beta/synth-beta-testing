import {
  hasNonEmptyPerRangeData,
  streamingProfileNeedsTrackResync,
} from '@synth/shared';
import { syncStreamingProfile } from './streamingSyncActions';
import {
  markAutoSynced,
  wasRecentlyAutoSynced,
  STREAMING_AUTO_SYNC_THROTTLE_MS,
} from './streamingAutoSyncStorage';

export {
  markAutoSynced,
  clearAutoSyncThrottle,
  wasRecentlyAutoSynced,
  STREAMING_AUTO_SYNC_THROTTLE_MS,
} from './streamingAutoSyncStorage';

export const STREAMING_AUTO_SYNC_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export type StreamingAutoSyncReason = 'migration' | 'stale' | 'never';

export interface StreamingAutoSyncDecision {
  shouldSync: boolean;
  reason: StreamingAutoSyncReason | null;
}

export function evaluateStreamingAutoSync(params: {
  profileData: Record<string, unknown> | null;
  lastSynced: string | null;
  linked: boolean;
  serviceType: 'spotify' | 'apple-music' | null;
}): StreamingAutoSyncDecision {
  if (!params.linked || !params.serviceType) {
    return { shouldSync: false, reason: null };
  }

  if (params.serviceType === 'spotify' && params.profileData) {
    if (streamingProfileNeedsTrackResync(params.profileData)) {
      return { shouldSync: true, reason: 'migration' };
    }
    const artistsHaveRanges = hasNonEmptyPerRangeData(params.profileData, 'topArtistsByTimeRange');
    const songsHaveRanges = hasNonEmptyPerRangeData(params.profileData, 'topTracksByTimeRange');
    if (artistsHaveRanges && !songsHaveRanges) {
      return { shouldSync: true, reason: 'migration' };
    }
  }

  if (!params.lastSynced) {
    return { shouldSync: true, reason: 'never' };
  }

  const ageMs = Date.now() - new Date(params.lastSynced).getTime();
  if (Number.isFinite(ageMs) && ageMs >= STREAMING_AUTO_SYNC_STALE_MS) {
    return { shouldSync: true, reason: 'stale' };
  }

  return { shouldSync: false, reason: null };
}

let inFlightAutoSync: Promise<{ ok: boolean; skipped?: string }> | null = null;

export async function runStreamingAutoSync(params: {
  userId: string;
  serviceType: 'spotify' | 'apple-music';
  profileData: Record<string, unknown> | null;
  lastSynced: string | null;
  linked: boolean;
  options?: { force?: boolean; reason?: StreamingAutoSyncReason };
}): Promise<{ ok: boolean; skipped?: string }> {
  if (inFlightAutoSync) {
    return inFlightAutoSync;
  }

  const decision = params.options?.force
    ? { shouldSync: true, reason: params.options.reason ?? ('stale' as const) }
    : evaluateStreamingAutoSync(params);

  if (!decision.shouldSync) {
    return { ok: false, skipped: 'not-needed' };
  }

  if (decision.reason !== 'migration' && (await wasRecentlyAutoSynced(params.userId))) {
    return { ok: false, skipped: 'throttled' };
  }

  inFlightAutoSync = (async () => {
    try {
      const result = await syncStreamingProfile(params.userId, params.serviceType, { manual: false });
      if (result.ok) {
        await markAutoSynced(params.userId);
        return { ok: true };
      }
      return { ok: false, skipped: result.skipped ?? 'error' };
    } finally {
      inFlightAutoSync = null;
    }
  })();

  return inFlightAutoSync;
}
