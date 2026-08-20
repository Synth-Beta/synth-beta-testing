import { newsletters } from "../src/data/newsletters";
import {
  buildPersonalizationContextForUser,
  getMockPersonalizationContext,
  inferDerivedState,
  resolveNewsletterForContext,
} from "../src/lib/newsletterPersonalization";

const issue = newsletters.find((item) => item.slug === "august-5-2026") ?? newsletters[0];

type TargetBucket =
  | "active-user"
  | "inactive-with-history"
  | "spotify-connected-user"
  | "apple-connected-user"
  | "interest-signal-user"
  | "brand-new-user"
  | "missing-location-user";

interface AuditRow {
  bucket: TargetBucket;
  source: "real" | "mock";
  userRef: string;
  inferredState: string;
  renderedModules: string[];
  fallbacksUsed: string[];
  qualityFlags: string[];
  countChecks: {
    upcomingShowCount: number;
    recentConcertCount: number;
    lifetimeConcertCount: number;
    lifetimeReviewCount: number;
  };
}

const hasHistory = (context: any) =>
  context.synthActivity.lifetimeConcertCount > 0 ||
  context.synthActivity.lifetimeReviewCount > 0 ||
  context.synthActivity.recentlyInterestedEvents.length > 0 ||
  context.synthActivity.recentlyAttendedConcerts.length > 0;

const hasMusic = (context: any) =>
  context.musicConnections.spotifyConnected ||
  context.musicConnections.appleMusicConnected ||
  context.musicConnections.topArtists.length > 0;

const hasInterestSignals = (context: any) =>
  context.musicConnections.followedArtists.length > 0 ||
  context.musicConnections.followedVenues.length > 0;

const hasLocation = (context: any) => Boolean(context.user.city);

const isBrandNew = (context: any) =>
  !hasHistory(context) && !hasMusic(context) && !hasInterestSignals(context);

const qualityFlagsForRow = (context: any, resolved: any) => {
  const flags: string[] = [];
  const renderedReasons = resolved.moduleExplanations
    .filter((entry: any) => entry.rendered)
    .map((entry: any) => String(entry.reason || ""));
  const renderedJoined = renderedReasons.join(" ").toLowerCase();
  if (renderedJoined.includes("most popular") || renderedJoined.includes("top reviewer")) {
    flags.push("contains_forbidden_competition_language");
  }
  if (context.user.city == null && renderedJoined.includes("near")) {
    flags.push("city_claim_with_missing_location");
  }
  return flags;
};

const toAuditRow = (bucket: TargetBucket, source: "real" | "mock", userRef: string, context: any) => {
  const resolved = resolveNewsletterForContext(issue, context, "resolved");
  return {
    bucket,
    source,
    userRef,
    inferredState: inferDerivedState(context),
    renderedModules: resolved.moduleExplanations
      .filter((entry) => entry.rendered)
      .map((entry) => entry.sectionType),
    fallbacksUsed: resolved.moduleExplanations
      .filter((entry) => /fallback/i.test(entry.reason))
      .map((entry) => `${entry.sectionType}:${entry.reason}`),
    qualityFlags: qualityFlagsForRow(context, resolved),
    countChecks: {
      upcomingShowCount: context.synthActivity.upcomingShows.length,
      recentConcertCount: context.synthActivity.recentlyAttendedConcerts.length,
      lifetimeConcertCount: context.synthActivity.lifetimeConcertCount,
      lifetimeReviewCount: context.synthActivity.lifetimeReviewCount,
    },
  } as AuditRow;
};

const bucketMatch = (bucket: TargetBucket, context: any) => {
  switch (bucket) {
    case "active-user":
      return context.synthActivity.hasActivityInLast7Days;
    case "inactive-with-history":
      return !context.synthActivity.hasActivityInLast7Days && hasHistory(context);
    case "spotify-connected-user":
      return context.musicConnections.spotifyConnected;
    case "apple-connected-user":
      return context.musicConnections.appleMusicConnected;
    case "interest-signal-user":
      return hasInterestSignals(context);
    case "brand-new-user":
      return isBrandNew(context);
    case "missing-location-user":
      return !hasLocation(context);
    default:
      return false;
  }
};

const run = async () => {
  const buckets: TargetBucket[] = [
    "active-user",
    "inactive-with-history",
    "spotify-connected-user",
    "apple-connected-user",
    "interest-signal-user",
    "brand-new-user",
    "missing-location-user",
  ];

  const selected = new Map<TargetBucket, AuditRow>();

  const { supabase } = await import("../src/integrations/supabase/client");
  const { data: users } = await (supabase as any)
    .from("users")
    .select("user_id")
    .limit(80);

  const userIds: string[] = (users ?? []).map((entry: any) => entry.user_id).filter(Boolean);

  for (const userId of userIds) {
    if (selected.size === buckets.length) break;
    try {
      const context = await buildPersonalizationContextForUser(userId);
      for (const bucket of buckets) {
        if (selected.has(bucket)) continue;
        if (bucketMatch(bucket, context)) {
          selected.set(bucket, toAuditRow(bucket, "real", userId.slice(0, 8), context));
        }
      }
    } catch {
      // Continue scanning users even when one context fails.
    }
  }

  for (const bucket of buckets) {
    if (selected.has(bucket)) continue;
    const mockPreset = bucket as any;
    const mockContext = getMockPersonalizationContext(mockPreset);
    selected.set(bucket, toAuditRow(bucket, "mock", "mock-user", mockContext));
  }

  console.log(
    JSON.stringify(
      {
        rows: buckets.map((bucket) => selected.get(bucket)),
        note:
          "Interest-signal state uses inferred interaction signals, not an explicit follow table.",
      },
      null,
      2
    )
  );
};

run();

