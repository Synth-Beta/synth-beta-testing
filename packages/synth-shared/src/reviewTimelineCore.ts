/**
 * Review-based profile timeline (concerts attended / reviewed) — shared list query.
 */
import type { SynthSupabaseClient } from './supabaseClientType';

export interface ProfileReviewTimelineItem {
  id: string;
  type: 'review';
  title: string;
  subtitle: string;
  date: string;
  image_url?: string;
  rating?: number;
}

export async function fetchProfileReviewTimeline(
  client: SynthSupabaseClient,
  userId: string
): Promise<ProfileReviewTimelineItem[]> {
  try {
    const { data: reviews, error } = await client
      .from('reviews')
      .select(`
          id,
          rating,
          review_text,
          created_at,
          entity_id,
          events:entity_id (
            title,
            artist_name,
            venue_name,
            event_date,
            images
          )
        `)
      .eq('user_id', userId)
      .eq('entity_type', 'event')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (reviews || []).map((rev: Record<string, unknown>) => {
      const events = rev.events as Record<string, unknown> | undefined;
      const images = events?.images as Array<{ url?: string }> | undefined;
      return {
        id: String(rev.id),
        type: 'review' as const,
        title: (events?.artist_name as string) || 'Concert',
        subtitle: `${(events?.venue_name as string) || 'Venue'} • ${rev.rating} stars`,
        date: (events?.event_date as string) || (rev.created_at as string),
        image_url: images?.[0]?.url,
        rating: rev.rating as number | undefined,
      };
    });
  } catch (error) {
    console.error('[synth-shared] fetchProfileReviewTimeline:', error);
    return [];
  }
}
