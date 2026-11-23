/**
 * The Setlist is a discovery email, NOT an activity statement.
 * History and saves are preference signals. They only appear in reader-facing
 * copy when they explain a real, actionable recommendation.
 */
import type {
  ComposedEdition, EditionEvent, EditionListen, EditionNews,
  EditionReader, EditionSource, ShowCard, StoryCard,
} from "./types";
import { editorialListens, inferTasteGenres, storyTasteScore } from "../../../../../supabase/functions/newsletter-send/editorial";
import { eventWithinSavedLocation, NEARBY_MILES } from "../../../../../supabase/functions/newsletter-send/nearby";
import { isMusicRelatedStory, meaningfulSummary } from "../../../../../supabase/functions/newsletter-send/news";
import { rankArtists } from "../../../../../supabase/functions/newsletter-send/taste";
import { buildShareLandingUrl } from "../../../../../packages/synth-shared/src/shareUrl";
import { formatEventWhen, formatIssueDate, isUpcoming } from "./time";

const APP_URL = "https://join.getsynth.app/";
const APP_ORIGIN = "https://join.getsynth.app";
const PROFILE_EDIT_URL = "https://join.getsynth.app/profile-edit";
const NEWS_WINDOW_MS = 14 * 86400000;
const DAY_MS = 86400000;

/** Canonical email-safe Universal Link that opens a specific event on web + installed apps. */
const eventInApp = (event: EditionEvent, referrerId?: string | null) =>
  buildShareLandingUrl(APP_ORIGIN, "event", event.id, referrerId);

const isRecentPast = (event: EditionEvent, sendAt: Date, days = 10) => {
  const date = Date.parse(event.eventDate.slice(0, 10) + "T23:59:59Z");
  return Number.isFinite(date) && date < sendAt.getTime() && sendAt.getTime() - date <= days * DAY_MS;
};

const validUrl = (input?: string | null): string | null => {
  if (!input) return null;
  try { const url = new URL(input); return /^https?:$/.test(url.protocol) ? url.href : null; }
  catch { return null; }
};
const key = (input?: string | null) => String(input ?? "").trim().toLocaleLowerCase();
const unique = (items: string[]) => [...new Set(items.map(key).filter(Boolean))];
const clean = (input: string) => input.replace(/[\u2013\u2014]/g, ", ").replace(/\s+/g, " ").trim();
const hasPlace = (reader: EditionReader) => Boolean(reader.city?.trim() || (reader.latitude != null && reader.longitude != null));
const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`;
const naturalGenre = (value: string) => value.toLowerCase() === "jamband" || value.toLowerCase() === "jam" ? "jam-band" : value.replace(/-/g, " ");
const artistMention = (text: string, artist: string) => {
  const needle = artist.trim();
  if (needle.length < 3) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(text);
};
const readerArtists = (reader: EditionReader) => unique([
  ...(reader.topArtists ?? []), ...(reader.listenedArtists ?? []), ...(reader.followedArtists ?? []),
  ...reader.reviews.filter((review) => review.rating == null || review.rating >= 3).map((review) => review.artistName),
]);
const repeatCount = (reader: EditionReader, artist: string) => reader.reviews.filter((review) => key(review.artistName) === key(artist)).length;
const localStory = (news: EditionNews, reader: EditionReader) => {
  const location = key(reader.city);
  const state = key(reader.state);
  const title = key(news.title);
  if ((state === "dc" || location === "washington dc" || location === "washington, dc") &&
      /\b(d\.c\.|dc|washington|maryland|prince george.s county)\b/i.test(title)) return true;
  if (location === "chicago" && /\bchicago\b/i.test(title)) return true;
  if (location === "new york" && /\bnew york|nyc|brooklyn|manhattan\b/i.test(title)) return true;
  return Boolean(location.length >= 4 && artistMention(news.title, location));
};

/** Home-feed–style affinity: reviews, streaming, follows, venue follows, genre overlap. */
const affinityScore = (reader: EditionReader, event: EditionEvent, tasteGenres: string[]) => {
  const n = repeatCount(reader, event.artistName);
  const followed = (reader.followedArtists ?? []).some((artist) => key(artist) === key(event.artistName));
  const streamed = [...(reader.topArtists ?? []), ...(reader.listenedArtists ?? [])]
    .some((artist) => key(artist) === key(event.artistName));
  const saved = reader.goingEventIds?.includes(event.id) ? 1 : reader.interestedEventIds?.includes(event.id) ? 2 : 0;
  const seenVenue = reader.reviews.some((review) => key(review.venueName) === key(event.venueName));
  const followedVenue = (reader.followedVenues ?? []).some((venue) => key(venue) === key(event.venueName));
  const genreHits = (event.genres ?? []).filter((genre) =>
    tasteGenres.some((known) => key(genre) === known || known.includes(key(genre)) || key(genre).includes(known))).length;
  // Prefer nearer dates slightly (just-announced / planning window).
  const when = Date.parse(event.eventDate.slice(0, 10) + "T12:00:00Z");
  const daysOut = Number.isFinite(when) ? Math.max(0, (when - Date.now()) / DAY_MS) : 120;
  const recencyBoost = daysOut <= 21 ? 6 : daysOut <= 45 ? 3 : 0;
  return n * 25 + (followed ? 18 : 0) + (streamed ? 15 : 0) + (saved ? 16 - saved : 0)
    + Math.min(genreHits, 3) * 8 + (seenVenue ? 2 : 0) + (followedVenue ? 10 : 0) + recencyBoost;
};

export const composeEdition = ({ reader, events, news, listens, sendAt, editionDate, issueNumber, retrievedAt,
  excludedUrls = [], excludedListenKeys = [], excludedConnectArtists = [] }: {
  reader: EditionReader;
  events: EditionEvent[];
  news: EditionNews[];
  listens: EditionListen[];
  sendAt: Date;
  editionDate: string;
  issueNumber: number;
  retrievedAt: string;
  /** Hard bans (vetoes + caller excludes). Never featured, unlike soft recent-url skips. */
  excludedUrls?: string[];
  excludedListenKeys?: string[];
  excludedConnectArtists?: string[];
}): ComposedEdition | null => {
  const sources: EditionSource[] = [];
  const warnings: string[] = [];
  const featuredArtists: string[] = [];
  const usedArtists = new Set<string>();
  const useArtist = (artist: string) => { const id = key(artist); if (!id || usedArtists.has(id)) return false; usedArtists.add(id); featuredArtists.push(artist); return true; };
  const bannedUrls = new Set(excludedUrls.map((url) => url.trim()).filter(Boolean));
  const pastUrls = new Set((reader.recentSourceUrls ?? []).map((url) => url.trim()));
  const pastLabels = new Set((reader.recentSourceLabels ?? []).map(key));
  const bannedListenKeys = new Set(excludedListenKeys.map(key).filter(Boolean));
  const pastListenKeys = new Set((reader.recentListenKeys ?? []).map(key).filter(Boolean));
  const bannedConnect = new Set(excludedConnectArtists.map(key).filter(Boolean));
  const tasteGenres = inferTasteGenres(reader).map(key);
  const ranked = rankArtists(reader.reviews);
  const preferred = readerArtists(reader);
  const repeat = ranked.find((artist) => artist.mentions >= 2) ?? null;
  const bestArtist = repeat?.name ?? ranked[0]?.name ?? reader.topArtists[0] ?? reader.followedArtists?.[0];
  const firstName = (reader.firstName ?? "").trim();
  const greeting = firstName ? `${firstName}, ` : "";
  const isNear = (event: EditionEvent) => hasPlace(reader) && eventWithinSavedLocation(reader, event);
  const rotation = Math.floor(Date.parse(editionDate + "T00:00:00Z") / (7 * DAY_MS)) % 4;

  // Real upcoming local shows only. A ticket URL is NOT required to discover a
  // show inside Synth — the CTA opens the event. Ticket CTAs still need verified links.
  const tracked = events.filter((event) =>
    (reader.interestedEventIds?.includes(event.id) || reader.goingEventIds?.includes(event.id)) &&
    event.id && event.artistName && event.venueName);
  const upcomingSaved = tracked.filter((event) => isUpcoming(event.eventDate, sendAt, event.state))
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  const pastSaved = tracked.filter((event) => isRecentPast(event, sendAt) &&
    !reader.reviews.some((review) => String(review.eventId ?? "") === String(event.id)))
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate));
  const soon = upcomingSaved.find((event) => {
    const t = Date.parse(event.eventDate.slice(0, 10) + "T23:59:59Z");
    return Number.isFinite(t) && t - sendAt.getTime() <= 21 * DAY_MS;
  });
  const candidates = events.filter((event) => event.id && event.artistName && event.venueName && event.city &&
    isUpcoming(event.eventDate, sendAt, event.state) && isNear(event) &&
    !bannedUrls.has(event.ticketUrl ?? "") && !bannedUrls.has(eventInApp(event, reader.userId)));
  // When another local show can fill radar, leave the soon-saved date for concert plans.
  const planningHasAlternateShow = Boolean(soon && candidates.some((event) =>
    event.id !== soon.id && key(event.artistName) !== key(soon.artistName)));
  const valueOf = (event: EditionEvent) => affinityScore(reader, event, tasteGenres);
  const recentlyShown = (event: EditionEvent) =>
    pastLabels.has(key(`Show ${event.id}`))
    || pastLabels.has(key(`Artist ${event.artistName}`))
    || Boolean(event.ticketUrl && pastUrls.has(event.ticketUrl))
    || pastUrls.has(eventInApp(event, reader.userId));
  const pool = [...candidates].sort((a, b) =>
    Number(recentlyShown(b)) - Number(recentlyShown(a)) ||
    valueOf(b) - valueOf(a) || Number(b.ticketAvailable === true) - Number(a.ticketAvailable === true) ||
    a.eventDate.localeCompare(b.eventDate));
  const selectedEvents: EditionEvent[] = [];
  for (const event of pool) {
    if (selectedEvents.some((chosen) => key(chosen.artistName) === key(event.artistName))) continue;
    if (planningHasAlternateShow && soon && event.id === soon.id) continue;
    // Prefer any unused alternative over repeating a show/artist from the last 56 days.
    if (recentlyShown(event) && pool.some((other) => !recentlyShown(other) && key(other.artistName) !== key(event.artistName))) continue;
    if (!useArtist(event.artistName)) continue;
    selectedEvents.push(event);
    if (selectedEvents.length === 2) break;
  }
  // Broader local fallback: if affinity filtering left us empty but inventory exists,
  // still pick the soonest nearby show rather than inventing nonlocal dates.
  if (!selectedEvents.length && candidates.length) {
    const fallback = [...candidates].sort((a, b) => a.eventDate.localeCompare(b.eventDate))
      .find((event) => useArtist(event.artistName));
    if (fallback) selectedEvents.push(fallback);
  }

  const shows: ShowCard[] = selectedEvents.map((event) => {
    const count = repeatCount(reader, event.artistName);
    const genres = (event.genres ?? []).filter((genre) => tasteGenres.includes(key(genre)));
    let why = count > 1 ? `You've reviewed ${event.artistName} ${count} times. Here's another chance to see them.`
      : count === 1 ? `You've seen ${event.artistName} before. They're back on the calendar.`
      : (reader.followedArtists ?? []).some((artist) => key(artist) === key(event.artistName)) ? `You follow ${event.artistName} on Synth. Here's a nearby date.`
      : reader.topArtists.some((artist) => key(artist) === key(event.artistName)) ? `${event.artistName} is in your listening history. Here's a chance to hear them live.`
      : (reader.followedVenues ?? []).some((venue) => key(venue) === key(event.venueName)) ? `At a venue you follow. Worth a look before it fills up.`
      : genres.length ? `A ${naturalGenre(genres[0])} pick based on your music taste, not just a random show in town.`
      : `A show coming up in your area.`;
    if (reader.goingEventIds?.includes(event.id)) why = `Already marked going? Open the event on Synth to share plans with whoever's coming with you.`;
    else if (reader.interestedEventIds?.includes(event.id)) why = `You saved this one. Open it on Synth if you're thinking about making it happen.`;
    const status = event.ticketAvailable === false ? "Listed as sold out. Check the organizer for updates." :
      event.ticketAvailable === true ? undefined : "Ticket availability not verified; confirm before making plans.";
    const ticket = validUrl(event.ticketUrl);
    const url = eventInApp(event, reader.userId);
    const links: Array<{ label: string; url: string }> = [];
    if (ticket && event.ticketAvailable !== false) {
      links.push({ label: "Official tickets", url: ticket });
    }
    links.push({ label: "Find people to go with", url });
    sources.push({ kind: "event", url: ticket || url, retrievedAt, label: `Show ${event.id}` });
    sources.push({ kind: "editorial", url, retrievedAt, label: `Artist ${event.artistName}` });
    return {
      eyebrow: `${formatEventWhen(event.eventDate, event.state, event.doorsTime)} · ${event.venueName} · ${event.city}`,
      title: event.artistName,
      body: clean(why),
      availabilityNote: status,
      ctaLabel: "Open this show on Synth",
      ctaUrl: url,
      caution: false,
      links,
    };
  });

  // Timely actions from live intent — never imply attendance from Interested alone.
  // Artists already used in radar are skipped so sections stay distinct.
  const features: StoryCard[] = [];
  const addActivity = (event: EditionEvent, mode: "planning" | "review") => {
    const marker = `Action ${mode} ${event.id}`;
    if (pastLabels.has(key(marker)) || features.length >= 2) return;
    if (!useArtist(event.artistName)) return;
    const going = reader.goingEventIds?.includes(event.id);
    const date = formatEventWhen(event.eventDate, event.state);
    const url = eventInApp(event, reader.userId);
    const ticket = validUrl(event.ticketUrl);
    if (mode === "planning") {
      const links: Array<{ label: string; url: string }> = [
        { label: "Find people to go with", url },
      ];
      if (ticket && event.ticketAvailable !== false) {
        links.push({ label: "Official tickets", url: ticket });
      }
      features.push({
        eyebrow: "Your concert plans",
        title: `${event.artistName} at ${event.venueName} is coming up`,
        body: `${date} in ${event.city}. You marked this ${going ? "Going" : "Interested"} on Synth. ${going ? "See who's going and make a plan together." : "Still thinking about it? Check the event, find people to go with, and look for official tickets when listed."}`,
        ctaLabel: "Make plans on Synth",
        ctaUrl: url,
        tone: "yellow",
        links,
      });
    } else {
      features.push({
        eyebrow: "Your show, your take",
        title: `How was ${event.artistName}?`,
        body: `The ${event.venueName} show was on ${date}. You had it saved, but haven't reviewed this event on Synth. If you went, share what you thought. If you didn't, no action needed.`,
        ctaLabel: "Open the event on Synth",
        ctaUrl: url,
        tone: "pink",
      });
    }
    sources.push({ kind: "editorial", url, retrievedAt, label: marker });
  };
  if (soon && planningHasAlternateShow) addActivity(soon, "planning");
  const recentPast = pastSaved.find((event) => !pastLabels.has(key(`Action review ${event.id}`)));
  if (recentPast) addActivity(recentPast, "review");

  // News only when there is a defensible personal or local connection. Sports stay out.
  const rejectedOffTopic = news.filter((item) => !isMusicRelatedStory(item)).length;
  const recent = news.filter((item) => validUrl(item.url) && !bannedUrls.has(item.url) && !pastUrls.has(item.url) &&
    !pastLabels.has(key(item.title)) &&
    isMusicRelatedStory(item) &&
    Number.isFinite(Date.parse(item.publishedAt)) && Date.parse(item.publishedAt) <= sendAt.getTime() &&
    sendAt.getTime() - Date.parse(item.publishedAt) <= NEWS_WINDOW_MS);
  const cleanedNews = recent.map((item) => ({ ...item, summary: meaningfulSummary(item.summary) })).filter((item) => item.summary);
  const omitted = recent.length - cleanedNews.length;
  const newsMatches = cleanedNews.map((item) => {
    const artist = preferred.find((name) => artistMention(`${item.title} ${item.summary}`, name));
    const geography = localStory(item, reader);
    const taste = storyTasteScore(item, tasteGenres);
    const headlineTaste = storyTasteScore({ title: item.title }, tasteGenres);
    const relevant = Boolean(artist || geography || (taste >= 6 && headlineTaste >= 3));
    return { item, artist, geography, relevant, score: (artist ? 100 : 0) + (geography ? 75 : 0) + Math.min(taste, 20) };
  }).filter((row) => row.relevant).sort((a, b) => b.score - a.score || Date.parse(b.item.publishedAt) - Date.parse(a.item.publishedAt));
  const updates: StoryCard[] = [];
  for (const row of newsMatches) {
    if (updates.length >= 2) break;
    const storyText = `${row.item.title} ${row.item.summary}`;
    // Never re-mention an artist already used in shows, plans, or another card.
    if ([...usedArtists].some((artist) => artistMention(storyText, artist))) continue;
    if (row.artist) {
      if (!useArtist(row.artist)) continue;
    } else {
      for (const name of preferred) {
        if (artistMention(storyText, name)) useArtist(name);
      }
    }
    updates.push({
      eyebrow: row.artist ? `In the news · ${row.artist}` : row.geography ? "Around your music scene" : "A story in your lane",
      title: clean(row.item.title),
      body: clean(row.item.summary!),
      ctaLabel: "Read the story",
      ctaUrl: row.item.url,
      tone: "white",
    });
    sources.push({ kind: "news", url: row.item.url, retrievedAt, label: row.item.title });
  }

  // Curated discovery over reprinting old setlists. Prefer local upcoming taste overlaps.
  const localDiscoveries = listens
    .filter((pick) => pick.artistName && pick.trackName && validUrl(pick.url) &&
      !bannedUrls.has(pick.url ?? "") && !bannedUrls.has(pick.sourceUrl ?? "") &&
      !preferred.includes(key(pick.artistName)) && !usedArtists.has(key(pick.artistName)))
    .map((pick) => ({ pick, event: events.find((event) => key(event.artistName) === key(pick.artistName) &&
        isUpcoming(event.eventDate, sendAt, event.state) && isNear(event) &&
        (event.genres ?? []).some((genre) => tasteGenres.some((taste) => key(genre) === taste ||
          taste.includes(key(genre)) || key(genre).includes(taste)))) }))
    .filter((row): row is { pick: EditionListen; event: EditionEvent } => Boolean(row.event))
    .sort((a, b) => Number(Boolean(b.event.ticketUrl)) - Number(Boolean(a.event.ticketUrl)) ||
      a.event.eventDate.localeCompare(b.event.eventDate))
      .filter(({ pick }) => !bannedListenKeys.has(key(`${pick.artistName}, ${pick.trackName}`)) &&
        !pastListenKeys.has(key(`${pick.artistName}, ${pick.trackName}`)))
      .slice(0, 1)
      .map(({ pick, event }) => ({ ...pick, albumName: "", evergreen: false,
      sourceUrl: validUrl(pick.sourceUrl) || validUrl(pick.url)!, genres: event.genres ?? [],
      reason: `There's a ${pick.artistName} show listed around ${event.city}. This is a way to check out the sound before you make plans.` }));
  const playlist = [...localDiscoveries, ...editorialListens(editionDate, tasteGenres, reader.userId)].filter((pick) =>
    Boolean(pick.trackName && validUrl(pick.url)) && !usedArtists.has(key(pick.artistName)) &&
    !preferred.includes(key(pick.artistName)) &&
    !bannedUrls.has(pick.url ?? "") && !bannedUrls.has(pick.sourceUrl ?? "") &&
    !bannedListenKeys.has(key(`${pick.artistName}, ${pick.trackName}`)));
  const freshPicks = playlist.filter((pick) => !pastListenKeys.has(key(`${pick.artistName}, ${pick.trackName}`)));
  const choices = freshPicks.length >= 2 ? freshPicks : [...freshPicks, ...playlist.filter((pick) => !freshPicks.includes(pick))];
  const picks = choices.filter((pick, index, arr) => arr.findIndex((other) => key(other.artistName) === key(pick.artistName)) === index).slice(0, 2);
  const suggested: StoryCard[] = [];
  for (const pick of picks) {
    if (!useArtist(pick.artistName)) continue;
    const shared = pick.genres.map(key).find((genre) => tasteGenres.includes(genre));
    const anchor = bestArtist && !usedArtists.has(key(bestArtist)) ? bestArtist : null;
    const why = anchor && shared
      ? `If ${anchor} is your kind of live show, here's another ${naturalGenre(shared)} direction to explore. `
      : shared ? `A ${naturalGenre(shared)} pick for your rotation. ` : "A left-field pick worth a listen. ";
    suggested.push({
      eyebrow: "On your next listen",
      title: `${pick.artistName} · “${pick.trackName}”`,
      body: clean(why + pick.reason),
      ctaLabel: "Play this track",
      ctaUrl: validUrl(pick.url)!,
      tone: suggested.length === 0 ? "pink" : "white",
    });
    sources.push({ kind: "listen", url: validUrl(pick.sourceUrl) || validUrl(pick.url)!, retrievedAt, label: `${pick.artistName}, ${pick.trackName}` });
  }

  const sharedArtist = reader.otherFiveStarArtists.find((artist) => !usedArtists.has(key(artist)) &&
    !bannedConnect.has(key(artist)) &&
    reader.reviews.some((review) => key(review.artistName) === key(artist) && (review.rating ?? 0) >= 5));
  const connect: StoryCard | undefined = sharedArtist && rotation !== 2 && useArtist(sharedArtist) ? {
    eyebrow: "Find your people",
    title: `You're not the only ${sharedArtist} fan here.`,
    body: `Other Synth users have given ${sharedArtist} five stars too. Find out what made those nights special to them.`,
    ctaLabel: "Explore fan reviews",
    ctaUrl: APP_URL,
    tone: "yellow",
  } : undefined;
  if (sharedArtist && connect) sources.push({ kind: "account", url: APP_URL, retrievedAt, label: `Other five-star fans of ${sharedArtist}` });

  // Local shows are preferred, but subscribed readers still get an edition
  // with listens / news / plans when no nearby date clears the matching checks.
  if (!shows.length) {
    warnings.push(`No verified upcoming local show passed the ${NEARBY_MILES}-mile matching checks. Sending listens and news without a local show.`);
  }

  const closest = selectedEvents[0];
  const leadAction = features[0];
  const headline = leadAction && rotation === 0 ? `${greeting}your next concert move is waiting.`
    : closest && repeatCount(reader, closest.artistName) > 1
    ? `${greeting}${closest.artistName} is back on the calendar.`
    : closest && rotation === 2 ? `${greeting}a live-music detour near ${reader.city || "you"}.`
    : closest ? `${greeting}${closest.artistName} has a date near you.`
    : `${greeting}here's something worth your Monday.`;
  const intro = leadAction && rotation === 0
    ? `Your concert plans and a new show worth discovering, plus fresh music picked for you.`
    : closest && rotation === 2
    ? `This week's live-music picks start with ${closest.artistName} in ${closest.city}. See what catches your ear.`
    : closest && repeatCount(reader, closest.artistName) > 1
    ? `You've reviewed ${closest.artistName} ${repeatCount(reader, closest.artistName)} times. Here's a nearby date, plus a couple of new sounds to try.`
    : closest
    ? `We found a show in your area that lines up with what you listen to. There are new tracks waiting for you, too.`
    : `A couple of songs we think are worth hearing, and the stories that actually connect to your music world.`;
  const subject = leadAction && rotation === 0 ? `${greeting}your concert plans + a show to discover`
    : closest && rotation === 1 ? `${greeting}one concert for your radar: ${closest.artistName}`
    : closest && rotation === 3 ? `${greeting}a live-music detour near ${reader.city || "you"}`
    : closest ? `${greeting}${closest.artistName} near you + this week's picks`
    : bestArtist && picks[0] ? `${greeting}if you like ${bestArtist}, try ${picks[0].artistName}`
    : `${greeting}two new listens picked for you`;
  const conciseSubject = subject.slice(0, 78);

  if (rejectedOffTopic) warnings.push(`${rejectedOffTopic} off-topic or non-music headlines were rejected before personalization.`);
  if (omitted) warnings.push(`${omitted} news stories lacked useful summaries and were excluded.`);
  if (!updates.length) warnings.push("No genuinely relevant, sourced news passed the personalization checks. The news section was omitted.");
  if (picks.length < 2) warnings.push("Fewer than two verified editorial listening picks were available.");

  const missingData: string[] = [];
  if (!reader.reviews.length) missingData.push("No concert history");
  if (!reader.topArtists.length) missingData.push("No streaming artists in the source");
  if (!hasPlace(reader)) missingData.push("No location; no local shows inferred");

  const evidence: string[] = [];
  if (repeat) evidence.push(`Repeated artist preference: ${repeat.name} (${plural(repeat.mentions, "logged show")})`);
  else if (bestArtist) evidence.push(`Taste anchor: ${bestArtist}`);
  if (tasteGenres.length) evidence.push(`Taste genres: ${tasteGenres.slice(0, 4).join(", ")}`);
  if (shows.length) evidence.push(`${shows.length} genuine local linked event matches`);
  if (suggested.length) evidence.push(`${suggested.length} distinct editorial recording recommendations`);
  if (updates.length) evidence.push(`${updates.length} relevant sourced stories`);
  if (features.length) evidence.push(`${features.length} timely saved-event actions`);
  if (reader.recentSourceUrls?.length || reader.recentListenKeys?.length || reader.recentSourceLabels?.length) {
    evidence.push("Recent-edition repeat filter applied");
  }

  const sections = [
    "introduction",
    shows.length ? "onYourRadar" : "",
    features.length ? "yourConcertPlans" : "",
    suggested.length ? "yourNextListen" : "",
    updates.length ? "thisWeekInMusic" : "",
    connect ? "connect" : "",
    "appSpotlight",
  ].filter(Boolean);

  const qualityReport = {
    sections,
    sourceCounts: { reviews: reader.reviews.length, fiveStarReviews: reader.fiveStarCount,
      streamingArtists: reader.topArtists.length, candidateEvents: events.length, newsStories: recent.length,
      personalListens: listens.filter((item) => !item.evergreen && item.trackName).length },
    personalizationEvidence: evidence,
    missingData,
    warnings,
    featuredArtists,
  };
  sources.push({ kind: "quality", url: APP_URL, retrievedAt, label: "Quality report", report: qualityReport });

  const showsHeading = rotation === 1
    ? `One concert for your radar${reader.city ? ` near ${reader.city}` : ""}`
    : rotation === 3
    ? `A scene pick${reader.city ? ` around ${reader.city}` : ""}`
    : `Actually worth a look${reader.city ? ` near ${reader.city}` : ""}`;
  const showsDek = rotation === 2
    ? "Matched to your taste and location. Open it on Synth to plan."
    : "Upcoming concerts matched to your music taste and location.";

  const preheader = leadAction && closest
    ? `A timely concert nudge, plus ${closest.artistName} nearby.`
    : leadAction
    ? `A timely concert nudge, plus new listens picked for you.`
    : closest
    ? `A real date in your area: ${closest.artistName}. Plus two new tracks.`
    : `Two new tracks and a few picks worth your Monday.`;

  return {
    subject: conciseSubject,
    preheader: clean(preheader),
    issueLabel: `${formatIssueDate(editionDate)} · Issue No. ${issueNumber}`,
    headline, intro,
    showsHeading,
    showsDek,
    locationPrompt: !hasPlace(reader) ? { label: "Set your city to get upcoming concerts near you", url: PROFILE_EDIT_URL } : undefined,
    shows,
    updates,
    features,
    listens: suggested,
    connect,
    sources,
    qualityReport,
  };
};
