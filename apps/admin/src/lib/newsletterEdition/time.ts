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

export const SEND_TIME_ZONE = "America/Chicago";

export const timeZoneForState = (state?: string | null) => {
  if (!state) return "America/New_York";
  const raw = state.trim();
  const key = STATE_TIME_ZONE[raw.toUpperCase()] ? raw.toUpperCase() : STATE_NAMES[raw.toLowerCase()];
  return (key && STATE_TIME_ZONE[key]) || "America/New_York";
};

export const centralParts = (now: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SEND_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
};

export const isTenAmCentral = (now: Date) => {
  const { hour, minute } = centralParts(now);
  return hour === 10 && minute < 15;
};

const ymd = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const addDays = (year: number, month: number, day: number, days: number) => {
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
};

export const centralCalendarDate = (now: Date) => {
  const current = centralParts(now);
  return ymd(current.year, current.month, current.day);
};

/** Calendar date of the next 10:00 America/Chicago send. At 10:00 the date is today. */
export const nextEditionDate = (now: Date) => {
  const current = centralParts(now);
  const rolled = current.hour > 10 || (current.hour === 10 && current.minute >= 15);
  const date = rolled ? addDays(current.year, current.month, current.day, 1) : current;
  return ymd(date.year, date.month, date.day);
};

export const formatIssueDate = (isoDate: string) => {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 15));
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
