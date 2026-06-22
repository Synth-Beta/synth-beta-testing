export function toLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayLocalYmd(now = new Date()): string {
  return toLocalYmd(now);
}

/** Local calendar yyyy-mm-dd for an event row `event_date` value. */
export function eventDateToLocalYmd(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return toLocalYmd(d);
}

/**
 * Upcoming home-feed gate: today or later in the user's local calendar.
 * Date-only Postgres strings (YYYY-MM-DD) compare literally (no UTC off-by-one).
 */
export function isEventUpcomingLocalDay(raw: unknown, now = new Date()): boolean {
  const ymd = eventDateToLocalYmd(raw);
  if (!ymd) return true;
  return ymd >= todayLocalYmd(now);
}

/** Stricter gate for feeds — excludes past and rows without a parseable date. */
export function isEventUpcomingForFeed(raw: unknown, now = new Date()): boolean {
  const ymd = eventDateToLocalYmd(raw);
  if (!ymd) return false;
  return ymd >= todayLocalYmd(now);
}
