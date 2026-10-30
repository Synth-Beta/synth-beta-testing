/**
 * Editorial quality checks for recommendation-first newsletter inputs.
 * Run: npx tsx scripts/test-newsletter-quality.ts
 */
import assert from "node:assert/strict";
import { generateDraftsFromSource } from "../src/lib/newsletterEdition/gather";
import { composeEdition } from "../src/lib/newsletterEdition/compose";
import { renderEditionHtml } from "../src/lib/newsletterEdition/render";
import { canSendDraft, contentHash, regenerateDecision, type StoredDraft } from "../src/lib/newsletterEdition/gate";
import { artistTitlePattern, loadEventsNearPlaces } from "../../../supabase/functions/newsletter-send/nearby";
import { meaningfulSummary, parseRssItems } from "../../../supabase/functions/newsletter-send/news";
import type { EditionEvent, EditionReader } from "../src/lib/newsletterEdition/types";

const sendAt = new Date("2026-10-13T15:00:00.000Z");
const retrievedAt = "2026-10-13T14:00:00.000Z";
const editionDate = "2026-10-13";

const show = (overrides: Partial<EditionEvent> & Pick<EditionEvent, "id" | "artistName">): EditionEvent => ({
  venueName: "The Anthem",
  city: "Washington",
  eventDate: "2026-11-20T00:00:00.000Z",
  ticketAvailable: true,
  ticketUrl: `https://www.axs.com/events/${overrides.id}`,
  state: "DC",
  latitude: 38.9072,
  longitude: -77.0369,
  genres: ["rock"],
  ...overrides,
});

const baseReader = (overrides: Partial<EditionReader>): EditionReader => ({
  userId: "reader",
  email: "reader@example.com",
  firstName: "Alex",
  city: "Washington",
  state: "DC",
  latitude: 38.9072,
  longitude: -77.0369,
  reviews: [],
  lifetimeShowCount: 0,
  fiveStarCount: 0,
  topArtists: [],
  genres: [],
  otherFiveStarArtists: [],
  ...overrides,
});

const compose = (reader: EditionReader, events: EditionEvent[] = [], extra: { news?: any[]; listens?: any[] } = {}) =>
  composeEdition({
    reader,
    events,
    news: extra.news ?? [],
    listens: extra.listens ?? [],
    sendAt,
    editionDate,
    issueNumber: 4,
    retrievedAt,
  })!;

const artistsOf = (edition: NonNullable<ReturnType<typeof composeEdition>>) => edition.qualityReport.featuredArtists.map((artist) => artist.toLowerCase());
const listenBodies = (edition: NonNullable<ReturnType<typeof composeEdition>>) => (edition.listens ?? []).map((card) => card.body).join(" ");
const listenTitles = (edition: NonNullable<ReturnType<typeof composeEdition>>) => (edition.listens ?? []).map((card) => card.title).join(" ");

const noFiller = (html: string) => {
  assert.doesNotMatch(html, /recent music story|details at the source|current artist update|the other picks are different/i);
  assert.doesNotMatch(html, /\u2014/);
  assert.doesNotMatch(html, /After the encore|85 saved shows|22 nights|Your Synth/i);
};

const active = baseReader({
  lifetimeShowCount: 8,
  fiveStarCount: 3,
  topArtists: ["Khruangbin", "Goose"],
  genres: ["rock", "jam"],
  otherFiveStarArtists: ["Phish"],
  interestedEventIds: ["kettama"],
  reviews: [
    { artistName: "Penelope Road", venueName: "The Anthem", eventDate: "2026-06-03T00:00:00.000Z", rating: 5, text: "The room stayed on its feet and the last song had everybody singing." },
    { artistName: "Goose", venueName: "The Anthem", eventDate: "2025-06-11T00:00:00.000Z", rating: 5, text: "The second set opened with a long jam that the whole floor knew." },
    { artistName: "Muse", venueName: "Hollywood Casino Amphitheatre", eventDate: "2024-07-05T00:00:00.000Z", rating: 4, text: "The lights were bigger than the songs, but the encore still landed." },
  ],
});
const activeEvents = [
  show({ id: "kettama", artistName: "KETTAMA", venueName: "Echostage" }),
  show({ id: "goose", artistName: "Goose", eventDate: "2026-12-02T00:00:00.000Z" }),
  show({ id: "far", artistName: "Wilco", city: "Chicago", state: "IL", latitude: 41.8781, longitude: -87.6298, venueName: "Chicago Theatre" }),
  show({ id: "past", artistName: "Muse", eventDate: "2026-09-01T00:00:00.000Z" }),
  show({ id: "cancel", artistName: "Jungle", ticketUrl: "https://www.axs.com/events/jungle" }),
];
const activeEdition = compose(active, activeEvents, {
  news: [
    { id: "goose-news", title: "Goose announces a winter run", url: "https://pitchfork.com/news/goose", source: "Pitchfork", publishedAt: "2026-10-10T12:00:00.000Z", summary: "Goose added winter dates, with the routing and on-sale note published at the source." },
    { id: "plain", title: "A producer talks about a session", url: "https://pitchfork.com/news/session", source: "Pitchfork", publishedAt: "2026-10-09T12:00:00.000Z", summary: "The producer described the session and named the record they were finishing." },
  ],
  listens: [
    { artistName: "Khruangbin", trackName: "Time (You and I)", url: "https://open.spotify.com/track/khruangbin" },
    { artistName: "Goose", trackName: "Arcadia", url: "https://open.spotify.com/track/goose" },
  ],
});
const activeHtml = renderEditionHtml(activeEdition);
noFiller(activeHtml);
assert.match(activeEdition.headline, /Goose|KETTAMA/);
assert.doesNotMatch(activeEdition.intro, /write a review|newest night/i);
assert.equal(activeEdition.yourSynth, undefined);
assert.equal(activeEdition.history, undefined);
assert.doesNotMatch(activeHtml, /Penelope Road|singing|newest night/);
assert.ok(activeEdition.shows.some((card) => card.title === "Goose"));
assert.ok(activeEdition.shows.some((card) => card.title === "KETTAMA" && /saved/i.test(card.body)));
assert.equal(activeEdition.shows.some((card) => card.title === "Wilco"), false);
assert.equal(activeEdition.shows.some((card) => card.title === "Penelope Road"), false);
assert.ok((activeEdition.listens?.length ?? 0) >= 2);
assert.doesNotMatch(listenTitles(activeEdition), /Arcadia|Time \(You and I\)|Khruangbin|Goose/);
assert.ok(activeEdition.listens?.every((card) => card.eyebrow === "On your next listen"));
assert.equal(new Set(artistsOf(activeEdition)).size, artistsOf(activeEdition).length);
assert.equal(activeEdition.qualityReport.sections.includes("yourSynth"), false);
assert.ok(activeEdition.qualityReport.sections.includes("onYourRadar"));
assert.ok(activeEdition.qualityReport.sections.includes("yourNextListen"));
assert.ok(activeEdition.qualityReport.personalizationEvidence.some((line) => /Taste genres|local linked event|Repeated artist|Taste anchor/.test(line)));

const reviewsOnly = compose(baseReader({
  lifetimeShowCount: 4,
  fiveStarCount: 2,
  reviews: [
    { artistName: "Wilco", venueName: "Riviera Theatre", eventDate: "2026-05-01T00:00:00.000Z", rating: 5, text: "The encore ran long and the room sang the last song back." },
    { artistName: "Jason Isbell", venueName: "Ryman Auditorium", eventDate: "2025-08-01T00:00:00.000Z", rating: 5, text: "The quiet songs carried farther than the loud ones in that room." },
  ],
}), [show({ id: "isbell", artistName: "Jason Isbell", city: "Washington" })]);
assert.equal(reviewsOnly.yourSynth, undefined);
assert.ok(reviewsOnly.shows.some((card) => card.title === "Jason Isbell"));
assert.match(reviewsOnly.shows.find((card) => card.title === "Jason Isbell")?.body ?? "", /seen Jason Isbell before/i);
assert.equal(reviewsOnly.history, undefined);
assert.ok((reviewsOnly.listens?.length ?? 0) >= 2);
assert.ok(reviewsOnly.qualityReport.missingData.some((line) => /streaming/i.test(line)));

const streamingOnly = compose(baseReader({
  city: "Chicago",
  state: "IL",
  latitude: 41.8781,
  longitude: -87.6298,
  topArtists: ["Wilco"],
  genres: ["rock"],
}), [show({ id: "wilco-chi", artistName: "Wilco", city: "Chicago", state: "IL", latitude: 41.8781, longitude: -87.6298, venueName: "Chicago Theatre" })], {
  listens: [{ artistName: "Wilco", trackName: "Jesus, Etc.", url: "https://open.spotify.com/track/wilco" }],
});
assert.equal(streamingOnly.yourSynth, undefined);
assert.ok(streamingOnly.shows.some((card) => card.title === "Wilco"));
assert.doesNotMatch(listenTitles(streamingOnly), /Jesus, Etc\.|Wilco/);
assert.match(renderEditionHtml(streamingOnly), /Wilco/);
assert.ok(streamingOnly.qualityReport.missingData.some((line) => /concert history|reviews/i.test(line)));

const empty = compose(baseReader({
  firstName: "Riley",
  city: null,
  state: null,
  latitude: null,
  longitude: null,
}));
const emptyHtml = renderEditionHtml(empty);
assert.equal(empty.yourSynth, undefined);
assert.equal(empty.shows.length, 0);
assert.match(emptyHtml, /The listening detour/);
assert.match(emptyHtml, /On your next listen/);
assert.match(emptyHtml, /Set your city to get upcoming concerts near you/);
assert.match(emptyHtml, /Explore concerts on Synth/);
assert.doesNotMatch(emptyHtml, /your latest|because you love|your favorite artist|After the encore/i);
noFiller(emptyHtml);

const jamSam = compose(baseReader({
  userId: "sam-jam",
  firstName: "Sam",
  topArtists: ["Goose", "Phish"],
  genres: ["jam"],
  lifetimeShowCount: 6,
  fiveStarCount: 2,
  reviews: [
    { artistName: "Goose", venueName: "The Anthem", eventDate: "2025-06-11T00:00:00.000Z", rating: 5, text: "The second set opened with a long jam that the whole floor knew." },
  ],
}), [], {
  news: [
    { id: "pop-a", title: "A pop star drops a glittery single", url: "https://pitchfork.com/news/pop-a", source: "Pitchfork", publishedAt: "2026-10-12T12:00:00.000Z", summary: "The pop star released a glittery single, with the video and credits posted at the source." },
    { id: "pop-b", title: "Another chart act announces a stadium tour", url: "https://pitchfork.com/news/pop-b", source: "Pitchfork", publishedAt: "2026-10-11T18:00:00.000Z", summary: "The chart act announced stadium dates, and the routing is listed on the official page." },
    { id: "billy", title: "Billy Strings expands a jam-band fall run", url: "https://pitchfork.com/news/billy", source: "Pitchfork", publishedAt: "2026-10-10T12:00:00.000Z", summary: "Billy Strings added fall jam-band dates, with the routing and on-sale note published at the source." },
    { id: "panic", title: "Widespread Panic plots another jam-band spring route", url: "https://relix.com/news/panic", source: "Relix", publishedAt: "2026-10-09T12:00:00.000Z", summary: "Widespread Panic plotted another jam-band spring route, and the dates are listed on the band site." },
    { id: "goose", title: "Goose shares a rehearsal clip", url: "https://relix.com/news/goose-clip", source: "Relix", publishedAt: "2026-10-11T12:00:00.000Z", summary: "Goose shared a rehearsal clip ahead of the next run, with the full video posted by the band." },
  ],
});
assert.ok(jamSam.updates.length >= 1);
assert.ok(jamSam.updates.every((story) => /Billy Strings|Widespread Panic|Goose|jam-band/i.test(story.title)));
assert.equal(jamSam.updates.some((story) => /pop star|chart act/i.test(story.title)), false);
assert.ok((jamSam.listens?.length ?? 0) >= 2);
assert.match(listenTitles(jamSam) + listenBodies(jamSam), /jam-band|rock direction|Circles Around the Sun|Lettuce|Medeski|Talking Heads|Alabama Shakes|Hiss Golden|My Morning Jacket|Umphrey|Twiddle|Lotus/i);
assert.doesNotMatch(listenTitles(jamSam), /Goose|Phish|Arcadia/);

const followNews = compose(baseReader({
  userId: "follow-reader",
  followedArtists: ["Japanese Breakfast"],
  followedVenues: ["9:30 Club"],
  reviews: [
    { artistName: "Bad Show", venueName: "Echo Stage", eventDate: "2025-01-01T00:00:00.000Z", rating: 2, text: "The sound never settled and the set felt unfinished in that room." },
    { artistName: "Good Show", venueName: "Lincoln Theatre", eventDate: "2025-02-01T00:00:00.000Z", rating: 4, text: "The encore ran long and the balcony stayed on its feet the whole time." },
  ],
}), [], {
  news: [
    { id: "jb", title: "Japanese Breakfast shares a new single", url: "https://pitchfork.com/news/jb", source: "Pitchfork", publishedAt: "2026-10-12T10:00:00.000Z", summary: "Japanese Breakfast shared a new single, with the credits listed at the source." },
    { id: "club", title: "9:30 Club posts a busy November calendar", url: "https://dcist.com/news/930", source: "DCist", publishedAt: "2026-10-11T10:00:00.000Z", summary: "9:30 Club posted a busy November calendar, with dates and ticket links on its site." },
    { id: "bad", title: "Bad Show announces a reunion date", url: "https://pitchfork.com/news/bad", source: "Pitchfork", publishedAt: "2026-10-12T12:00:00.000Z", summary: "Bad Show announced a reunion date, and the venue and on-sale note are at the source." },
    { id: "good", title: "Good Show adds a Lincoln Theatre return", url: "https://pitchfork.com/news/good", source: "Pitchfork", publishedAt: "2026-10-10T10:00:00.000Z", summary: "Good Show added a Lincoln Theatre return, with the date posted by the venue." },
    { id: "pop", title: "A pop star drops a glittery single", url: "https://pitchfork.com/news/pop", source: "Pitchfork", publishedAt: "2026-10-12T14:00:00.000Z", summary: "The pop star released a glittery single, with the video and credits posted at the source." },
  ],
});
assert.ok(followNews.updates.some((story) => /Japanese Breakfast/i.test(story.title)));
assert.ok(followNews.updates.some((story) => /Good Show|Lincoln Theatre/i.test(story.title)));
assert.equal(followNews.updates.some((story) => /Bad Show/i.test(story.title)), false);
assert.equal(followNews.updates.some((story) => /pop star/i.test(story.title)), false);

const sparseNearby = compose(active, [
  show({ id: "only", artistName: "KETTAMA" }),
  show({ id: "miles-away", artistName: "Phish", city: "Denver", state: "CO", latitude: 39.7392, longitude: -104.9903, venueName: "Red Rocks" }),
]);
assert.equal(sparseNearby.shows.length, 1);
assert.equal(sparseNearby.shows.some((card) => card.title === "Phish"), false);

const encoded = parseRssItems(
  `<rss><channel><item><title>Useful session note</title><link>https://www.billboard.com/music/example</link><pubDate>Tue, 06 Oct 2026 12:00:00 GMT</pubDate><description>Read more</description><content:encoded><![CDATA[<p>The band explained the new arrangement and why they brought the song back into the set.</p>]]></content:encoded></item><item><title>Comments on: a post</title><link>https://www.nme.com/comment</link><pubDate>Tue, 06 Oct 2026 12:00:00 GMT</pubDate><description>This comment is long enough to look like a summary but it is not a story.</description></item></channel></rss>`,
  "Billboard",
  sendAt
);
assert.equal(encoded.length, 1);
assert.match(encoded[0].summary ?? "", /new arrangement/);
assert.equal(meaningfulSummary("Read more at the source website today please"), null);
assert.equal(meaningfulSummary("A long enough music note about the D.C. scene that used to truncate awkwardly."), "A long enough music note about the D.C. scene that used to truncate awkwardly.");
const unsourced = compose(baseReader({ topArtists: ["Muse"] }), [], {
  news: [{ id: "bare", title: "Muse posts a photo", url: "https://pitchfork.com/news/bare", source: "Pitchfork", publishedAt: "2026-10-10T12:00:00.000Z" }],
});
assert.equal(unsourced.updates.length, 0);
assert.ok(unsourced.qualityReport.warnings.some((line) => /lacked useful summaries|No genuinely relevant/i.test(line)));

const featured = artistsOf(activeEdition);
assert.equal(new Set(featured).size, featured.length);
assert.doesNotMatch(activeHtml, /Penelope Road[\s\S]*Penelope Road/);

const blocked = await generateDraftsFromSource({
  users: [{ user_id: "sam", email: "sam@example.com", name: "Sam", location_city: "Washington", location_state: "DC" }],
  news: [],
  reviews: [],
  stats: [],
  publicFives: [],
  events: [
    { id: "resale", artist_name: "Resale Act", artists: { name: "Resale Act" }, venues: { name: "Club" }, venue_city: "Washington", venue_state: "DC", event_date: "2026-11-01T00:00:00.000Z", ticket_urls: ["https://stubhub.com/resale-act", "https://vivid-seats.pxf.io/resale"], latitude: 38.9, longitude: -77.0 },
    { id: "official", artist_name: "Official Act", artists: { name: "Official Act" }, venues: { name: "9:30 Club" }, venue_city: "Washington", venue_state: "DC", event_date: "2026-11-02T00:00:00.000Z", ticket_urls: ["https://stubhub.com/official", "https://www.axs.com/events/official"], ticket_available: true, latitude: 38.9, longitude: -77.0 },
    { id: "canceled", artist_name: "Canceled Act", artists: { name: "Canceled Act" }, venues: { name: "Club" }, venue_city: "Washington", venue_state: "DC", event_date: "2026-11-03T00:00:00.000Z", event_status: "cancelled", ticket_urls: ["https://www.axs.com/events/canceled"], latitude: 38.9, longitude: -77.0 },
    { id: "expired", artist_name: "Expired Act", artists: { name: "Expired Act" }, venues: { name: "Club" }, venue_city: "Washington", venue_state: "DC", event_date: "2026-09-01T00:00:00.000Z", ticket_urls: ["https://www.axs.com/events/expired"], latitude: 38.9, longitude: -77.0 },
    { id: "sold", artist_name: "Sold Act", artists: { name: "Sold Act" }, venues: { name: "Club" }, venue_city: "Washington", venue_state: "DC", event_date: "2026-11-04T00:00:00.000Z", event_status: "sold out", ticket_available: false, ticket_urls: ["https://www.ticketmaster.com/sold"], latitude: 38.9, longitude: -77.0 },
  ],
}, sendAt, "2026-10-19");
const blockedHtml = blocked.drafts[0].html;
assert.doesNotMatch(blockedHtml, /Resale Act|Canceled Act|Expired Act|stubhub|vivid-seats/);
assert.match(blockedHtml, /Official Act/);
assert.match(blockedHtml, /https:\/\/www\.axs\.com\/events\/official/);
assert.match(blockedHtml, /Sold Act/);
assert.match(blockedHtml, /Listed as sold out/);

const wrongGeo = compose(baseReader({ city: "Chicago", state: "IL", latitude: 41.8781, longitude: -87.6298 }), [
  show({ id: "dc-show", artistName: "Local Natives", city: "Washington", state: "DC", latitude: 38.9, longitude: -77.0 }),
  show({ id: "chi-show", artistName: "Horsegirl", city: "Evanston", state: "IL", latitude: 42.0451, longitude: -87.6877, venueName: "SPACE" }),
]);
assert.ok(wrongGeo.shows.some((card) => card.title === "Horsegirl"));
assert.equal(wrongGeo.shows.some((card) => card.title === "Local Natives"), false);

assert.equal(artistTitlePattern("Wilco"), "Wilco at%");
const early = Array.from({ length: 40 }, (_, index) => ({
  id: `early-${index}`,
  event_date: "2026-10-16T00:00:00.000Z",
  latitude: 41.88,
  longitude: -87.63,
  artists: { name: "Early Act" },
  venue_city: "Chicago",
}));
const late = { id: "late-favorite", event_date: "2026-12-20T00:00:00.000Z", latitude: 41.89, longitude: -87.62, artists: { name: "Late Favorite" }, venue_city: "Chicago" };
const loaded = await loadEventsNearPlaces([{ city: "Chicago", state: "IL" }], ["Late Favorite"], new Date("2026-10-13T12:00:00.000Z"), async (spec) => {
  if (spec.kind === "city-sample") return [{ latitude: 41.8781, longitude: -87.6298, venue_state: "IL" }];
  if (spec.kind === "artist") {
    assert.equal(spec.limit, 12);
    return [late];
  }
  if (spec.kind === "box" && Date.parse(spec.from) < Date.parse("2026-11-15T00:00:00.000Z")) return early;
  if (spec.kind === "box") return [late];
  return [];
});
assert.ok(loaded.events.some((row) => row.id === "late-favorite"));
assert.ok(loaded.events.length > 40);

const hash = await contentHash("Subject", "<p>Reviewed</p>");
const draft = (overrides: Partial<StoredDraft>): StoredDraft => ({
  id: "draft",
  editionDate,
  userId: "alex",
  email: "alex@example.com",
  subject: "Subject",
  html: "<p>Reviewed</p>",
  contentHash: hash,
  status: "approved",
  approvedContentHash: hash,
  sentAt: null,
  ...overrides,
});
assert.equal(regenerateDecision({ status: "approved" }), "replace");
assert.equal(regenerateDecision({ status: "sent" }), "keep");
assert.equal(canSendDraft(draft({ status: "sent", sentAt: retrievedAt }), new Set()).reason, "already sent");
assert.equal(canSendDraft(draft({ status: "needs_approval", approvedContentHash: null }), new Set()).ok, false);

const noLocationSaved = compose(baseReader({
  city: null,
  state: null,
  latitude: null,
  longitude: null,
  interestedEventIds: ["dc-1", "dc-2", "dc-3", "chi"],
}), [
  show({ id: "dc-1", artistName: "Eggy", eventDate: "2026-11-20T00:00:00.000Z" }),
  show({ id: "dc-2", artistName: "Daniel Donato", eventDate: "2026-11-21T00:00:00.000Z" }),
  show({ id: "dc-3", artistName: "Dark Star Orchestra", eventDate: "2026-11-22T00:00:00.000Z" }),
  show({ id: "chi", artistName: "Wilco", city: "Chicago", state: "IL", latitude: 41.88, longitude: -87.63, venueName: "Chicago Theatre" }),
]);
assert.equal(noLocationSaved.shows.length, 0, "saved interests never invent a city when location is missing");
assert.ok(noLocationSaved.locationPrompt);
assert.ok(noLocationSaved.qualityReport.missingData.some((line) => /No location/i.test(line)));

const gooseReviews = [
  { artistName: "Goose", venueName: "The Anthem", eventDate: "2026-06-11T00:00:00.000Z", rating: 5, text: "The second set opened with a long jam that the whole floor knew." },
  { artistName: "Goose", venueName: "Merriweather", eventDate: "2025-08-01T00:00:00.000Z", rating: 4, text: "Another Goose night, and the second set ran long again." },
];
const withReturn = compose(baseReader({
  firstName: "Sam",
  lifetimeShowCount: 3,
  fiveStarCount: 2,
  goingEventIds: ["goose-weekend"],
  interestedEventIds: ["reviewed-weekend"],
  reviews: [
    ...gooseReviews,
    { artistName: "Khruangbin", eventId: "reviewed-weekend", venueName: "9:30 Club", eventDate: "2026-10-10T00:00:00.000Z", rating: 5, text: "Already wrote this one up while the room was still loud." },
  ],
}), [
  show({ id: "goose-weekend", artistName: "Goose", eventDate: "2026-10-10T00:00:00.000Z", venueName: "The Anthem", genres: ["jam"] }),
  show({ id: "reviewed-weekend", artistName: "Khruangbin", eventDate: "2026-10-10T00:00:00.000Z", venueName: "9:30 Club", genres: ["funk"] }),
  show({ id: "goose-next", artistName: "Goose", eventDate: "2026-12-02T00:00:00.000Z", venueName: "The Anthem", genres: ["jam"] }),
]);
assert.match(withReturn.headline, /Goose is back on the calendar/);
assert.match(withReturn.intro, /reviewed Goose 2 times/i);
assert.ok(withReturn.shows.some((card) => card.title === "Goose" && /reviewed Goose 2 times|another chance/i.test(card.body)));
assert.equal(withReturn.shows.some((card) => card.title === "Goose" && /2026-10-10/.test(card.eyebrow)), false, "past going date is not recommended as upcoming");
const goingSoon = compose(baseReader({
  firstName: "Sam",
  goingEventIds: ["goose-next"],
  reviews: gooseReviews,
}), [
  show({ id: "goose-next", artistName: "Goose", eventDate: "2026-12-02T00:00:00.000Z", venueName: "The Anthem", genres: ["jam"] }),
]);
assert.match(goingSoon.shows.find((card) => card.title === "Goose")?.body ?? "", /Already marked going/i);

const rotation = compose(baseReader({
  topArtists: ["Goose"],
  genres: ["jam"],
  recentSourceUrls: ["https://pitchfork.com/news/goose"],
  recentListenKeys: ["Circles Around the Sun, Hallucinate"],
}), [], {
  news: [
    { id: "goose-news", title: "Goose announces a winter run", url: "https://pitchfork.com/news/goose", source: "Pitchfork", publishedAt: "2026-10-10T12:00:00.000Z", summary: "Goose added winter dates, with the routing and on-sale note published at the source." },
    { id: "fresh", title: "Goose shares a new rehearsal clip", url: "https://relix.com/news/goose-fresh", source: "Relix", publishedAt: "2026-10-11T12:00:00.000Z", summary: "Goose shared a rehearsal clip ahead of the next run, with the full video posted by the band." },
  ],
});
assert.equal(rotation.updates.some((story) => story.ctaUrl === "https://pitchfork.com/news/goose"), false);
assert.ok(rotation.updates.some((story) => story.ctaUrl === "https://relix.com/news/goose-fresh"));
assert.ok(rotation.qualityReport.personalizationEvidence.some((line) => /Recent-edition repeat filter/.test(line)));

const fresh = compose(baseReader({
  reviews: [{ artistName: "Goose", venueName: "The Anthem", eventDate: "2026-10-11T00:00:00.000Z", rating: 5, text: "The room stayed loud." }],
}), []);
assert.equal(fresh.yourSynth, undefined);
assert.equal(fresh.history, undefined);
assert.doesNotMatch(renderEditionHtml(fresh), /newest night|Fur Elise|85 saved/);
assert.match(fresh.headline, /outside your usual rotation|Goose|new sounds|rabbit hole/i);

console.log("newsletter quality checks passed");
