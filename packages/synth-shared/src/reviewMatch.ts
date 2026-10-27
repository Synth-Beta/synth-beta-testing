/**
 * Which side of a review a home-thread show relates to, and the quote to show for it.
 * An artist match shows the artist text; a venue match shows the venue text. A review
 * only pairs with another artist's show at the same venue when it has venue text, so an
 * artist write-up never sits under a different artist's show.
 *
 * Shared so web and Expo pair reviews identically.
 */

export type ReviewMatch = 'artist' | 'venue';

type Id = string | number | null | undefined;

const sameId = (a: Id, b: Id) => a != null && a !== '' && b != null && String(a) === String(b);

export function reviewEventMatch(
  review: { artist_id?: Id; venue_id?: Id; venue_feedback?: string | null },
  event: { artist_id?: Id; venue_id?: Id }
): ReviewMatch | null {
  if (sameId(review.artist_id, event.artist_id)) return 'artist';
  if (sameId(review.venue_id, event.venue_id) && review.venue_feedback?.trim()) return 'venue';
  return null;
}

export function reviewQuoteFor(
  review: {
    review_text?: string | null;
    artist_performance_feedback?: string | null;
    venue_feedback?: string | null;
  },
  match: ReviewMatch | null | undefined
): string {
  const side =
    match === 'artist' ? review.artist_performance_feedback : match === 'venue' ? review.venue_feedback : undefined;
  return side?.trim() || review.review_text?.trim() || '';
}
