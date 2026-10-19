import { requireRows } from "./queries.js";
import { artistTitlePattern, type EventQuery } from "./nearby.js";

export const EVENT_SELECT =
  "id, title, event_date, doors_time, venue_city, venue_state, latitude, longitude, ticket_available, ticket_urls, genres, event_status, artists(name), venues(name)";

const limitOf = (spec: EventQuery) => {
  if (spec.limit) return spec.limit;
  if (spec.kind === "city-sample" || spec.kind === "artist") return 12;
  if (spec.kind === "ids") return Math.min(spec.ids.length, 100);
  return 25;
};

/** One PostgREST call for a newsletter event spec. Callers page by date slice. */
export const runEventQuery = async (db: { from: (table: string) => any }, spec: EventQuery) => {
  const limit = limitOf(spec);
  if (spec.kind === "city-sample") {
    const rows = await db.from("events").select("latitude, longitude, venue_state")
      .ilike("venue_city", spec.city).gte("event_date", spec.from).not("latitude", "is", null)
      .order("event_date", { ascending: true }).limit(limit);
    return requireRows(rows, "Load event listings");
  }
  if (spec.kind === "ids") {
    if (!spec.ids.length) return [];
    const rows = await db.from("events").select(EVENT_SELECT).in("id", spec.ids.slice(0, limit));
    return requireRows(rows, "Load saved events");
  }
  let query = db.from("events").select(EVENT_SELECT).gte("event_date", spec.from).lte("event_date", spec.until)
    .order("event_date", { ascending: true }).limit(limit);
  if (spec.kind === "city") query = query.ilike("venue_city", spec.city);
  if (spec.kind === "box") {
    query = query.gte("latitude", spec.minLat).lte("latitude", spec.maxLat)
      .gte("longitude", spec.minLng).lte("longitude", spec.maxLng);
  }
  if (spec.kind === "artist") query = query.ilike("title", artistTitlePattern(spec.artist));
  return requireRows(await query, "Load event listings");
};
