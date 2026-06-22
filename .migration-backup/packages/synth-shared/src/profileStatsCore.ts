/**
 * Profile header counts — one definition for web + Expo profile surfaces.
 */
import type { SynthSupabaseClient } from './supabaseClientType';

export interface ProfileStatsSummary {
  /**
   * Matches web ProfileView “Events” pill: non-draft reviews where user attended
   * (`was_there`) or wrote non–attendance-only text (`review_text`).
   */
  reviewed_events_count: number;
  artist_count: number;
  venue_count: number;
  friend_count: number;
  /** Artists + venues the user follows (profile “Following” stat). */
  following_count: number;
}

/** Matches web ProfileView “Events” pill row filter (was_there, text review, or rated). */
const REVIEW_PILL_COUNT_OR =
  'was_there.eq.true,and(review_text.neq.ATTENDANCE_ONLY,review_text.not.is.null),rating.gt.0';

export async function fetchProfileStatsSummary(
  client: SynthSupabaseClient,
  userId: string
): Promise<ProfileStatsSummary> {
  try {
    const [friendRes, reviewCountRes, artistFollows, venueFollows] = await Promise.all([
      client
        .from('user_relationships')
        .select('id', { count: 'exact', head: true })
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted')
        .or(`user_id.eq.${userId},related_user_id.eq.${userId}`),
      client
        .from('reviews')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_draft', false)
        .or(REVIEW_PILL_COUNT_OR),
      client
        .from('artist_follows')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
      client
        .from('user_venue_relationships')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
    ]);

    const following = (artistFollows.count || 0) + (venueFollows.count || 0);

    return {
      reviewed_events_count: reviewCountRes.count ?? 0,
      artist_count: 0,
      venue_count: 0,
      friend_count: friendRes.count ?? 0,
      following_count: following,
    };
  } catch (error) {
    console.error('[synth-shared] fetchProfileStatsSummary:', error);
    return {
      reviewed_events_count: 0,
      artist_count: 0,
      venue_count: 0,
      friend_count: 0,
      following_count: 0,
    };
  }
}
