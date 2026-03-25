/**
 * Profile header counts — one definition for web + Expo profile surfaces.
 */
import type { SynthSupabaseClient } from './supabaseClientType';

export interface ProfileStatsSummary {
  concert_count: number;
  artist_count: number;
  venue_count: number;
  friend_count: number;
  /** Artists + venues the user follows (profile “Following” stat). */
  following_count: number;
}

export async function fetchProfileStatsSummary(
  client: SynthSupabaseClient,
  userId: string
): Promise<ProfileStatsSummary> {
  try {
    const { count: concertCount } = await client
      .from('user_event_relationships')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('relationship_type', 'going');

    const { count: friendCount } = await client
      .from('user_relationships')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'accepted');

    const [{ count: artistFollows }, { count: venueFollows }] = await Promise.all([
      client
        .from('artist_follows')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
      client
        .from('user_venue_relationships')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
    ]);

    const following = (artistFollows || 0) + (venueFollows || 0);

    return {
      concert_count: concertCount || 0,
      artist_count: 0,
      venue_count: 0,
      friend_count: friendCount || 0,
      following_count: following,
    };
  } catch (error) {
    console.error('[synth-shared] fetchProfileStatsSummary:', error);
    return {
      concert_count: 0,
      artist_count: 0,
      venue_count: 0,
      friend_count: 0,
      following_count: 0,
    };
  }
}
