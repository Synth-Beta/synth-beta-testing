import { newsletters } from "../src/data/newsletters";
import {
  buildPersonalizationContextForUser,
  inferDerivedState,
  resolveNewsletterForContext,
} from "../src/lib/newsletterPersonalization";

const uid = "349bda34-7878-4c10-9f86-ec5888e55571";

const run = async () => {
  const ctx = await buildPersonalizationContextForUser(uid);
  const issue = newsletters.find((item) => item.slug === "august-5-2026")!;
  const resolved = resolveNewsletterForContext(issue, ctx, "resolved");
  console.log(
    JSON.stringify(
      {
        firstName: ctx.user.firstName,
        city: ctx.user.city,
        location: ctx.user.location,
        upcoming: ctx.synthActivity.upcomingShows.length,
        interested: ctx.synthActivity.recentlyInterestedEvents.length,
        attendedSample: ctx.synthActivity.recentlyAttendedConcerts.slice(0, 5),
        reviewsSample: ctx.synthActivity.recentReviews.slice(0, 5),
        photos: ctx.synthActivity.recentPhotos.length,
        connections: ctx.synthActivity.newConnections.length,
        lifetimeConcertCount: ctx.synthActivity.lifetimeConcertCount,
        lifetimeReviewCount: ctx.synthActivity.lifetimeReviewCount,
        hasActivityInLast7Days: ctx.synthActivity.hasActivityInLast7Days,
        spotifyConnected: ctx.musicConnections.spotifyConnected,
        spotifyDataAvailable: ctx.musicConnections.spotifyDataAvailable,
        appleMusicConnected: ctx.musicConnections.appleMusicConnected,
        appleMusicDataAvailable: ctx.musicConnections.appleMusicDataAvailable,
        topArtists: ctx.musicConnections.topArtists,
        genres: ctx.musicConnections.genres,
        nearbyShows: ctx.recommendations.nearbyShows.slice(0, 3),
        state: inferDerivedState(ctx),
        modules: resolved.newsletter.sections
          .filter((s) => !s.hidden)
          .map((s) => ({
            type: s.type,
            headline: s.headline,
            body: (s.body || "").slice(0, 140),
          })),
        explanations: resolved.moduleExplanations.map((e) => ({
          type: e.sectionType,
          fallback: e.fallbackUsed,
          source: e.sourceLabel,
          reason: e.reason,
        })),
      },
      null,
      2
    )
  );
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
