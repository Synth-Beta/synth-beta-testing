import {
  fetchUserStreamingStatsSnapshot,
  enrichProfileDataWithGenres,
  type StreamingLinkStatus,
  type StreamingProvider,
} from '@synth/shared';
import { supabase } from '../integrations/supabase/client';
import { getStreamingLinkStatus } from './streamingConnectionService';

export type StreamingServiceType = 'spotify' | 'apple-music';

export interface StreamingProfileLoadResult {
  linkStatus: StreamingLinkStatus;
  serviceType: StreamingServiceType | null;
  profileData: Record<string, unknown> | null;
  lastSynced: string | null;
  needsConnection: boolean;
}

export function hasAnyProfileStats(profileData: Record<string, unknown> | null | undefined): boolean {
  if (!profileData) return false;

  const artists = profileData.topArtists;
  const artistsByRange = profileData.topArtistsByTimeRange;
  const tracks = profileData.topTracks;
  const tracksByRange = profileData.topTracksByTimeRange;
  const genres = profileData.topGenresSnapshot;

  if (Array.isArray(artists) && artists.length > 0) return true;
  if (Array.isArray(tracks) && tracks.length > 0) return true;
  if (Array.isArray(genres) && genres.length > 0) return true;

  const hasRangeItems = (field: unknown): boolean => {
    if (!field || typeof field !== 'object') return false;
    return Object.values(field as Record<string, unknown>).some(
      (v) => Array.isArray(v) && v.length > 0
    );
  };

  return hasRangeItems(artistsByRange) || hasRangeItems(tracksByRange);
}

export function providerAccentColor(provider: StreamingProvider | null): string {
  if (provider === 'spotify') return '#1DB954';
  if (provider === 'apple-music') return '#FC3C44';
  return '#EC4899';
}

export async function loadStreamingProfile(userId: string): Promise<StreamingProfileLoadResult> {
  const linkStatus = await getStreamingLinkStatus(userId);

  const { data: streamingRows } = await supabase
    .from('streaming_profiles')
    .select('profile_data, last_updated, service_type')
    .eq('user_id', userId)
    .order('last_updated', { ascending: false });

  const preferredType = linkStatus.provider !== 'unknown' ? linkStatus.provider : null;

  const profileRow =
    (preferredType
      ? streamingRows?.find((row) => row.service_type === preferredType)
      : null) ??
    streamingRows?.find((row) => row.profile_data) ??
    streamingRows?.[0] ??
    null;

  const resolvedType: StreamingServiceType | null =
    profileRow?.service_type === 'spotify' || profileRow?.service_type === 'apple-music'
      ? profileRow.service_type
      : linkStatus.provider !== 'unknown'
        ? linkStatus.provider
        : null;

  if (!linkStatus.linked && !profileRow?.profile_data) {
    return {
      linkStatus,
      serviceType: null,
      profileData: null,
      lastSynced: null,
      needsConnection: true,
    };
  }

  if (profileRow?.profile_data) {
    const snapshot = await fetchUserStreamingStatsSnapshot(supabase, userId);
    return {
      linkStatus,
      serviceType: resolvedType,
      profileData: enrichProfileDataWithGenres(profileRow.profile_data as Record<string, unknown>, {
        prefsGenres: snapshot?.top_genres,
      }),
      lastSynced: profileRow.last_updated ?? null,
      needsConnection: false,
    };
  }

  const snapshot = await fetchUserStreamingStatsSnapshot(supabase, userId);
  if (snapshot && (snapshot.top_artists.length > 0 || snapshot.top_genres.length > 0)) {
    return {
      linkStatus,
      serviceType: resolvedType,
      profileData: {
        topArtists: snapshot.top_artists.map((artist) => ({
          name: artist.name,
          popularity: artist.popularity,
          genres: [],
        })),
        topTracks: [],
        topGenresSnapshot: snapshot.top_genres,
      },
      lastSynced: null,
      needsConnection: false,
    };
  }

  return {
    linkStatus,
    serviceType: resolvedType,
    profileData: null,
    lastSynced: null,
    needsConnection: !linkStatus.linked,
  };
}
