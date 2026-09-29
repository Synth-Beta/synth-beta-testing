/**
 * Pure helpers for the social analytics function, kept out of index.ts so they
 * can be checked without a Deno runtime — see platformData.check.mjs.
 *
 * Both of these existed inline and both were wrong in a way that hid a six-week
 * Instagram outage (2026-08-15 -> 2026-09-28) behind an empty dashboard.
 */

/**
 * A stat or card value counts as data only when it parses to a positive number.
 *
 * These fields are display STRINGS. A failed fetch fills them with "0" and
 * "N/A (Instagram impressions unavailable status 400...)", both of which are
 * non-null, so the original `!= null` test read a total failure as a success:
 * every admin page load saved a snapshot of nothing (~1,000 of them) and the
 * saved-data fallback never fired, so the page showed zeros instead of the last
 * known-good numbers.
 */
export const hasPositiveValue = (value: string | number | null | undefined): boolean => {
  if (value == null) return false;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  const parsed = Number.parseFloat(value.replace(/[$,%\s]/g, ''));
  return Number.isFinite(parsed) && parsed > 0;
};

/**
 * Only the parts of a platform result this predicate reads.
 *
 * `metrics` is `unknown` on purpose: the caller's metrics type is an interface,
 * and an interface has no implicit index signature, so declaring this as
 * `Record<string, number | null>` makes the call site a type error and fails the
 * type check Supabase runs on deploy.
 */
export interface PlatformResultShape {
  metrics?: unknown;
  contentPerformance?: Array<{ metricValue?: string | null }>;
  recentPosts?: unknown[];
  platformComparison?: { stats?: Array<{ value?: string | null }> };
}

export const platformResultHasData = (result: PlatformResultShape): boolean => {
  const metricValues =
    result.metrics && typeof result.metrics === 'object'
      ? Object.values(result.metrics as Record<string, unknown>)
      : [];
  return (
    metricValues.some(value => typeof value === 'number' && value > 0) ||
    (result.contentPerformance ?? []).some(card => hasPositiveValue(card.metricValue)) ||
    (result.recentPosts ?? []).length > 0 ||
    (result.platformComparison?.stats ?? []).some(stat => hasPositiveValue(stat.value))
  );
};

/**
 * Meta's own error code and message, pulled out of a Graph error body.
 *
 * Only the named fields, never the raw body — this string reaches metricReasons
 * and therefore the admin page, so nothing unexpected in the response rides
 * along. Returns null when the body isn't a Graph error, and the caller then
 * keeps its bare status-code message.
 */
export const describeGraphError = (body: string): string | null => {
  try {
    const graphError = JSON.parse(body)?.error;
    if (!graphError) return null;
    const parts = [
      typeof graphError.message === 'string' ? graphError.message : null,
      graphError.code != null ? `code ${graphError.code}` : null,
      graphError.error_subcode != null ? `subcode ${graphError.error_subcode}` : null,
    ].filter(Boolean) as string[];
    return parts.length > 0 ? parts.join(' — ') : null;
  } catch {
    return null;
  }
};
