import { requireRows } from "./queries.js";
import type { EventQuery } from "./nearby.js";

type QueryClient = {
  from: (table: string) => any;
  rpc?: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any[] | null; error: { message: string } | null }>;
};

export const EVENT_SELECT =
  "id, title, event_date, doors_time, venue_city, venue_state, latitude, longitude, ticket_available, ticket_urls, genres, event_status, artists(name), venues(name)";

const limitOf = (spec: EventQuery) => {
  if (spec.limit) return spec.limit;
  if (spec.kind === "city-sample" || spec.kind === "artist") return 12;
  if (spec.kind === "ids") return Math.min(spec.ids.length, 100);
  return 25;
};

/** One PostgREST call for a newsletter event spec. Callers page by date slice. */
const artistName = (value: string) => value.replace(/[%_\\]/g, " ").replace(/\s+/g, " ").trim();

export const runEventQuery = async (db: QueryClient, spec: EventQuery) => {
  const limit = limitOf(spec);
  if (spec.kind === "city-sample") {
    if (spec.until && typeof db.rpc === "function") {
      const indexed = await db.rpc("newsletter_city_sample", {
        target_city: spec.city,
        from_at: spec.from,
        until_at: spec.until,
      });
      const missing = indexed.error && /does not exist|could not find the function|schema cache/i.test(indexed.error.message);
      if (!missing) return requireRows(indexed, "Load event listings");
    }
    let sample = db.from("events").select("latitude, longitude, venue_state")
      .ilike("venue_city", spec.city).gte("event_date", spec.from).not("latitude", "is", null)
      .order("event_date", { ascending: true }).limit(limit);
    if (spec.until) sample = sample.lte("event_date", spec.until);
    return requireRows(await sample, "Load event listings");
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
  if (spec.kind === "artist") {
    const name = artistName(spec.artist);
    if (name.length < 2) return [];
    const people = requireRows(await db.from("artists").select("id").ilike("name", name).limit(8), "Load event listings");
    const ids = people.map((row: { id?: string }) => row.id).filter(Boolean);
    if (!ids.length) return [];
    return requireRows(await db.from("events").select(EVENT_SELECT).in("artist_id", ids)
      .gte("event_date", spec.from).lte("event_date", spec.until)
      .order("event_date", { ascending: true }).limit(limit), "Load event listings");
  }
  return requireRows(await query, "Load event listings");
};
