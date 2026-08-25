/**
 * DC local calendar week helpers + featured-set constants (LOI-566).
 * Week boundary: Monday 00:00 America/New_York.
 */

export const FEATURED_METRO_DC = 'dc' as const;
export const FEATURED_MIN = 10;
export const FEATURED_MAX = 15;
export const FEATURED_TARGET = 12;

/** Demo / density sprint week (LOI-585 / LOI-646). Home + Discover pin this SoT week. */
export const DEMO_FEATURED_WEEK_ID = '2026-W35' as const;
export const DEMO_FEATURED_WEEK_START = '2026-08-24' as const;

export type FeaturedMetro = typeof FEATURED_METRO_DC;
export type FeaturedSetStatus = 'draft' | 'published' | 'archived';

/** Stable chat provisioning key for Messages / featured-show chats. */
export function featuredShowChatKey(weekId: string, eventId: string): string {
  return `featured_show:${weekId}:${eventId}`;
}

/**
 * Monday date (YYYY-MM-DD) of the DC calendar week containing `at`.
 * Uses America/New_York civil date (DST-safe via Intl).
 */
export function dcWeekStartDate(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(at);

  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const weekday = get('weekday'); // Sun, Mon, ...

  // Build a UTC noon anchor for that civil date to avoid DST edge flips.
  const civil = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dowMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dow = dowMap[weekday || 'Mon'] ?? 1;
  const daysFromMonday = (dow + 6) % 7;
  civil.setUTCDate(civil.getUTCDate() - daysFromMonday);

  const y = civil.getUTCFullYear();
  const m = String(civil.getUTCMonth() + 1).padStart(2, '0');
  const d = String(civil.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** ISO-like week id for DC local week: YYYY-Www (based on Monday week start). */
export function dcWeekId(at: Date = new Date()): string {
  const start = dcWeekStartDate(at);
  const [y, m, d] = start.split('-').map(Number);
  const monday = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

  // ISO week: week 1 is the week with the year's first Thursday.
  const dayNum = monday.getUTCDay() || 7;
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week =
    Math.floor(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7) + 1;
  const isoYear = thursday.getUTCFullYear();
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

export type FeaturedPinInput = {
  eventId: string;
  position?: number;
  genre?: string | null;
  curatorNote?: string | null;
};

export type FeaturedSetValidation =
  | { ok: true; count: number; genres: string[] }
  | { ok: false; error: string; count: number; genres: string[] };

export function validateFeaturedPins(
  pins: FeaturedPinInput[],
  opts: { forPublish?: boolean } = {}
): FeaturedSetValidation {
  const forPublish = opts.forPublish ?? false;
  const count = pins.length;
  const genres = [
    ...new Set(
      pins
        .map((p) => (p.genre || '').trim().toLowerCase())
        .filter(Boolean)
    ),
  ];

  if (count > FEATURED_MAX) {
    return {
      ok: false,
      error: `Hard cap is ${FEATURED_MAX} shows (got ${count})`,
      count,
      genres,
    };
  }

  const ids = pins.map((p) => p.eventId);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: 'Duplicate event ids in featured set', count, genres };
  }

  if (forPublish) {
    if (count < FEATURED_MIN || count > FEATURED_MAX) {
      return {
        ok: false,
        error: `Published set must have ${FEATURED_MIN}–${FEATURED_MAX} shows (got ${count})`,
        count,
        genres,
      };
    }
    if (genres.length === 1) {
      return {
        ok: false,
        error: 'Published set must mix genres within the week',
        count,
        genres,
      };
    }
  }

  return { ok: true, count, genres };
}
