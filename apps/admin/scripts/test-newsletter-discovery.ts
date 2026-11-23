import assert from "node:assert/strict";
import { generateDraftsFromSource } from "../src/lib/newsletterEdition/gather";
import { composeEdition } from "../src/lib/newsletterEdition/compose";
import { renderEditionHtml } from "../src/lib/newsletterEdition/render";
import { editionSendAt } from "../src/lib/newsletterEdition/time";
import { editorialListens, historyArtists, inferTasteGenres } from "../../../supabase/functions/newsletter-send/editorial";
import { profileRecordings, lookupRecordings } from "../../../supabase/functions/newsletter-send/tracks";
import { loadListeningStats } from "../../../supabase/functions/newsletter-send/queries";
import { loadEditionSource as apiSource } from "../../../api/_lib/newsletterSource";

const now = new Date("2026-10-11T23:00:00Z");
const users = Array.from({ length: 135 }, (_, i) => ({ user_id: `user-${i}`, email: `user${i}@example.com`, name: `Reader ${i}` }));
const emptyUsers = users.map((user, index) => ({
  ...user,
  location_city: "Washington",
  location_state: "DC",
  latitude: 38.9072,
  longitude: -77.0369,
}));
const sharedEvents = Array.from({ length: 8 }, (_, index) => ({
  id: `show-${index}`,
  artist_name: `Discovery Act ${index}`,
  artists: { name: `Discovery Act ${index}` },
  venues: { name: "9:30 Club" },
  venue_city: "Washington",
  venue_state: "DC",
  event_date: `2026-11-${String(10 + index).padStart(2, "0")}T00:00:00.000Z`,
  ticket_urls: [`https://www.axs.com/events/discovery-${index}`],
  ticket_available: true,
  latitude: 38.9072,
  longitude: -77.0369,
  genres: ["rock"],
}));
const empty = { users: emptyUsers, news: [], reviews: [], stats: [], events: sharedEvents, publicFives: [] };
const drafts = await generateDraftsFromSource(empty, now, "2026-10-12");
assert.equal(drafts.drafts.length, 135);
assert.equal(drafts.held, 0);
for (const draft of drafts.drafts) {
  assert.match(draft.html, /The listening detour|On your next listen|Open this show on Synth/);
  assert.match(draft.html, /join\.getsynth\.app\/share\?event=/);
  assert.doesNotMatch(draft.html, /evergreen|After the encore|Your Synth|newest night/i);
  assert.match(draft.html, /synth-newsletter-writer-9/);
  assert.match(draft.html, /upcoming_shows\.png/);
  assert.match(draft.html, /\{\{unsubscribe_url\}\}/);
  assert.ok(draft.sources.some((source) => source.kind === "event"), "every sent draft includes a show");
  assert.ok(draft.sources.filter((source) => source.kind === "listen").length === 2);
  assert.doesNotMatch(draft.html, /This week in live music|Your latest was|Tickets are listed as available|85 saved shows/);
}
const noShowHeld = await generateDraftsFromSource({ users: emptyUsers, news: [], reviews: [], stats: [], events: [], publicFives: [] }, now, "2026-10-12");
assert.equal(noShowHeld.drafts.length, 135, "zero-show inventory still drafts every subscribed reader");
assert.equal(noShowHeld.held, 0);
for (const draft of noShowHeld.drafts) {
  assert.ok(draft.sources.some((source) => source.kind === "listen"), "no-show editions still include listens");
  assert.equal(draft.sources.some((source) => source.kind === "event"), false);
}
const eligibility = await generateDraftsFromSource({ ...empty, users: [
  emptyUsers[0], { ...emptyUsers[1], is_bot: true }, { ...emptyUsers[2], account_status: "inactive" },
  { user_id: "dup", email: "USER0@example.com", location_city: "Washington", location_state: "DC" }, { user_id: "bad", email: "no email", location_city: "Washington", location_state: "DC" },
] }, now);
assert.equal(eligibility.drafts.length, 1);

const tracks = profileRecordings({ topTracksByTimeRange: {
  medium_term: [{ name: "A real title", artists: [{ name: "Older favorite" }], external_urls: { spotify: "https://open.spotify.com/track/verified" } }],
  long_term: [{ attributes: { name: "Another title", artistName: "Another favorite", url: "https://music.apple.com/us/song/123" } }],
}, topTracks: [{ name: "A real title", artists: [{ name: "Older favorite" }] }, { name: "Missing artist" }] });
assert.equal(tracks.length, 2);
assert.equal(tracks[0].url, "https://open.spotify.com/track/verified");
assert.equal(tracks[1].artistName, "Another favorite");
assert.deepEqual(historyArtists([
  { artistName: "Latest", rating: 1 }, { artistName: "Yesterday", rating: 2 },
  { artistName: "Old favorite", rating: 5, review_text: "A full account of the night that made this artist a favorite." },
])[0], "Old favorite");

const reader = { userId: "u", email: "u@example.com", firstName: "Riley", city: "Washington", state: "DC",
  latitude: 38.9072, longitude: -77.0369,
  lifetimeShowCount: 2, fiveStarCount: 1, topArtists: ["Older favorite", "Latest"], genres: [], otherFiveStarArtists: [],
  reviews: [{ artistName: "Latest", eventDate: "2026-10-01", text: "The LAST_REVIEW phrase belongs only in the recap." },
    { artistName: "Older reviewed", rating: 5, eventDate: "2026-09-01" }],
};
const localShow = {
  id: "local-discovery",
  artistName: "Local Discovery",
  venueName: "9:30 Club",
  city: "Washington",
  state: "DC",
  eventDate: "2026-11-01T00:00:00.000Z",
  ticketUrl: "https://www.axs.com/events/local-discovery",
  ticketAvailable: true,
  latitude: 38.9072,
  longitude: -77.0369,
  genres: ["rock"],
};
const edition = composeEdition({ reader, events: [localShow], listens: [...tracks,
  { artistName: "Latest", trackName: "Last show's song", url: "https://example.com/song" },
  { artistName: "Unrelated local act", trackName: "Wrong city", url: "https://example.com/wrong-city" },
], news: [
  { id: "latest", title: "Latest announces a tour", url: "https://example.com/latest", publishedAt: "2026-10-10T12:00:00Z", summary: "Latest added tour dates, and the routing is listed on the official page." },
  { id: "history", title: "Older favorite shares a recording", url: "https://example.com/history", publishedAt: "2026-10-09T12:00:00Z", summary: "Older favorite released a recording, with the song title and credits at the source." },
  { id: "general", title: "A festival reveals its lineup", url: "https://example.com/general", publishedAt: "2026-10-08T12:00:00Z", summary: "The festival published its lineup and the daily schedule on its own site." },
  { id: "future", title: "Unpublished story", url: "https://example.com/future", publishedAt: "2026-10-12T01:00:00Z", summary: "This story is dated after the edition and should stay out of the newsletter." },
], sendAt: editionSendAt("2026-10-12"), editionDate: "2026-10-12", issueNumber: 1, retrievedAt: now.toISOString() })!;
assert.ok(edition.shows.some((show) => show.title === "Local Discovery"));
assert.match(edition.shows[0].ctaUrl, /join\.getsynth\.app\/share\?event=local-discovery/);
assert.ok(edition.updates.some((story) => /Older favorite|Latest/.test(story.title)));
assert.equal(edition.updates.some((story) => story.title === "Unpublished story"), false);
assert.equal(edition.updates.some((story) => story.title === "A festival reveals its lineup"), false);
assert.equal((renderEditionHtml(edition).match(/LAST_REVIEW/g) ?? []).length, 0);
assert.equal(edition.yourSynth, undefined);
assert.equal(edition.history, undefined);
assert.doesNotMatch(edition.intro, /newest night|2 nights|85 saved/);
assert.ok((edition.listens?.length ?? 0) >= 2);
assert.ok(edition.listens?.every((listen) => listen.eyebrow === "On your next listen"));
assert.doesNotMatch((edition.listens ?? []).map((listen) => `${listen.title} ${listen.body}`).join(" "), /Last show's song|Wrong city|Older favorite|A real title/);
assert.equal(editionSendAt("2026-10-12").toISOString(), "2026-10-12T14:00:00.000Z");
assert.equal(editionSendAt("2027-01-11").toISOString(), "2027-01-11T15:00:00.000Z");
assert.notDeepEqual(editorialListens("2026-10-12"), editorialListens("2026-10-19"));
assert.deepEqual(inferTasteGenres({ topArtists: ["Goose"], genres: [] }), ["jam", "rock"]);
assert.notEqual(
  editorialListens("2026-10-12", ["jam"], "sam").map((pick) => pick.artistName).join("|"),
  editorialListens("2026-10-12", [], "empty").map((pick) => pick.artistName).join("|"),
);

let lookups = 0;
globalThis.fetch = async () => {
  lookups++;
  return Response.json({ results: [
    { artistName: "Wrong artist", trackName: "A title", trackViewUrl: "https://example.com/wrong" },
    { artistName: "Correct artist", trackName: "Right title", trackViewUrl: "https://music.apple.com/us/song/123" },
  ] });
};
const found = await lookupRecordings(["Correct artist", "correct artist"]);
assert.equal(lookups, 1);
assert.equal(found.length, 1);
assert.equal(found[0].artistName, "Correct artist");
globalThis.fetch = async () => { throw new Error("Feed or catalog unavailable"); };
assert.deepEqual(await lookupRecordings(["Someone"]), []);

const profile = { user_id: users[0].user_id, service_type: "spotify", profile_data: { topArtists: [{ name: "Older favorite" }], topTracks: [{ name: "A real title", artists: [{ name: "Older favorite" }] }] } };
const tables: Record<string, any[]> = {
  users,
  streaming_profiles: [
    profile,
    { user_id: users[0].user_id, service_type: "apple_music", profile_data: { topArtists: [{ attributes: { name: "Apple favorite" } }], topTracks: [{ attributes: { name: "Apple recording", artistName: "Apple favorite", url: "https://music.apple.com/us/song/456" } }] } },
  ],
  user_preferences: [],
  newsletter_unsubscribes: [{ email: users[134].email }],
  reviews: [],
  news_items: [],
  events: [],
  newsletter_drafts: [],
};
const queried: string[] = [];
const db = { from(table: string) {
  queried.push(table);
  const query: any = { then(resolve: any, reject: any) { return Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve, reject); } };
  for (const method of ["select", "eq", "or", "not", "order", "range", "in", "ilike", "gte", "lte", "limit", "lt"]) query[method] = () => query;
  return query;
} };
const source = await apiSource(db, now);
assert.equal(source.users.length, 134);
assert.equal(source.stats[0].listens[0].trackName, "A real title");
assert.ok(source.stats.some((stat) => stat.listens?.[0]?.trackName === "Apple recording"), "both streaming services survive loading");
assert.equal(queried.includes("user_streaming_stats_summary"), false);
assert.ok(queried.includes("newsletter_drafts"), "recent-source rotation loads prior drafts");
assert.equal((await loadListeningStats(db, [users[0].user_id]))[0].listens[0].trackName, "A real title");
console.log("PASS: 135 localized discovery editions; zero-show still drafts; eligibility; sourced recordings; news relevance; API source rotation; DST and weekly rotation.");
