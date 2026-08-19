/**
 * Deterministic regression checks for newsletter personalization state/copy.
 * Run: npx vite-node scripts/test-newsletter-personalization-regression.ts
 */
import assert from "node:assert/strict";
import { newsletters } from "../src/data/newsletters";
import {
  detectStreamingServiceFromProfile,
  getMockPersonalizationContext,
  inferDerivedState,
  resolveNewsletterForContext,
} from "../src/lib/newsletterPersonalization";
import type { NewsletterPersonalizationContext } from "../src/types/newsletterPersonalization";

const issue = newsletters.find((item) => item.slug === "august-5-2026")!;

const emptyContext = (): NewsletterPersonalizationContext => ({
  source: "mock",
  isAdminMockData: true,
  containsRealUserData: false,
  user: { id: "test-user" },
  synthActivity: {
    upcomingShows: [],
    recentlyInterestedEvents: [],
    recentlyAttendedConcerts: [],
    recentReviews: [],
    recentPhotos: [],
    newConnections: [],
    lifetimeConcertCount: 0,
    lifetimeReviewCount: 0,
    unreviewedConcerts: [],
    hasActivityInLast7Days: false,
  },
  musicConnections: {
    spotifyConnected: false,
    spotifyDataAvailable: false,
    appleMusicConnected: false,
    appleMusicDataAvailable: false,
    recentArtists: [],
    topArtists: [],
    genres: [],
    artistsWithNearbyShows: [],
    followedArtists: [],
    followedVenues: [],
  },
  recommendations: {
    nearbyShows: [],
    relevantArtists: [],
    relevantVenues: [],
  },
});

const sectionByType = (ctx: NewsletterPersonalizationContext, type: string) => {
  const resolved = resolveNewsletterForContext(issue, ctx, "resolved");
  return resolved.newsletter.sections.find((section) => section.type === type)!;
};

const assertNoConnectCta = (body: string | undefined, headline: string | undefined) => {
  const text = `${headline ?? ""} ${body ?? ""}`.toLowerCase();
  assert.equal(text.includes("connect spotify"), false, `Unexpected Connect Spotify copy: ${text}`);
  assert.equal(
    text.includes("connect spotify or apple music"),
    false,
    `Unexpected connect CTA: ${text}`
  );
};

const run = () => {
  // Profile detection
  assert.deepEqual(
    detectStreamingServiceFromProfile("https://open.spotify.com/user/historian0071", null),
    { spotify: true, appleMusic: false }
  );
  assert.deepEqual(detectStreamingServiceFromProfile("historian0071", null), {
    spotify: true,
    appleMusic: false,
  });
  assert.deepEqual(
    detectStreamingServiceFromProfile("https://music.apple.com/profile/x", null),
    { spotify: false, appleMusic: true }
  );

  // 1) Connected Spotify + no streaming stats → never "Connect Spotify"
  {
    const ctx = emptyContext();
    ctx.user.firstName = "Sam";
    ctx.user.city = "Washington DC";
    ctx.musicConnections.spotifyConnected = true;
    ctx.musicConnections.spotifyDataAvailable = false;
    ctx.synthActivity.lifetimeConcertCount = 22;
    ctx.synthActivity.lifetimeReviewCount = 22;
    ctx.synthActivity.recentlyAttendedConcerts = [
      {
        id: "1",
        title: "Goose",
        artistName: "Goose",
        venueName: "The Anthem",
        eventDate: "2024-11-12",
        city: "Washington",
        state: "DC",
      },
    ];
    ctx.synthActivity.recentReviews = [
      {
        id: "r1",
        rating: 5,
        reviewText: "Great",
        eventTitle: "Goose",
        eventDate: "2024-11-12",
        createdAt: "2026-02-01T00:00:00.000Z",
      },
    ];

    assert.equal(inferDerivedState(ctx), "inactive-with-history");
    const music = sectionByType(ctx, "yourMusic");
    assert.match(music.headline ?? "", /Spotify is connected/i);
    assert.match(music.body ?? "", /still building out your listening insights/i);
    assertNoConnectCta(music.body, music.headline);
    const discover = sectionByType(ctx, "discoverTip");
    assertNoConnectCta(discover.body, discover.headline);
    assert.notEqual(inferDerivedState(ctx), "new-or-empty-user");
  }

  // 2) Connected Spotify + streaming stats
  {
    const ctx = emptyContext();
    ctx.musicConnections.spotifyConnected = true;
    ctx.musicConnections.spotifyDataAvailable = true;
    ctx.musicConnections.topArtists = [{ name: "The National" }];
    ctx.musicConnections.genres = ["indie rock"];
    assert.equal(inferDerivedState(ctx), "connected-music-user");
    const music = sectionByType(ctx, "yourMusic");
    assert.match(music.body ?? "", /The National/);
    assertNoConnectCta(music.body, music.headline);
  }

  // 3) Active Synth user + no recent activity this week (historical only)
  {
    const ctx = emptyContext();
    ctx.user.city = "Washington DC";
    ctx.synthActivity.hasActivityInLast7Days = false;
    ctx.synthActivity.lifetimeConcertCount = 12;
    ctx.synthActivity.lifetimeReviewCount = 8;
    ctx.synthActivity.recentlyAttendedConcerts = [
      {
        id: "a1",
        title: "Show",
        artistName: "Dogs In A Pile",
        venueName: "Merriweather Post Pavilion",
        eventDate: "2025-06-14",
        city: "Columbia",
        state: "Maryland",
      },
    ];
    ctx.synthActivity.recentReviews = [
      {
        id: "r2",
        rating: 4,
        eventTitle: "Dogs In A Pile",
        createdAt: "2026-02-02T00:00:00.000Z",
      },
    ];
    assert.equal(inferDerivedState(ctx), "inactive-with-history");
    const synth = sectionByType(ctx, "yourSynth");
    assert.match(synth.headline ?? "", /show history/i);
    assert.notEqual(inferDerivedState(ctx), "new-or-empty-user");
  }

  // 4) Active historical user with reviews/attended shows
  {
    const ctx = getMockPersonalizationContext("inactive-with-history");
    // Force no upcoming to prove history path still personalizes.
    ctx.synthActivity.upcomingShows = [];
    ctx.synthActivity.hasActivityInLast7Days = false;
    assert.equal(inferDerivedState(ctx), "inactive-with-history");
    const synth = sectionByType(ctx, "yourSynth");
    assert.match(String(synth.body ?? ""), /logged/i);
    assert.notEqual(synth.headline, "Still thinking about your last show?");
  }

  // 5) Saved events present
  {
    const ctx = emptyContext();
    ctx.synthActivity.recentlyInterestedEvents = [
      {
        id: "s1",
        title: "Saved Show",
        artistName: "Mt. Joy",
        venueName: "9:30 Club",
        eventDate: "2026-09-01",
        city: "Washington",
        state: "DC",
      },
    ];
    assert.equal(inferDerivedState(ctx), "inactive-with-history");
    const synth = sectionByType(ctx, "yourSynth");
    assert.match(synth.body ?? "", /Mt\. Joy/);
    assert.notEqual(inferDerivedState(ctx), "new-or-empty-user");
  }

  // 6) Upcoming events present
  {
    const ctx = emptyContext();
    ctx.synthActivity.upcomingShows = [
      {
        id: "u1",
        title: "Upcoming",
        artistName: "Goose",
        venueName: "The Anthem",
        eventDate: "2026-09-20",
        city: "Washington",
        state: "DC",
      },
    ];
    ctx.synthActivity.lifetimeConcertCount = 1;
    ctx.synthActivity.hasActivityInLast7Days = true;
    assert.equal(inferDerivedState(ctx), "active-user");
    const synth = sectionByType(ctx, "yourSynth");
    assert.match(synth.body ?? "", /Goose/);
    const comingUp = sectionByType(ctx, "aroundYou");
    assert.match(comingUp.headline ?? "", /Goose/);
  }

  // Brand-new / zero-data still gets connect CTA
  {
    const ctx = emptyContext();
    assert.equal(inferDerivedState(ctx), "missing-location-user");
    const music = sectionByType(ctx, "yourMusic");
    assert.match(music.body ?? "", /Connect Spotify or Apple Music/i);
  }

  console.log("All newsletter personalization regression checks passed.");
};

run();
