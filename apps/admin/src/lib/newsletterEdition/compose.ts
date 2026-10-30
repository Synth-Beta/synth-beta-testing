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
import { meaningfulSummary } from "../../../../../supabase/functions/newsletter-send/news";
import { rankArtists } from "../../../../../supabase/functions/newsletter-send/taste";
import { formatEventWhen, formatIssueDate, isUpcoming } from "./time";

const APP_URL = "https://join.getsynth.app/";
const PROFILE_EDIT_URL = "https://join.getsynth.app/profile-edit";
const NEWS_WINDOW_MS = 14 * 86400000;
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
const hasReviewed = (reader: EditionReader, artist: string) => repeatCount(reader, artist) > 0;
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

export const composeEdition = ({ reader, events, news, listens, sendAt, editionDate, issueNumber, retrievedAt }: {
  reader: EditionReader;
  events: EditionEvent[];
  news: EditionNews[];
  listens: EditionListen[];
  sendAt: Date;
  editionDate: string;
  issueNumber: number;
  retrievedAt: string;
}): ComposedEdition | null => {
  const sources: EditionSource[] = [];
  const warnings: string[] = [];
  const featuredArtists: string[] = [];
  const usedArtists = new Set<string>();
  const useArtist = (artist: string) => { const id = key(artist); if (!id || usedArtists.has(id)) return false; usedArtists.add(id); featuredArtists.push(artist); return true; };
  const pastUrls = new Set((reader.recentSourceUrls ?? []).map((url) => url.trim()));
  const pastListenKeys = new Set((reader.recentListenKeys ?? []).map(key));
  const tasteGenres = inferTasteGenres(reader).map(key);
  const ranked = rankArtists(reader.reviews);
  const preferred = readerArtists(reader);
  const repeat = ranked.find((artist) => artist.mentions >= 2) ?? null;
  const bestArtist = repeat?.name ?? ranked[0]?.name ?? reader.topArtists[0] ?? reader.followedArtists?.[0];
  const firstName = (reader.firstName ?? "").trim();
  const greeting = firstName ? `${firstName}, ` : "";
  const isNear = (event: EditionEvent) => hasPlace(reader) && eventWithinSavedLocation(reader, event);

  // Factual local event recommendations only. Never borrow a different city's
  // concert listings or promote a resale site as an official ticket link.
  const candidates = events.filter((event) => event.id && event.artistName && event.venueName && event.city &&
    isUpcoming(event.eventDate, sendAt, event.state) && validUrl(event.ticketUrl) && isNear(event));
  const valueOf = (event: EditionEvent) => {
    const n = repeatCount(reader, event.artistName);
    const followed = (reader.followedArtists ?? []).some((artist) => key(artist) === key(event.artistName));
    const streamed = reader.topArtists.some((artist) => key(artist) === key(event.artistName));
    const saved = reader.goingEventIds?.includes(event.id) ? 1 : reader.interestedEventIds?.includes(event.id) ? 2 : 0;
    const seenVenue = reader.reviews.some((review) => key(review.venueName) === key(event.venueName));
    const genreHits = (event.genres ?? []).filter((genre) => tasteGenres.some((known) => key(genre) === known || known.includes(key(genre)) || key(genre).includes(known))).length;
    return n * 25 + (followed ? 18 : 0) + (streamed ? 15 : 0) + (saved ? 16 - saved : 0) + Math.min(genreHits, 3) * 8 + (seenVenue ? 2 : 0);
  };
  const pool = [...candidates].sort((a, b) => valueOf(b) - valueOf(a) || Number(b.ticketAvailable === true) - Number(a.ticketAvailable === true) || a.eventDate.localeCompare(b.eventDate));
  const selectedEvents: EditionEvent[] = [];
  for (const event of pool) {
    if (selectedEvents.some((chosen) => key(chosen.artistName) === key(event.artistName))) continue;
    if (pastUrls.has(event.ticketUrl ?? "") && pool.some((other) => !pastUrls.has(other.ticketUrl ?? "") && valueOf(other) >= valueOf(event) - 10)) continue;
    if (!useArtist(event.artistName)) continue;
    selectedEvents.push(event);
    if (selectedEvents.length === 2) break;
  }
  const shows: ShowCard[] = selectedEvents.map((event) => {
    const count = repeatCount(reader, event.artistName);
    const genres = (event.genres ?? []).filter((genre) => tasteGenres.includes(key(genre)));
    let why = count > 1 ? `You've reviewed ${event.artistName} ${count} times. Here's another chance to see them.`
      : count === 1 ? `You've seen ${event.artistName} before. They're back on the calendar.`
      : (reader.followedArtists ?? []).some((artist) => key(artist) === key(event.artistName)) ? `You follow ${event.artistName} on Synth. Here's a nearby date.`
      : reader.topArtists.some((artist) => key(artist) === key(event.artistName)) ? `${event.artistName} is in your listening history. Here's a chance to hear them live.`
      : genres.length ? `A ${naturalGenre(genres[0])} pick based on your music taste, not just a random show in town.`
      : `A show coming up in your area.`;
    if (reader.goingEventIds?.includes(event.id)) why = `Already marked going? Here's the listing to share with whoever's coming with you.`;
    else if (reader.interestedEventIds?.includes(event.id)) why = `You saved this one. Here's the listing if you're thinking about making it happen.`;
    const status = event.ticketAvailable === false ? "Listed as sold out. Check the organizer for updates." :
      event.ticketAvailable === true ? undefined : "Ticket availability not verified; confirm before making plans.";
    const url = validUrl(event.ticketUrl)!;
    sources.push({ kind: "event", url, retrievedAt, label: `${event.artistName} at ${event.venueName}` });
    return {
      eyebrow: `${formatEventWhen(event.eventDate, event.state, event.doorsTime)} · ${event.venueName} · ${event.city}`,
      title: event.artistName,
      body: clean(why),
      availabilityNote: status,
      ctaLabel: event.ticketAvailable === true ? "See this concert" : "View the event listing",
      ctaUrl: url,
      caution: event.ticketAvailable !== true,
    };
  });

  // News only appears when there is a defensible personal or local connection.
  // A generic rock/pop headline must not be sent to a jam fan as "their news".
  const recent = news.filter((item) => validUrl(item.url) && !pastUrls.has(item.url) &&
    Number.isFinite(Date.parse(item.publishedAt)) && Date.parse(item.publishedAt) <= sendAt.getTime() &&
    sendAt.getTime() - Date.parse(item.publishedAt) <= NEWS_WINDOW_MS);
  const cleanedNews = recent.map((item) => ({ ...item, summary: meaningfulSummary(item.summary) })).filter((item) => item.summary);
  const omitted = recent.length - cleanedNews.length;
  const newsMatches = cleanedNews.map((item) => {
    const artist = preferred.find((name) => artistMention(`${item.title} ${item.summary}`, name));
    const geography = localStory(item, reader);
    const taste = storyTasteScore(item, tasteGenres);
    // Genre match is only strong when the title itself explicitly shares a
    // descriptive taste term. Generic words in blurbs are not enough.
    const headlineTaste = storyTasteScore({ title: item.title }, tasteGenres);
    const relevant = Boolean(artist || geography || (taste >= 6 && headlineTaste >= 3));
    return { item, artist, geography, relevant, score: (artist ? 100 : 0) + (geography ? 75 : 0) + Math.min(taste, 20) };
  }).filter((row) => row.relevant).sort((a, b) => b.score - a.score || Date.parse(b.item.publishedAt) - Date.parse(a.item.publishedAt));
  const updates: StoryCard[] = [];
  for (const row of newsMatches) {
    if (updates.length >= 2) break;
    if (row.artist && usedArtists.has(key(row.artist)) && !row.geography) continue;
    if (row.artist) useArtist(row.artist);
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

  // Curated discovery is more useful than reprinting someone's old setlist.
  // Require a known recording; avoid recently sent listens where alternatives exist.
  // Prefer one real catalog recording from an upcoming LOCAL show that shares
  // the reader's taste, even when ticket details are missing. The email links
  // to the recording, never invents a ticket URL or a deep link.
  const localDiscoveries = listens
    .filter((pick) => pick.artistName && pick.trackName && validUrl(pick.url) &&
      !preferred.includes(key(pick.artistName)) && !usedArtists.has(key(pick.artistName)))
    .map((pick) => ({ pick, event: events.find((event) => key(event.artistName) === key(pick.artistName) &&
        isUpcoming(event.eventDate, sendAt, event.state) && isNear(event) &&
        (event.genres ?? []).some((genre) => tasteGenres.some((taste) => key(genre) === taste ||
          taste.includes(key(genre)) || key(genre).includes(taste)))) }))
    .filter((row): row is { pick: EditionListen; event: EditionEvent } => Boolean(row.event))
    .sort((a, b) => Number(Boolean(b.event.ticketUrl)) - Number(Boolean(a.event.ticketUrl)) ||
      a.event.eventDate.localeCompare(b.event.eventDate))
    .filter(({ pick }) => !pastListenKeys.has(key(`${pick.artistName}, ${pick.trackName}`)))
    .slice(0, 1)
    .map(({ pick, event }) => ({ ...pick, albumName: "", evergreen: false,
      sourceUrl: validUrl(pick.sourceUrl) || validUrl(pick.url)!, genres: event.genres ?? [],
      reason: `There's a ${pick.artistName} show listed around ${event.city}. This is a way to check out the sound before you make plans. Ticket details need to be checked separately.` }));
  const playlist = [...localDiscoveries, ...editorialListens(editionDate, tasteGenres, reader.userId)].filter((pick) =>
    Boolean(pick.trackName && validUrl(pick.url)) && !usedArtists.has(key(pick.artistName)) &&
    !preferred.includes(key(pick.artistName)));
  const freshPicks = playlist.filter((pick) => !pastListenKeys.has(key(`${pick.artistName}, ${pick.trackName}`)));
  const choices = freshPicks.length >= 2 ? freshPicks : [...freshPicks, ...playlist.filter((pick) => !freshPicks.includes(pick))];
  const picks = choices.filter((pick, index, arr) => arr.findIndex((other) => key(other.artistName) === key(pick.artistName)) === index).slice(0, 2);
  const suggested: StoryCard[] = [];
  for (const pick of picks) {
    if (!useArtist(pick.artistName)) continue;
    const shared = pick.genres.map(key).find((genre) => tasteGenres.includes(genre));
    const why = bestArtist && shared
      ? `If ${bestArtist} is your kind of live show, here's another ${naturalGenre(shared)} direction to explore. `
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

  // Only make a social claim when there is actually cross-user public review evidence.
  // No more saved-count filler or a second generic app invitation.
  const sharedArtist = reader.otherFiveStarArtists.find((artist) => !usedArtists.has(key(artist)) &&
    reader.reviews.some((review) => key(review.artistName) === key(artist) && (review.rating ?? 0) >= 5));
  const connect: StoryCard | undefined = sharedArtist ? {
    eyebrow: "Your people are here",
    title: `You're not the only ${sharedArtist} fan here.`,
    body: `Other Synth users have given ${sharedArtist} five stars too. Find out what made those nights special to them.`,
    ctaLabel: "Explore fan reviews",
    ctaUrl: APP_URL,
    tone: "yellow",
  } : undefined;
  if (sharedArtist) sources.push({ kind: "account", url: APP_URL, retrievedAt, label: `Other five-star fans of ${sharedArtist}` });

  const closest = selectedEvents[0];
  const leading = closest ? closest.artistName : picks[0]?.artistName;
  const headline = closest && repeatCount(reader, closest.artistName) > 1
    ? `${greeting}${closest.artistName} is back on the calendar.`
    : closest ? `${greeting}${closest.artistName} has a date near you.`
    : bestArtist ? `${greeting}here's something outside your usual rotation.`
    : `${greeting}two songs for your next music rabbit hole.`;
  const intro = closest && repeatCount(reader, closest.artistName) > 1
    ? `You've reviewed ${closest.artistName} ${repeatCount(reader, closest.artistName)} times. Here's a nearby date, plus a couple of new sounds to try.`
    : closest ? `We found a show in your area that lines up with what you listen to. There are new tracks waiting for you, too.`
    : bestArtist ? `Your ${bestArtist} history gave us a starting point. Here are a couple of new sounds worth exploring this week.`
    : `A couple of songs we think are worth hearing, and the stories that actually connect to your music world.`;
  const subject = closest ? `${greeting}${closest.artistName} near you + this week's picks`
    : bestArtist && picks[0] ? `${greeting}if you like ${bestArtist}, try ${picks[0].artistName}`
    : `${greeting}two new listens picked for you`;
  const conciseSubject = subject.slice(0, 78);
  if (omitted) warnings.push(`${omitted} news stories lacked useful summaries and were excluded.`);
  if (!updates.length) warnings.push("No genuinely relevant, sourced news passed the personalization checks. The news section was omitted.");
  if (hasPlace(reader) && !shows.length) warnings.push(`No upcoming, linked concert passed the ${NEARBY_MILES}-mile location and ticket checks. No out-of-area concert was substituted.`);
  if (picks.length < 2) warnings.push("Fewer than two verified editorial listening picks were available.");
  const missingData: string[] = [];
  if (!reader.reviews.length) missingData.push("No concert history");
  if (!reader.topArtists.length) missingData.push("No streaming artists in the source");
  if (!hasPlace(reader)) missingData.push("No location; no local shows inferred");
  if (hasPlace(reader) && !shows.length) missingData.push("No nearby upcoming shows with a usable non-resale event or ticket link");
  const evidence: string[] = [];
  if (repeat) evidence.push(`Repeated artist preference: ${repeat.name} (${plural(repeat.mentions, "logged show")})`);
  else if (bestArtist) evidence.push(`Taste anchor: ${bestArtist}`);
  if (tasteGenres.length) evidence.push(`Taste genres: ${tasteGenres.slice(0, 4).join(", ")}`);
  if (shows.length) evidence.push(`${shows.length} genuine local linked event matches`);
  if (suggested.length) evidence.push(`${suggested.length} distinct editorial recording recommendations`);
  if (updates.length) evidence.push(`${updates.length} relevant sourced stories`);
  if (reader.recentSourceUrls?.length || reader.recentListenKeys?.length) evidence.push("Recent-edition repeat filter applied");
  const sections = ["introduction", shows.length ? "onYourRadar" : "", suggested.length ? "yourNextListen" : "", updates.length ? "thisWeekInMusic" : "", connect ? "connect" : "", "appSpotlight"].filter(Boolean);
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
  return {
    subject: conciseSubject,
    preheader: clean(closest ? `A real date in your area: ${closest.artistName}. Plus two new tracks.` : `New tracks based on your music taste, without the same old concert recap.`),
    issueLabel: `${formatIssueDate(editionDate)} · Issue No. ${issueNumber}`,
    headline, intro,
    showsHeading: shows.length ? `Actually worth a look${reader.city ? ` near ${reader.city}` : ""}` : undefined,
    showsDek: shows.length ? "Upcoming concerts matched to your music taste and location." : undefined,
    locationPrompt: !hasPlace(reader) ? { label: "Set your city to get upcoming concerts near you", url: PROFILE_EDIT_URL } : undefined,
    shows,
    updates,
    listens: suggested,
    connect,
    sources,
    qualityReport,
  };
};
