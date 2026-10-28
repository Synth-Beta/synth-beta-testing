/** Monday 10:00 America/New_York send; Monday 9:00 generate. UTC crons cover both DST offsets. */

export const SEND_TIME_ZONE = "America/New_York";

/** UTC hours that can land on 10:00 Eastern (EDT=14, EST=15). */
export const SEND_UTC_HOURS = [14, 15] as const;
/** UTC hours that can land on 9:00 Eastern (EDT=13, EST=14). */
export const GENERATE_UTC_HOURS = [13, 14] as const;

const ymd = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const addDays = (year: number, month: number, day: number, days: number) => {
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
};

export const sendZoneParts = (now: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SEND_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((item) => item.type === type)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: get("weekday"),
  };
};

const isMonday = (parts: ReturnType<typeof sendZoneParts>) => parts.weekday === "Mon";

const inHourWindow = (parts: ReturnType<typeof sendZoneParts>, hour: number) =>
  parts.hour === hour && parts.minute < 15;

/** True during the first 15 minutes of Monday 10:00 America/New_York. */
export const isNewsletterSendWindow = (now: Date) => {
  const parts = sendZoneParts(now);
  return isMonday(parts) && inHourWindow(parts, 10);
};

/** True during the first 15 minutes of Monday 9:00 America/New_York. */
export const isNewsletterGenerateWindow = (now: Date) => {
  const parts = sendZoneParts(now);
  return isMonday(parts) && inHourWindow(parts, 9);
};

export const editionCalendarDate = (now: Date) => {
  const current = sendZoneParts(now);
  return ymd(current.year, current.month, current.day);
};

/**
 * Calendar date of the next Monday 10:00 America/New_York send.
 * During that send window the date is today; after 10:15 Monday it rolls to next Monday.
 */
export const nextEditionDate = (now: Date) => {
  const current = sendZoneParts(now);
  const pastSend =
    !isMonday(current)
    || current.hour > 10
    || (current.hour === 10 && current.minute >= 15);
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(current.weekday);
  const daysUntilMonday = pastSend
    ? ((8 - weekdayIndex) % 7 || 7)
    : 0;
  const date = daysUntilMonday
    ? addDays(current.year, current.month, current.day, daysUntilMonday)
    : current;
  return ymd(date.year, date.month, date.day);
};

/** Resolve 10 a.m. Eastern on the edition date, including the DST offset. */
export const editionSendAt = (editionDate: string) => {
  for (const hour of SEND_UTC_HOURS) {
    const candidate = new Date(`${editionDate}T${String(hour).padStart(2, "0")}:00:00.000Z`);
    if (isNewsletterSendWindow(candidate)) return candidate;
  }
  throw new Error("Invalid newsletter edition date (expected a Monday).");
};
