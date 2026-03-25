/**
 * Snapshot row from `user_streaming_stats` (used by Expo stats screen; web can reuse for parity reads).
 */
import type { SynthSupabaseClient } from './supabaseClientType';

export interface UserStreamingStatsSnapshot {
  top_artists: Array<{ name: string; popularity: number }>;
  top_genres: Array<{ genre: string; count: number }>;
  total_listening_hours: number;
}

export async function fetchUserStreamingStatsSnapshot(
  client: SynthSupabaseClient,
  userId: string
): Promise<UserStreamingStatsSnapshot | null> {
  try {
    const { data, error } = await client
      .from('user_streaming_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return { top_artists: [], top_genres: [], total_listening_hours: 0 };
    }

    return {
      top_artists: (data.top_artists as UserStreamingStatsSnapshot['top_artists']) || [],
      top_genres: (data.top_genres as UserStreamingStatsSnapshot['top_genres']) || [],
      total_listening_hours: (data.total_listening_hours as number) || 0,
    };
  } catch (error) {
    console.error('[synth-shared] fetchUserStreamingStatsSnapshot:', error);
    return null;
  }
}
