import { requireRows } from "./queries.js";
import type { EventQuery } from "./nearby.js";

type QueryClient = {
  from: (table: string) => any;
  rpc?: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any[] | null; error: { message: string } | null }>;
};

export const EVENT_SELECT =
  "id, title, event_date, doors_time, venue_city, venue_state, latitude, longitude, ticket_available, ticket_urls, genres, event_status, artists(name), venues(name)";

/** Listing filters stay on events columns. Names are attached after the limit. */
const EVENT_COLUMNS =
  "id, title, event_date, doors_time, venue_city, venue_state, latitude, longitude, ticket_available, ticket_urls, genres, event_status, artist_id, venue_id";

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
  if (spec.kind === "artist") {
    const name = artistName(spec.artist);
    if (name.length < 2) return [];
    const people = requireRows(await db.from("artists").select("id").ilike("name", name).limit(8), "Load event listings");
    const ids = people.map((row: { id?: string }) => row.id).filter(Boolean);
    if (!ids.length) return [];
    const rows = requireRows(await db.from("events").select(EVENT_COLUMNS).in("artist_id", ids)
      .gte("event_date", spec.from).lte("event_date", spec.until)
      .order("event_date", { ascending: true }).limit(limit), "Load event listings");
    return attachNames(db, rows);
  }
  if (spec.kind === "box") {
    const rows = requireRows(await db.from("events").select(EVENT_COLUMNS)
      .gte("latitude", spec.minLat).lte("latitude", spec.maxLat)
      .gte("longitude", spec.minLng).lte("longitude", spec.maxLng)
      .gte("event_date", spec.from).lte("event_date", spec.until)
      .order("latitude", { ascending: true }).limit(limit), "Load event listings");
    return attachNames(db, rows);
  }
  const rows = requireRows(await db.from("events").select(EVENT_COLUMNS)
    .ilike("venue_city", spec.city)
    .gte("event_date", spec.from).lte("event_date", spec.until)
    .limit(limit), "Load event listings");
  return attachNames(db, rows);
};

const attachNames = async (db: QueryClient, rows: any[]) => {
  const artistIds = [...new Set(rows.filter((row) => row.artist_id && !row.artists?.name && !row.artist_name).map((row) => row.artist_id))];
  const venueIds = [...new Set(rows.filter((row) => row.venue_id && !row.venues?.name && !row.venue_name).map((row) => row.venue_id))];
  const artistNames = new Map<string, string>();
  const venueNames = new Map<string, string>();
  if (artistIds.length) {
    for (const person of requireRows(await db.from("artists").select("id, name").in("id", artistIds), "Load event listings")) {
      if (person?.name) artistNames.set(person.id, person.name);
    }
  }
  if (venueIds.length) {
    for (const place of requireRows(await db.from("venues").select("id, name").in("id", venueIds), "Load event listings")) {
      if (place?.name) venueNames.set(place.id, place.name);
    }
  }
  return rows.map((row) => ({
    ...row,
    artists: row.artists?.name ? row.artists : artistNames.has(row.artist_id) ? { name: artistNames.get(row.artist_id) } : row.artists,
    venues: row.venues?.name ? row.venues : venueNames.has(row.venue_id) ? { name: venueNames.get(row.venue_id) } : row.venues,
  }));
};
