import { loadEventsNearPlaces, placeKey, type EventQuery } from "../../../../../supabase/functions/newsletter-send/nearby";
import { fetchMusicNews } from "../../../../../supabase/functions/newsletter-send/news";
import { composeEdition } from "./compose";
import { renderEditionHtml } from "./render";
import { contentHash } from "./gate";
import { nextEditionDate } from "./time";
import type { ComposedEdition, EditionEvent, EditionListen, EditionNews, EditionReader, EditionReview } from "./types";

type Db = { from: (table: string) => any };

export interface GeneratedDraft {
  userId: string;
  email: string;
  name: string;
  subject: string;
  preheader: string;
  html: string;
  contentHash: string;
  sources: ComposedEdition["sources"];
}

const httpUrl = (value?: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const RESALE_HOST = /stubhub|viagogo|vividseats|tickpick/i;

const officialTicketUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    const wrapped = parsed.searchParams.get("u") || parsed.searchParams.get("destination");
    const destination = wrapped ? httpUrl(wrapped) : null;
    if (destination && !RESALE_HOST.test(destination)) return destination;
  } catch {
    return value;
  }
  return value;
};

const firstTicketUrl = (value: unknown) => {
  const urls: string[] = [];
  const list = Array.isArray(value) ? value : value ? [value] : [];
  for (const item of list) {
    const url = httpUrl(typeof item === "string" ? item : null);
    if (url) urls.push(officialTicketUrl(url));
  }
  return urls.find((url) => !RESALE_HOST.test(url)) ?? urls[0] ?? null;
};

const toEvent = (row: any): EditionEvent | null => {
  const artistName = row.artist_name || row.artists?.name;
  const venueName = row.venue_name || row.venues?.name;
  const ticketUrl = firstTicketUrl(row.ticket_urls);
  const status = String(row.event_status ?? "");
  if (/cancel/i.test(status)) return null;
  if (!ticketUrl || !artistName || !venueName || !row.venue_city || !row.event_date) return null;
  const soldOut = /sold.?out/i.test(status);
  return {
    id: String(row.id),
    artistName: String(artistName),
    venueName: String(venueName),
    city: String(row.venue_city),
    state: row.venue_state ?? null,
    eventDate: String(row.event_date),
    doorsTime: row.doors_time ?? null,
    ticketAvailable: row.ticket_available === true ? true : soldOut ? false : null,
    ticketUrl,
    genres: Array.isArray(row.genres) ? row.genres.map(String) : [],
    latitude: coordinate(row.latitude),
    longitude: coordinate(row.longitude),
  };
};

const coordinate = (value: unknown) => {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const chunk = <T,>(items: T[], size: number) => {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
};

const firstNameOf = (name?: string | null, username?: string | null) => {
  const fromName = name?.trim().split(/\s+/)[0];
  if (fromName) return fromName;
  const handle = username?.trim();
  return handle || null;
};

export const generateDraftsFromSource = async (
  source: {
    users: any[];
    news: any[];
    reviews: any[];
    stats: any[];
    events: any[];
    publicFives: any[];
  },
  now = new Date()
): Promise<{
  editionDate: string;
  retrievedAt: string;
  drafts: GeneratedDraft[];
  held: number;
}> => {
  const editionDate = nextEditionDate(now);
  const retrievedAt = now.toISOString();
  const news: EditionNews[] = (source.news ?? [])
    .filter((row) => httpUrl(row.url) && row.title)
    .map((row) => ({
      id: String(row.id),
      title: String(row.title),
      url: String(row.url),
      source: row.source ?? null,
      publishedAt: String(row.publishedAt ?? row.created_at),
    }));
  const reviewsByUser = new Map<string, EditionReview[]>();
  for (const row of source.reviews ?? []) {
    const artistName = row.artistName ?? row.artists?.name;
    const userId = row.userId ?? row.user_id;
    if (!artistName || !userId) continue;
    const list = reviewsByUser.get(userId) ?? [];
    if (list.length >= 8) continue;
    list.push({
      artistName,
      venueName: row.venueName ?? row.venues?.name ?? null,
      eventDate: row.eventDate ?? row.Event_date ?? null,
      rating: row.rating ?? null,
      text: row.text ?? (row.review_text && row.review_text !== "ATTENDANCE_ONLY" ? row.review_text : null),
    });
    reviewsByUser.set(userId, list);
  }
  const artistsByUser = new Map<string, string[]>();
  const genresByUser = new Map<string, string[]>();
  const listensByUser = new Map<string, EditionListen[]>();
  for (const row of source.stats ?? []) {
    const userId = row.userId ?? row.user_id;
    const artists = Array.isArray(row.topArtists)
      ? row.topArtists.map(String)
      : Array.isArray(row.top_artists)
        ? row.top_artists.map((artist: any) => String(artist.name || "")).filter(Boolean)
        : [];
    const genres = Array.isArray(row.genres)
      ? row.genres.map(String)
      : Array.isArray(row.top_genres)
        ? row.top_genres.map((genre: any) => String(genre.genre || genre.name || "")).filter(Boolean)
        : [];
    artistsByUser.set(userId, artists.slice(0, 8));
    genresByUser.set(userId, genres.slice(0, 6));
    listensByUser.set(userId, (row.listens ?? artists.slice(0, 2).map((artistName: string) => ({ artistName }))).slice(0, 2));
  }
  const events: EditionEvent[] = [];
  const seen = new Set<string>();
  for (const row of source.events ?? []) {
    const mapped = row.artistName ? (row as EditionEvent) : toEvent(row);
    if (!mapped?.ticketUrl || seen.has(mapped.id)) continue;
    seen.add(mapped.id);
    events.push(mapped);
  }
  const fiveStarArtists = new Map<string, Set<string>>();
  for (const row of source.publicFives ?? []) {
    const artistName = row.artistName ?? row.artists?.name;
    const userId = row.userId ?? row.user_id;
    if (!artistName || !userId) continue;
    const set = fiveStarArtists.get(String(artistName).toLowerCase()) ?? new Set<string>();
    set.add(userId);
    fiveStarArtists.set(String(artistName).toLowerCase(), set);
  }

  const drafts: GeneratedDraft[] = [];
  let held = 0;
  for (const user of source.users ?? []) {
    const userId = user.userId ?? user.user_id;
    const email = String(user.email ?? "").trim().toLowerCase();
    if (!userId || !email.includes("@")) continue;
    const reviews = reviewsByUser.get(userId) ?? [];
    const reader: EditionReader = {
      userId,
      email,
      firstName: firstNameOf(user.name, user.username),
      city: user.city ?? user.location_city ?? null,
      state: user.state ?? user.location_state ?? null,
      latitude: coordinate(user.latitude),
      longitude: coordinate(user.longitude),
      reviews,
      lifetimeShowCount: reviews.length < 8 ? reviews.length : 0,
      fiveStarCount: reviews.length < 8 ? reviews.filter((review) => (review.rating ?? 0) >= 5).length : 0,
      topArtists: artistsByUser.get(userId) ?? [],
      genres: genresByUser.get(userId) ?? [],
      otherFiveStarArtists: reviews
        .filter((review) => (review.rating ?? 0) >= 5)
        .map((review) => review.artistName)
        .filter((artist) => {
          const set = fiveStarArtists.get(artist.toLowerCase());
          return Boolean(set && [...set].some((id) => id !== userId));
        }),
    };
    const composed = composeEdition({
      reader,
      events,
      news,
      listens: listensByUser.get(userId) ?? [],
      sendAt: now,
      editionDate,
      issueNumber: 1,
      retrievedAt,
    });
    if (!composed) {
      held += 1;
      continue;
    }
    const html = renderEditionHtml(composed);
    drafts.push({
      userId,
      email,
      name: user.name || reader.firstName || email,
      subject: composed.subject,
      preheader: composed.preheader,
      html,
      contentHash: await contentHash(composed.subject, html),
      sources: composed.sources,
    });
  }
  return { editionDate, retrievedAt, drafts, held };
};

export const generateEditionDrafts = async (db: Db, now = new Date()) => {
  const { data: users, error: userError } = await db
    .from("users")
    .select("user_id, email, name, username, location_city, location_state, account_status, is_bot")
    .eq("account_status", "active")
    .or("is_bot.is.false,is_bot.is.null")
    .not("email", "is", null);
  if (userError) throw new Error(userError.message);

  const { data: unsubscribes } = await db.from("newsletter_unsubscribes").select("email");
  const unsubscribed = new Set((unsubscribes ?? []).map((row: any) => String(row.email).trim().toLowerCase()));
  const recipients = (users ?? []).filter((user: any) => {
    const email = String(user.email ?? "").trim().toLowerCase();
    return email.includes("@") && !unsubscribed.has(email);
  });

  const rss = await fetchMusicNews(now);
  const { data: storedNews } = await db
    .from("news_items")
    .select("id, title, url, source, created_at")
    .order("created_at", { ascending: false })
    .limit(40);
  const news = [...rss, ...(storedNews ?? [])];

  const userIds = recipients.map((user: any) => user.user_id);
  const reviews: any[] = [];
  const stats: any[] = [];
  for (const ids of chunk(userIds, 40)) {
    if (!ids.length) continue;
    const { data: reviewRows } = await db
      .from("reviews")
      .select("user_id, rating, review_text, Event_date, artists(name), venues(name)")
      .in("user_id", ids)
      .eq("is_draft", false)
      .order("Event_date", { ascending: false })
      .limit(400);
    reviews.push(...(reviewRows ?? []));
    const { data: statsRows } = await db
      .from("user_streaming_stats_summary")
      .select("user_id, top_artists, top_genres")
      .in("user_id", ids);
    stats.push(...(statsRows ?? []));
  }

  const artistNames = [...new Set(userIds.flatMap((id: string) => {
    const reviewArtists = reviews
      .filter((row) => row.user_id === id)
      .slice(0, 2)
      .map((row) => row.artists?.name)
      .filter(Boolean);
    const stat = stats.find((row) => row.user_id === id);
    const listening = Array.isArray(stat?.top_artists) ? stat.top_artists.slice(0, 3).map((artist: any) => artist.name) : [];
    return [...listening, ...reviewArtists];
  }))].slice(0, 40);
  const places = [...new Map(recipients.map((user: any) => {
    const city = String(user.location_city || "").trim();
    return [placeKey(city, user.location_state), { city, state: user.location_state ?? null }];
  })).values()].filter((place) => place.city).slice(0, 30);
  const eventSelect = "id, title, event_date, doors_time, venue_city, venue_state, latitude, longitude, ticket_available, ticket_urls, genres, event_status, artists(name), venues(name)";
  const loaded = await loadEventsNearPlaces(places, artistNames, now, async (spec: EventQuery) => {
    if (spec.kind === "city-sample") {
      const { data } = await db.from("events").select("latitude, longitude, venue_state").ilike("venue_city", spec.city).gte("event_date", spec.from).not("latitude", "is", null).limit(12);
      return data ?? [];
    }
    if (spec.kind === "box") {
      const { data } = await db.from("events").select(eventSelect).gte("latitude", spec.minLat).lte("latitude", spec.maxLat).gte("longitude", spec.minLng).lte("longitude", spec.maxLng).gte("event_date", spec.from).lte("event_date", spec.until).order("event_date", { ascending: true }).limit(40);
      return data ?? [];
    }
    const { data } = await db.from("events").select(eventSelect).ilike("title", `%${spec.artist}%`).gte("event_date", spec.from).lte("event_date", spec.until).order("event_date", { ascending: true }).limit(8);
    return data ?? [];
  });
  const events = loaded.events;
  const usersWithLocation = recipients.map((user: any) => {
    const center = loaded.centers.get(placeKey(user.location_city, user.location_state));
    return { ...user, latitude: center?.latitude ?? null, longitude: center?.longitude ?? null };
  });

  const { data: publicFives } = await db
    .from("reviews")
    .select("user_id, artists(name)")
    .eq("is_public", true)
    .eq("is_draft", false)
    .gte("rating", 5)
    .limit(300);

  return generateDraftsFromSource({ users: usersWithLocation, news, reviews, stats, events, publicFives: publicFives ?? [] }, now);
};
