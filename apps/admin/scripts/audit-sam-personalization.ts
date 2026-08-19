/**
 * One-off debug audit for Sam newsletter personalization.
 * Does not write HTML or mutate user data.
 */
import { newsletters } from "../src/data/newsletters";
import {
  buildPersonalizationContextForUser,
  inferDerivedState,
  resolveNewsletterForContext,
} from "../src/lib/newsletterPersonalization";
import { MusicTasteService } from "../src/services/musicTasteService";
import { supabase } from "../src/integrations/supabase/client";

const TARGET_USERNAME = "sloiterstein";

const safeQuery = async (label: string, fn: () => Promise<any>) => {
  try {
    const result = await fn();
    return { label, ok: true, result };
  } catch (error: any) {
    return { label, ok: false, error: error?.message ?? String(error) };
  }
};

const summarize = (entry: any) => {
  if (!entry.ok) return { error: entry.error };
  const result = entry.result;
  if (result?.error) {
    return {
      supabaseError: result.error.message,
      code: result.error.code,
      details: result.error.details,
      hint: result.error.hint,
    };
  }
  const data = result?.data;
  const sanitizeRow = (row: any) => {
    const clone = { ...row };
    delete clone.email;
    delete clone.access_token;
    delete clone.refresh_token;
    delete clone.token;
    delete clone.tokens;
    if (clone.top_artists) {
      clone.top_artists_count = Array.isArray(clone.top_artists) ? clone.top_artists.length : 0;
      clone.top_artists_sample = Array.isArray(clone.top_artists)
        ? clone.top_artists.slice(0, 5).map((a: any) => a?.name ?? a)
        : [];
      delete clone.top_artists;
    }
    if (clone.top_genres) {
      clone.top_genres_count = Array.isArray(clone.top_genres) ? clone.top_genres.length : 0;
      clone.top_genres_sample = Array.isArray(clone.top_genres)
        ? clone.top_genres.slice(0, 5).map((g: any) => g?.genre ?? g)
        : [];
      delete clone.top_genres;
    }
    if (clone.photos) {
      clone.photos_count = Array.isArray(clone.photos) ? clone.photos.length : 0;
      delete clone.photos;
    }
    if (clone.videos) {
      clone.videos_count = Array.isArray(clone.videos) ? clone.videos.length : 0;
      delete clone.videos;
    }
    if (clone.review_text) clone.review_text = String(clone.review_text).slice(0, 100);
    if (clone.music_streaming_profile) {
      clone.music_streaming_profile_present = Boolean(clone.music_streaming_profile);
      clone.music_streaming_profile_kind = String(clone.music_streaming_profile).includes("spotify")
        ? "spotify-like"
        : String(clone.music_streaming_profile).includes("apple")
          ? "apple-like"
          : "other-or-handle";
      delete clone.music_streaming_profile;
    }
    if (clone.jambase_event && typeof clone.jambase_event === "object") {
      clone.jambase_event = {
        id: clone.jambase_event.id,
        title: clone.jambase_event.title,
        artist_name: clone.jambase_event.artist_name,
        venue_name: clone.jambase_event.venue_name,
        event_date: clone.jambase_event.event_date,
        venue_city: clone.jambase_event.venue_city,
        venue_state: clone.jambase_event.venue_state,
      };
    }
    return clone;
  };

  if (Array.isArray(data)) {
    return { count: data.length, sample: data.slice(0, 8).map(sanitizeRow) };
  }
  if (data && typeof data === "object") {
    return { count: 1, row: sanitizeRow(data) };
  }
  return { count: 0, data: null };
};

const run = async () => {
  // Resolve username without city/state (those columns may not exist).
  const { data: matches, error } = await (supabase as any)
    .from("users")
    .select("user_id, username, name, last_active_at")
    .eq("username", TARGET_USERNAME);

  if (error) throw new Error(`username resolve failed: ${error.message}`);
  const exact = (matches ?? []).filter((row: any) => row.username === TARGET_USERNAME);
  if (exact.length !== 1) {
    throw new Error(`Expected 1 user for ${TARGET_USERNAME}, found ${exact.length}`);
  }

  const user = exact[0];
  const userId = String(user.user_id);

  // Probe column existence on users
  const usersColumnProbes = await Promise.all(
    ["city", "state", "location", "home_city", "email"].map(async (col) => {
      const res = await (supabase as any).from("users").select(col).eq("user_id", userId).maybeSingle();
      return { col, ok: !res.error, error: res.error?.message ?? null, value: res.data?.[col] ?? null };
    })
  );

  const queries = await Promise.all([
    safeQuery("users_core", async () =>
      (supabase as any)
        .from("users")
        .select("user_id, username, name, last_active_at")
        .eq("user_id", userId)
        .maybeSingle()
    ),
    safeQuery("users_with_city_state_as_newsletter_does", async () =>
      (supabase as any)
        .from("users")
        .select("user_id, name, username, email, city, state, last_active_at")
        .eq("user_id", userId)
        .maybeSingle()
    ),
    safeQuery("profiles", async () =>
      supabase
        .from("profiles")
        .select("user_id, name, music_streaming_profile, avatar_url, bio, created_at, updated_at")
        .eq("user_id", userId)
        .maybeSingle()
    ),
    safeQuery("user_jambase_events", async () =>
      (supabase as any)
        .from("user_jambase_events")
        .select(
          "id, created_at, jambase_event_id, jambase_event:jambase_events(id, title, artist_name, venue_name, event_date, venue_city, venue_state)"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50)
    ),
    safeQuery("user_reviews", async () =>
      (supabase as any)
        .from("user_reviews")
        .select("id, user_id, event_id, rating, review_text, photos, videos, created_at, is_public, is_draft")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50)
    ),
    safeQuery("public_reviews_with_profiles", async () =>
      (supabase as any)
        .from("public_reviews_with_profiles")
        .select(
          "id, user_id, event_id, rating, review_text, photos, videos, created_at, event_title, event_date, artist_name, venue_name"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50)
    ),
    safeQuery("friends", async () =>
      supabase
        .from("friends")
        .select("id, user1_id, user2_id, created_at")
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .limit(50)
    ),
    safeQuery("user_streaming_stats_summary", async () =>
      (supabase as any)
        .from("user_streaming_stats_summary")
        .select(
          "user_id, service_type, top_artists, top_genres, total_tracks, unique_artists, total_listening_hours, last_updated"
        )
        .eq("user_id", userId)
    ),
    safeQuery("streaming_profiles", async () =>
      (supabase as any)
        .from("streaming_profiles")
        .select("user_id, service_type, profile_url, external_user_id, sync_status, last_updated, created_at, updated_at")
        .eq("user_id", userId)
    ),
    safeQuery("user_interactions", async () =>
      (supabase as any)
        .from("user_interactions")
        .select("event_type, entity_type, entity_id, metadata, occurred_at")
        .eq("user_id", userId)
        .order("occurred_at", { ascending: false })
        .limit(50)
    ),
    safeQuery("event_interests", async () =>
      (supabase as any).from("event_interests").select("*").eq("user_id", userId).limit(50)
    ),
    safeQuery("concerts", async () =>
      (supabase as any)
        .from("concerts")
        .select("id, artist, venue, date, user_id, city")
        .eq("user_id", userId)
        .limit(50)
    ),
    safeQuery("user_swipes", async () =>
      (supabase as any)
        .from("user_swipes")
        .select("id, event_id, is_interested, created_at")
        .eq("swiper_user_id", userId)
        .eq("is_interested", true)
        .limit(50)
    ),
  ]);

  // Probe streaming_profiles columns if first select failed
  const streamingProbe = await safeQuery("streaming_profiles_star", async () =>
    (supabase as any).from("streaming_profiles").select("*").eq("user_id", userId).limit(5)
  );

  const musicTaste = await MusicTasteService.getUserMusicTaste(userId).catch((e) => ({
    error: e?.message ?? String(e),
  }));

  const context = await buildPersonalizationContextForUser(userId);
  const issue = newsletters.find((item) => item.slug === "august-5-2026")!;
  const resolved = resolveNewsletterForContext(issue, context, "resolved");

  const report = {
    account: {
      userId,
      username: user.username,
      nameFromUsers: user.name ?? null,
      lastActiveAt: user.last_active_at ?? null,
    },
    usersColumnProbes,
    queryResults: Object.fromEntries(queries.map((q) => [q.label, summarize(q)])),
    streaming_profiles_star: summarize(streamingProbe),
    musicTasteService: {
      ...(typeof musicTaste === "object" && musicTaste
        ? {
            serviceType: (musicTaste as any).serviceType ?? null,
            description: (musicTaste as any).description ?? null,
            topArtists: ((musicTaste as any).topArtists ?? []).slice(0, 8).map((a: any) => a.name),
            topGenres: ((musicTaste as any).topGenres ?? []).slice(0, 8).map((g: any) => g.genre ?? g),
            error: (musicTaste as any).error ?? null,
          }
        : { raw: musicTaste }),
    },
    builtContext: {
      source: context.source,
      firstName: context.user.firstName ?? null,
      city: context.user.city ?? null,
      location: context.user.location ?? null,
      upcomingShows: context.synthActivity.upcomingShows.map((e) => ({
        title: e.title,
        artist: e.artistName,
        date: e.eventDate,
        city: e.city,
      })),
      interested: context.synthActivity.recentlyInterestedEvents.map((e) => ({
        title: e.title,
        artist: e.artistName,
        date: e.eventDate,
      })),
      attended: context.synthActivity.recentlyAttendedConcerts.map((e) => ({
        title: e.title,
        artist: e.artistName,
        date: e.eventDate,
      })),
      reviews: context.synthActivity.recentReviews.map((r) => ({
        eventTitle: r.eventTitle,
        rating: r.rating,
        createdAt: r.createdAt,
      })),
      photosCount: context.synthActivity.recentPhotos.length,
      connections: context.synthActivity.newConnections.map((c) => c.name),
      lifetimeConcertCount: context.synthActivity.lifetimeConcertCount,
      lifetimeReviewCount: context.synthActivity.lifetimeReviewCount,
      hasActivityInLast7Days: context.synthActivity.hasActivityInLast7Days,
      spotifyConnected: context.musicConnections.spotifyConnected,
      spotifyDataAvailable: (context.musicConnections as any).spotifyDataAvailable ?? false,
      appleMusicConnected: context.musicConnections.appleMusicConnected,
      appleMusicDataAvailable: (context.musicConnections as any).appleMusicDataAvailable ?? false,
      topArtists: context.musicConnections.topArtists.map((a) => a.name),
      genres: context.musicConnections.genres,
      nearbyShows: context.recommendations.nearbyShows.length,
      inferredState: inferDerivedState(context),
    },
    moduleTrace: resolved.moduleExplanations.map((entry) => ({
      sectionId: entry.sectionId,
      sectionType: entry.sectionType,
      rendered: entry.rendered,
      sourceLabel: entry.sourceLabel,
      fallbackUsed: entry.fallbackUsed,
      reason: entry.reason,
    })),
    renderedHeadlines: resolved.newsletter.sections
      .filter((s) => !s.hidden)
      .map((s) => ({
        type: s.type,
        label: s.label,
        headline: s.headline,
        body: s.body?.slice(0, 140),
      })),
  };

  console.log(JSON.stringify(report, null, 2));
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
