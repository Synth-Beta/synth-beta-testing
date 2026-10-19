import { historyArtists } from "../../../../../supabase/functions/newsletter-send/editorial";
import { runEventQuery } from "../../../../../supabase/functions/newsletter-send/eventQuery";
import { lookupRecordings } from "../../../../../supabase/functions/newsletter-send/tracks";
import { loadEventsNearPlaces, placeKey, withHubPlaces, type EventQuery } from "../../../../../supabase/functions/newsletter-send/nearby";
import { fetchMusicNews } from "../../../../../supabase/functions/newsletter-send/news";
import { readAll, requireRows, enrichReviewArtists, loadListeningStats, loadTasteSignals } from "../../../../../supabase/functions/newsletter-send/queries";
import { composeEdition } from "./compose";
import { renderEditionHtml } from "./render";
import { contentHash } from "./gate";
import { nextEditionDate, editionSendAt } from "./time";
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

const RESALE_HOST = /stubhub|viagogo|vivid[-.]?seats|tickpick|gametime|seatgeek/i;

const unwrapTicketUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    const wrapped = parsed.searchParams.get("u") || parsed.searchParams.get("url") || parsed.searchParams.get("destination");
    const destination = wrapped ? httpUrl(wrapped) : null;
    if (destination) return destination;
  } catch {
    return value;
  }
  return value;
};

const ticketRank = (value: string) => {
  const host = new URL(value).host.toLowerCase();
  if (RESALE_HOST.test(host)) return 9;
  if (/ticketmaster|axs\.com|dice\.fm|eventbrite|etix|tixr|seetickets|universe\.com/.test(host)) return 0;
  return 1;
};

const firstTicketUrl = (value: unknown) => {
  const urls: string[] = [];
  const list = Array.isArray(value) ? value : value ? [value] : [];
  for (const item of list) {
    const url = httpUrl(typeof item === "string" ? item : typeof item === "object" && item && "url" in item ? String((item as { url?: string }).url ?? "") : null);
    if (url) urls.push(unwrapTicketUrl(url));
  }
  const official = urls.filter((url) => {
    try { return ticketRank(url) < 9; } catch { return false; }
  }).sort((left, right) => ticketRank(left) - ticketRank(right));
  return official[0] ?? null;
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
    listens?: EditionListen[];
  },
  now = new Date(),
  targetEditionDate = nextEditionDate(now)
): Promise<{
  editionDate: string;
  retrievedAt: string;
  drafts: GeneratedDraft[];
  held: number;
}> => {
  const editionDate = targetEditionDate;
  const retrievedAt = now.toISOString();
  const news: EditionNews[] = (source.news ?? [])
    .filter((row) => httpUrl(row.url) && row.title)
    .map((row) => ({
      id: String(row.id),
      title: String(row.title),
      url: String(row.url),
      source: row.source ?? null,
      publishedAt: String(row.publishedAt ?? row.created_at),
      summary: row.summary ?? row.seo_description ?? null,
    }));
  const reviewsByUser = new Map<string, EditionReview[]>();
  for (const row of source.reviews ?? []) {
    const artistName = row.artistName ?? row.artists?.name ?? row.user_created_artists?.name ?? row.setlist?.artist?.name;
    const userId = row.userId ?? row.user_id;
    if (!artistName || !userId) continue;
    const list = reviewsByUser.get(userId) ?? [];
    list.push({
      artistName,
      venueName: row.venueName ?? row.venues?.name ?? row.setlist?.venue?.name ?? null,
      eventDate: row.eventDate ?? row.Event_date ?? row.setlist?.eventDate ?? null,
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
        ? row.top_artists.map((artist: any) => String(typeof artist === "string" ? artist : artist.name || "")).filter(Boolean)
        : [];
    const genres = Array.isArray(row.genres)
      ? row.genres.map(String)
      : Array.isArray(row.top_genres)
        ? row.top_genres.map((genre: any) => String(typeof genre === "string" ? genre : genre.genre || genre.name || "")).filter(Boolean)
        : [];
    artistsByUser.set(userId, [...new Set([...(artistsByUser.get(userId) ?? []), ...artists])].slice(0, 8));
    genresByUser.set(userId, [...new Set([...(genresByUser.get(userId) ?? []), ...genres])].slice(0, 6));
    listensByUser.set(userId, [...(listensByUser.get(userId) ?? []), ...(row.listens ?? [])]);
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
    const artistName = row.artistName ?? row.artists?.name ?? row.user_created_artists?.name ?? row.setlist?.artist?.name;
    const userId = row.userId ?? row.user_id;
    if (!artistName || !userId) continue;
    const set = fiveStarArtists.get(String(artistName).toLowerCase()) ?? new Set<string>();
    set.add(userId);
    fiveStarArtists.set(String(artistName).toLowerCase(), set);
  }

  const drafts: GeneratedDraft[] = [];
  let held = 0;
  const seenEmails = new Set<string>();
  for (const user of source.users ?? []) {
    const userId = user.userId ?? user.user_id;
    const email = String(user.email ?? "").trim().toLowerCase();
    if (!userId || user.is_bot === true || (user.account_status && user.account_status !== "active")
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seenEmails.has(email)) continue;
    seenEmails.add(email);
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
      lifetimeShowCount: reviews.length,
      fiveStarCount: reviews.filter((review) => (review.rating ?? 0) >= 5).length,
      topArtists: [...new Set([...(artistsByUser.get(userId) ?? []), ...((user.followedArtists as string[] | undefined) ?? [])])].slice(0, 8),
      genres: genresByUser.get(userId) ?? [],
      otherFiveStarArtists: reviews
        .filter((review) => (review.rating ?? 0) >= 5)
        .map((review) => review.artistName)
        .filter((artist) => {
          const set = fiveStarArtists.get(artist.toLowerCase());
          return Boolean(set && [...set].some((id) => id !== userId));
        }),
      interestedEventIds: Array.isArray(user.interestedEventIds) ? user.interestedEventIds.map(String) : [],
      goingEventIds: Array.isArray(user.goingEventIds) ? user.goingEventIds.map(String) : [],
    };
    const composed = composeEdition({
      reader,
      events,
      news,
      listens: [...(listensByUser.get(userId) ?? []), ...(source.listens ?? [])],
      sendAt: editionSendAt(editionDate),
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

export const loadEditionSource = async (db: Db, now = new Date()) => {
  const users = await readAll(() => db.from("users")
    .select("user_id, email, name, username, location_city, location_state, account_status, is_bot, newsletter_subscription")
    .eq("account_status", "active").eq("newsletter_subscription", "subscribed").or("is_bot.is.false,is_bot.is.null")
    .not("email", "is", null).order("user_id"), "Load users");
  const unsubscribes = await readAll(() => db.from("newsletter_unsubscribes")
    .select("email").order("email"), "Load unsubscribes");
  const unsubscribed = new Set((unsubscribes ?? []).map((row: any) => String(row.email).trim().toLowerCase()));
  const recipients = (users ?? []).filter((user: any) => {
    const email = String(user.email ?? "").trim().toLowerCase();
    return email.includes("@") && !unsubscribed.has(email);
  });

  const rss = await fetchMusicNews(now);
  const storedNews = await db
    .from("news_items")
    .select("id, title, url, source, created_at, seo_description")
    .order("created_at", { ascending: false })
    .limit(40);
  const news = [...rss, ...requireRows(storedNews, "Load stored news")];

  const userIds = recipients.map((user: any) => user.user_id);
  const reviews: any[] = [];
  for (const ids of chunk(userIds, 40)) {
    if (!ids.length) continue;
    reviews.push(...await readAll(() => db.from("reviews")
      .select("id, user_id, rating, review_text, Event_date, setlist, user_created_artist_id, artists(name), venues(name)")
      .in("user_id", ids).eq("is_draft", false)
      .order("Event_date", { ascending: false }).order("id"), "Load review history"));
  }
  const stats = await loadListeningStats(db, userIds);

  const enrichedReviews = await enrichReviewArtists(db, reviews);
  const artistNames = [...new Set(userIds.flatMap((id: string) => {
    const reviewArtists = historyArtists(enrichedReviews.filter((row) => row.user_id === id));
    const listening = stats.filter((row) => row.user_id === id).flatMap((stat) => Array.isArray(stat.top_artists) ? stat.top_artists.slice(0, 8).map((artist: any) => artist.name) : []);
    return [...listening, ...reviewArtists];
  }))];
  const places = withHubPlaces([...new Map(recipients.map((user: any) => {
    const city = String(user.location_city || "").trim();
    return [placeKey(city, user.location_state), { city, state: user.location_state ?? null }];
  })).values()].filter((place) => place.city));
  const loaded = await loadEventsNearPlaces(places, artistNames, now, (spec: EventQuery) => runEventQuery(db, spec));
  const signals = await loadTasteSignals(db, userIds);
  const seenEventIds = new Set(loaded.events.map((row: any) => String(row.id)));
  const missingIds = [...new Set(signals.interests.map((row) => String(row.event_id)))].filter((id) => !seenEventIds.has(id));
  for (let index = 0; index < missingIds.length; index += 80) {
    const ids = missingIds.slice(index, index + 80);
    for (const row of await runEventQuery(db, { kind: "ids", ids, limit: ids.length })) {
      if (row?.id && !seenEventIds.has(String(row.id))) {
        seenEventIds.add(String(row.id));
        loaded.events.push(row);
      }
    }
  }
  const events = loaded.events;
  const usersWithLocation = recipients.map((user: any) => {
    const center = loaded.centers.get(placeKey(user.location_city, user.location_state));
    const mine = signals.interests.filter((row) => row.user_id === user.user_id);
    return {
      ...user,
      latitude: center?.latitude ?? null,
      longitude: center?.longitude ?? null,
      interestedEventIds: mine.filter((row) => row.relationship_type !== "going").map((row) => String(row.event_id)),
      goingEventIds: mine.filter((row) => row.relationship_type === "going").map((row) => String(row.event_id)),
      followedArtists: signals.follows.filter((row) => row.user_id === user.user_id).map((row) => row.artistName),
    };
  });

  const listens = await lookupRecordings(events.map((event) => String(event.artists?.name ?? event.artist_name ?? "")));
  const publicFives = await readAll(() => db
    .from("reviews")
    .select("user_id, artists(name)")
    .eq("is_public", true)
    .eq("is_draft", false)
    .gte("rating", 5)
    .order("user_id"), "Load community reviews");

  return {
    users: usersWithLocation,
    news,
    reviews: enrichedReviews,
    stats,
    events,
    listens,
    publicFives,
  };
};

export const generateEditionDrafts = async (db: Db, now = new Date()) =>
  generateDraftsFromSource(await loadEditionSource(db, now), now);
