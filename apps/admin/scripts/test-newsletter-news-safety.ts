/** Run from apps/admin: npx tsx scripts/test-newsletter-news-safety.ts */
import assert from "node:assert/strict";
import { composeEdition } from "../src/lib/newsletterEdition/compose";
import { renderEditionHtml } from "../src/lib/newsletterEdition/render";
import { isMusicRelatedStory, parseRssItems } from "../../../supabase/functions/newsletter-send/news";
import type { EditionEvent, EditionReader } from "../src/lib/newsletterEdition/types";

const story = (title: string, summary = "") => ({
  title,
  summary,
  url: "https://www.billboard.com/music/music-news/example",
  source: "Billboard",
});

for (const headline of [
  "Football tips for this weekend",
  "NFL game picks and predictions",
  "Super Bowl betting odds and fantasy football advice",
  "Champions League match preview",
  "NBA playoff results and power rankings",
  "Fantasy football tips from a musician",
]) {
  assert.equal(isMusicRelatedStory(story(headline, "Spotify playlist and new music album news")), false, headline);
}

assert.equal(
  isMusicRelatedStory(story("Super Bowl halftime show announces its musical performer")),
  false,
  "sports crossover headlines are rejected",
);

for (const headline of [
  "Goose announces winter tour",
  "New album arrives from indie rock band",
  "Singer announces concert during a weekend residency",
]) {
  assert.equal(isMusicRelatedStory(story(headline)), true, headline);
}

assert.equal(
  isMusicRelatedStory({
    title: "Weekend predictions",
    summary: "New music and concerts",
    source: "Pitchfork",
    url: "https://sports.example.com/news",
  }),
  false,
);

const xml = `<rss><channel><item><title>Football tips for this weekend</title><link>https://www.billboard.com/music/music-news/football-tips</link><pubDate>Mon, 02 Nov 2026 12:00:00 GMT</pubDate><description>A new album plays in the background.</description></item></channel></rss>`;
assert.equal(parseRssItems(xml, "Billboard", new Date("2026-11-02T18:00:00Z")).length, 0);

const sendAt = new Date("2026-11-02T15:00:00.000Z");
const retrievedAt = "2026-11-02T14:00:00.000Z";
const dcReader: EditionReader = {
  userId: "dc-reader",
  email: "dc@example.com",
  firstName: "Lauren",
  city: "Washington",
  state: "DC",
  latitude: 38.9072,
  longitude: -77.0369,
  lifetimeShowCount: 8,
  fiveStarCount: 3,
  topArtists: ["Jon Batiste", "Goose"],
  genres: ["jazz", "jam"],
  otherFiveStarArtists: [],
  reviews: [
    {
      artistName: "Jon Batiste",
      venueName: "Kennedy Center",
      eventDate: "2026-08-01T23:00:00.000Z",
      rating: 5,
      text: "A night that moved between jazz and pop without losing the room.",
    },
  ],
};

const footballFromBillboard = {
  id: "football-tips",
  title: "Football tips for this weekend",
  url: "https://www.billboard.com/music/music-news/football-tips-weekend",
  source: "Billboard",
  publishedAt: "2026-10-28T12:00:00.000Z",
  summary:
    "Concert calendars and Spotify playlists are trending, but here are the NFL picks and fantasy football advice for Sunday.",
};

const musicStory = {
  id: "batiste-news",
  title: "Jon Batiste announces a winter concert run",
  url: "https://www.billboard.com/music/music-news/jon-batiste-winter-concert",
  source: "Billboard",
  publishedAt: "2026-10-29T12:00:00.000Z",
  summary: "Jon Batiste added winter concert dates, with routing and on-sale details posted by the promoter.",
};

const halftimeStory = {
  id: "halftime",
  title: "Super Bowl halftime show announces its musical performer",
  url: "https://www.billboard.com/music/music-news/super-bowl-halftime-performer",
  source: "Billboard",
  publishedAt: "2026-10-30T12:00:00.000Z",
  summary: "The league confirmed the musical guest for the Super Bowl halftime show, with rehearsal notes at the source.",
};

const events: EditionEvent[] = [{
  id: "dc-show",
  artistName: "Sylvan Esso",
  venueName: "9:30 Club",
  city: "Washington",
  state: "DC",
  eventDate: "2026-11-20T00:00:00.000Z",
  ticketUrl: "https://www.axs.com/events/sylvan",
  ticketAvailable: true,
  latitude: 38.9072,
  longitude: -77.0369,
  genres: ["pop"],
}];

const edition = composeEdition({
  reader: dcReader,
  events,
  news: [footballFromBillboard, musicStory, halftimeStory],
  listens: [],
  sendAt,
  editionDate: "2026-11-02",
  issueNumber: 11,
  retrievedAt,
})!;

assert.ok(edition.shows.length >= 1, "safety checks still require a real show");
assert.equal(
  edition.updates.some((update) => /football tips/i.test(update.title)),
  false,
  "football tips never appear in personalized updates",
);
assert.equal(
  edition.sources.some((source) => /football tips/i.test(source.label ?? "") || /football-tips/i.test(source.url)),
  false,
  "football tips never appear in sources",
);
const html = renderEditionHtml(edition);
assert.doesNotMatch(html, /Football tips for this weekend/i);
assert.doesNotMatch(html, /Super Bowl/i);
assert.ok(
  edition.updates.some((update) => /Jon Batiste/i.test(update.title)),
  "preferred-artist music news still personalizes",
);

assert.equal(isMusicRelatedStory(halftimeStory), false, "sports crossovers are completely excluded");
assert.equal(
  edition.updates.some((update) => /halftime/i.test(update.title)),
  false,
  "halftime story is omitted entirely",
);

assert.ok(
  (edition.qualityReport?.warnings ?? []).some((warning) => /off-topic or non-music headlines were rejected/i.test(warning)),
  "quality report records off-topic rejections",
);

console.log("Newsletter editorial safety regressions passed.");
