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
  /** Linked event when review is tied to an event row */
  event_id?: string;
}

type ReviewTimelineRow = Record<string, unknown> & {
  id?: string;
  rating?: number | null;
  review_text?: string | null;
  created_at?: string | null;
  Event_date?: string | null;
  event_id?: string | null;
  photos?: string[] | null;
  events?: EventTimelineRow | EventTimelineRow[] | null;
};

type EventTimelineRow = Record<string, unknown> & {
  id?: string;
  title?: string | null;
  venue_city?: string | null;
  venue_state?: string | null;
  event_date?: string | null;
  event_media_url?: string | null;
  images?: Array<{ url?: string | null }> | null;
};

function firstEvent(value: ReviewTimelineRow['events']): EventTimelineRow | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function firstImageUrl(review: ReviewTimelineRow, event: EventTimelineRow | null): string | undefined {
  const eventImages = event?.images;
  const fromEventImages = Array.isArray(eventImages)
    ? eventImages.find((image) => typeof image?.url === 'string' && image.url.trim())?.url
    : undefined;
  if (fromEventImages) return fromEventImages;

  if (typeof event?.event_media_url === 'string' && event.event_media_url.trim()) {
    return event.event_media_url;
  }

  const photos = review.photos;
  if (Array.isArray(photos)) {
    return photos.find((photo) => typeof photo === 'string' && photo.trim());
  }

  return undefined;
}

function titleForEvent(event: EventTimelineRow | null): string {
  if (event?.title) return event.title;
  return 'Concert';
}

function subtitleForReview(review: ReviewTimelineRow, event: EventTimelineRow | null): string {
  const place = event?.venue_city || event?.venue_state;
  const pieces = [
    place,
    typeof review.rating === 'number' ? `${review.rating} stars` : null,
  ].filter(Boolean);

  return pieces.length ? pieces.join(' • ') : 'Reviewed event';
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
          Event_date,
          event_id,
          photos,
          events:event_id (
            id,
            title,
            venue_city,
            venue_state,
            event_date,
            event_media_url,
            images
          )
        `)
      .eq('user_id', userId)
      .or('is_draft.eq.false,is_draft.is.null')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const rows = (reviews || []) as ReviewTimelineRow[];

    return rows.map((rev) => {
      const event = firstEvent(rev.events);
      const eventId = rev.event_id || event?.id;

      return {
        id: String(rev.id),
        type: 'review' as const,
        title: titleForEvent(event),
        subtitle: subtitleForReview(rev, event),
        date: event?.event_date || rev.Event_date || rev.created_at || new Date().toISOString(),
        image_url: firstImageUrl(rev, event),
        rating: typeof rev.rating === 'number' ? rev.rating : undefined,
        event_id: eventId || undefined,
      };
    });
  } catch (error) {
    console.error('[synth-shared] fetchProfileReviewTimeline:', error);
    return [];
  }
}
