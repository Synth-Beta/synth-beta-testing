import type {
  Availability,
  ComposedEdition,
  EditionEvent,
  EditionListen,
  EditionNews,
  EditionQualityReport,
  EditionReview,
  EditionReader,
  EditionSource,
  ShowCard,
  StoryCard,
} from "./types";
import { editorialListens, inferTasteGenres, storyTasteScore } from "../../../../../supabase/functions/newsletter-send/editorial";
import { eventWithinSavedLocation, hubForEvent, milesBetween, NEARBY_MILES } from "../../../../../supabase/functions/newsletter-send/nearby";
import { meaningfulSummary } from "../../../../../supabase/functions/newsletter-send/news";
import { rankArtists } from "../../../../../supabase/functions/newsletter-send/taste";
import { formatEventWhen, formatIssueDate, isUpcoming } from "./time";

const APP_URL = "https://join.getsynth.app/";
const PROFILE_EDIT_URL = "https://join.getsynth.app/profile-edit";

const readerCity = (city: string) => (/^washington(?:\s*,?\s*d\.?c\.?)?$/i.test(city.trim()) ? "DC" : city.trim());
const NEWS_WINDOW_MS = 21 * 24 * 60 * 60 * 1000;

const httpUrl = (value?: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
};

const sameName = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();

const scrub = (value: string) =>
  value.replace(/\u2014/g, ", ").replace(/\u2013/g, "-").replace(/\s+,/g, ",").replace(/[ \t]{2,}/g, " ").trim();

const availabilityOf = (event: EditionEvent): Availability => {
  if (event.ticketAvailable === true) return "available";
  if (event.ticketAvailable === false) return "sold_out";
  return "unverified";
};

const availabilityNote = (availability: Availability) => {
  if (availability === "available") return "Tickets are listed as available.";
  if (availability === "sold_out") return "Currently listed as sold out.";
  return "Availability was not verified. Check the official listing before you make plans.";
};

const ctaLabel = (availability: Availability) => {
  if (availability === "sold_out" || availability === "unverified") return "Check the official listing";
  return "See the show";
};

const joinList = (items: string[]) => {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
};

const knownArtists = (reader: EditionReader) => {
  const names = [
    ...reader.topArtists,
    ...reader.otherFiveStarArtists,
    ...reader.reviews.map((review) => review.artistName),
  ].filter(Boolean);
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const alreadyLogged = (reader: EditionReader, artistName: string) =>
  reader.reviews.some((review) => sameName(review.artistName, artistName));

const latestReview = (reader: EditionReader) =>
  [...reader.reviews].sort((left, right) => String(right.eventDate ?? "").localeCompare(String(left.eventDate ?? "")))[0];

const titleMentionsArtist = (title: string, artist: string) => {
  const name = artist.trim();
  if (name.length < 3) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(title);
};

const storyMentionsArtist = (item: { title: string; summary?: string | null }, artist: string) =>
  titleMentionsArtist(item.title, artist) || titleMentionsArtist(item.summary ?? "", artist);

const recentNews = (news: EditionNews[], sendAt: Date) =>
  news
    .filter((item) => httpUrl(item.url))
    .filter((item) => {
      const published = Date.parse(item.publishedAt);
      return Number.isFinite(published) && published <= sendAt.getTime() && sendAt.getTime() - published <= NEWS_WINDOW_MS;
    })
    .filter((item, index, items) => items.findIndex((other) => other.url === item.url) === index);

const savedPlace = (reader: EditionReader) =>
  Boolean(reader.city?.trim()) || (reader.latitude != null && reader.longitude != null);

/** When the profile has no city, a tight cluster of saved events is still a real place. */
const inferActivityCenter = (reader: EditionReader, events: EditionEvent[], sendAt: Date) => {
  const ids = new Set([...(reader.interestedEventIds ?? []), ...(reader.goingEventIds ?? [])]);
  const linked = events.filter((event) =>
    ids.has(event.id) &&
    typeof event.latitude === "number" &&
    typeof event.longitude === "number" &&
    event.city?.trim()
  );
  const upcoming = linked.filter((event) => Date.parse(event.eventDate) >= sendAt.getTime() - 86400000);
  const pool = upcoming.length >= 3 ? upcoming : linked;
  if (pool.length < 3) return null;
  let best: EditionEvent[] = [];
  for (const seed of pool) {
    const cluster = pool.filter((event) =>
      milesBetween(seed.latitude!, seed.longitude!, event.latitude!, event.longitude!) <= NEARBY_MILES
    );
    if (cluster.length > best.length) best = cluster;
  }
  if (best.length < 3 || best.length * 2 < pool.length) return null;
  const cities = new Map<string, { city: string; state?: string | null; count: number }>();
  for (const event of best) {
    const key = event.city.trim().toLowerCase();
    const current = cities.get(key) ?? { city: event.city.trim(), state: event.state, count: 0 };
    current.count += 1;
    cities.set(key, current);
  }
  const top = [...cities.values()].sort((left, right) => right.count - left.count)[0];
  return {
    city: top.city,
    state: top.state ?? null,
    latitude: best.reduce((sum, event) => sum + event.latitude!, 0) / best.length,
    longitude: best.reduce((sum, event) => sum + event.longitude!, 0) / best.length,
  };
};

const genreMatch = (event: EditionEvent, reader: EditionReader) =>
  (event.genres ?? []).some((genre) => reader.genres.some((known) => sameName(known, genre)));

const savedRelationship = (event: EditionEvent, reader: EditionReader) => {
  if (reader.goingEventIds?.includes(event.id)) return "going" as const;
  if (reader.interestedEventIds?.includes(event.id)) return "interested" as const;
  return null;
};

const reasonFor = (event: EditionEvent, reader: EditionReader) => {
  const saved = savedRelationship(event, reader);
  if (saved === "going") return `You marked ${event.artistName} at ${event.venueName} as going on Synth.`;
  if (saved === "interested") return `You saved ${event.artistName} at ${event.venueName} on Synth.`;
  const logged = alreadyLogged(reader, event.artistName);
  const listening = reader.topArtists.some((artist) => sameName(artist, event.artistName));
  if (!logged && listening) return `${event.artistName} is in your saved listening, and this date is at ${event.venueName}.`;
  if (logged) return `You have seen ${event.artistName} before. This date is at ${event.venueName}.`;
  const knownVenue = reader.reviews.find((review) => review.venueName && sameName(review.venueName, event.venueName));
  if (knownVenue) return `You have already spent a night at ${event.venueName}. ${event.artistName} is on a later bill there.`;
  const genre = (event.genres ?? []).find((item) => reader.genres.some((known) => sameName(known, item)));
  if (genre) return `${event.artistName} plays ${event.venueName}. The bill is listed as ${genre}.`;
  return `${event.artistName} plays ${event.venueName} in ${event.city}.`;
};

/** True when Spotify or a logged setlist already ties this artist to the reader. */
const alreadyHeardArtist = (reader: EditionReader, artistName: string) =>
  reader.topArtists.some((artist) => sameName(artist, artistName)) || alreadyLogged(reader, artistName);

const listenReason = (pick: EditionListen) => {
  const supplied = pick.reason?.trim() ?? "";
  if (
    supplied
    && !/give it another spin|from your saved listening|song to try before making plans|before choosing your next night|recording to revisit/i.test(supplied)
  ) {
    return scrub(supplied);
  }
  return "Worth a play this week.";
};

export const composeEdition = ({
  reader,
  events,
  news,
  listens,
  sendAt,
  editionDate,
  issueNumber,
  retrievedAt,
}: {
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
  const used = new Set<string>();
  const featuredArtists: string[] = [];
  const claim = (artist?: string | null) => {
    const name = artist?.trim();
    if (!name) return false;
    const key = name.toLowerCase();
    if (used.has(key)) return false;
    used.add(key);
    featuredArtists.push(name);
    return true;
  };
  const taken = (artist?: string | null) => Boolean(artist && used.has(artist.trim().toLowerCase()));

  const name = reader.firstName?.trim() || "";
  const profilePlace = savedPlace(reader);
  const inferred = profilePlace ? null : inferActivityCenter(reader, events, sendAt);
  const located = inferred
    ? { ...reader, city: inferred.city, state: inferred.state, latitude: inferred.latitude, longitude: inferred.longitude }
    : reader;
  const place = located.city?.trim() || "";
  const latest = latestReview(reader);
  const latestIsPast = Boolean(
    latest?.artistName && latest.eventDate && !isUpcoming(latest.eventDate, new Date(retrievedAt), reader.state)
  );
  if (latestIsPast) claim(latest?.artistName);

  const upcoming = events.filter((event) =>
    isUpcoming(event.eventDate, sendAt, event.state) &&
    httpUrl(event.ticketUrl) &&
    event.artistName &&
    event.venueName &&
    event.city &&
    !taken(event.artistName)
  );
  const byInterest = (left: EditionEvent, right: EditionEvent) => {
    const score = (event: EditionEvent) => {
      const saved = savedRelationship(event, reader);
      const logged = alreadyLogged(reader, event.artistName);
      const listening = reader.topArtists.some((artist) => sameName(artist, event.artistName));
      const inCity = Boolean(place && sameName(event.city, place));
      if (saved === "going") return 0;
      if (saved === "interested") return 1;
      if (!logged && listening && inCity) return 2;
      if (!logged && listening) return 3;
      if (logged && inCity) return 4;
      if (logged) return 5;
      if (genreMatch(event, reader) && inCity) return 6;
      if (inCity) return 7;
      if (genreMatch(event, reader)) return 8;
      return 9;
    };
    return score(left) - score(right) || left.eventDate.localeCompare(right.eventDate) || Number(left.ticketAvailable !== true) - Number(right.ticketAvailable !== true);
  };

  const shows: EditionEvent[] = [];
  if (savedPlace(located)) {
    const local = upcoming.filter((event) => eventWithinSavedLocation(located, event)).sort(byInterest);
    for (const event of local) {
      if (shows.some((item) => sameName(item.artistName, event.artistName))) continue;
      if (!claim(event.artistName)) continue;
      shows.push(event);
      if (shows.length === 3) break;
    }
  } else {
    const hubs = ["Chicago", "Washington", "New York"];
    for (const hubName of hubs) {
      const pool = upcoming.filter((event) => hubForEvent(event)?.city === hubName).sort(byInterest);
      const event = pool.find((item) => !shows.some((chosen) => sameName(chosen.artistName, item.artistName)));
      if (!event || !claim(event.artistName)) continue;
      shows.push(event);
    }
  }

  const rankedHistory = rankArtists(reader.reviews).filter((artist) => !taken(artist.name));
  const week = Math.floor(Date.parse(`${editionDate}T12:00:00Z`) / (7 * 86400000));
  const historyPool = (rankedHistory.some((artist) => !artist.shortOnly) ? rankedHistory.filter((artist) => !artist.shortOnly) : rankedHistory).slice(0, 4);
  const historyArtist = historyPool.length
    ? historyPool[((Number.isFinite(week) ? week : 0) % historyPool.length + historyPool.length) % historyPool.length]
    : null;
  const historyReview = historyArtist
    ? reader.reviews
      .filter((review) => sameName(review.artistName, historyArtist.name))
      .sort((left, right) => (right.text?.length ?? 0) - (left.text?.length ?? 0))[0]
    : null;
  if (historyArtist) claim(historyArtist.name);

  const tasteGenres = inferTasteGenres(reader);
  const hasTaste = tasteGenres.length > 0 || knownArtists(reader).length > 0;
  const freshNews = recentNews(news, new Date(Math.min(sendAt.getTime(), Date.parse(retrievedAt))));
  const summarized = freshNews
    .map((item) => ({ ...item, summary: meaningfulSummary(item.summary) }))
    .filter((item) => item.summary);
  const omittedSummaries = freshNews.length - summarized.length;
  const knownForNews = knownArtists(reader).filter((artist) => !taken(artist));
  const scoredNews = summarized
    .map((item) => {
      const blocked = [...used].some((artist) => storyMentionsArtist(item, artist));
      const artistHit = !blocked && knownForNews.some((artist) => storyMentionsArtist(item, artist));
      const taste = blocked ? 0 : storyTasteScore(item, tasteGenres);
      return { item, blocked, artistHit, taste, published: Date.parse(item.publishedAt) };
    })
    .filter((row) => !row.blocked)
    .sort((left, right) =>
      Number(right.artistHit) - Number(left.artistHit)
      || right.taste - left.taste
      || right.published - left.published
    );
  const relevantNews = scoredNews.filter((row) => row.artistHit || row.taste > 0).map((row) => row.item);
  // With taste data, stay on taste-aligned stories. Do not pad with unrelated pop/general headlines.
  const chosenNews = (hasTaste
    ? (relevantNews.length ? relevantNews : scoredNews.map((row) => row.item).slice(0, 1))
    : scoredNews.map((row) => row.item)
  ).slice(0, hasTaste && relevantNews.length ? Math.min(2, relevantNews.length) : 1);
  const newsArtists = new Map<string, string>();
  for (const item of chosenNews) {
    const matched = knownForNews.find((artist) => storyMentionsArtist(item, artist) && !taken(artist));
    if (matched) {
      claim(matched);
      newsArtists.set(item.id, matched);
    }
  }

  // Discovery only: taste-ranked picks the reader has not already streamed or
  // logged. Never resurface Spotify top tracks or setlist artists.
  const discoveryListens = editorialListens(editionDate, tasteGenres, reader.userId).filter((item) =>
    item.artistName
    && item.trackName?.trim()
    && httpUrl(item.url)
    && !taken(item.artistName)
    && !alreadyHeardArtist(reader, item.artistName)
  );
  const listenPool = discoveryListens
    .filter((item, index, items) => items.findIndex((other) => sameName(other.artistName, item.artistName)) === index)
    .slice(0, 2);
  listenPool.forEach((item) => claim(item.artistName));

  const genericShows = !savedPlace(located) && shows.length > 0;
  const showCards: ShowCard[] = shows.map((event) => {
    const listed = genericShows ? { ...event, city: readerCity(event.city) } : event;
    const url = httpUrl(listed.ticketUrl)!;
    const availability = availabilityOf(event);
    sources.push({ kind: "event", url, retrievedAt, label: `${listed.artistName} at ${listed.venueName}` });
    const when = formatEventWhen(listed.eventDate, listed.state, listed.doorsTime);
    return {
      eyebrow: [when, listed.venueName, listed.city].filter(Boolean).join(" · "),
      title: listed.artistName,
      body: scrub(reasonFor(listed, located)),
      availabilityNote: availabilityNote(availability),
      ctaLabel: ctaLabel(availability),
      ctaUrl: url,
      caution: availability !== "available",
    };
  });

  const updateCards: StoryCard[] = chosenNews.map((item) => {
    const url = httpUrl(item.url)!;
    sources.push({ kind: "news", url, retrievedAt, label: item.title });
    const matched = newsArtists.get(item.id);
    return {
      eyebrow: item.source ? (matched ? `${item.source} · ${matched}` : item.source) : "Music story",
      title: scrub(item.title),
      body: scrub(item.summary || ""),
      ctaLabel: "Read the source",
      ctaUrl: url,
      tone: "white",
    };
  });

  let listen: StoryCard | undefined;
  if (listenPool.length > 0) {
    for (const pick of listenPool) {
      sources.push({
        kind: "listen",
        url: httpUrl(pick.sourceUrl) ?? httpUrl(pick.url)!,
        retrievedAt,
        label: `${pick.artistName}, ${pick.trackName}`,
      });
    }
    listen = {
      eyebrow: "Your next listen",
      title: listenPool.length > 1 ? "Two recordings to put on." : `“${listenPool[0].trackName}”`,
      body: scrub(listenPool.map((pick) => `${pick.artistName}, “${pick.trackName}”. ${listenReason(pick)}`).join(" ")),
      ctaLabel: `Listen to “${listenPool[0].trackName}”`,
      ctaUrl: httpUrl(listenPool[0].url)!,
      tone: "pink",
      links: listenPool.map((pick) => ({ label: `Listen to ${pick.artistName}, “${pick.trackName}”`, url: httpUrl(pick.url)! })),
    };
  }

  const features: StoryCard[] = [];
  if (!updateCards.length) {
    const detour = discoveryListens.find((pick) => !listenPool.some((item) => sameName(item.artistName, pick.artistName)));
    if (detour && claim(detour.artistName)) {
      features.push({
        eyebrow: "The album detour · from the archives",
        title: `${detour.artistName}: ${detour.albumName}`,
        body: scrub(`Start with “${detour.trackName}”. ${detour.reason} The rest of ${detour.albumName} is worth a turn.`),
        ctaLabel: "Explore the record",
        ctaUrl: detour.sourceUrl,
        tone: "white",
      });
      sources.push({
        kind: "editorial",
        url: detour.sourceUrl,
        retrievedAt,
        label: `${detour.artistName}, ${detour.albumName}`,
      });
    }
  }

  const usedFacts = new Set<string>();
  const extraFact = (review: EditionReview) => {
    const candidates: string[] = [];
    const repeats = reader.reviews.filter((item) => sameName(item.artistName, review.artistName)).length;
    if (repeats > 1) candidates.push(`You have logged ${review.artistName} ${repeats} times.`);
    const venueMates = [...new Set(reader.reviews
      .filter((item) => review.venueName && item.venueName && sameName(item.venueName, review.venueName) && !sameName(item.artistName, review.artistName))
      .map((item) => item.artistName))];
    if (review.venueName && venueMates.length) candidates.push(`${review.venueName} is also where you saw ${joinList(venueMates.slice(0, 2))}.`);
    const later = shows.find((event) => review.venueName && sameName(event.venueName, review.venueName));
    if (later && review.venueName) candidates.push(`${later.artistName} plays ${review.venueName} on a later date.`);
    if ((review.rating ?? 0) >= 5 && reader.fiveStarCount > 1) {
      const others = reader.fiveStarCount - 1;
      candidates.push(`It sits with ${others} other five-star night${others === 1 ? "" : "s"}.`);
    }
    if (reader.lifetimeShowCount > 1) candidates.push(`It is one of ${reader.lifetimeShowCount} nights on your timeline.`);
    const pick = candidates.find((line) => !usedFacts.has(line));
    if (pick) usedFacts.add(pick);
    return pick ?? "";
  };

  let yourSynth: ComposedEdition["yourSynth"];
  if (latestIsPast && latest?.artistName) {
    const when = formatEventWhen(latest.eventDate || "", reader.state);
    const fact = extraFact(latest);
    const headline = reader.lifetimeShowCount > 0 && reader.fiveStarCount > 0
      ? `${reader.lifetimeShowCount} show${reader.lifetimeShowCount === 1 ? "" : "s"} logged. ${reader.fiveStarCount} five-star night${reader.fiveStarCount === 1 ? "" : "s"}.`
      : `Your latest: ${latest.artistName}.`;
    yourSynth = {
      headline,
      body: scrub(`${latest.artistName}${latest.venueName ? ` at ${latest.venueName}` : ""}${when ? ` on ${when}` : ""} is the newest night on your timeline.${fact ? ` ${fact}` : ""}`),
    };
    sources.push({ kind: "account", url: APP_URL, retrievedAt, label: `Review of ${latest.artistName}` });
  }

  let history: StoryCard | undefined;
  if (historyArtist && historyReview) {
    const when = historyReview.eventDate ? formatEventWhen(historyReview.eventDate, reader.state) : "";
    const rating = historyReview.rating != null ? `${historyReview.rating} stars` : "a rating";
    const fact = extraFact(historyReview);
    history = {
      eyebrow: "From your concert history",
      title: historyArtist.name,
      body: scrub(`${historyArtist.name}${historyReview.venueName ? ` at ${historyReview.venueName}` : ""}${when ? ` on ${when}` : ""} is an earlier night you rated ${rating}.${fact ? ` ${fact}` : ""}`),
      ctaLabel: "Open your timeline",
      ctaUrl: APP_URL,
      tone: "white",
    };
    sources.push({ kind: "account", url: APP_URL, retrievedAt, label: `History note for ${historyArtist.name}` });
  }

  const savedCount = (reader.interestedEventIds?.length ?? 0) + (reader.goingEventIds?.length ?? 0);
  const communityArtist = reader.otherFiveStarArtists.find((artist) => !taken(artist));
  if (communityArtist) claim(communityArtist);
  const connect: StoryCard = communityArtist
    ? {
        eyebrow: "Connect on Synth",
        title: `Who else gave ${communityArtist} a 5?`,
        body: `Other people on Synth rated ${communityArtist} five stars. Open those reviews and see what they wrote down.`,
        ctaLabel: "Explore Synth",
        ctaUrl: APP_URL,
        tone: "yellow",
      }
    : savedCount > 0
      ? {
          eyebrow: "Connect on Synth",
          title: "Your saved dates",
          body: `You have ${savedCount} show${savedCount === 1 ? "" : "s"} saved on Synth. Open the list and pick a night to keep.`,
          ctaLabel: "Explore Synth",
          ctaUrl: APP_URL,
          tone: "yellow",
        }
      : showCards.length
        ? {
            eyebrow: "Connect on Synth",
            title: "Bring one date back to Synth",
            body: "Save a date, send it to a friend, and after the show keep one detail in a review.",
            ctaLabel: "Explore Synth",
            ctaUrl: APP_URL,
            tone: "yellow",
          }
        : reader.reviews.length
          ? {
              eyebrow: "Connect on Synth",
              title: "Your timeline is already started",
              body: "Open a night you logged and see whether anyone else wrote about that artist.",
              ctaLabel: "Explore Synth",
              ctaUrl: APP_URL,
              tone: "yellow",
            }
          : {
              eyebrow: "Make your next show count",
              title: "Build your live music timeline.",
              body: "Think of a night you would go back to: the room, the song, the person beside you. Log a concert you remember and keep one detail that made it yours.",
              ctaLabel: "Explore Synth",
              ctaUrl: APP_URL,
              tone: "yellow",
            };

  const savedShows = shows.filter((event) => savedRelationship(event, reader));
  const showNames = shows.map((event) => event.artistName);
  const where = genericShows ? "" : place ? `around ${place}` : "";
  const introSentences = [
    showNames.length
      ? `${joinList(showNames)} ${showNames.length === 1 ? "is" : "are"} ${savedShows.length === shows.length ? "already saved" : "coming up"}${where ? ` ${where}` : ""}.`
      : "",
    historyArtist ? `${historyArtist.name} is an earlier night still on your timeline.` : "",
    !showNames.length && !historyArtist && latest?.artistName ? `${latest.artistName} is the newest night on your timeline.` : "",
    !showNames.length && !historyArtist && !latest?.artistName && listenPool[0]?.artistName
      ? `${listenPool[0].artistName} is worth a play this week.`
      : "",
  ].filter(Boolean);
  const intro = introSentences.join(" ")
    || (name ? `${name}, a few things in music are worth your time this week.` : "A few things in music are worth your time this week.");

  const headline = name ? `${name}, here is a week drawn from your music.` : "Here is a week drawn from your music.";
  const lead = showCards[0]?.title || historyArtist?.name || listenPool[0]?.artistName;
  const subject = (lead
    ? `${name ? `${name}, ` : ""}${lead} and a few things worth your time`
    : `${name ? `${name}, ` : ""}A week of music worth your time`).slice(0, 78);

  const warnings: string[] = [];
  if (omittedSummaries > 0) warnings.push(`${omittedSummaries} music ${omittedSummaries === 1 ? "story was" : "stories were"} skipped because the source had no reliable summary.`);
  if (!updateCards.length) warnings.push("No current news with a reliable summary was available, so this edition uses another section.");
  if (showCards.some((show) => /sold out/i.test(show.availabilityNote ?? ""))) warnings.push("A listed show is sold out. The note says so and does not promise tickets.");
  if (savedPlace(located) && showCards.length < 2) warnings.push("Fewer than two upcoming shows passed the location, date, and ticket checks.");
  const loweredFeatured = featuredArtists.map((artist) => artist.toLowerCase());
  if (new Set(loweredFeatured).size !== loweredFeatured.length) warnings.push("The same artist was featured in more than one section.");

  const missingData: string[] = [];
  if (!reader.reviews.length) missingData.push("No concert reviews");
  if (!reader.topArtists.length) missingData.push("No streaming artists in the source");
  if (!reader.genres.length) missingData.push("No genre preferences in the source");
  if (!profilePlace) missingData.push("No saved city or coordinates");
  if (!savedCount) missingData.push("No saved upcoming shows");
  if (savedPlace(located) && showCards.length === 0) missingData.push("No upcoming shows within 75 miles with an official ticket link");

  const evidence: string[] = [];
  if (reader.lifetimeShowCount) evidence.push(`${reader.lifetimeShowCount} logged shows`);
  if (reader.fiveStarCount) evidence.push(`${reader.fiveStarCount} five-star reviews`);
  if (reader.topArtists.length) evidence.push(`Listening artists include ${joinList(reader.topArtists.slice(0, 3))}`);
  if (tasteGenres.length) evidence.push(`Taste genres include ${joinList(tasteGenres.slice(0, 3))}`);
  if (savedCount) evidence.push(`${savedCount} saved shows`);
  if (latestIsPast && latest?.artistName) evidence.push(`Latest show: ${latest.artistName}`);
  if (historyArtist) evidence.push(`History note: ${historyArtist.name}`);
  if (inferred) evidence.push(`Saved shows cluster around ${inferred.city}`);
  if (!profilePlace && !inferred && showCards.length) evidence.push("City listings are general because no saved location was available");

  const sections = [
    "introduction",
    yourSynth ? "yourSynth" : "",
    showCards.length ? "onYourRadar" : "",
    updateCards.length ? "thisWeekInMusic" : "",
    features.length ? "albumDetour" : "",
    listen ? "yourNextListen" : "",
    history ? "fromYourHistory" : "",
    "connect",
  ].filter(Boolean);

  const qualityReport: EditionQualityReport = {
    sections,
    sourceCounts: {
      reviews: reader.reviews.length,
      fiveStarReviews: reader.fiveStarCount,
      streamingArtists: reader.topArtists.length,
      candidateEvents: events.length,
      newsStories: freshNews.length,
      personalListens: listens.filter((item) => !item.evergreen && item.trackName).length,
    },
    personalizationEvidence: evidence,
    missingData,
    warnings,
    featuredArtists,
  };
  sources.push({
    kind: "quality",
    url: APP_URL,
    retrievedAt,
    label: "Quality report",
    report: qualityReport,
  });

  const localShows = Boolean(place) && (located.latitude != null || shows.every((event) => sameName(event.city, place)));
  return {
    subject,
    preheader: intro,
    issueLabel: `${formatIssueDate(editionDate)} · Issue No. ${issueNumber}`,
    headline,
    intro,
    yourSynth,
    showsHeading: showCards.length ? (localShows ? `On your radar in ${place}` : "On your radar") : undefined,
    showsDek: showCards.length && !genericShows
      ? (place ? `Dates around ${place}.` : "A few dates on the calendar.")
      : undefined,
    locationPrompt: genericShows
      ? {
          label: "Add your location in the app for more personalized recommendations.",
          url: PROFILE_EDIT_URL,
        }
      : undefined,
    shows: showCards,
    updates: updateCards,
    features,
    editorialFlags: warnings,
    listen,
    history,
    connect,
    sources,
    qualityReport,
  };
};
