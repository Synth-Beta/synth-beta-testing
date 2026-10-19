/**
 * Editorial quality checks for realistic newsletter inputs.
 * Run: npx vite-node scripts/test-newsletter-quality.ts
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

const noFiller = (html: string) => {
  assert.doesNotMatch(html, /recent music story|details at the source|current artist update|the other picks are different/i);
  assert.doesNotMatch(html, /\u2014/);
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
assert.ok(activeEdition.yourSynth?.body.includes("Penelope Road"));
assert.equal(/singing/.test(activeEdition.yourSynth?.body ?? ""), false);
assert.match(activeEdition.yourSynth?.body ?? "", /Goose|Anthem/);
assert.doesNotMatch(renderEditionHtml(activeEdition), /no saved city|saved shows cluster|sourced summary|account has no/i);
assert.ok(activeEdition.shows.some((card) => card.title === "KETTAMA"));
assert.ok(activeEdition.shows.some((card) => card.body.includes("saved")));
assert.equal(activeEdition.shows.some((card) => card.title === "Wilco"), false);
assert.equal(activeEdition.shows.some((card) => card.title === "Penelope Road"), false);
assert.equal(activeEdition.history?.title === "Penelope Road", false);
assert.doesNotMatch(activeEdition.listen?.body ?? "", /Arcadia|Time \(You and I\)|Khruangbin|Goose/);
assert.equal(activeEdition.listen?.eyebrow, "Your next listen");
assert.doesNotMatch(activeEdition.listen?.body ?? "", /saved listening|logged .+ live|evergreen/i);
assert.equal(new Set(artistsOf(activeEdition)).size, artistsOf(activeEdition).length);
assert.ok(activeEdition.qualityReport.sections.includes("yourSynth"));
assert.ok(activeEdition.qualityReport.sections.includes("onYourRadar"));
assert.ok(activeEdition.qualityReport.personalizationEvidence.some((line) => /logged shows|Listening artists|saved shows/.test(line)));

const reviewsOnly = compose(baseReader({
  lifetimeShowCount: 4,
  fiveStarCount: 2,
  reviews: [
    { artistName: "Wilco", venueName: "Riviera Theatre", eventDate: "2026-05-01T00:00:00.000Z", rating: 5, text: "The encore ran long and the room sang the last song back." },
    { artistName: "Jason Isbell", venueName: "Ryman Auditorium", eventDate: "2025-08-01T00:00:00.000Z", rating: 5, text: "The quiet songs carried farther than the loud ones in that room." },
  ],
}), [show({ id: "isbell", artistName: "Jason Isbell", city: "Washington" })]);
assert.ok(reviewsOnly.yourSynth?.body.includes("Wilco"));
assert.equal(reviewsOnly.shows.some((card) => card.title === "Jason Isbell"), true);
assert.equal(reviewsOnly.history?.title === "Wilco" || reviewsOnly.history?.title === "Jason Isbell", false);
assert.equal(reviewsOnly.listen?.eyebrow, "Your next listen");
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
assert.doesNotMatch(streamingOnly.listen?.body ?? "", /Jesus, Etc\.|Wilco/);
assert.equal(streamingOnly.listen?.eyebrow, "Your next listen");
assert.match(renderEditionHtml(streamingOnly), /Wilco/);
assert.doesNotMatch(`${streamingOnly.listen?.eyebrow ?? ""} ${streamingOnly.listen?.body ?? ""}`, /saved listening|evergreen/i);
assert.ok(streamingOnly.qualityReport.missingData.some((line) => /reviews/i.test(line)));

const empty = compose(baseReader({
  firstName: "Riley",
  city: null,
  state: null,
  latitude: null,
  longitude: null,
}));
const emptyHtml = renderEditionHtml(empty);
assert.equal(empty.yourSynth, undefined);
assert.match(emptyHtml, /Your next listen/);
assert.doesNotMatch(emptyHtml, /evergreen/i);
assert.match(emptyHtml, /The album detour/);
assert.match(emptyHtml, /Build your live music timeline/);
assert.doesNotMatch(emptyHtml, /your latest|because you love|your favorite artist/i);
noFiller(emptyHtml);

const sparseNearby = compose(active, [
  show({ id: "only", artistName: "KETTAMA" }),
  show({ id: "miles-away", artistName: "Phish", city: "Denver", state: "CO", latitude: 39.7392, longitude: -104.9903, venueName: "Red Rocks" }),
]);
assert.equal(sparseNearby.shows.length, 1);
assert.equal(sparseNearby.shows.some((card) => card.title === "Phish"), false);
assert.ok(sparseNearby.qualityReport.warnings.some((line) => /Fewer than two/.test(line)));

const encoded = parseRssItems(
  `<rss><channel><item><title>Useful session note</title><link>https://www.billboard.com/music/example</link><pubDate>Tue, 06 Oct 2026 12:00:00 GMT</pubDate><description>Read more</description><content:encoded><![CDATA[<p>The band explained the new arrangement and why they brought the song back into the set.</p>]]></content:encoded></item><item><title>Comments on: a post</title><link>https://www.nme.com/comment</link><pubDate>Tue, 06 Oct 2026 12:00:00 GMT</pubDate><description>This comment is long enough to look like a summary but it is not a story.</description></item></channel></rss>`,
  "Billboard",
  sendAt
);
assert.equal(encoded.length, 1);
assert.match(encoded[0].summary ?? "", /new arrangement/);
assert.equal(meaningfulSummary("Read more at the source website today please"), null);
const unsourced = compose(baseReader({ topArtists: ["Muse"] }), [], {
  news: [{ id: "bare", title: "Muse posts a photo", url: "https://pitchfork.com/news/bare", source: "Pitchfork", publishedAt: "2026-10-10T12:00:00.000Z" }],
});
assert.equal(unsourced.updates.length, 0);
assert.ok(unsourced.qualityReport.warnings.some((line) => /reliable summary/.test(line)));

const richHtml = activeHtml;
const featured = artistsOf(activeEdition);
assert.equal(new Set(featured).size, featured.length);
assert.doesNotMatch(richHtml, /Penelope Road[\s\S]*Penelope Road/);

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
}, sendAt, editionDate);
const blockedHtml = blocked.drafts[0].html;
assert.doesNotMatch(blockedHtml, /Resale Act|Canceled Act|Expired Act|stubhub|vivid-seats/);
assert.match(blockedHtml, /Official Act/);
assert.match(blockedHtml, /https:\/\/www\.axs\.com\/events\/official/);
assert.match(blockedHtml, /Sold Act/);
assert.match(blockedHtml, /Currently listed as sold out/);

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

const clustered = compose(baseReader({
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
assert.equal(clustered.shows.some((card) => card.title === "Wilco"), false);
assert.ok(clustered.shows.length >= 2);
assert.match(clustered.showsHeading ?? "", /Washington/);
assert.match(clustered.showsDek ?? "", /Dates around Washington/);
assert.doesNotMatch(`${clustered.intro} ${clustered.showsDek}`, /no saved city|saved shows cluster|sourced summary/);
assert.ok(clustered.shows.every((card) => /saved/i.test(card.body)));
assert.ok(clustered.qualityReport.missingData.some((line) => /saved city/i.test(line)));
assert.ok(clustered.qualityReport.personalizationEvidence.some((line) => /cluster around Washington/.test(line)));

console.log("newsletter quality checks passed");
