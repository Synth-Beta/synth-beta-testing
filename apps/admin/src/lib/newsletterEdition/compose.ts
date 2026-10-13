import type {
  Availability,
  ComposedEdition,
  EditionEvent,
  EditionListen,
  EditionNews,
  EditionReader,
  EditionSource,
  ShowCard,
  StoryCard,
} from "./types";
import { editorialListens } from "../../../../../supabase/functions/newsletter-send/editorial";
import { eventWithinSavedLocation } from "../../../../../supabase/functions/newsletter-send/nearby";
import { formatEventWhen, formatIssueDate, isUpcoming } from "./time";

const APP_URL = "https://join.getsynth.app/";
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
  if (availability === "sold_out") return "Check the official listing";
  if (availability === "unverified") return "Check the official listing";
  return "See the show";
};

const joinList = (items: string[]) => {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
};

const firstSentence = (text: string) => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const match = cleaned.match(/^.{12,180}?[.!](\s|$)/);
  return (match ? match[0] : cleaned.slice(0, 160)).trim();
};

const knownArtists = (reader: EditionReader) => {
  const names = [
    ...reader.topArtists,
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

const isLatestArtist = (reader: EditionReader, artistName: string) => {
  const latest = latestReview(reader);
  return Boolean(latest?.artistName && sameName(latest.artistName, artistName));
};

const reasonFor = (event: EditionEvent, reader: EditionReader, listens: EditionListen[]) => {
  const logged = alreadyLogged(reader, event.artistName);
  const listening = reader.topArtists.some((artist) => sameName(artist, event.artistName) && !logged);
  const recording = listens.find((pick) => sameName(pick.artistName, event.artistName) && pick.trackName);
  const start = recording ? ` Start with “${recording.trackName}” before you make plans.` : "";
  if (listening) return `A chance to take ${event.artistName} from your headphones to ${event.venueName}.${start}`;
  const genre = (event.genres ?? []).find((item) =>
    reader.genres.some((known) => known.toLowerCase() === item.toLowerCase())
  );
  if (!logged && genre) return `A ${genre} detour for the taste you have been building. Try ${event.artistName} in a different room: ${event.venueName}.${start}`;
  if (!logged) return `A discovery night at ${event.venueName}${event.genres?.length ? `, with ${event.genres.slice(0, 2).join(" and ")} on the bill` : ""}.${start} Keep the date if the music clicks.`;
  return `Another chance to catch ${event.artistName}, this time at ${event.venueName}.${start}`;
};

const pickShows = (events: EditionEvent[], reader: EditionReader, sendAt: Date) => {
  const artists = knownArtists(reader);
  const upcoming = events.filter(
    (event) =>
      isUpcoming(event.eventDate, sendAt, event.state) &&
      httpUrl(event.ticketUrl) &&
      event.artistName &&
      event.venueName &&
      event.city &&
      eventWithinSavedLocation(reader, event)
  );
  const genreMatch = (event: EditionEvent) =>
    (event.genres ?? []).some((genre) => reader.genres.some((known) => sameName(known, genre)));
  const ranked = [...upcoming].sort((left, right) => {
    const score = (event: EditionEvent) => {
      const inCity = Boolean(reader.city && sameName(event.city, reader.city));
      const logged = alreadyLogged(reader, event.artistName);
      const listening = reader.topArtists.some((artist) => sameName(artist, event.artistName));
      if (!logged && listening && inCity) return 0;
      if (!logged && listening) return 1;
      if (!logged && genreMatch(event) && inCity) return 2;
      if (!logged && inCity) return 3;
      if (!logged && genreMatch(event)) return 4;
      if (!logged) return 5;
      if (inCity) return 6;
      return 8;
    };
    return score(left) - score(right) || left.eventDate.localeCompare(right.eventDate);
  });
  const notTheLatest = (event: EditionEvent) => !isLatestArtist(reader, event.artistName);
  const taste = ranked.filter(
    (event) => artists.some((artist) => sameName(artist, event.artistName)) || genreMatch(event)
  );
  const pool = (reader.latitude != null || reader.city ? ranked : taste).filter(notTheLatest);
  const chosen: EditionEvent[] = [];
  for (const event of pool) {
    if (chosen.some((item) => sameName(item.artistName, event.artistName))) continue;
    chosen.push(event);
    if (chosen.length === 3) break;
  }
  return chosen;
};

const titleMentionsArtist = (title: string, artist: string) => {
  const name = artist.trim();
  if (name.length < 3) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(title);
};

const recentNews = (news: EditionNews[], sendAt: Date) =>
  news
    .filter((item) => httpUrl(item.url))
    .filter((item) => {
      const published = Date.parse(item.publishedAt);
      return Number.isFinite(published) && published <= sendAt.getTime() && sendAt.getTime() - published <= NEWS_WINDOW_MS;
    })
    .filter((item, index, items) => items.findIndex((other) => other.url === item.url) === index);

const pickListens = (listens: EditionListen[], shows: EditionEvent[], reader: EditionReader) => {
  // An artist name alone is never a recording. New artists take priority over repeats.
  const pool = listens.filter((item) => item.artistName && item.trackName?.trim() && httpUrl(item.url)
    && !isLatestArtist(reader, item.artistName)
    && (item.evergreen || reader.topArtists.some((artist) => sameName(artist, item.artistName))
      || shows.some((show) => sameName(show.artistName, item.artistName))));
  const score = (item: EditionListen) =>
    (alreadyLogged(reader, item.artistName) ? 10 : 0)
    + (shows.some((show) => sameName(show.artistName, item.artistName)) ? 0 : item.evergreen ? 3 : 1);
  const ordered = [...pool].sort((a, b) => score(a) - score(b));
  const chosen: EditionListen[] = [];
  for (const item of ordered) {
    if (chosen.some((existing) => sameName(existing.artistName, item.artistName))) continue;
    chosen.push(item);
    if (chosen.length === 2) break;
  }
  return chosen;
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
  const shows = pickShows(events, reader, sendAt);
  const latestName = latestReview(reader)?.artistName;
  const updates = [...recentNews(news, new Date(Math.min(sendAt.getTime(), Date.parse(retrievedAt))))]
    .sort((left, right) => {
      const aboutLatest = (item: EditionNews) => (latestName && titleMentionsArtist(item.title, latestName) ? 1 : 0);
      const known = knownArtists(reader).filter((artist) => !latestName || !sameName(artist, latestName));
      const rank = (item: EditionNews) => (aboutLatest(item) ? 3 : known.some((artist) => titleMentionsArtist(item.title, artist)) ? 0 : 1);
      return rank(left) - rank(right) || Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
    })
    .slice(0, 2);
  const curated = editorialListens(editionDate, reader.genres);
  const availableListens = [...listens, ...curated];
  const listenPicks = pickListens(availableListens, shows, reader);


  const name = reader.firstName?.trim() || "";
  const place = reader.city?.trim() || "";
  const latest = latestReview(reader);

  const showCards: ShowCard[] = shows.map((event) => {
    const url = httpUrl(event.ticketUrl)!;
    const availability = availabilityOf(event);
    sources.push({
      kind: "event",
      url,
      retrievedAt,
      label: `${event.artistName} at ${event.venueName}`,
    });
    const when = formatEventWhen(event.eventDate, event.state, event.doorsTime);
    return {
      eyebrow: [when, event.venueName, event.city].filter(Boolean).join(" · "),
      title: event.artistName,
      body: reasonFor(event, reader, availableListens),
      availabilityNote: availabilityNote(availability),
      ctaLabel: ctaLabel(availability),
      ctaUrl: url,
      caution: availability !== "available",
    };
  });

  const updateCards: StoryCard[] = updates.map((item) => {
    const url = httpUrl(item.url)!;
    sources.push({ kind: "news", url, retrievedAt, label: item.title });
    return {
      eyebrow: item.source ? `${item.source} · recent` : "Live music update",
      title: item.title,
      body: item.summary?.trim()
        || (item.source ? `${item.source}: a recent music story, with the details at the source.` : "A recent music story to explore this week."),
      ctaLabel: "Read the source",
      ctaUrl: url,
      tone: "white",
    };
  });

  let listen: StoryCard | undefined;
  if (listenPicks.length > 0) {
    const general = listenPicks.every((pick) => pick.evergreen);
    for (const pick of listenPicks) {
      sources.push({ kind: "listen", url: httpUrl(pick.sourceUrl) ?? httpUrl(pick.url)!, retrievedAt,
        label: `${pick.artistName} — ${pick.trackName}` });
    }
    listen = {
      eyebrow: general ? "The listening room · evergreen picks" : "Your next listen",
      title: shows.length ? "Two songs before the ticket." : "Press play. Take a different route.",
      body: listenPicks.map((pick) => `${pick.artistName}’s “${pick.trackName}”: ${pick.reason?.trim() || "Try this recording and decide whether to explore the rest of the record."}`).join(" "),
      ctaLabel: `Listen to “${listenPicks[0].trackName}”`,
      ctaUrl: httpUrl(listenPicks[0].url)!,
      tone: "pink",
      links: listenPicks.map((pick) => ({ label: `Listen to ${pick.artistName} — “${pick.trackName}”`, url: httpUrl(pick.url)! })),
    };
  }

  // Feed outages must not turn new accounts' editions into a single app CTA.
  // This is a labeled album detour, never presented as breaking news or a personal match.
  const features: StoryCard[] = [];
  if (!updateCards.length) {
    const detour = curated.find((pick) => !isLatestArtist(reader, pick.artistName)
      && !listenPicks.some((listen) => sameName(listen.artistName, pick.artistName)))!;
    features.push({
      eyebrow: "The album detour · from the archives",
      title: `${detour.artistName}: ${detour.albumName}`,
      body: `Start with “${detour.trackName}”. ${detour.reason} If that moment lands, give the whole album a turn without skipping ahead. This is a record to revisit, rather than a new-release announcement.`,
      ctaLabel: "Explore the record", ctaUrl: detour.sourceUrl, tone: "white",
    });
    sources.push({ kind: "editorial", url: detour.sourceUrl, retrievedAt,
      label: `${detour.artistName} — ${detour.albumName} (evergreen)` });
  }

  let yourSynth: ComposedEdition["yourSynth"];
  if (latest?.artistName && latest.eventDate && !isUpcoming(latest.eventDate, new Date(retrievedAt), reader.state)) {
    const when = formatEventWhen(latest.eventDate, reader.state);
    const detail = latest.text ? ` ${firstSentence(latest.text)}` : "";
    const headline =
      reader.lifetimeShowCount > 0 && reader.fiveStarCount > 0
        ? `${reader.lifetimeShowCount} show${reader.lifetimeShowCount === 1 ? "" : "s"} logged. ${reader.fiveStarCount} five-star night${reader.fiveStarCount === 1 ? "" : "s"}.`
        : `Your latest: ${latest.artistName}.`;
    yourSynth = {
      headline,
      body: `Your latest was ${latest.artistName}${latest.venueName ? ` at ${latest.venueName}` : ""} on ${when}.${detail}`,
    };
    sources.push({
      kind: "account",
      url: APP_URL,
      retrievedAt,
      label: `Review of ${latest.artistName}`,
    });
  }

  const connectArtist = reader.otherFiveStarArtists.find((artist) => !latest?.artistName || !sameName(artist, latest.artistName));
  const connect: StoryCard = connectArtist
    ? {
        eyebrow: "Connect",
        title: `Who else gave ${connectArtist} a 5?`,
        body: `Other people on Synth rated ${connectArtist} a five. Open those reviews and see who else is planning a night out.`,
        ctaLabel: "Explore Synth",
        ctaUrl: APP_URL,
        tone: "yellow",
      }
    : shows.length
    ? {
        eyebrow: "Connect",
        title: "See the dates on Synth.",
        body: "Pick one date, send it to a friend, and leave room for the opener. After the encore, keep one detail you want to remember in your review.",
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

  const headline = name ? `${name}, let’s find your next great night.` : "Let’s find your next great night.";
  const introBits = [
    showCards.length && place ? `a few ${place} shows to put on your radar` : showCards.length ? "a few dates to put on your radar" : "",
    updateCards.length ? "the music stories worth a look" : "an album detour from the archives",
    listen ? "two songs to take into your week" : "",
  ].filter(Boolean);
  const intro = introBits.length
    ? `${joinList(introBits).replace(/^./, (letter) => letter.toUpperCase())}.`
    : "Your next great night starts with the music you love. Keep your concert memories and explore with other fans on Synth.";

  const firstArtist = showCards[0]?.title;
  const subject = firstArtist
    ? `${name ? `${name}, ` : ""}${firstArtist} and what’s worth hearing`.slice(0, 78)
    : `${name ? `${name}, ` : ""}Your next night out`.slice(0, 78);

  return {
    subject,
    preheader: intro,
    issueLabel: `${formatIssueDate(editionDate)} · Issue No. ${issueNumber}`,
    headline,
    intro,
    yourSynth,
    showsHeading: showCards.length
      ? place && (reader.latitude != null || shows.every((event) => sameName(event.city, place)))
        ? `On your radar in ${place}`
        : "On your radar"
      : undefined,
    showsDek: showCards.length ? "Upcoming options, with a reason each one is here." : undefined,
    shows: showCards,
    updates: updateCards,
    features,
    editorialFlags: updateCards.length ? [] : ["No current news was available; this edition uses a labeled evergreen album feature."],
    listen,
    connect,
    sources,
  };
};
