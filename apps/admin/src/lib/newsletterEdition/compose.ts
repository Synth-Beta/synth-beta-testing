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
  const match = cleaned.match(/^.{12,160}?[.!](\s|$)/);
  return (match ? match[0] : cleaned.slice(0, 140)).trim();
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

const reasonFor = (event: EditionEvent, reader: EditionReader) => {
  const review = reader.reviews.find((item) => sameName(item.artistName, event.artistName));
  if (review?.venueName) {
    return `You already logged ${review.artistName}${review.venueName ? ` at ${review.venueName}` : ""}. This is another date if you want to go back.`;
  }
  if (reader.topArtists.some((artist) => sameName(artist, event.artistName))) {
    return `${event.artistName} shows up in your listening, so this date is a direct match.`;
  }
  const genre = (event.genres ?? []).find((item) =>
    reader.genres.some((known) => known.toLowerCase() === item.toLowerCase())
  );
  if (genre) {
    const article = /^[aeiou]/i.test(genre) ? "An" : "A";
    return `${article} ${genre} bill, in line with what you listen to.`;
  }
  if (reader.city) return `On the calendar in ${reader.city}.`;
  return `${event.artistName} has a listed date in ${event.city}.`;
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
      if (reader.reviews.some((review) => sameName(review.artistName, event.artistName)) && inCity) return 0;
      if (reader.reviews.some((review) => sameName(review.artistName, event.artistName))) return 1;
      if (reader.topArtists.some((artist) => sameName(artist, event.artistName)) && inCity) return 2;
      if (reader.topArtists.some((artist) => sameName(artist, event.artistName))) return 3;
      if (genreMatch(event) && inCity) return 4;
      if (inCity) return 5;
      if (genreMatch(event)) return 6;
      return 9;
    };
    return score(left) - score(right) || left.eventDate.localeCompare(right.eventDate);
  });
  const taste = ranked.filter(
    (event) => artists.some((artist) => sameName(artist, event.artistName)) || genreMatch(event)
  );
  const pool = reader.latitude != null || reader.city ? ranked : taste;
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

const pickNews = (news: EditionNews[], reader: EditionReader, sendAt: Date) => {
  const artists = knownArtists(reader);
  return news
    .filter((item) => httpUrl(item.url))
    .filter((item) => {
      const published = new Date(item.publishedAt).getTime();
      return !Number.isNaN(published) && sendAt.getTime() - published <= NEWS_WINDOW_MS && published <= sendAt.getTime();
    })
    .filter((item) =>
      artists.some((artist) => titleMentionsArtist(item.title, artist))
    )
    .slice(0, 2);
};

const pickListens = (listens: EditionListen[], shows: EditionEvent[], reader: EditionReader) => {
  const fromShows = shows
    .filter((show) => !reader.reviews.some((review) => sameName(review.artistName, show.artistName)))
    .map((show) => ({ artistName: show.artistName }));
  const fromReviews = reader.reviews
    .filter((review) => (review.rating ?? 0) >= 4)
    .filter((review) => !shows.some((show) => sameName(show.artistName, review.artistName)))
    .map((review) => ({ artistName: review.artistName }));
  const pool = [...listens, ...fromShows, ...fromReviews];
  const chosen: EditionListen[] = [];
  for (const item of pool) {
    if (!item.artistName) continue;
    if (chosen.some((existing) => sameName(existing.artistName, item.artistName))) continue;
    chosen.push(item);
    if (chosen.length === 2) break;
  }
  return chosen;
};

const spotifySearch = (query: string) =>
  `https://open.spotify.com/search/${encodeURIComponent(query)}`;

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
  const personalizedNews = pickNews(news, reader, sendAt);
  // A sourced general edition also serves readers without taste/history data.
  const updates = personalizedNews.length ? personalizedNews : news
    .filter((item) => httpUrl(item.url))
    .filter((item) => {
      const published = Date.parse(item.publishedAt);
      return Number.isFinite(published) && published <= sendAt.getTime() && sendAt.getTime() - published <= NEWS_WINDOW_MS;
    })
    .filter((item, index, items) => items.findIndex((other) => other.url === item.url) === index)
    .slice(0, 2);
  const listenPicks = pickListens(listens, shows, reader);


  const name = reader.firstName?.trim() || "";
  const place = reader.city?.trim() || "";
  const latest = [...reader.reviews].sort((left, right) =>
    String(right.eventDate ?? "").localeCompare(String(left.eventDate ?? ""))
  )[0];

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
      body: reasonFor(event, reader),
      availabilityNote: availabilityNote(availability),
      ctaLabel: ctaLabel(availability),
      ctaUrl: url,
      caution: availability !== "available",
    };
  });

  const updateCards: StoryCard[] = updates.map((item) => {
    const url = httpUrl(item.url)!;
    const artist = knownArtists(reader).find((name) => titleMentionsArtist(item.title, name));
    sources.push({ kind: "news", url, retrievedAt, label: item.title });
    return {
      eyebrow: item.source ? `${item.source} · recent` : "Live music update",
      title: item.title,
      body: artist
        ? `${artist} is part of your listening or your show history, and this listing is new enough to be worth a look.`
        : "A recent music story to explore this week.",
      ctaLabel: "Read the source",
      ctaUrl: url,
      tone: "white",
    };
  });

  let listen: StoryCard | undefined;
  if (listenPicks.length > 0) {
    const lines = listenPicks.map((pick) => {
      const query = pick.trackName ? `${pick.artistName} ${pick.trackName}` : pick.artistName;
      const url = spotifySearch(query);
      sources.push({
        kind: "listen",
        url,
        retrievedAt,
        label: pick.trackName ? `${pick.artistName} — ${pick.trackName}` : pick.artistName,
      });
      return { ...pick, url };
    });
    listen = {
      eyebrow: "Your next listen",
      title: lines.length > 1 ? "Two places to start." : "One place to start.",
      body: lines
        .map((pick) =>
          pick.trackName
            ? `Try ${pick.artistName}’s “${pick.trackName}” if you want a sample before a ticket.`
            : `Sample ${pick.artistName} before you decide on a ticket. This is a match for your taste, not a promise you’ll love it.`
        )
        .join(" "),
      ctaLabel: lines[0].trackName ? `Listen to “${lines[0].trackName}”` : `Listen to ${lines[0].artistName}`,
      ctaUrl: lines[0].url,
      tone: "pink",
    };
    listen.links = lines.map((pick) => ({
      label: pick.trackName ? `Listen to “${pick.trackName}”` : `Listen to ${pick.artistName}`,
      url: pick.url,
    }));
  }

  let yourSynth: ComposedEdition["yourSynth"];
  if (latest?.artistName && latest.eventDate && !isUpcoming(latest.eventDate, sendAt, reader.state)) {
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

  const connectArtist = reader.otherFiveStarArtists[0];
  const connect: StoryCard = connectArtist
    ? {
        eyebrow: "Connect",
        title: `Who else gave ${connectArtist} a 5?`,
        body: `Other people on Synth rated ${connectArtist} a five. Open the reviews and see who else wrote about that show.`,
        ctaLabel: "Explore Synth",
        ctaUrl: APP_URL,
        tone: "yellow",
      }
    : latest
      ? {
          eyebrow: "Connect",
          title: `See what else is logged for ${latest.artistName}.`,
          body: "Your note is already on Synth. Browse reviews and upcoming shows for the artists you care about.",
          ctaLabel: "Explore Synth",
          ctaUrl: APP_URL,
          tone: "yellow",
        }
      : shows.length
        ? {
            eyebrow: "Connect",
            title: "See the dates on Synth.",
            body: "Open Synth to look through shows and write a review after you go.",
            ctaLabel: "Explore Synth",
            ctaUrl: APP_URL,
            tone: "yellow",
          }
        : {
            eyebrow: "Make your next show count",
            title: "Build your live music timeline.",
            body: "Log a concert you remember, add your review, and explore what other fans are sharing on Synth.",
            ctaLabel: "Explore Synth",
            ctaUrl: APP_URL,
            tone: "yellow",
          };

  const headline = name ? `${name}, let’s find your next great night.` : "Let’s find your next great night.";
  const introBits = [
    showCards.length && place ? `a few ${place} shows to put on your radar` : showCards.length ? "a few dates tied to artists you already know" : "",
    updateCards.length ? "a current artist update" : "",
    listen ? "something to sample before you buy a ticket" : "",
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
    listen,
    connect,
    sources,
  };
};
