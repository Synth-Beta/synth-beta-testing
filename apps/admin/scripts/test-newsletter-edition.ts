/**
 * Focused checks for recommendation-first newsletter generation and the send gate.
 * Run: npx tsx scripts/test-newsletter-edition.ts
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateEditionDrafts } from "../src/lib/newsletterEdition/gather";
import { composeEdition } from "../src/lib/newsletterEdition/compose";
import { eventWithinSavedLocation, milesBetween, NEARBY_MILES } from "../../../supabase/functions/newsletter-send/nearby";
import { runEventQuery } from "../../../supabase/functions/newsletter-send/eventQuery";
import { fetchMusicNews, parseRssItems } from "../../../supabase/functions/newsletter-send/news";
import { canSendDraft, contentHash, deliverApprovedDrafts, planSend, regenerateDecision, type StoredDraft } from "../src/lib/newsletterEdition/gate";
import { renderEditionHtml } from "../src/lib/newsletterEdition/render";
import { formatEventWhen, isTenAmCentral, isUpcoming, nextEditionDate, recentWeekend } from "../src/lib/newsletterEdition/time";
import type { EditionEvent, EditionReader } from "../src/lib/newsletterEdition/types";

if (process.env.NEWSLETTER_TEST_LIVE !== "1") {
  globalThis.fetch = async () => new Response("", { status: 503 });
}

const sendAt = new Date("2026-10-07T14:00:00.000Z");
const retrievedAt = "2026-10-06T21:00:00.000Z";

const event = (overrides: Partial<EditionEvent> & Pick<EditionEvent, "id" | "artistName" | "city">): EditionEvent => ({
  venueName: "9:30 Club",
  eventDate: "2026-10-20T23:00:00.000Z",
  ticketAvailable: true,
  ticketUrl: `https://tickets.example.com/${overrides.id}`,
  genres: ["pop"],
  state: "DC",
  ...overrides,
});

const lauren: EditionReader = {
  userId: "lauren",
  email: "lauren@example.com",
  firstName: "Lauren",
  city: "Washington",
  state: "DC",
  lifetimeShowCount: 13,
  fiveStarCount: 7,
  topArtists: ["Jon Batiste", "Glass Animals"],
  genres: ["pop"],
  otherFiveStarArtists: ["Pitbull"],
  reviews: [
    {
      artistName: "Jon Batiste",
      venueName: "Filene Center at Wolf Trap",
      eventDate: "2026-08-21T23:00:00.000Z",
      rating: 5,
      text: "The orchestra and that unexpected Fur Elise moment made the night.",
    },
  ],
};

const chicago: EditionReader = {
  userId: "sam",
  email: "sam@example.com",
  firstName: "Sam",
  city: "Chicago",
  state: "IL",
  lifetimeShowCount: 4,
  fiveStarCount: 1,
  topArtists: ["Wilco"],
  genres: ["rock"],
  otherFiveStarArtists: [],
  reviews: [
    {
      artistName: "Wilco",
      venueName: "Riviera Theatre",
      eventDate: "2025-06-01T00:00:00.000Z",
      rating: 5,
      text: "The encore ran long and the room sang the last song.",
    },
  ],
};

const sparse: EditionReader = {
  userId: "new",
  email: "new@example.com",
  firstName: "Alex",
  city: "Austin",
  state: "TX",
  lifetimeShowCount: 0,
  fiveStarCount: 0,
  topArtists: [],
  genres: [],
  otherFiveStarArtists: [],
  reviews: [],
};

const noLocation: EditionReader = {
  ...sparse,
  userId: "noloc",
  firstName: "Riley",
  city: null,
  state: null,
  topArtists: ["Phoebe Bridgers"],
  genres: ["indie"],
};

const events: EditionEvent[] = [
  event({ id: "past", artistName: "Jon Batiste", city: "Washington", eventDate: "2026-09-01T23:00:00.000Z" }),
  event({ id: "sylvan", artistName: "Sylvan Esso", city: "Washington", genres: ["pop"], ticketUrl: "https://impconcerts.com/event/sylvan-esso-2/" }),
  event({ id: "wilco", artistName: "Wilco", city: "Chicago", state: "IL", genres: ["rock"], venueName: "Metro", ticketUrl: "https://metrochicago.com/wilco" }),
  event({ id: "austin", artistName: "Local Natives", city: "Austin", state: "TX", genres: ["indie"], venueName: "Mohawk", ticketUrl: "https://mohawkaustin.com/local-natives" }),
  event({ id: "phoebe", artistName: "Phoebe Bridgers", city: "Los Angeles", state: "CA", genres: ["indie"], venueName: "Greek Theatre", ticketUrl: "https://www.greektheatrela.com/phoebe" }),
  event({ id: "soldout", artistName: "Glass Animals", city: "Washington", ticketAvailable: false, ticketUrl: "https://930.com/glass-animals" }),
];

const base = {
  events,
  news: [
    {
      id: "news-1",
      title: "Jon Batiste joins a Radio City birthday bill",
      url: "https://www.msg.com/events/jon-batiste",
      source: "Madison Square Garden",
      publishedAt: "2026-10-01T12:00:00.000Z",
      summary: "Jon Batiste is on a Radio City bill celebrating a birthday, with the lineup listed at the venue.",
    },
    {
      id: "news-2",
      title: "A fall calendar lands for a Chicago room",
      url: "https://pitchfork.com/news/calendar",
      source: "Pitchfork",
      publishedAt: "2026-09-28T12:00:00.000Z",
      summary: "The Chicago venue posted its fall calendar, with dates and ticket links on its own site.",
    },
  ],
  listens: [] as [],
  sendAt,
  editionDate: "2026-10-07",
  issueNumber: 2,
  retrievedAt,
};

const laurenEdition = composeEdition({ ...base, reader: lauren })!;
const chicagoEdition = composeEdition({ ...base, reader: chicago })!;
const sparseEdition = composeEdition({ ...base, reader: sparse })!;
const noLocationEdition = composeEdition({ ...base, reader: noLocation })!;

assert.ok(laurenEdition);
assert.ok(chicagoEdition);
assert.ok(sparseEdition);
assert.ok(noLocationEdition);

assert.equal(laurenEdition.shows.some((show) => show.title === "Jon Batiste"), false, "past shows are not upcoming");
assert.ok(laurenEdition.shows.some((show) => show.title === "Sylvan Esso" || show.title === "Glass Animals"));
assert.ok(laurenEdition.updates.some((update) => update.title.includes("Jon Batiste")), "artist-matched news is allowed");
assert.equal(laurenEdition.updates.some((update) => update.title.includes("fall calendar")), false, "Chicago scene news is not forced onto a DC reader");
assert.doesNotMatch(laurenEdition.updates.map((update) => update.body).join(" "), /recent music story|details at the source/i);
assert.match(laurenEdition.headline, /Glass Animals|Sylvan Esso/);
assert.doesNotMatch(laurenEdition.intro, /write a review|newest night|22 nights|85 saved/i);
assert.equal(laurenEdition.yourSynth, undefined);
assert.equal(laurenEdition.history, undefined);
assert.doesNotMatch(renderEditionHtml(laurenEdition), /Fur Elise|Wolf Trap|newest night|After the encore/);
assert.equal(laurenEdition.shows.some((show) => /Fur Elise/.test(show.body)), false);
assert.ok((laurenEdition.listens?.length ?? 0) >= 2);
assert.ok(laurenEdition.listens?.every((listen) => listen.eyebrow === "On your next listen"));

assert.ok(chicagoEdition.shows.some((show) => show.title === "Wilco"), "repeat artists are recommended when a nearby date exists");
assert.match(chicagoEdition.shows.find((show) => show.title === "Wilco")?.body ?? "", /seen Wilco before/i);
assert.equal(chicagoEdition.shows.some((show) => show.title === "Sylvan Esso"), false);
const chicagoPoint = { latitude: 41.8781, longitude: -87.6298 };
const evanston = event({
  id: "evanston",
  artistName: "Horsegirl",
  city: "Evanston",
  state: "IL",
  latitude: 42.0451,
  longitude: -87.6877,
  venueName: "SPACE",
});
const newYork = event({
  id: "nyc",
  artistName: "Wilco",
  city: "New York",
  state: "NY",
  latitude: 40.7804,
  longitude: -73.9806,
  venueName: "Beacon Theatre",
});
assert.ok(milesBetween(chicagoPoint.latitude, chicagoPoint.longitude, evanston.latitude!, evanston.longitude!) < NEARBY_MILES);
assert.ok(milesBetween(chicagoPoint.latitude, chicagoPoint.longitude, newYork.latitude!, newYork.longitude!) > NEARBY_MILES);
const locatedChicago = composeEdition({
  ...base,
  events: [...events, evanston, newYork],
  reader: { ...chicago, ...chicagoPoint },
})!;
assert.ok(locatedChicago.shows.some((show) => show.title === "Horsegirl"));
assert.equal(locatedChicago.shows.some((show) => show.title === "Wilco" && /New York/.test(show.eyebrow)), false);
assert.equal(eventWithinSavedLocation({ ...chicago, ...chicagoPoint }, newYork), false);
assert.match(locatedChicago.showsHeading ?? "", /Actually worth a look near Chicago/);
assert.equal(locatedChicago.locationPrompt, undefined);
assert.ok(chicagoEdition.updates.some((update) => /Chicago/i.test(update.title)), "local scene news may appear when it matches the city");

assert.ok(sparseEdition.shows.some((show) => show.title === "Local Natives"));
assert.equal(sparseEdition.yourSynth, undefined);
assert.equal(/inactive|haven't used|no shows yet/i.test(renderEditionHtml(sparseEdition)), false);

assert.equal(noLocationEdition.shows.length, 0, "no far-away city is substituted when location is unknown");
assert.equal(noLocationEdition.showsHeading, undefined);
assert.equal(noLocationEdition.locationPrompt?.url, "https://join.getsynth.app/profile-edit");
assert.match(noLocationEdition.locationPrompt?.label ?? "", /Set your city/);
assert.ok((noLocationEdition.listens?.length ?? 0) >= 2);
assert.match(renderEditionHtml(noLocationEdition), /join\.getsynth\.app\/profile-edit/);

const jungleReader: EditionReader = {
  ...sparse,
  userId: "sam",
  email: "sam@example.com",
  firstName: "Sam",
  city: "Washington",
  state: "DC",
  lifetimeShowCount: 4,
  fiveStarCount: 1,
  topArtists: ["Jungle"],
  otherFiveStarArtists: ["Jungle"],
  reviews: [
    {
      artistName: "Jungle",
      venueName: "The Anthem",
      eventDate: "2026-06-01T00:00:00.000Z",
      rating: 5,
      text: "The room did not sit down once.",
    },
  ],
};
const jungleEdition = composeEdition({
  ...base,
  reader: jungleReader,
  events: [
    event({ id: "jungle-show", artistName: "Jungle", city: "Washington", ticketUrl: "https://tickets.example.com/jungle" }),
    event({ id: "sylvan-show", artistName: "Sylvan Esso", city: "Washington", genres: ["pop"], ticketUrl: "https://impconcerts.com/event/sylvan-esso-2/" }),
  ],
  listens: [
    { artistName: "Jungle" },
    { artistName: "Sylvan Esso", trackName: "Coffee", url: "https://open.spotify.com/search/Sylvan%20Esso%20Coffee" },
  ],
})!;
assert.ok(jungleEdition.shows.some((show) => show.title === "Jungle"), "a past Jungle show is a reason to recommend the next nearby date");
assert.ok(jungleEdition.shows.some((show) => show.title === "Sylvan Esso"));
assert.match(jungleEdition.headline, /Jungle/);
assert.equal(jungleEdition.yourSynth, undefined);
assert.doesNotMatch(renderEditionHtml(jungleEdition), /did not sit down|newest night/);
assert.equal(jungleEdition.shows.some((show) => /did not sit down/.test(show.body)), false);
assert.ok((jungleEdition.listens?.length ?? 0) >= 2);
assert.doesNotMatch((jungleEdition.listens ?? []).map((listen) => listen.body).join(" "), /Coffee|Sample Jungle|show history|your latest log/i);

const soldOut = laurenEdition.shows.find((show) => show.title === "Glass Animals");
if (soldOut) {
  assert.match(soldOut.availabilityNote ?? "", /sold out/i);
  assert.doesNotMatch(soldOut.availabilityNote ?? "", /tickets are listed as available/i);
}

const laurenHtml = renderEditionHtml(laurenEdition);
const chicagoHtml = renderEditionHtml(chicagoEdition);
assert.notEqual(laurenHtml, chicagoHtml);
assert.match(laurenHtml, /max-width:680px/);
assert.match(laurenHtml, /#CC2486/);
assert.match(laurenHtml, /Explore concerts on Synth/);
assert.match(laurenHtml, /synth-newsletter-writer-8/);
assert.match(laurenHtml, /upcoming_shows\.png/);
assert.match(laurenHtml, /\{\{unsubscribe_url\}\}/);
assert.doesNotMatch(laurenHtml, /After the encore|Open Synth|September 30, 2026/);
assert.match(laurenHtml, /https:\/\/impconcerts.com\/event\/sylvan-esso-2\/|https:\/\/930.com\/glass-animals/);

assert.deepEqual(recentWeekend(new Date("2026-10-13T15:00:00.000Z"), "DC"), { start: "2026-10-09", end: "2026-10-11" });
assert.deepEqual(recentWeekend(new Date("2026-10-26T15:00:00.000Z"), "DC"), { start: "2026-10-23", end: "2026-10-25" });
assert.equal(isUpcoming("2026-09-01T23:00:00.000Z", sendAt), false);
assert.equal(isUpcoming("2026-10-20T23:00:00.000Z", sendAt), true);
assert.equal(isUpcoming("2026-10-08", sendAt, "DC"), true);
assert.equal(isUpcoming("2026-10-07", sendAt, "DC"), false);
assert.equal(isUpcoming("2026-10-07T00:00:00+00:00", sendAt, "TX"), false);
assert.equal(isUpcoming("2026-10-08T00:00:00+00:00", sendAt, "TX"), true);
assert.match(formatEventWhen("2026-10-09T00:00:00+00:00", "Texas"), /October 8/);
assert.equal(isTenAmCentral(new Date("2026-10-12T14:00:00.000Z")), true);
assert.equal(isTenAmCentral(new Date("2026-10-12T15:00:00.000Z")), false);
assert.equal(isTenAmCentral(new Date("2027-01-11T15:00:00.000Z")), true);
assert.equal(isTenAmCentral(new Date("2027-01-11T14:00:00.000Z")), false);
assert.equal(isTenAmCentral(new Date("2026-10-13T14:00:00.000Z")), false, "Tuesday is not a send day");
assert.equal(nextEditionDate(new Date("2026-10-12T13:00:00.000Z")), "2026-10-12");
assert.equal(nextEditionDate(new Date("2026-10-12T20:00:00.000Z")), "2026-10-19");
assert.equal(nextEditionDate(new Date("2026-10-14T12:00:00.000Z")), "2026-10-19");

const html = "<p>Reviewed copy</p>";
const hash = await contentHash("Subject", html);
const changed = await contentHash("Subject", "<p>Changed copy</p>");
const draft = (overrides: Partial<StoredDraft>): StoredDraft => ({
  id: "draft-1",
  editionDate: "2026-10-07",
  userId: "lauren",
  email: "lauren@example.com",
  subject: "Subject",
  html,
  contentHash: hash,
  status: "needs_approval",
  approvedContentHash: null,
  sentAt: null,
  ...overrides,
});

assert.equal(canSendDraft(draft({}), new Set()).ok, false);
assert.equal(canSendDraft(draft({ status: "approved", approvedContentHash: hash }), new Set()).ok, true);
assert.equal(canSendDraft(draft({ status: "approved", approvedContentHash: changed }), new Set()).reason, "approval does not match the reviewed content");
assert.equal(canSendDraft(draft({ status: "approved", approvedContentHash: hash }), new Set(["lauren@example.com"])).reason, "unsubscribed");
assert.equal(canSendDraft(draft({ status: "sent", sentAt: retrievedAt, approvedContentHash: hash }), new Set()).reason, "already sent");
assert.equal(canSendDraft(draft({ status: "approved", approvedContentHash: hash, deliveryState: "uncertain", sendClaimedAt: retrievedAt }), new Set()).reason, "acceptance was not confirmed");
assert.equal(canSendDraft(draft({ status: "approved", approvedContentHash: hash, deliveryState: "failed" }), new Set()).ok, true);
assert.equal(canSendDraft(draft({ status: "approved", approvedContentHash: hash, brevoMessageId: "<brevo>" }), new Set()).reason, "already sent");
assert.equal(regenerateDecision(null), "replace");
assert.equal(regenerateDecision({ status: "needs_approval" }), "replace");
assert.equal(regenerateDecision({ status: "approved" }), "replace");
assert.equal(regenerateDecision({ status: "sent" }), "keep");

const approved = draft({ id: "approved", status: "approved", approvedContentHash: hash });
const pending = draft({ id: "pending", userId: "sam", email: "sam@example.com" });
const duplicate = draft({ id: "duplicate", status: "approved", approvedContentHash: hash });
const planned = planSend([approved, pending, duplicate, draft({ id: "old", status: "sent", sentAt: retrievedAt, approvedContentHash: hash, userId: "alex", email: "alex@example.com" })], new Set());
assert.deepEqual(planned.send.map((item) => item.id), ["approved"]);
assert.equal(planned.skip.find((item) => item.id === "pending")?.reason, "not approved");
assert.equal(planned.skip.find((item) => item.id === "duplicate")?.reason, "duplicate");
assert.equal(planned.skip.find((item) => item.id === "old")?.reason, "already sent");

const sentEmails: string[] = [];
const released: string[] = [];
const delivery = await deliverApprovedDrafts({
  drafts: [approved, pending],
  unsubscribedEmails: new Set(),
  claim: async () => true,
  sendEmail: async (item) => {
    sentEmails.push(item.email);
    if (item.id === "approved") throw new Error("mocked provider failure");
  },
  release: async (item) => {
    released.push(item.id);
  },
});
assert.deepEqual(sentEmails, ["lauren@example.com"]);
assert.deepEqual(released, ["approved"]);
assert.equal(delivery.sent, 0);
assert.equal(delivery.failed, 1);

const staleNews = parseRssItems(
  `<rss><channel><item><title>Old Wilco story</title><link>https://pitchfork.com/news/old</link><pubDate>Mon, 01 Jun 2026 12:00:00 GMT</pubDate></item><item><title>Wilco announces a fall tour</title><link>https://pitchfork.com/news/new</link><pubDate>Thu, 01 Oct 2026 12:00:00 GMT</pubDate></item><item><title>No link here</title><pubDate>Thu, 01 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>`,
  "Pitchfork",
  sendAt
);
assert.deepEqual(staleNews.map((story) => story.title), ["Wilco announces a fall tour"]);
const museum = composeEdition({
  ...base,
  news: [{ id: "museum", title: "The museum opens a new wing", url: "https://pitchfork.com/news/museum", source: "Pitchfork", publishedAt: "2026-10-01T12:00:00.000Z", summary: "The museum opened a new wing with no music angle at all in the writeup." }],
  reader: { ...noLocation, topArtists: ["Muse"], genres: [] },
})!;
assert.equal(museum.updates.length, 0);
assert.equal(museum.features?.length ?? 0, 0);
assert.doesNotMatch(renderEditionHtml(museum), /recent music story|details at the source/i);

const calls: Array<{ table: string; filters: Record<string, unknown> }> = [];
const catalog = [
  { ...evanston, artists: { name: "Horsegirl" }, venues: { name: "SPACE" }, venue_city: "Evanston", venue_state: "IL", ticket_urls: [evanston.ticketUrl], event_date: evanston.eventDate, genres: ["rock"] },
  { ...newYork, artists: { name: "Wilco" }, venues: { name: "Beacon Theatre" }, venue_city: "New York", venue_state: "NY", ticket_urls: [newYork.ticketUrl], event_date: newYork.eventDate, genres: ["rock"] },
];
const db = {
  from(table: string) {
    const filters: Record<string, unknown> = {};
    const api: Record<string, unknown> = {
      select(columns?: string) { filters.select = columns ?? ""; return api; },
      eq(column: string, value: unknown) { filters[column] = value; return api; },
      or() { return api; },
      not() { return api; },
      in() { return api; },
      ilike(column: string, value: unknown) { filters[`ilike:${column}`] = value; return api; },
      gte(column: string, value: unknown) { filters[`gte:${column}`] = value; return api; },
      lte(column: string, value: unknown) { filters[`lte:${column}`] = value; return api; },
      lt(column: string, value: unknown) { filters[`lt:${column}`] = value; return api; },
      order() { return api; },
      limit() { return api; },
      range() { return api; },
      then(resolve: (value: { data: unknown[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
        calls.push({ table, filters: { ...filters } });
        let data: unknown[] = [];
        if (table === "users") {
          data = [{ user_id: "sam", email: "sam@example.com", name: "Sam", username: "sam", location_city: "Chicago", location_state: "IL" }];
        } else if (table === "newsletter_drafts") {
          data = [];
        } else if (table === "events" && filters["ilike:venue_city"] === "Chicago") {
          data = [{ latitude: 41.8781, longitude: -87.6298, venue_state: "IL" }];
        } else if (table === "events" && filters["gte:latitude"] != null) {
          data = catalog.filter((row) =>
            row.latitude! >= Number(filters["gte:latitude"]) &&
            row.latitude! <= Number(filters["lte:latitude"]) &&
            row.longitude! >= Number(filters["gte:longitude"]) &&
            row.longitude! <= Number(filters["lte:longitude"])
          );
        }
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return api;
  },
};
const generated = await generateEditionDrafts(db, sendAt);
const locatedDraft = generated.drafts[0];
assert.match(String(calls.find((call) => call.table === "users")?.filters.select ?? ""), /location_city, location_state/);
assert.ok(calls.some((call) => call.table === "events" && call.filters["ilike:venue_city"] === "Chicago"));
assert.ok(calls.some((call) => call.table === "events" && call.filters["gte:latitude"] != null));
assert.match(locatedDraft?.html ?? "", /Horsegirl/);
assert.doesNotMatch(locatedDraft?.html ?? "", /Beacon Theatre/);

if (process.env.NEWSLETTER_TEST_LIVE === "1") {
  const liveNews = await fetchMusicNews(new Date());
  assert.ok(liveNews.length > 0, "music feeds returned no current stories");
  assert.ok(liveNews.every((story) => /^https?:\/\//.test(story.url)));
  assert.ok(liveNews.every((story) => Date.now() - Date.parse(story.publishedAt) <= 14 * 24 * 60 * 60 * 1000));
}

const outDir = resolve(process.cwd(), "public/newsletter-demos/generated");
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "lauren.html"), laurenHtml);
writeFileSync(resolve(outDir, "chicago.html"), chicagoHtml);
writeFileSync(resolve(outDir, "sparse.html"), renderEditionHtml(sparseEdition));
writeFileSync(resolve(outDir, "no-location.html"), renderEditionHtml(noLocationEdition));

const namedEvents = await runEventQuery({
  from(table: string) {
    const api: Record<string, unknown> = {
      select() { return api; },
      eq() { return api; },
      in() { return api; },
      gte() { return api; },
      lte() { return api; },
      order() { return api; },
      limit() { return api; },
      then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
        const data = table === "events"
          ? [{ id: "show", artist_id: "artist", venue_id: "venue", venue_city: "Chicago", event_date: "2026-11-01T00:00:00.000Z" }]
          : table === "artists"
            ? [{ id: "artist", name: "Horsegirl" }]
            : table === "venues"
              ? [{ id: "venue", name: "SPACE" }]
              : [];
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return api;
  },
}, {
  kind: "box",
  minLat: 41,
  maxLat: 42,
  minLng: -88,
  maxLng: -87,
  from: "2026-10-01T00:00:00.000Z",
  until: "2026-12-01T00:00:00.000Z",
});
assert.equal(namedEvents[0]?.artists?.name, "Horsegirl");
assert.equal(namedEvents[0]?.venues?.name, "SPACE");

console.log("newsletter edition checks passed");
