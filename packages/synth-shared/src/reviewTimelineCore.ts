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
  artist_name?: string | null;
  venue_name?: string | null;
  venue_city?: string | null;
  event_date?: string | null;
  image?: string | null;
  poster_image_url?: string | null;
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

  if (typeof event?.poster_image_url === 'string' && event.poster_image_url.trim()) {
    return event.poster_image_url;
  }
  if (typeof event?.image === 'string' && event.image.trim()) {
    return event.image;
  }

  const photos = review.photos;
  if (Array.isArray(photos)) {
    return photos.find((photo) => typeof photo === 'string' && photo.trim());
  }

  return undefined;
}

function titleForEvent(event: EventTimelineRow | null): string {
  if (event?.artist_name && event?.venue_name) return `${event.artist_name} @ ${event.venue_name}`;
  if (event?.title) return event.title;
  if (event?.artist_name) return event.artist_name;
  if (event?.venue_name) return event.venue_name;
  return 'Concert';
}

function subtitleForReview(review: ReviewTimelineRow, event: EventTimelineRow | null): string {
  const pieces = [
    event?.venue_name,
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
            artist_name,
            venue_name,
            venue_city,
            event_date,
            image,
            poster_image_url,
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
