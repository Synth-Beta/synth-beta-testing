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
