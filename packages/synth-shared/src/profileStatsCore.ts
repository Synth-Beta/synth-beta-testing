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

function countReviewPillRows(
  rows: Array<{ was_there?: boolean | null; review_text?: string | null; rating?: number | null }>
): number {
  return rows.filter((item) => {
    if (item.was_there === true) return true;
    if (item.review_text && item.review_text !== 'ATTENDANCE_ONLY') return true;
    // Count quick-flow reviews that have a rating but no text
    if (typeof item.rating === 'number' && item.rating > 0) return true;
    return false;
  }).length;
}

export async function fetchProfileStatsSummary(
  client: SynthSupabaseClient,
  userId: string
): Promise<ProfileStatsSummary> {
  try {
    const [friendRes, reviewRowsRes, artistFollows, venueFollows] = await Promise.all([
      client
        .from('user_relationships')
        .select('id', { count: 'exact', head: true })
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted')
        .or(`user_id.eq.${userId},related_user_id.eq.${userId}`),
      client
        .from('reviews')
        .select('was_there, review_text, rating')
        .eq('user_id', userId)
        .eq('is_draft', false),
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
      reviewed_events_count: countReviewPillRows(reviewRowsRes.data ?? []),
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
