export function toLocalYmd(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function toUtcYmd(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function todayLocalYmd(now = new Date()): string {
    return toLocalYmd(now);
}

/**
 * True when an event row's `event_date` falls on `dayYmd` in the user's local calendar.
 * Date-only strings from Postgres (YYYY-MM-DD) are compared literally — avoids the
 * `new Date('YYYY-MM-DD')` UTC-midnight off-by-one-day bug in US timezones.
 */
/** Start of local calendar day as ISO string (for RPC `p_min_date` TIMESTAMPTZ). */
export function localYmdToStartOfDayIso(ymd: string): string {
    const t = String(ymd).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
        const n = new Date();
        n.setHours(0, 0, 0, 0);
        return n.toISOString();
    }
    const [y, m, d] = t.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
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
 * True when `event_date` is today or later in the user's local calendar (home feed gate).
 * Missing or unparseable dates are treated as upcoming — same as legacy `!e.event_date || e.event_date >= today`.
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

export function eventRawMatchesLocalYmd(raw: unknown, dayYmd: string): boolean {
    const target = String(dayYmd).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) return false;
    const s = String(raw ?? '').trim();
    if (!s) return false;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return s === target;
    }
    const d = new Date(s);
    if (!Number.isFinite(d.getTime())) return false;
    return toLocalYmd(d) === target;
}
