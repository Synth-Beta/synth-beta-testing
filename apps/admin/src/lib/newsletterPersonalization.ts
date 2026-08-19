import { supabase } from "@/integrations/supabase/client";
import { LocationService } from "@/services/locationService";
import { MusicTasteService } from "@/services/musicTasteService";
import {
  NewsletterIssue,
  NewsletterPersonalizationConfidence,
  NewsletterPersonalizationDataField,
  NewsletterSectionSourceLabel,
  NewsletterSection,
  NewsletterTokenName,
} from "@/types/newsletter";
import {
  NewsletterArtistSummary,
  NewsletterDerivedState,
  NewsletterEventSummary,
  NewsletterModuleExplanation,
  NewsletterPersonalizationContext,
  NewsletterPreviewPreset,
  NewsletterVenueSummary,
} from "@/types/newsletterPersonalization";

/** Main Synth app entry. Exact deep links for in-app actions are not yet available. */
const SYNTH_APP_URL = "https://join.getsynth.app/";

/** Phrases that must never appear in recipient-facing newsletter HTML. */
export const RECIPIENT_LEAKAGE_PHRASES = [
  "this section",
  "this block",
  "fallback",
  "personalized",
  "interest signals",
  "fully personal next week",
  "use this each week",
  "use this block",
  "final cta",
  "admin-selected",
  "admin selected",
  "mock data",
  "admin mock",
] as const;

const FABRICATED_COMMUNITY_PHRASES = [
  "a member wrote",
  "a member shared",
  "one of our members",
] as const;

const TOKEN_REGEX = /\{\{\s*([a-zA-Z0-9]+)\s*\}\}/g;

const SUPPORTED_TOKENS = new Set<NewsletterTokenName>([
  "firstName",
  "city",
  "upcomingShowCount",
  "recentConcertCount",
  "lifetimeConcertCount",
  "lifetimeReviewCount",
  "topArtist",
  "topGenre",
  "nextShowArtist",
  "nextShowVenue",
  "followedArtist",
  "followedVenue",
]);

const toEventSummary = (event: any): NewsletterEventSummary => ({
  id: String(event?.id ?? event?.event_id ?? crypto.randomUUID()),
  title: String(event?.title ?? event?.event_title ?? "Untitled show"),
  artistName: String(event?.artist_name ?? event?.artistName ?? "Unknown artist"),
  venueName: String(event?.venue_name ?? event?.venueName ?? "Unknown venue"),
  eventDate: String(event?.event_date ?? event?.eventDate ?? ""),
  city: event?.venue_city ?? event?.city ?? null,
  state: event?.venue_state ?? event?.state ?? null,
});

const extractFirstName = (name?: string | null) => {
  if (!name) return undefined;
  const first = name.trim().split(/\s+/)[0];
  return first || undefined;
};

const hasRecentTimestamp = (iso?: string, days = 7) => {
  if (!iso) return false;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return ts >= cutoff;
};

const normalizeStreamingProfileValue = (value?: string | null) => String(value ?? "").trim().toLowerCase();

/** Detect Spotify/Apple connection signals from persisted profile fields (not OAuth tokens). */
export const detectStreamingServiceFromProfile = (
  musicStreamingProfile?: string | null,
  musicStreamingService?: string | null
): { spotify: boolean; appleMusic: boolean } => {
  const service = normalizeStreamingProfileValue(musicStreamingService);
  const profile = normalizeStreamingProfileValue(musicStreamingProfile);
  const appleFromService = service.includes("apple");
  const spotifyFromService = service.includes("spotify");
  const appleFromProfile =
    profile.includes("music.apple.com") ||
    profile.includes("itunes.apple.com") ||
    profile.includes("apple music");
  const spotifyFromProfile =
    profile.includes("spotify.com") ||
    profile.startsWith("spotify:") ||
    // Legacy profile field: bare handles were treated as Spotify user ids in the app.
    Boolean(profile) && !appleFromProfile && !profile.includes("http");

  return {
    spotify: spotifyFromService || spotifyFromProfile,
    appleMusic: appleFromService || appleFromProfile,
  };
};

export const hasUsableStreamingData = (context: NewsletterPersonalizationContext) =>
  context.musicConnections.topArtists.length > 0 || context.musicConnections.genres.length > 0;

const hasDataField = (context: NewsletterPersonalizationContext, field: NewsletterPersonalizationDataField) => {
  switch (field) {
    case "user.firstName":
      return Boolean(context.user.firstName);
    case "user.city":
      return Boolean(context.user.city);
    case "synthActivity.upcomingShows":
      return context.synthActivity.upcomingShows.length > 0;
    case "synthActivity.recentlyInterestedEvents":
      return context.synthActivity.recentlyInterestedEvents.length > 0;
    case "synthActivity.recentlyAttendedConcerts":
      return context.synthActivity.recentlyAttendedConcerts.length > 0;
    case "synthActivity.recentReviews":
      return context.synthActivity.recentReviews.length > 0;
    case "synthActivity.recentPhotos":
      return context.synthActivity.recentPhotos.length > 0;
    case "synthActivity.newConnections":
      return context.synthActivity.newConnections.length > 0;
    case "musicConnections.spotifyConnected":
      return context.musicConnections.spotifyConnected;
    case "musicConnections.spotifyDataAvailable":
      return context.musicConnections.spotifyDataAvailable;
    case "musicConnections.appleMusicConnected":
      return context.musicConnections.appleMusicConnected;
    case "musicConnections.appleMusicDataAvailable":
      return context.musicConnections.appleMusicDataAvailable;
    case "musicConnections.topArtists":
      return context.musicConnections.topArtists.length > 0;
    case "musicConnections.followedArtists":
      return context.musicConnections.followedArtists.length > 0;
    case "musicConnections.followedVenues":
      return context.musicConnections.followedVenues.length > 0;
    case "recommendations.nearbyShows":
      return context.recommendations.nearbyShows.length > 0;
    default:
      return false;
  }
};

const confidenceOrder: Record<NewsletterPersonalizationConfidence, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const confidenceForDataField = (
  context: NewsletterPersonalizationContext,
  field: NewsletterPersonalizationDataField
): NewsletterPersonalizationConfidence => {
  switch (field) {
    case "user.firstName":
      return "high";
    case "user.city":
      return context.user.city ? "high" : "medium";
    case "synthActivity.upcomingShows":
    case "synthActivity.recentlyInterestedEvents":
    case "synthActivity.recentlyAttendedConcerts":
    case "synthActivity.recentReviews":
    case "synthActivity.recentPhotos":
    case "synthActivity.newConnections":
      return "high";
    case "musicConnections.spotifyConnected":
    case "musicConnections.spotifyDataAvailable":
    case "musicConnections.appleMusicConnected":
    case "musicConnections.appleMusicDataAvailable":
      return "high";
    case "musicConnections.topArtists":
      return context.musicConnections.spotifyDataAvailable ||
        context.musicConnections.appleMusicDataAvailable ||
        context.musicConnections.spotifyConnected ||
        context.musicConnections.appleMusicConnected
        ? "high"
        : "medium";
    case "musicConnections.followedArtists":
    case "musicConnections.followedVenues":
      return "medium";
    case "recommendations.nearbyShows":
      return context.user.city ? "medium" : "low";
    default:
      return "low";
  }
};

const resolveSourceLabel = (section: NewsletterSection): NewsletterSectionSourceLabel => {
  if (section.personalization?.sourceLabel) return section.personalization.sourceLabel;
  if (section.type === "communitySpotlight" || section.type === "featuredStory" || section.type === "quickStories") {
    return "Admin-selected";
  }
  if (section.type === "yourMusic") return "Streaming-based";
  if (section.type === "aroundYou" || section.id.includes("coming-up")) return "Location-based";
  if (section.personalization) return "Personalized";
  return "Evergreen fallback";
};

const tokenValuesForContext = (context: NewsletterPersonalizationContext): Record<NewsletterTokenName, string> => ({
  firstName: context.user.firstName ?? "",
  city: context.user.city ?? "",
  upcomingShowCount: String(context.synthActivity.upcomingShows.length),
  recentConcertCount: String(context.synthActivity.recentlyAttendedConcerts.length),
  lifetimeConcertCount: String(context.synthActivity.lifetimeConcertCount),
  lifetimeReviewCount: String(context.synthActivity.lifetimeReviewCount),
  topArtist: context.musicConnections.topArtists[0]?.name ?? "",
  topGenre: context.musicConnections.genres[0] ?? "",
  nextShowArtist:
    context.synthActivity.upcomingShows[0]?.artistName ??
    context.recommendations.nearbyShows[0]?.artistName ??
    "",
  nextShowVenue:
    context.synthActivity.upcomingShows[0]?.venueName ??
    context.recommendations.nearbyShows[0]?.venueName ??
    "",
  followedArtist: context.musicConnections.followedArtists[0]?.name ?? "",
  followedVenue: context.musicConnections.followedVenues[0]?.name ?? "",
});

const replaceTokens = (value: string | undefined, tokenMap: Record<NewsletterTokenName, string>) => {
  if (!value) return value ?? "";
  return value.replace(TOKEN_REGEX, (_match, tokenName: string) => {
    if (!SUPPORTED_TOKENS.has(tokenName as NewsletterTokenName)) return "";
    const resolved = tokenMap[tokenName as NewsletterTokenName] ?? "";
    return String(resolved);
  });
};

const replaceSectionTokens = (
  section: NewsletterSection,
  tokenMap: Record<NewsletterTokenName, string>
): NewsletterSection => ({
  ...section,
  label: replaceTokens(section.label, tokenMap),
  eyebrowText: replaceTokens(section.eyebrowText, tokenMap),
  headline: replaceTokens(section.headline, tokenMap),
  body: replaceTokens(section.body, tokenMap),
  imageUrl: replaceTokens(section.imageUrl, tokenMap),
  ctaLabel: replaceTokens(section.ctaLabel, tokenMap),
  ctaUrl: replaceTokens(section.ctaUrl, tokenMap),
  cards: section.cards?.map((card) => ({
    ...card,
    label: replaceTokens(card.label, tokenMap) || "",
    title: replaceTokens(card.title, tokenMap) || "",
    body: replaceTokens(card.body, tokenMap) || "",
    imageUrl: replaceTokens(card.imageUrl, tokenMap),
    ctaLabel: replaceTokens(card.ctaLabel, tokenMap),
    ctaUrl: replaceTokens(card.ctaUrl, tokenMap),
  })),
  listItems: section.listItems?.map((item) => ({
    ...item,
    title: replaceTokens(item.title, tokenMap) || "",
    body: replaceTokens(item.body, tokenMap) || "",
  })),
});

const normalizeCountGrammar = (value: string) =>
  value
    .replace(/\b1 shows\b/g, "1 show")
    .replace(/\b1 concerts\b/g, "1 concert")
    .replace(/\b1 reviews\b/g, "1 review")
    .replace(/\s+at\s+\./g, ".")
    .replace(/\s+near\s+\./g, ".")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+,/g, ",")
    .replace(/\s+\./g, ".")
    .replace(/,+/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();

const readableEventDate = (value?: string | null) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const formatRecipientCity = (city?: string) => {
  if (!city) return city ?? "";
  return city.replace(/\bWashington\s+DC\b/gi, "Washington, DC");
};

const isRenderableUrl = (value?: string) => {
  if (!value) return false;
  if (value.startsWith("{{") && value.endsWith("}}")) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
};

const sanitizeSectionForRender = (section: NewsletterSection): NewsletterSection => {
  const ctaUrl = isRenderableUrl(section.ctaUrl) ? section.ctaUrl : undefined;
  const ctaLabel = ctaUrl ? section.ctaLabel : undefined;
  return {
    ...section,
    label: section.label ? normalizeCountGrammar(section.label) : section.label,
    eyebrowText: section.eyebrowText
      ? normalizeCountGrammar(section.eyebrowText)
      : section.eyebrowText,
    headline: section.headline
      ? normalizeCountGrammar(section.headline)
      : section.headline,
    body: section.body ? normalizeCountGrammar(section.body) : section.body,
    ctaLabel,
    ctaUrl,
    cards: section.cards?.map((card) => ({
      ...card,
      label: normalizeCountGrammar(card.label),
      title: normalizeCountGrammar(card.title),
      body: normalizeCountGrammar(card.body),
      ctaUrl: isRenderableUrl(card.ctaUrl) ? card.ctaUrl : undefined,
      ctaLabel: isRenderableUrl(card.ctaUrl) ? card.ctaLabel : undefined,
    })),
    listItems: section.listItems?.map((item) => ({
      ...item,
      title: normalizeCountGrammar(item.title),
      body: normalizeCountGrammar(item.body),
    })),
  };
};

const applyFallbackContent = (
  section: NewsletterSection,
  fallbackContent: NonNullable<NewsletterSection["personalization"]>["fallbackContent"]
): NewsletterSection => {
  if (!fallbackContent) return section;
  return {
    ...section,
    ...fallbackContent,
    ctaStyle: section.ctaStyle ?? "button",
    listItems:
      fallbackContent.listItems !== undefined
        ? fallbackContent.listItems
        : section.type === "yourMusic"
          ? []
          : section.listItems,
    cards: fallbackContent.cards !== undefined ? fallbackContent.cards : section.cards,
  };
};

const buildYourSynthSection = (
  section: NewsletterSection,
  context: NewsletterPersonalizationContext
): NewsletterSection => {
  const upcoming = context.synthActivity.upcomingShows[0];
  const attended = context.synthActivity.recentlyAttendedConcerts[0];
  const review = context.synthActivity.recentReviews[0];
  const lifetimeShows = context.synthActivity.lifetimeConcertCount;
  const lifetimeReviews = context.synthActivity.lifetimeReviewCount;

  if (upcoming) {
    const count = context.synthActivity.upcomingShows.length;
    return {
      ...section,
      label: "Your Synth",
      headline:
        count === 1 ? "Your next show is on the calendar." : "Your next few shows are lined up.",
      body:
        count === 1
          ? `${upcoming.artistName} at ${upcoming.venueName} is next. You’ve logged ${lifetimeShows} concerts so far.`
          : `Starting with ${upcoming.artistName} at ${upcoming.venueName}, you have ${count} shows ahead. You’ve logged ${lifetimeShows} concerts so far.`,
      ctaLabel: "View your upcoming shows",
      ctaUrl: SYNTH_APP_URL,
      ctaStyle: "button",
    };
  }

  if (attended || lifetimeShows > 0 || lifetimeReviews > 0) {
    const anchor = attended?.artistName ?? review?.eventTitle ?? "your recent shows";
    return {
      ...section,
      label: "Your Synth",
      headline: "Your show history is already working for you.",
      body:
        lifetimeReviews > 0
          ? `You’ve logged ${lifetimeShows} concerts and ${lifetimeReviews} reviews, including ${anchor}.`
          : `You’ve logged ${lifetimeShows} concerts so far. Keep adding nights so your timeline stays useful.`,
      ctaLabel: "Open your Synth timeline",
      ctaUrl: SYNTH_APP_URL,
      ctaStyle: "button",
    };
  }

  if (context.synthActivity.recentlyInterestedEvents.length > 0) {
    const saved = context.synthActivity.recentlyInterestedEvents[0];
    return {
      ...section,
      label: "Your Synth",
      headline: "You’ve already saved shows worth keeping close.",
      body: `${saved.artistName} at ${saved.venueName} is on your list. Save another date while you’re looking.`,
      ctaLabel: "Browse shows",
      ctaUrl: SYNTH_APP_URL,
      ctaStyle: "button",
    };
  }

  return applyFallbackContent(section, section.personalization?.fallbackContent);
};

const buildConcertHistorySection = (
  section: NewsletterSection,
  context: NewsletterPersonalizationContext
): NewsletterSection | null => {
  const attended = context.synthActivity.recentlyAttendedConcerts;
  const uniqueArtists = [...new Set(
    attended
      .map((event) => event.artistName?.trim())
      .filter((artist): artist is string => Boolean(artist && artist.toLowerCase() !== "unknown artist"))
  )];
  const uniqueVenues = [...new Set(
    attended
      .map((event) => event.venueName?.trim())
      .filter((venue): venue is string => Boolean(venue && venue.toLowerCase() !== "unknown venue"))
  )];
  const recentDetail = attended[0];
  const recentReview = context.synthActivity.recentReviews[0];
  const hasPhoto = context.synthActivity.recentPhotos.length > 0;

  // 1) Multiple real artists from concert history.
  if (uniqueArtists.length >= 3) {
    const artistLine = uniqueArtists.slice(0, 3).join(" · ");
    return {
      ...section,
      label: "From Your Concert History",
      headline: "A few names already on your timeline",
      body: hasPhoto
        ? "You even have photos saved from one of your recent nights."
        : "These are already part of your real show history on Synth.",
      listItems: [
        {
          id: "history-artists",
          title: artistLine,
          body: "",
        },
      ],
    };
  }

  // 2) Multiple real venues from concert history.
  if (uniqueVenues.length >= 3) {
    const venueLine = uniqueVenues.slice(0, 3).join(" · ");
    return {
      ...section,
      label: "From Your Concert History",
      headline: "Places that already show up in your concert history",
      body: "You’ve built a real trail of rooms and stages in your timeline.",
      listItems: [
        {
          id: "history-venues",
          title: venueLine,
          body: "",
        },
      ],
    };
  }

  // 3) Combination of recent artist + venue/show history.
  if (uniqueArtists.length >= 1 && uniqueVenues.length >= 1 && attended.length >= 2) {
    const recentArtist = uniqueArtists[0];
    const recentVenue = uniqueVenues[0];
    return {
      ...section,
      label: "From Your Concert History",
      headline: `${recentArtist} and ${recentVenue} are already in your story`,
      body: "Your timeline is already rich enough to make every week feel familiar.",
      listItems: [],
    };
  }

  // 4) One meaningful recent concert detail.
  if (recentDetail && (recentDetail.artistName || recentReview?.eventTitle)) {
    const artist = recentDetail.artistName || recentReview?.eventTitle || "a recent show";
    const venue = recentDetail.venueName && recentDetail.venueName !== "Unknown venue" ? recentDetail.venueName : null;
    const dateLabel = readableEventDate(recentDetail.eventDate);
    const detailLine = [artist, venue].filter(Boolean).join(" at ");
    return {
      ...section,
      label: "From Your Concert History",
      headline: "One recent night worth keeping close",
      body: dateLabel ? `${detailLine} · ${dateLabel}` : detailLine,
      listItems: [],
    };
  }

  // Not enough reliable history: hide this personalization-only section.
  return null;
};

const buildYourMusicSection = (
  section: NewsletterSection,
  context: NewsletterPersonalizationContext
): NewsletterSection => {
  const connected =
    context.musicConnections.spotifyConnected || context.musicConnections.appleMusicConnected;
  const dataAvailable =
    context.musicConnections.spotifyDataAvailable ||
    context.musicConnections.appleMusicDataAvailable ||
    hasUsableStreamingData(context);
  const topArtist = context.musicConnections.topArtists[0]?.name;
  const topGenre = context.musicConnections.genres[0];
  const serviceLabel = context.musicConnections.spotifyConnected
    ? "Spotify"
    : context.musicConnections.appleMusicConnected
      ? "Apple Music"
      : "your music service";

  if (dataAvailable && topArtist) {
    return {
      ...section,
      label: "Your Music",
      headline: "Based on your recent listening",
      body: topGenre
        ? `${topArtist} keeps showing up in your listening, with a lean toward ${topGenre}.`
        : `${topArtist} keeps showing up in your listening.`,
      ctaLabel: "Browse matching shows",
      ctaUrl: SYNTH_APP_URL,
      ctaStyle: "button",
    };
  }

  if (connected && !dataAvailable) {
    return {
      ...section,
      label: "Your Music",
      headline: `${serviceLabel} is connected.`,
      body: "We’re still building out your listening insights.",
      ctaLabel: "Browse shows",
      ctaUrl: SYNTH_APP_URL,
      ctaStyle: "button",
      listItems: [],
    };
  }

  return applyFallbackContent(section, section.personalization?.fallbackContent);
};

const buildComingUpSection = (
  section: NewsletterSection,
  context: NewsletterPersonalizationContext
): NewsletterSection => {
  const directEvent =
    context.synthActivity.upcomingShows[0] ??
    context.synthActivity.recentlyInterestedEvents.find(
      (event) => new Date(event.eventDate).getTime() >= Date.now()
    );
  if (directEvent) {
    return {
      ...section,
      label: "Coming Up",
      headline: `Next on your calendar: ${directEvent.artistName}`,
      body: `${directEvent.venueName} is waiting. Keep the details close so the night stays easy to find.`,
      ctaLabel: "View your upcoming shows",
      ctaUrl: SYNTH_APP_URL,
      ctaStyle: "button",
    };
  }

  if (context.user.city && context.recommendations.nearbyShows.length > 0) {
    const nearby = context.recommendations.nearbyShows[0];
    return {
      ...section,
      label: "Coming Up",
      headline: `Coming up near ${context.user.city}`,
      body: `${nearby.artistName} at ${nearby.venueName} looks like a strong fit.`,
      ctaLabel: "Browse shows",
      ctaUrl: SYNTH_APP_URL,
      ctaStyle: "button",
    };
  }

  if (context.user.city) {
    const cityLabel = formatRecipientCity(context.user.city);
    return {
      ...section,
      label: "Coming Up",
      headline: `Find a show near ${cityLabel}`,
      body: `Browse live dates around ${cityLabel} and save one you actually want to see.`,
      ctaLabel: "Browse shows",
      ctaUrl: SYNTH_APP_URL,
      ctaStyle: "button",
    };
  }

  return {
    ...section,
    label: "Coming Up",
    headline: "Find your next night out",
    body: "Browse live dates and save one show you actually want to see.",
    ctaLabel: "Browse shows",
    ctaUrl: SYNTH_APP_URL,
    ctaStyle: "button",
  };
};

const buildHeroSection = (
  section: NewsletterSection,
  context: NewsletterPersonalizationContext
): NewsletterSection => {
  const nextShow = context.synthActivity.upcomingShows[0];
  const hasUpcoming = context.synthActivity.upcomingShows.length > 0;
  const hasMusic = context.musicConnections.topArtists.length > 0;
  const topArtist = context.musicConnections.topArtists[0]?.name;

  if (hasUpcoming && nextShow) {
    const count = context.synthActivity.upcomingShows.length;
    return {
      ...section,
      label: "Your week in live music",
      headline:
        count === 1
          ? "Your next show is taking shape."
          : "Your next few shows are taking shape.",
      body:
        count === 1
          ? `${nextShow.artistName} at ${nextShow.venueName} is on your calendar.`
          : `Starting with ${nextShow.artistName} at ${nextShow.venueName}, you have ${count} shows ahead.`,
    };
  }

  if (hasMusic && topArtist) {
    return {
      ...section,
      label: "Your week in live music",
      headline: "Your listening already points to live nights.",
      body: `${topArtist} keeps showing up in your mix. See what else is coming up.`,
    };
  }

  if (context.synthActivity.lifetimeConcertCount > 0) {
    const lifetimeShows = context.synthActivity.lifetimeConcertCount;
    return {
      ...section,
      label: "Your week in live music",
      headline: `${lifetimeShows} shows down. Plenty more to come.`,
      body: "Here’s what’s worth knowing this week, plus a simple way to keep adding nights you’ve already seen.",
    };
  }

  return {
    ...section,
    label: section.label || "Your week in live music",
    headline: section.headline || "Here’s what’s worth knowing this week.",
    body:
      section.body ||
      "A short guide to the shows, stories, and moments worth your attention.",
  };
};

const buildDiscoverSection = (
  section: NewsletterSection,
  context: NewsletterPersonalizationContext
): NewsletterSection => {
  const musicConnected =
    context.musicConnections.spotifyConnected || context.musicConnections.appleMusicConnected;
  const musicDataAvailable =
    context.musicConnections.spotifyDataAvailable ||
    context.musicConnections.appleMusicDataAvailable ||
    hasUsableStreamingData(context);

  if (!musicConnected && context.musicConnections.topArtists.length === 0) {
    return {
      ...section,
      label: "Discover",
      headline: "Connect Spotify.",
      body: "Bring your listening into Synth and make show recommendations easier to trust.",
      ctaLabel: "Connect your music",
      ctaUrl: SYNTH_APP_URL,
      ctaStyle: "button",
    };
  }

  if (musicConnected && !musicDataAvailable) {
    return {
      ...section,
      label: "Discover",
      headline: "Follow one artist you never want to miss.",
      body: "Following artists helps keep your weekly picks focused on the shows you care about.",
      ctaLabel: "Follow artists",
      ctaUrl: SYNTH_APP_URL,
      ctaStyle: "button",
    };
  }

  if (context.synthActivity.unreviewedConcerts.length > 0) {
    return {
      ...section,
      label: "Discover",
      headline: "Finish that review.",
      body: "You already have a show waiting for a few notes while the night is still clear.",
      ctaLabel: "Review a show",
      ctaUrl: SYNTH_APP_URL,
      ctaStyle: "button",
    };
  }

  if (!context.user.city) {
    return {
      ...section,
      label: "Discover",
      headline: "Find a show near you.",
      body: "Add your city so nearby dates are easier to spot.",
      ctaLabel: "Browse shows",
      ctaUrl: SYNTH_APP_URL,
      ctaStyle: "button",
    };
  }

  if (context.synthActivity.lifetimeConcertCount === 0) {
    return {
      ...section,
      label: "Discover",
      headline: "Add the last concert you went to.",
      body: "One show is enough to start building a timeline you can actually use.",
      ctaLabel: "Add your last concert",
      ctaUrl: SYNTH_APP_URL,
      ctaStyle: "button",
    };
  }

  return {
    ...section,
    label: "Discover",
    headline: "Find a show near you.",
    body: "Save one date this week and keep your calendar moving.",
    ctaLabel: "Browse shows",
    ctaUrl: SYNTH_APP_URL,
    ctaStyle: "button",
  };
};

const inferActivityCity = (events: NewsletterEventSummary[]) => {
  const counts = new Map<string, number>();
  events.forEach((event) => {
    const city = event.city?.trim();
    if (!city) return;
    counts.set(city, (counts.get(city) ?? 0) + 1);
  });
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [city, count] = sorted[0] ?? [];
  return city && count >= 2 ? city : undefined;
};

const getInterestSignals = async (userId: string) => {
  const trySources = async () => {
    const userInteractions = await (supabase as any)
      .from("user_interactions")
      .select("entity_type, entity_id, metadata, occurred_at, event_type")
      .eq("user_id", userId)
      .in("entity_type", ["artist", "venue"])
      .order("occurred_at", { ascending: false })
      .limit(250);
    if (!userInteractions.error) return userInteractions.data ?? [];

    const interactions = await (supabase as any)
      .from("interactions")
      .select("entity_type, entity_id, metadata, occurred_at, event_type, interaction_type")
      .eq("user_id", userId)
      .in("entity_type", ["artist", "venue"])
      .order("occurred_at", { ascending: false })
      .limit(250);
    if (!interactions.error) return interactions.data ?? [];

    return [];
  };

  const allowedTypes = new Set(["interest", "review", "music_pref"]);
  const data = await trySources();

  const artistMap = new Map<string, NewsletterArtistSummary>();
  const venueMap = new Map<string, NewsletterVenueSummary>();
  const artistCount = new Map<string, number>();
  const venueCount = new Map<string, number>();
  (data ?? []).forEach((row: any) => {
    const eventType = String(row.event_type ?? row.interaction_type ?? "").toLowerCase();
    if (!allowedTypes.has(eventType)) return;
    if (row.entity_type === "artist") {
      const name = String(row.metadata?.name ?? row.metadata?.artist_name ?? row.entity_id);
      artistCount.set(name, (artistCount.get(name) ?? 0) + 1);
      if (!artistMap.has(name)) artistMap.set(name, { name, score: 0 });
    }
    if (row.entity_type === "venue") {
      const name = String(row.metadata?.name ?? row.metadata?.venue_name ?? row.entity_id);
      venueCount.set(name, (venueCount.get(name) ?? 0) + 1);
      if (!venueMap.has(name)) {
        venueMap.set(name, {
          name,
          city: row.metadata?.city ?? null,
          state: row.metadata?.state ?? null,
        });
      }
    }
  });

  const mediumConfidenceArtists = [...artistMap.values()]
    .map((artist) => ({ ...artist, score: artistCount.get(artist.name) ?? 0 }))
    .filter((artist) => (artist.score ?? 0) >= 2)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const mediumConfidenceVenues = [...venueMap.values()]
    .map((venue) => ({ ...venue, score: venueCount.get(venue.name) ?? 0 }))
    .filter((venue) => (venue.score ?? 0) >= 2)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return {
    interestArtists: mediumConfidenceArtists.slice(0, 8),
    interestVenues: mediumConfidenceVenues.map(({ score, ...venue }) => venue).slice(0, 8),
    lowConfidenceSignals:
      [...artistCount.values()].filter((count) => count === 1).length +
      [...venueCount.values()].filter((count) => count === 1).length,
  };
};

export const getMockPersonalizationContext = (
  preset: NewsletterPreviewPreset
): NewsletterPersonalizationContext => {
  const baseEvent: NewsletterEventSummary = {
    id: "mock-event-1",
    title: "Mock: Late Night at 9:30 Club",
    artistName: "Mock Artist",
    venueName: "9:30 Club",
    eventDate: "2026-08-15",
    city: "Washington",
    state: "DC",
  };

  const common: NewsletterPersonalizationContext = {
    source: "mock",
    isAdminMockData: true,
    containsRealUserData: false,
    user: {
      id: "admin-mock-user",
      firstName: "Alex",
      email: "admin.mock@example.com",
      city: "Washington",
      location: "Washington, DC",
    },
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
      nearbyShows: [baseEvent],
      relevantArtists: [{ name: "Mock Artist" }],
      relevantVenues: [{ name: "9:30 Club", city: "Washington", state: "DC" }],
    },
  };

  if (preset === "active-user") {
    common.synthActivity.upcomingShows = [baseEvent];
    common.synthActivity.recentlyInterestedEvents = [baseEvent];
    common.synthActivity.recentlyAttendedConcerts = [{ ...baseEvent, id: "mock-attended-1" }];
    common.synthActivity.recentReviews = [
      {
        id: "mock-review-1",
        rating: 5,
        reviewText: "Amazing set.",
        eventTitle: baseEvent.title,
        eventDate: baseEvent.eventDate,
        createdAt: new Date().toISOString(),
      },
    ];
    common.synthActivity.recentPhotos = [
      {
        reviewId: "mock-review-1",
        photoUrl: "https://getsynth.app/newsletters/images/mock-photo.jpg",
        createdAt: new Date().toISOString(),
      },
    ];
    common.synthActivity.newConnections = [
      { userId: "mock-friend-1", name: "Jordan", createdAt: new Date().toISOString() },
    ];
    common.synthActivity.lifetimeConcertCount = 12;
    common.synthActivity.lifetimeReviewCount = 8;
    common.synthActivity.unreviewedConcerts = [{ ...baseEvent, id: "mock-unreviewed-1" }];
    common.synthActivity.hasActivityInLast7Days = true;
  } else if (preset === "inactive-with-history") {
    common.synthActivity.upcomingShows = [baseEvent];
    common.synthActivity.recentlyAttendedConcerts = [{ ...baseEvent, id: "mock-attended-2" }];
    common.synthActivity.lifetimeConcertCount = 27;
    common.synthActivity.lifetimeReviewCount = 14;
    common.synthActivity.unreviewedConcerts = [{ ...baseEvent, id: "mock-unreviewed-2" }];
  } else if (preset === "spotify-connected-user") {
    common.musicConnections.spotifyConnected = true;
    common.musicConnections.spotifyDataAvailable = true;
    common.musicConnections.topArtists = [{ name: "The National" }, { name: "SZA" }];
    common.musicConnections.recentArtists = [{ name: "The National" }];
    common.musicConnections.genres = ["indie rock", "alt pop"];
    common.musicConnections.artistsWithNearbyShows = [{ name: "The National" }];
    common.recommendations.relevantArtists = [{ name: "The National" }];
  } else if (preset === "apple-connected-user") {
    common.musicConnections.appleMusicConnected = true;
    common.musicConnections.appleMusicDataAvailable = true;
    common.musicConnections.topArtists = [{ name: "boygenius" }, { name: "Mitski" }];
    common.musicConnections.recentArtists = [{ name: "boygenius" }];
    common.musicConnections.genres = ["indie", "alternative"];
    common.musicConnections.artistsWithNearbyShows = [{ name: "Mitski" }];
    common.recommendations.relevantArtists = [{ name: "Mitski" }];
  } else if (preset === "interest-signal-user") {
    common.musicConnections.followedArtists = [{ name: "Japanese Breakfast" }, { name: "Noname" }];
    common.musicConnections.followedVenues = [
      { name: "The Anthem", city: "Washington", state: "DC" },
      { name: "9:30 Club", city: "Washington", state: "DC" },
    ];
    common.recommendations.nearbyShows = [
      { ...baseEvent, id: "mock-following-show-1", artistName: "Japanese Breakfast" },
    ];
  } else if (preset === "missing-location-user") {
    common.user.city = undefined;
    common.user.location = undefined;
    common.recommendations.nearbyShows = [];
    common.musicConnections.topArtists = [{ name: "Khruangbin" }];
    common.musicConnections.spotifyConnected = true;
    common.musicConnections.spotifyDataAvailable = true;
  }

  return common;
};

export const inferDerivedState = (
  context: NewsletterPersonalizationContext
): NewsletterDerivedState => {
  const hasHistoricalSynthData =
    context.synthActivity.lifetimeConcertCount > 0 ||
    context.synthActivity.lifetimeReviewCount > 0 ||
    context.synthActivity.recentlyAttendedConcerts.length > 0 ||
    context.synthActivity.recentlyInterestedEvents.length > 0 ||
    context.synthActivity.recentReviews.length > 0;
  const hasMusicConnection =
    context.musicConnections.spotifyConnected || context.musicConnections.appleMusicConnected;
  const hasMusicData =
    context.musicConnections.spotifyDataAvailable ||
    context.musicConnections.appleMusicDataAvailable ||
    hasUsableStreamingData(context);
  const hasInterestSignals =
    context.musicConnections.followedArtists.length > 0 ||
    context.musicConnections.followedVenues.length > 0;
  const missingLocation = !context.user.city && context.recommendations.nearbyShows.length === 0;

  if (context.synthActivity.hasActivityInLast7Days) return "active-user";
  if (hasHistoricalSynthData) return "inactive-with-history";
  if (hasMusicConnection || hasMusicData) return "connected-music-user";
  if (hasInterestSignals) return "interest-signal-user";
  if (missingLocation) return "missing-location-user";
  return "new-or-empty-user";
};

interface NewsletterCapabilities {
  hasRecentActivity: boolean;
  hasHistory: boolean;
  hasMusicConnection: boolean;
  hasLocation: boolean;
  hasInterestSignals: boolean;
}

const deriveCapabilities = (
  context: NewsletterPersonalizationContext
): NewsletterCapabilities => ({
  hasRecentActivity: context.synthActivity.hasActivityInLast7Days,
  hasHistory:
    context.synthActivity.lifetimeConcertCount > 0 ||
    context.synthActivity.lifetimeReviewCount > 0 ||
    context.synthActivity.recentlyInterestedEvents.length > 0 ||
    context.synthActivity.recentlyAttendedConcerts.length > 0,
  hasMusicConnection:
    context.musicConnections.spotifyConnected ||
    context.musicConnections.appleMusicConnected ||
    context.musicConnections.spotifyDataAvailable ||
    context.musicConnections.appleMusicDataAvailable ||
    context.musicConnections.topArtists.length > 0,
  hasLocation: Boolean(context.user.city),
  hasInterestSignals:
    context.musicConnections.followedArtists.length > 0 ||
    context.musicConnections.followedVenues.length > 0,
});

const deriveApplicableStates = (
  context: NewsletterPersonalizationContext,
  primaryState: NewsletterDerivedState,
  capabilities: NewsletterCapabilities
) => {
  const states = new Set<NewsletterDerivedState>([primaryState]);
  if (capabilities.hasRecentActivity) states.add("active-user");
  if (!capabilities.hasRecentActivity && capabilities.hasHistory) states.add("inactive-with-history");
  if (capabilities.hasMusicConnection) states.add("connected-music-user");
  if (capabilities.hasInterestSignals) states.add("interest-signal-user");
  if (!capabilities.hasLocation) states.add("missing-location-user");
  if (
    !capabilities.hasHistory &&
    !capabilities.hasMusicConnection &&
    !capabilities.hasInterestSignals
  ) {
    states.add("new-or-empty-user");
  }
  if (!context.user.city && context.recommendations.nearbyShows.length === 0) {
    states.add("missing-location-user");
  }
  return states;
};

const evaluateSectionRender = (
  section: NewsletterSection,
  context: NewsletterPersonalizationContext,
  state: NewsletterDerivedState,
  applicableStates: Set<NewsletterDerivedState>
) => {
  const personalization = section.personalization;
  const sourceLabel = resolveSourceLabel(section);
  if (!personalization) {
    return {
      rendered: true,
      reason: "Rendered as non-personalized module.",
      confidence: "high" as NewsletterPersonalizationConfidence,
      sourceLabel,
    };
  }

  const minimumConfidence = personalization.minimumConfidence ?? "high";
  let achievedConfidence: NewsletterPersonalizationConfidence = "high";

  if (personalization.displayIfStates?.length) {
    const shouldDisplay = personalization.displayIfStates.some((candidate) =>
      applicableStates.has(candidate as NewsletterDerivedState)
    );
    if (!shouldDisplay) {
      return {
        rendered: false,
        reason: `Hidden for state ${state}.`,
        confidence: achievedConfidence,
        sourceLabel,
      };
    }
  }

  if (personalization.requiresLocation && !context.user.city) {
    return {
      rendered: false,
      reason: "Hidden because location is unavailable.",
      confidence: achievedConfidence,
      sourceLabel,
    };
  }

  if (personalization.requiredDataFields?.length) {
    const missingField = personalization.requiredDataFields.find((field) => !hasDataField(context, field));
    if (missingField) {
      return {
        rendered: false,
        reason: `Missing required data: ${missingField}.`,
        confidence: achievedConfidence,
        sourceLabel,
      };
    }
    const lowestFieldConfidence = personalization.requiredDataFields.reduce<NewsletterPersonalizationConfidence>(
      (currentLowest, field) => {
        const candidate = confidenceForDataField(context, field);
        return confidenceOrder[candidate] < confidenceOrder[currentLowest]
          ? candidate
          : currentLowest;
      },
      "high"
    );
    achievedConfidence = lowestFieldConfidence;
  }

  if (confidenceOrder[achievedConfidence] < confidenceOrder[minimumConfidence]) {
    return {
      rendered: false,
      reason: `Hidden because confidence was ${achievedConfidence}, below required ${minimumConfidence}.`,
      confidence: achievedConfidence,
      sourceLabel,
    };
  }

  return {
    rendered: true,
    reason: "Rendered because personalization conditions passed.",
    confidence: achievedConfidence,
    sourceLabel,
  };
};

export interface ResolvedNewsletterResult {
  newsletter: NewsletterIssue;
  state: NewsletterDerivedState;
  moduleExplanations: NewsletterModuleExplanation[];
}

export const resolveNewsletterForContext = (
  newsletter: NewsletterIssue,
  context: NewsletterPersonalizationContext,
  mode: "template" | "resolved"
): ResolvedNewsletterResult => {
  const tokenMap = tokenValuesForContext(context);
  const derivedState = inferDerivedState(context);
  const capabilities = deriveCapabilities(context);
  const applicableStates = deriveApplicableStates(context, derivedState, capabilities);
  const byId = new Map(newsletter.sections.map((section) => [section.id, section]));

  const moduleExplanations: NewsletterModuleExplanation[] = [];
  const resolvedSections = newsletter.sections
    .map((section) => {
      if (mode === "resolved" && section.type === "hero") {
        moduleExplanations.push({
          sectionId: section.id,
          sectionType: section.type,
          rendered: true,
          sourceLabel:
            context.synthActivity.upcomingShows.length > 0 ||
            context.musicConnections.topArtists.length > 0 ||
            context.synthActivity.lifetimeConcertCount > 0
              ? "Personalized"
              : "Admin-selected",
          confidence: "high",
          fallbackUsed:
            context.synthActivity.upcomingShows.length === 0 &&
            context.musicConnections.topArtists.length === 0 &&
            context.synthActivity.lifetimeConcertCount === 0,
          reason:
            context.synthActivity.upcomingShows.length > 0 ||
            context.musicConnections.topArtists.length > 0 ||
            context.synthActivity.lifetimeConcertCount > 0
              ? "Rendered hero from recipient activity or listening data."
              : "Rendered editorial hero so every issue opens with a strong first section.",
        });
        return sanitizeSectionForRender(
          replaceSectionTokens(buildHeroSection(section, context), tokenMap)
        );
      }

      if (mode === "resolved" && section.type === "yourSynth") {
        const hasSynthSignal =
          context.synthActivity.upcomingShows.length > 0 ||
          context.synthActivity.recentlyAttendedConcerts.length > 0 ||
          context.synthActivity.recentReviews.length > 0 ||
          context.synthActivity.lifetimeConcertCount > 0 ||
          context.synthActivity.lifetimeReviewCount > 0 ||
          context.synthActivity.recentlyInterestedEvents.length > 0;
        const baseCheck = evaluateSectionRender(section, context, derivedState, applicableStates);
        if (!baseCheck.rendered && !section.personalization?.fallbackContent) {
          moduleExplanations.push({
            sectionId: section.id,
            sectionType: section.type,
            rendered: false,
            sourceLabel: baseCheck.sourceLabel,
            confidence: baseCheck.confidence,
            fallbackUsed: false,
            reason: `${baseCheck.reason} Hidden because no fallback was configured.`,
          });
          return { ...section, hidden: true };
        }
        const built = buildYourSynthSection(section, context);
        moduleExplanations.push({
          sectionId: section.id,
          sectionType: section.type,
          rendered: true,
          sourceLabel: hasSynthSignal ? "Personalized" : "Evergreen fallback",
          confidence: "high",
          fallbackUsed: !hasSynthSignal,
          reason: hasSynthSignal
            ? "Rendered from upcoming shows, reviews, or concert history."
            : `${baseCheck.reason} Used inline fallback content.`,
        });
        return sanitizeSectionForRender(replaceSectionTokens(built, tokenMap));
      }

      if (mode === "resolved" && section.type === "concertHistory") {
        const built = buildConcertHistorySection(section, context);
        if (!built) {
          moduleExplanations.push({
            sectionId: section.id,
            sectionType: section.type,
            rendered: false,
            sourceLabel: "Personalized",
            confidence: "high",
            fallbackUsed: false,
            reason: "Hidden because reliable concert-history details were insufficient.",
          });
          return { ...section, hidden: true };
        }
        moduleExplanations.push({
          sectionId: section.id,
          sectionType: section.type,
          rendered: true,
          sourceLabel: "Personalized",
          confidence: "high",
          fallbackUsed: false,
          reason: "Rendered from high-confidence concert and review history.",
        });
        return sanitizeSectionForRender(replaceSectionTokens(built, tokenMap));
      }

      if (mode === "resolved" && section.type === "yourMusic") {
        const connected =
          context.musicConnections.spotifyConnected || context.musicConnections.appleMusicConnected;
        const dataAvailable =
          context.musicConnections.spotifyDataAvailable ||
          context.musicConnections.appleMusicDataAvailable ||
          hasUsableStreamingData(context);
        if (connected && !dataAvailable) {
          moduleExplanations.push({
            sectionId: section.id,
            sectionType: section.type,
            rendered: false,
            sourceLabel: "Streaming-based",
            confidence: "high",
            fallbackUsed: false,
            reason: "Hidden because no recipient-safe music insight is available yet.",
          });
          return { ...section, hidden: true };
        }
        const built = buildYourMusicSection(section, context);
        moduleExplanations.push({
          sectionId: section.id,
          sectionType: section.type,
          rendered: true,
          sourceLabel: dataAvailable ? "Streaming-based" : connected ? "Personalized" : "Evergreen fallback",
          confidence: "high",
          fallbackUsed: !connected && !dataAvailable,
          reason: dataAvailable
            ? "Rendered from streaming listening insights."
            : connected
              ? "Spotify/Apple Music is connected but listening insights are not available yet."
              : "No music connection detected. Used connect-music fallback.",
        });
        return sanitizeSectionForRender(replaceSectionTokens(built, tokenMap));
      }

      if (mode === "resolved" && section.id === "coming-up-001") {
        const hasDirectEvent =
          context.synthActivity.upcomingShows.length > 0 ||
          context.synthActivity.recentlyInterestedEvents.some(
            (event) => new Date(event.eventDate).getTime() >= Date.now()
          );
        const hasNearby = Boolean(context.user.city) && context.recommendations.nearbyShows.length > 0;
        const hasCityOnly = Boolean(context.user.city) && !hasNearby && !hasDirectEvent;
        const confidence: NewsletterPersonalizationConfidence = hasDirectEvent
          ? "high"
          : hasNearby
            ? "medium"
            : hasCityOnly
              ? "medium"
              : "high";
        const sourceLabel: NewsletterSectionSourceLabel = hasDirectEvent
          ? "Personalized"
          : hasNearby || hasCityOnly
            ? "Location-based"
            : "Evergreen fallback";
        moduleExplanations.push({
          sectionId: section.id,
          sectionType: section.type,
          rendered: true,
          sourceLabel,
          confidence,
          fallbackUsed: !hasDirectEvent && !hasNearby && !hasCityOnly,
          reason: hasDirectEvent
            ? "Rendered from direct upcoming or saved event data."
            : hasNearby
              ? "Rendered from location-aware nearby recommendations."
              : hasCityOnly
                ? "Rendered with recipient city because nearby event inventory was empty."
                : "Rendered with evergreen coming-up content.",
        });
        return sanitizeSectionForRender(buildComingUpSection(section, context));
      }

      if (mode === "resolved" && section.type === "discoverTip") {
        moduleExplanations.push({
          sectionId: section.id,
          sectionType: section.type,
          rendered: true,
          sourceLabel: "Evergreen fallback",
          confidence: "high",
          fallbackUsed: true,
          reason: "Rendered one recipient-relevant next action.",
        });
        return sanitizeSectionForRender(
          replaceSectionTokens(buildDiscoverSection(section, context), tokenMap)
        );
      }

      const baseCheck = evaluateSectionRender(section, context, derivedState, applicableStates);
      if (baseCheck.rendered) {
        moduleExplanations.push({
          sectionId: section.id,
          sectionType: section.type,
          rendered: true,
          sourceLabel: baseCheck.sourceLabel,
          confidence: baseCheck.confidence,
          fallbackUsed: false,
          reason:
            mode === "resolved"
              ? `${baseCheck.reason} Rendered with ${context.source === "mock" ? "Admin mock data" : "real data"}.`
              : "Rendered in template mode without token resolution.",
        });
        const resolvedSection = mode === "resolved" ? replaceSectionTokens(section, tokenMap) : section;
        return sanitizeSectionForRender(resolvedSection);
      }

      const fallbackId = section.personalization?.fallbackSectionId;
      if (fallbackId && byId.has(fallbackId)) {
        const fallback = byId.get(fallbackId)!;
        moduleExplanations.push({
          sectionId: section.id,
          sectionType: section.type,
          rendered: true,
          sourceLabel: "Evergreen fallback",
          confidence: baseCheck.confidence,
          fallbackUsed: true,
          reason: `${baseCheck.reason} Used fallback section ${fallbackId}.`,
        });
        const resolvedFallback = mode === "resolved" ? replaceSectionTokens(fallback, tokenMap) : fallback;
        return sanitizeSectionForRender(resolvedFallback);
      }

      const fallbackContent = section.personalization?.fallbackContent;
      if (fallbackContent) {
        const merged = applyFallbackContent(section, fallbackContent);
        moduleExplanations.push({
          sectionId: section.id,
          sectionType: section.type,
          rendered: true,
          sourceLabel: "Evergreen fallback",
          confidence: baseCheck.confidence,
          fallbackUsed: true,
          reason: `${baseCheck.reason} Used inline fallback content.`,
        });
        const resolvedMerged = mode === "resolved" ? replaceSectionTokens(merged, tokenMap) : merged;
        return sanitizeSectionForRender(resolvedMerged);
      }

      moduleExplanations.push({
        sectionId: section.id,
        sectionType: section.type,
        rendered: false,
        sourceLabel: baseCheck.sourceLabel,
        confidence: baseCheck.confidence,
        fallbackUsed: false,
        reason: `${baseCheck.reason} Hidden because no fallback was configured.`,
      });
      return { ...section, hidden: true };
    })
    .filter(Boolean);

  return {
    newsletter: {
      ...newsletter,
      sections: resolvedSections,
    },
    state: derivedState,
    moduleExplanations,
  };
};

export interface NewsletterPersonalizationValidation {
  errors: string[];
  warnings: string[];
}

const extractTokens = (text?: string) => {
  if (!text) return [];
  return [...text.matchAll(TOKEN_REGEX)].map((match) => match[1]);
};

const sectionTokenStrings = (section: NewsletterSection) => {
  const values = [
    section.label,
    section.eyebrowText,
    section.headline,
    section.body,
    section.ctaLabel,
    section.ctaUrl,
    ...(section.cards ?? []).flatMap((card) => [card.label, card.title, card.body, card.ctaLabel, card.ctaUrl]),
    ...(section.listItems ?? []).flatMap((item) => [item.title, item.body]),
  ];
  return values.filter(Boolean) as string[];
};

export const collectRecipientFacingText = (newsletter: NewsletterIssue) => {
  const values: string[] = [];
  if (newsletter.preheader) values.push(newsletter.preheader);
  if (newsletter.subjectLine) values.push(newsletter.subjectLine);
  newsletter.sections.forEach((section) => {
    if (section.hidden) return;
    values.push(...sectionTokenStrings(section));
    if (section.label) values.push(section.label);
  });
  return values.join("\n");
};

export const findRecipientFacingLeaks = (text: string) => {
  const lower = text.toLowerCase();
  return RECIPIENT_LEAKAGE_PHRASES.filter((phrase) => lower.includes(phrase));
};

export const validateNewsletterPersonalization = (
  newsletter: NewsletterIssue,
  context: NewsletterPersonalizationContext
): NewsletterPersonalizationValidation => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const state = inferDerivedState(context);

  newsletter.sections.forEach((section) => {
    sectionTokenStrings(section)
      .flatMap(extractTokens)
      .forEach((tokenName) => {
        if (!SUPPORTED_TOKENS.has(tokenName as NewsletterTokenName)) {
          errors.push(
            `${section.type} contains unsupported token "{{${tokenName}}}".`
          );
        }
      });

    if (section.personalization?.requiredDataFields?.length) {
      const missingFields = section.personalization.requiredDataFields.filter(
        (field) => !hasDataField(context, field)
      );
      if (missingFields.length > 0 && !section.personalization.fallbackSectionId && !section.personalization.fallbackContent) {
        errors.push(
          `${section.type} requires unavailable data (${missingFields.join(
            ", "
          )}) and has no fallback configured.`
        );
      }
    }

    if (
      section.personalization?.displayIfStates?.length &&
      !section.personalization.displayIfStates.includes(state) &&
      !section.personalization.fallbackSectionId &&
      !section.personalization.fallbackContent
    ) {
      warnings.push(
        `${section.type} does not display for current state "${state}" and has no fallback.`
      );
    }

    if (section.type === "communitySpotlight" && !section.hidden) {
      const body = `${section.headline ?? ""} ${section.body ?? ""}`.toLowerCase();
      const looksFabricated = FABRICATED_COMMUNITY_PHRASES.some((phrase) =>
        body.includes(phrase)
      );
      const claimsRealMemberStory =
        section.personalization?.sourceLabel === "Admin-selected" && looksFabricated;
      if (claimsRealMemberStory && !section.contentSourceUrl) {
        errors.push(
          "Community Spotlight claims a real member story but has no contentSourceUrl."
        );
      }
      if (looksFabricated && !section.contentSourceUrl) {
        errors.push(
          "Community Spotlight appears to fabricate a member story without a source reference."
        );
      }
    }

    if (section.type === "productUpdate" && !section.hidden) {
      const text = `${section.headline ?? ""} ${section.body ?? ""}`.toLowerCase();
      if (
        text.includes("use this block") ||
        text.includes("use this each week") ||
        text.includes("for launches, tips")
      ) {
        errors.push("What's New contains admin helper text that must not ship to recipients.");
      }
    }

    if (section.type === "cta" && section.label?.toLowerCase() === "final cta") {
      errors.push('Final CTA label "Final CTA" is an internal name and must not appear to recipients.');
    }
  });

  const resolved = resolveNewsletterForContext(newsletter, context, "resolved");
  const leakHits = findRecipientFacingLeaks(
    collectRecipientFacingText(resolved.newsletter)
  );
  leakHits.forEach((phrase) => {
    errors.push(`Recipient-facing copy contains blocked implementation phrase: "${phrase}".`);
  });

  return { errors, warnings };
};

export const buildPersonalizationContextForUser = async (
  userId: string
): Promise<NewsletterPersonalizationContext> => {
  // Live schema stores profile + location on `users` (`location_city` / `location_state`).
  // The legacy `profiles` / `city` / `state` columns are not present in production.
  const { data: userRecord } = await (supabase as any)
    .from("users")
    .select(
      "user_id, name, username, email, location_city, location_state, music_streaming_profile, music_streaming_service, last_active_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  const loadStreamingStats = async () => {
    try {
      const result = await (supabase as any)
        .from("user_streaming_stats_summary")
        .select("*")
        .eq("user_id", userId)
        .order("service_type", { ascending: true });
      if (result.error) return [] as any[];
      return result.data ?? [];
    } catch {
      return [] as any[];
    }
  };

  const loadStreamingProfiles = async () => {
    try {
      const result = await (supabase as any)
        .from("streaming_profiles")
        .select("user_id, service_type, sync_status, last_updated")
        .eq("user_id", userId);
      if (result.error) return [] as any[];
      return result.data ?? [];
    } catch {
      return [] as any[];
    }
  };

  const loadReviews = async () => {
    // Production table is `reviews` (not `public_reviews_with_profiles` / `user_reviews`).
    const result = await (supabase as any)
      .from("reviews")
      .select(
        "id, user_id, event_id, artist_id, venue_id, user_created_artist_id, rating, review_text, photos, videos, created_at, is_public, is_draft, was_there, Event_date, setlist"
      )
      .eq("user_id", userId)
      .eq("is_draft", false)
      .order("created_at", { ascending: false })
      .limit(120);
    if (result.error) return [] as any[];
    return result.data ?? [];
  };

  const [
    interestedRows,
    reviewRowsRaw,
    friendsRows,
    streamingStats,
    streamingProfiles,
    musicTaste,
    interestSignals,
  ] = await Promise.all([
    (supabase as any)
      .from("user_jambase_events")
      .select("created_at, jambase_event:jambase_events(*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(120),
    loadReviews(),
    (supabase as any)
      .from("friends")
      .select("*")
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .order("created_at", { ascending: false }),
    loadStreamingStats(),
    loadStreamingProfiles(),
    MusicTasteService.getUserMusicTaste(userId).catch(() => ({
      topArtists: [],
      topGenres: [],
      description: "",
      serviceType: "unknown" as const,
    })),
    getInterestSignals(userId).catch(() => ({
      interestArtists: [],
      interestVenues: [],
      lowConfidenceSignals: 0,
    })),
  ]);

  const reviewRows = Array.isArray(reviewRowsRaw) ? reviewRowsRaw : [];

  const artistIds = [
    ...new Set(reviewRows.map((row: any) => row.artist_id).filter(Boolean)),
  ] as string[];
  const venueIds = [
    ...new Set(reviewRows.map((row: any) => row.venue_id).filter(Boolean)),
  ] as string[];
  const userCreatedArtistIds = [
    ...new Set(reviewRows.map((row: any) => row.user_created_artist_id).filter(Boolean)),
  ] as string[];

  const [artistsRes, venuesRes, userCreatedArtistsRes] = await Promise.all([
    artistIds.length
      ? (supabase as any).from("artists").select("id, name").in("id", artistIds)
      : Promise.resolve({ data: [] as any[] }),
    venueIds.length
      ? (supabase as any).from("venues").select("id, name, city, state").in("id", venueIds)
      : Promise.resolve({ data: [] as any[] }),
    userCreatedArtistIds.length
      ? (supabase as any).from("user_created_artists").select("id, name").in("id", userCreatedArtistIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const artistNameById = new Map<string, string>(
    (artistsRes.data ?? []).map((row: any) => [row.id, row.name])
  );
  const venueById = new Map<string, { name: string; city?: string | null; state?: string | null }>(
    (venuesRes.data ?? []).map((row: any) => [
      row.id,
      { name: row.name, city: row.city ?? null, state: row.state ?? null },
    ])
  );
  const userCreatedArtistNameById = new Map<string, string>(
    (userCreatedArtistsRes.data ?? []).map((row: any) => [row.id, row.name])
  );

  const enrichReview = (row: any) => {
    const artistName =
      (row.artist_id ? artistNameById.get(row.artist_id) : undefined) ??
      (row.user_created_artist_id
        ? userCreatedArtistNameById.get(row.user_created_artist_id)
        : undefined) ??
      row.setlist?.artist?.name ??
      null;
    const venue = row.venue_id ? venueById.get(row.venue_id) : undefined;
    const venueName = venue?.name ?? row.setlist?.venue?.name ?? null;
    const city = venue?.city ?? row.setlist?.venue?.city ?? null;
    const state = venue?.state ?? row.setlist?.venue?.state ?? null;
    const eventDate = row.Event_date ?? row.setlist?.eventDate ?? row.created_at ?? null;
    return { artistName, venueName, city, state, eventDate };
  };

  const dedupeEvents = (events: NewsletterEventSummary[]) => {
    const seen = new Set<string>();
    return events.filter((event) => {
      const key = `${event.id}-${event.artistName}-${event.eventDate}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const interestedData = interestedRows?.error ? [] : interestedRows?.data ?? [];
  const allInterestedEvents = dedupeEvents(
    interestedData.map((row: any) => toEventSummary(row.jambase_event))
  );
  const nowMs = Date.now();
  const upcomingShows = allInterestedEvents.filter((event) => {
    const ts = new Date(event.eventDate).getTime();
    return !Number.isNaN(ts) && ts >= nowMs;
  });
  const recentlyInterestedEvents = allInterestedEvents.slice(0, 6);

  const recentReviews = reviewRows.slice(0, 6).map((row: any) => {
    const enriched = enrichReview(row);
    return {
      id: row.id,
      rating: row.rating,
      reviewText: row.review_text === "ATTENDANCE_ONLY" ? null : row.review_text,
      eventTitle: enriched.artistName ?? enriched.venueName ?? null,
      eventDate: enriched.eventDate,
      createdAt: row.created_at,
    };
  });
  const recentPhotos = reviewRows
    .flatMap((row: any) =>
      (row.photos ?? []).map((photoUrl: string) => ({
        reviewId: row.id,
        photoUrl,
        createdAt: row.created_at,
      }))
    )
    .slice(0, 6);
  const attendedConcerts = dedupeEvents(
    reviewRows
      .filter((row: any) => row.was_there !== false)
      .map((row: any) => {
        const enriched = enrichReview(row);
        return {
          id: String(row.event_id ?? row.id),
          title: String(enriched.artistName ?? enriched.venueName ?? "Concert"),
          artistName: String(enriched.artistName ?? "Unknown artist"),
          venueName: String(enriched.venueName ?? "Unknown venue"),
          eventDate: String(enriched.eventDate ?? row.created_at ?? ""),
          city: enriched.city,
          state: enriched.state,
        };
      })
  );

  const friendsData = friendsRows?.error ? [] : friendsRows?.data ?? [];
  const friendIds = friendsData.map((friend: any) =>
    friend.user1_id === userId ? friend.user2_id : friend.user1_id
  );
  const { data: friendProfiles } = friendIds.length
    ? await (supabase as any)
        .from("users")
        .select("user_id, name")
        .in("user_id", friendIds)
    : { data: [] as any[] };
  const friendNameMap = new Map(
    (friendProfiles ?? []).map((profile: any) => [profile.user_id, profile.name])
  );
  const newConnections = friendsData.slice(0, 8).map((friend: any) => {
    const otherId = friend.user1_id === userId ? friend.user2_id : friend.user1_id;
    return {
      userId: otherId,
      name: friendNameMap.get(otherId) ?? "Connection",
      createdAt: friend.created_at,
    };
  });

  const reviewedEventIds = new Set(
    reviewRows.map((row: any) => row.event_id).filter(Boolean)
  );
  const unreviewedConcerts = recentlyInterestedEvents.filter((event) => {
    const isPast = event.eventDate && new Date(event.eventDate).getTime() < Date.now();
    return isPast && !reviewedEventIds.has(event.id);
  });

  const hasActivityInLast7Days = [
    ...interestedData.map((row: any) => row.created_at),
    ...recentReviews.map((review) => review.createdAt),
    ...recentPhotos.map((photo) => photo.createdAt),
    ...newConnections.map((connection) => connection.createdAt),
    userRecord?.last_active_at,
  ].some((timestamp) => hasRecentTimestamp(timestamp, 7));

  const spotifyStats = streamingStats.find((entry: any) => entry.service_type === "spotify");
  const appleStats = streamingStats.find(
    (entry: any) => entry.service_type === "apple-music" || entry.service_type === "apple"
  );
  const profileServices = detectStreamingServiceFromProfile(
    userRecord?.music_streaming_profile,
    userRecord?.music_streaming_service
  );
  const spotifyProfileRow = streamingProfiles.some(
    (entry: any) => entry.service_type === "spotify"
  );
  const appleProfileRow = streamingProfiles.some(
    (entry: any) => entry.service_type === "apple-music" || entry.service_type === "apple"
  );

  const topArtists: NewsletterArtistSummary[] =
    (musicTaste.topArtists ?? []).map((artist: any) => ({
      name: artist.name,
      score: artist.popularity,
    })) ?? [];
  const recentArtists = topArtists.slice(0, 3);
  const genres = (musicTaste.topGenres ?? []).map((genre: any) => genre.genre).slice(0, 8);
  const streamingDataAvailable = topArtists.length > 0 || genres.length > 0;

  const spotifyConnected =
    Boolean(spotifyStats) || spotifyProfileRow || profileServices.spotify;
  const appleMusicConnected =
    Boolean(appleStats) || appleProfileRow || profileServices.appleMusic;
  const spotifyDataAvailable =
    spotifyConnected &&
    streamingDataAvailable &&
    (Boolean(spotifyStats) ||
      musicTaste.serviceType === "spotify" ||
      (!appleMusicConnected && streamingDataAvailable));
  const appleMusicDataAvailable =
    appleMusicConnected &&
    streamingDataAvailable &&
    (Boolean(appleStats) || musicTaste.serviceType === "apple-music");

  const persistedCity = userRecord?.location_city ?? null;
  const persistedState = userRecord?.location_state ?? null;
  const inferredCity = inferActivityCity([
    ...upcomingShows,
    ...recentlyInterestedEvents,
    ...attendedConcerts,
  ]);
  // Prefer explicit profile location; only fall back to inferred city from activity.
  const city = persistedCity || inferredCity;
  const location = city
    ? `${city}${persistedState ? `, ${persistedState}` : ""}`
    : undefined;

  let nearbyShows: NewsletterEventSummary[] = [];
  if (city) {
    const near = await LocationService.searchEventsByCity(city, 25, 8).catch(() => ({
      events: [] as any[],
      city: null,
    }));
    nearbyShows = dedupeEvents((near.events ?? []).map((event) => toEventSummary(event)));
  }

  const artistsWithNearbyShows = topArtists
    .filter((artist) =>
      nearbyShows.some((event) => event.artistName.toLowerCase() === artist.name.toLowerCase())
    )
    .slice(0, 6);

  const relevantArtistMap = new Map<string, NewsletterArtistSummary>();
  [...artistsWithNearbyShows, ...interestSignals.interestArtists, ...topArtists].forEach(
    (artist) => {
      if (!relevantArtistMap.has(artist.name)) relevantArtistMap.set(artist.name, artist);
    }
  );
  const relevantVenueMap = new Map<string, NewsletterVenueSummary>();
  [
    ...interestSignals.interestVenues,
    ...nearbyShows.map((event) => ({
      name: event.venueName,
      city: event.city,
      state: event.state,
    })),
    ...attendedConcerts
      .filter((event) => event.venueName && event.venueName !== "Unknown venue")
      .map((event) => ({ name: event.venueName, city: event.city, state: event.state })),
  ].forEach((venue) => {
    if (!relevantVenueMap.has(venue.name)) relevantVenueMap.set(venue.name, venue);
  });

  return {
    source: "real",
    isAdminMockData: false,
    containsRealUserData: true,
    user: {
      id: userId,
      firstName: extractFirstName(userRecord?.name ?? userRecord?.username),
      email: userRecord?.email ?? undefined,
      city: city ?? undefined,
      location,
    },
    synthActivity: {
      upcomingShows,
      recentlyInterestedEvents,
      recentlyAttendedConcerts: attendedConcerts.slice(0, 8),
      recentReviews,
      recentPhotos,
      newConnections,
      lifetimeConcertCount: attendedConcerts.length,
      lifetimeReviewCount: reviewRows.filter(
        (row: any) => row.review_text && row.review_text !== "ATTENDANCE_ONLY"
      ).length,
      unreviewedConcerts,
      hasActivityInLast7Days,
    },
    musicConnections: {
      spotifyConnected,
      spotifyDataAvailable,
      appleMusicConnected,
      appleMusicDataAvailable,
      recentArtists,
      topArtists,
      genres,
      artistsWithNearbyShows,
      followedArtists: interestSignals.interestArtists,
      followedVenues: interestSignals.interestVenues,
    },
    recommendations: {
      nearbyShows: nearbyShows.slice(0, 8),
      relevantArtists: [...relevantArtistMap.values()].slice(0, 8),
      relevantVenues: [...relevantVenueMap.values()].slice(0, 8),
    },
  };
};

export interface NewsletterPreviewUserOption {
  id: string;
  label: string;
}

export const searchPreviewUsers = async (
  query: string
): Promise<NewsletterPreviewUserOption[]> => {
  const normalized = query.trim();
  if (!normalized) return [];
  const { data, error } = await (supabase as any)
    .from("users")
    .select("user_id, name, username")
    .or(`name.ilike.%${normalized}%,username.ilike.%${normalized}%`)
    .limit(8);
  if (error || !data) return [];
  return data.map((row: any) => ({
    id: row.user_id,
    label: `${row.name || row.username || row.user_id} (${row.user_id.slice(0, 8)})`,
  }));
};

