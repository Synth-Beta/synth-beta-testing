const STATE_TIME_ZONE: Record<string, string> = {
  AL: "America/Chicago",
  AK: "America/Anchorage",
  AZ: "America/Phoenix",
  AR: "America/Chicago",
  CA: "America/Los_Angeles",
  CO: "America/Denver",
  CT: "America/New_York",
  DC: "America/New_York",
  DE: "America/New_York",
  FL: "America/New_York",
  GA: "America/New_York",
  HI: "Pacific/Honolulu",
  IA: "America/Chicago",
  ID: "America/Boise",
  IL: "America/Chicago",
  IN: "America/Indiana/Indianapolis",
  KS: "America/Chicago",
  KY: "America/New_York",
  LA: "America/Chicago",
  MA: "America/New_York",
  MD: "America/New_York",
  ME: "America/New_York",
  MI: "America/Detroit",
  MN: "America/Chicago",
  MO: "America/Chicago",
  MS: "America/Chicago",
  MT: "America/Denver",
  NC: "America/New_York",
  ND: "America/Chicago",
  NE: "America/Chicago",
  NH: "America/New_York",
  NJ: "America/New_York",
  NM: "America/Denver",
  NV: "America/Los_Angeles",
  NY: "America/New_York",
  OH: "America/New_York",
  OK: "America/Chicago",
  OR: "America/Los_Angeles",
  PA: "America/New_York",
  RI: "America/New_York",
  SC: "America/New_York",
  SD: "America/Chicago",
  TN: "America/Chicago",
  TX: "America/Chicago",
  UT: "America/Denver",
  VA: "America/New_York",
  VT: "America/New_York",
  WA: "America/Los_Angeles",
  WI: "America/Chicago",
  WV: "America/New_York",
  WY: "America/Denver",
};

export {
  SEND_TIME_ZONE,
  editionCalendarDate,
  editionSendAt,
  isNewsletterGenerateWindow,
  isNewsletterSendWindow,
  nextEditionDate,
  sendZoneParts,
} from "../../../../../api/_lib/newsletterSchedule";

import { SEND_TIME_ZONE, editionCalendarDate, isNewsletterSendWindow, sendZoneParts } from "../../../../../api/_lib/newsletterSchedule";

/** @deprecated Use sendZoneParts — kept for existing call sites. */
export const centralParts = (now: Date) => {
  const { year, month, day, hour, minute } = sendZoneParts(now);
  return { year, month, day, hour, minute };
};

/** @deprecated Use isNewsletterSendWindow. */
export const isTenAmCentral = isNewsletterSendWindow;

/** @deprecated Use editionCalendarDate. */
export const centralCalendarDate = editionCalendarDate;

export const timeZoneForState = (state?: string | null) => {
  if (!state) return "America/New_York";
  const raw = state.trim();
  const key = STATE_TIME_ZONE[raw.toUpperCase()] ? raw.toUpperCase() : STATE_NAMES[raw.toLowerCase()];
  return (key && STATE_TIME_ZONE[key]) || "America/New_York";
};

export const formatIssueDate = (isoDate: string) => {
  const [year, month, day] = isoDate.split("-").map(Number);
  // Noon UTC keeps the calendar date stable across Eastern offsets.
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: SEND_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY",
  louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
  "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA",
  washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

const calendarDate = (eventDate: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDate.trim());
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 16));
};

export const formatEventWhen = (eventDate: string, state?: string | null, doorsTime?: string | null) => {
  const instant = calendarDate(eventDate) ?? new Date(eventDate);
  if (Number.isNaN(instant.getTime())) return "";
  const timeZone = timeZoneForState(state);
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
    day: "numeric",
  }).format(instant);
  let doors = "";
  if (doorsTime && /^\d{2}:\d{2}/.test(doorsTime)) {
    const [hour, minute] = doorsTime.split(":").map(Number);
    const suffix = hour >= 12 ? "p.m." : "a.m.";
    const hour12 = hour % 12 || 12;
    doors = minute ? `${hour12}:${String(minute).padStart(2, "0")} ${suffix}` : `${hour12} ${suffix}`;
  }
  return doors ? `${date} · Doors ${doors}` : date;
};

export const isUpcoming = (eventDate: string, sendAt: Date, state?: string | null) => {
  if (calendarDate(eventDate)) {
    const sendDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZoneForState(state),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(sendAt);
    return eventDate.trim().slice(0, 10) > sendDay;
  }
  const instant = new Date(eventDate);
  return !Number.isNaN(instant.getTime()) && instant.getTime() > sendAt.getTime();
};

export const calendarDay = (instant: Date, state?: string | null) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZoneForState(state),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);

const shiftIsoDate = (isoDate: string, days: number) => {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};

const weekdayIndex = (isoDate: string, timeZone: string) => {
  const [year, month, day] = isoDate.split("-").map(Number);
  const instant = new Date(Date.UTC(year, month - 1, day, 16));
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(instant);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
};

/** Friday–Sunday that already happened before this send. A Friday send uses the previous weekend. */
export const recentWeekend = (sendAt: Date, state?: string | null) => {
  const timeZone = timeZoneForState(state);
  const sendDay = calendarDay(sendAt, state);
  const dow = weekdayIndex(sendDay, timeZone);
  const end = dow === 0 || dow === 6 ? sendDay : shiftIsoDate(sendDay, -dow);
  const start = shiftIsoDate(end, dow === 6 ? -1 : -2);
  return { start, end };
};

export const daysBetween = (laterDay: string, earlierDay: string) => {
  const later = Date.parse(`${laterDay.slice(0, 10)}T00:00:00Z`);
  const earlier = Date.parse(`${earlierDay.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(later) || !Number.isFinite(earlier)) return Number.POSITIVE_INFINITY;
  return Math.round((later - earlier) / 86400000);
};
