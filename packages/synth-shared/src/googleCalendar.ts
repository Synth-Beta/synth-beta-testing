import { buildShareLandingUrl } from './shareUrl.ts';

/** Default length when Synth has a start time but no end time. */
export const GOOGLE_CALENDAR_DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const GOOGLE_CALENDAR_EDIT_BASE =
  'https://calendar.google.com/calendar/r/eventedit';

export interface GoogleCalendarEventInput {
  id: string;
  title?: string | null;
  artistName?: string | null;
  /** ISO timestamptz or YYYY-MM-DD. */
  eventDate?: string | null;
  /**
   * Optional real end instant (ISO) or exclusive end calendar day (YYYY-MM-DD)
   * for multi-day / known-end events. When omitted, timed events get a 2h placeholder.
   */
  endDate?: string | null;
  /** IANA venue timezone when known (e.g. America/New_York). */
  venueTimezone?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  venueCity?: string | null;
  venueState?: string | null;
  description?: string | null;
  /** Site origin used to build the Synth share link in the description. */
  siteUrl: string;
}

export interface GoogleCalendarBuildResult {
  url: string;
  /** True when dates are all-day (no reliable start time). */
  allDay: boolean;
  text: string;
  dates: string;
  location: string;
  details: string;
  ctz?: string;
}

function trimOrEmpty(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Artist + event title without repeating the artist when the title already includes it. */
export function buildGoogleCalendarTitle(
  artistName?: string | null,
  eventTitle?: string | null
): string {
  const artist = trimOrEmpty(artistName);
  const title = trimOrEmpty(eventTitle);
  if (!artist && !title) return 'Synth Event';
  if (!artist) return title;
  if (!title) return artist;

  const artistLower = artist.toLowerCase();
  const titleLower = title.toLowerCase();
  if (
    titleLower === artistLower ||
    titleLower.startsWith(`${artistLower} `) ||
    titleLower.startsWith(`${artistLower}:`) ||
    titleLower.startsWith(`${artistLower} -`) ||
    titleLower.startsWith(`${artistLower} –`) ||
    titleLower.startsWith(`${artistLower} —`) ||
    titleLower.includes(` ${artistLower} `) ||
    titleLower.endsWith(` ${artistLower}`)
  ) {
    return title;
  }
  return `${artist} – ${title}`;
}

export function buildGoogleCalendarLocation(input: {
  venueName?: string | null;
  venueAddress?: string | null;
  venueCity?: string | null;
  venueState?: string | null;
}): string {
  const parts = [
    trimOrEmpty(input.venueName),
    trimOrEmpty(input.venueAddress),
    [trimOrEmpty(input.venueCity), trimOrEmpty(input.venueState)].filter(Boolean).join(', '),
  ].filter(Boolean);
  return parts.join(', ');
}

export function buildGoogleCalendarDetails(input: {
  artistName?: string | null;
  title?: string | null;
  description?: string | null;
  eventUrl: string;
}): string {
  const lines: string[] = [];
  const artist = trimOrEmpty(input.artistName);
  const title = trimOrEmpty(input.title);
  if (artist) lines.push(`Artist: ${artist}`);
  if (title && title.toLowerCase() !== artist.toLowerCase()) lines.push(`Event: ${title}`);
  const desc = trimOrEmpty(input.description);
  if (desc) lines.push('', desc);
  lines.push('', `View on Synth: ${input.eventUrl}`);
  return lines.join('\n').trim();
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

type ZonedParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

function zonedDateTimeParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const map: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  // Some engines emit "24" for midnight under hourCycle h23.
  const hour = map.hour === '24' ? '00' : map.hour;
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour,
    minute: map.minute,
    second: map.second,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatUtcCompact(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  );
}

function formatLocalCompact(parts: ZonedParts): string {
  return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}`;
}

function formatYmdCompact(ymd: string): string {
  return ymd.replace(/-/g, '');
}

function addCalendarDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/**
 * True when `raw` is a calendar date without a usable wall-clock start time.
 * Matches Synth's YYYY-MM-DD handling in localYmd — we do not invent a start time.
 */
export function isDateOnlyEventDate(raw: string | null | undefined): boolean {
  const s = trimOrEmpty(raw);
  if (!s) return true;
  return DATE_ONLY_RE.test(s);
}

/**
 * Builds a Google Calendar "create event" URL (TEMPLATE) with prefilled fields.
 * No OAuth — opens the public eventedit page for the user to review and Save.
 */
export function buildGoogleCalendarUrl(
  input: GoogleCalendarEventInput
): GoogleCalendarBuildResult | null {
  const eventDateRaw = trimOrEmpty(input.eventDate);
  if (!eventDateRaw) return null;

  const text = buildGoogleCalendarTitle(input.artistName, input.title);
  const location = buildGoogleCalendarLocation(input);
  const eventUrl = buildShareLandingUrl(input.siteUrl, 'event', input.id);
  const details = buildGoogleCalendarDetails({
    artistName: input.artistName,
    title: input.title,
    description: input.description,
    eventUrl,
  });

  const allDay = isDateOnlyEventDate(eventDateRaw);
  const params = new URLSearchParams();
  params.set('action', 'TEMPLATE');
  params.set('text', text);
  if (details) params.set('details', details);
  if (location) params.set('location', location);

  let dates: string;
  let ctz: string | undefined;

  if (allDay) {
    const startYmd = eventDateRaw;
    const endRaw = trimOrEmpty(input.endDate);
    // Google all-day end is exclusive.
    const endYmd = endRaw && DATE_ONLY_RE.test(endRaw)
      ? endRaw > startYmd
        ? endRaw
        : addCalendarDays(startYmd, 1)
      : addCalendarDays(startYmd, 1);
    dates = `${formatYmdCompact(startYmd)}/${formatYmdCompact(endYmd)}`;
    params.set('dates', dates);
  } else {
    const start = new Date(eventDateRaw);
    if (!Number.isFinite(start.getTime())) return null;

    const endRaw = trimOrEmpty(input.endDate);
    let end: Date;
    if (endRaw && !DATE_ONLY_RE.test(endRaw)) {
      const parsedEnd = new Date(endRaw);
      end =
        Number.isFinite(parsedEnd.getTime()) && parsedEnd.getTime() > start.getTime()
          ? parsedEnd
          : new Date(start.getTime() + GOOGLE_CALENDAR_DEFAULT_DURATION_MS);
    } else {
      end = new Date(start.getTime() + GOOGLE_CALENDAR_DEFAULT_DURATION_MS);
    }

    const tz = trimOrEmpty(input.venueTimezone);
    if (tz && isValidTimeZone(tz)) {
      ctz = tz;
      dates = `${formatLocalCompact(zonedDateTimeParts(start, tz))}/${formatLocalCompact(
        zonedDateTimeParts(end, tz)
      )}`;
      params.set('dates', dates);
      params.set('ctz', tz);
    } else {
      // Absolute UTC instants — Google converts to the user's calendar timezone.
      dates = `${formatUtcCompact(start)}/${formatUtcCompact(end)}`;
      params.set('dates', dates);
    }
  }

  return {
    url: `${GOOGLE_CALENDAR_EDIT_BASE}?${params.toString()}`,
    allDay,
    text,
    dates,
    location,
    details,
    ctz,
  };
}
