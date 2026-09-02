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
  artist_id?: string | null;
  venue_id?: string | null;
  user_created_artist_id?: string | null;
  user_created_venue_id?: string | null;
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

/** Batch `id -> name` lookup for one table; best-effort (a failed lookup just loses names). */
async function namesById(
  client: SynthSupabaseClient,
  table: string,
  ids: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))] as string[];
  if (unique.length === 0) return new Map();

  const { data, error } = await client.from(table).select('id, name').in('id', unique);
  if (error) {
    console.warn(`[synth-shared] reviewTimeline ${table} names:`, error.message);
    return new Map();
  }

  const map = new Map<string, string>();
  for (const row of (data || []) as Array<{ id?: string; name?: string | null }>) {
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (row.id && name) map.set(String(row.id), name);
  }
  return map;
}

function titleFor(event: EventTimelineRow | null, artist: string | null, venue: string | null): string {
  if (event?.title) return event.title;
  if (artist && venue) return `${artist} at ${venue}`;
  return artist || venue || 'Concert';
}

function subtitleFor(
  review: ReviewTimelineRow,
  event: EventTimelineRow | null,
  artist: string | null,
  venue: string | null
): string {
  // Don't repeat the artist/venue already in the title.
  const place = artist && venue ? event?.venue_city : venue || event?.venue_city || event?.venue_state;
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
          artist_id,
          venue_id,
          user_created_artist_id,
          user_created_venue_id,
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
      .or('is_draft.eq.false,is_draft.is.null');

    if (error) throw error;

    const rows = (reviews || []) as ReviewTimelineRow[];

    // The review flow stores artist_id + venue_id and leaves event_id null
    // (see web reviewService.setEventReview), so the `events` embed is null for
    // most reviews — resolve the names off the review itself or every card
    // renders as a bare "Concert".
    const [artistNames, venueNames, userArtistNames, userVenueNames] = await Promise.all([
      namesById(client, 'artists', rows.map((r) => r.artist_id)),
      namesById(client, 'venues', rows.map((r) => r.venue_id)),
      namesById(client, 'user_created_artists', rows.map((r) => r.user_created_artist_id)),
      namesById(client, 'user_created_venues', rows.map((r) => r.user_created_venue_id)),
    ]);

    const items = rows.map((rev) => {
      const event = firstEvent(rev.events);
      const eventId = rev.event_id || event?.id;
      const artist =
        (rev.artist_id && artistNames.get(String(rev.artist_id))) ||
        (rev.user_created_artist_id && userArtistNames.get(String(rev.user_created_artist_id))) ||
        null;
      const venue =
        (rev.venue_id && venueNames.get(String(rev.venue_id))) ||
        (rev.user_created_venue_id && userVenueNames.get(String(rev.user_created_venue_id))) ||
        null;

      return {
        id: String(rev.id),
        type: 'review' as const,
        title: titleFor(event, artist, venue),
        subtitle: subtitleFor(rev, event, artist, venue),
        date: event?.event_date || rev.Event_date || rev.created_at || new Date().toISOString(),
        image_url: firstImageUrl(rev, event),
        rating: typeof rev.rating === 'number' ? rev.rating : undefined,
        event_id: eventId || undefined,
      };
    });

    // Sort on the date actually rendered (show date), not on created_at — the
    // two diverge whenever a show is reviewed late, which scrambled the rail.
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch (error) {
    console.error('[synth-shared] fetchProfileReviewTimeline:', error);
    return [];
  }
}
