/**
 * Edition data for the Vercel API route. This stays inside api/ so the
 * serverless function does not have to open the admin app at runtime.
 */
import { historyArtists } from "../../supabase/functions/newsletter-send/editorial.js";
import { runEventQuery } from "../../supabase/functions/newsletter-send/eventQuery.js";
import { lookupRecordings } from "../../supabase/functions/newsletter-send/tracks.js";
import { loadEventsNearPlaces, placeKey, rankedArtistNames, withHubPlaces, type EventQuery } from "../../supabase/functions/newsletter-send/nearby.js";
import { fetchMusicNews } from "../../supabase/functions/newsletter-send/news.js";
import { readAll, requireRows, enrichReviewArtists, loadListeningStats, loadTasteSignals } from "../../supabase/functions/newsletter-send/queries.js";

type Db = { from: (table: string) => any };

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
  for (let index = 0; index < userIds.length; index += 40) {
    const ids = userIds.slice(index, index + 40);
    if (!ids.length) continue;
    reviews.push(...await readAll(() => db.from("reviews")
      .select("id, user_id, rating, review_text, Event_date, setlist, user_created_artist_id, artists(name), venues(name)")
      .in("user_id", ids).eq("is_draft", false)
      .order("Event_date", { ascending: false }).order("id"), "Load review history"));
  }
  const stats = await loadListeningStats(db, userIds);

  const enrichedReviews = await enrichReviewArtists(db, reviews);
  const artistNames = rankedArtistNames(userIds.map((id: string) => {
    const reviewArtists = historyArtists(enrichedReviews.filter((row) => row.user_id === id));
    const listening = stats.filter((row) => row.user_id === id).flatMap((stat) => Array.isArray(stat.top_artists) ? stat.top_artists.slice(0, 8).map((artist: any) => artist.name) : []);
    return [...listening, ...reviewArtists];
  }));
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
      followedVenues: signals.venueFollows.filter((row) => row.user_id === user.user_id).map((row) => row.venueName),
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
