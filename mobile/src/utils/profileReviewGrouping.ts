import type { MyReviewListItem } from '../services/myEventsService';

export type StarBucket = 1 | 2 | 3 | 4 | 5;

/** Align with web ProfileStarBuckets.effectiveStarBucketRating. */
export function effectiveStarBucketRating(review: MyReviewListItem): number | null {
  const r = review.rating;
  if (typeof r === 'number' && Number.isFinite(r)) return r;
  if (typeof r === 'string') {
    const p = parseFloat(r);
    return Number.isFinite(p) ? p : null;
  }
  if (r === null || r === undefined) return null;
  return null;
}

export function groupReviewsIntoStarBuckets(reviews: MyReviewListItem[]): {
  buckets: Record<StarBucket, MyReviewListItem[]>;
  unrated: MyReviewListItem[];
} {
  const buckets: Record<StarBucket, MyReviewListItem[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  const unrated: MyReviewListItem[] = [];

  for (const review of reviews || []) {
    if (review.review_text === 'ATTENDANCE_ONLY' && !review.was_there) continue;

    const rawRating = effectiveStarBucketRating(review);
    if (rawRating === null || !Number.isFinite(rawRating) || rawRating <= 0) {
      unrated.push(review);
      continue;
    }

    const bucket = Math.floor(rawRating) as StarBucket;
    if (bucket >= 1 && bucket <= 5) {
      buckets[bucket].push(review);
    } else {
      unrated.push(review);
    }
  }

  const starKeys: StarBucket[] = [5, 4, 3, 2, 1];
  for (const stars of starKeys) {
    const items = buckets[stars] || [];
    buckets[stars] = items.slice().sort((a, b) => {
      const getEffective = (rev: MyReviewListItem) => effectiveStarBucketRating(rev) ?? stars;
      const aRating = getEffective(a);
      const bRating = getEffective(b);
      if (bRating !== aRating) return bRating - aRating;
      const aDate = a.event_date || a.created_at;
      const bDate = b.event_date || b.created_at;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
  }

  unrated.sort((a, b) => {
    const aDate = a.event_date || a.created_at;
    const bDate = b.event_date || b.created_at;
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });

  return { buckets, unrated };
}

export function hasAnyStarBucketContent(grouped: {
  buckets: Record<StarBucket, MyReviewListItem[]>;
  unrated: MyReviewListItem[];
}): boolean {
  const keys: StarBucket[] = [5, 4, 3, 2, 1];
  if (keys.some(k => grouped.buckets[k].length > 0)) return true;
  return grouped.unrated.length > 0;
}

/** Web ProfileView getDisplayRating: 1-decimal display rating from stored average. */
export function getDisplayRating(review: MyReviewListItem): number | null {
  const r = review.rating;
  if (typeof r === 'number' && Number.isFinite(r)) {
    return parseFloat(r.toFixed(1));
  }
  if (typeof r === 'string') {
    const parsed = parseFloat(r);
    if (!Number.isFinite(parsed)) return null;
    return parseFloat(parsed.toFixed(1));
  }
  return null;
}
