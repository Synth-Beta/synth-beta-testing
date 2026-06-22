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

export type RankingsGroup = { ratingKey: number; items: MyReviewListItem[] };

/** Web ProfileView rankings mode: unique 0.1 ratings, exclude ATTENDANCE_ONLY. */
export function buildRankingsGroups(reviews: MyReviewListItem[]): RankingsGroup[] {
  const eligible = reviews.filter(r => r.review_text !== 'ATTENDANCE_ONLY');

  const uniqueRatings = Array.from(
    new Set(
      eligible
        .map(r => getDisplayRating(r))
        .filter((x): x is number => x != null && Number.isFinite(x))
        .map(rating => Math.round(rating * 10) / 10)
    )
  ).sort((a, b) => b - a);

  const groups: RankingsGroup[] = [];
  for (const ratingGroup of uniqueRatings) {
    const items = eligible.filter(r => {
      const displayRating = getDisplayRating(r);
      if (displayRating == null || !Number.isFinite(displayRating)) return false;
      const roundedRating = Math.round(displayRating * 10) / 10;
      return Math.abs(roundedRating - ratingGroup) < 0.01;
    });
    if (items.length === 0) continue;
    items.sort((a, b) => {
      const ao = a.rank_order ?? 9999;
      const bo = b.rank_order ?? 9999;
      if (ao !== bo) return ao - bo;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    groups.push({ ratingKey: ratingGroup, items });
  }
  return groups;
}
