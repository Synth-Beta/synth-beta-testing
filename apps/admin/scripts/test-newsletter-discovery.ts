import assert from "node:assert/strict";
import { generateDraftsFromSource } from "../src/lib/newsletterEdition/gather";
import { composeEdition } from "../src/lib/newsletterEdition/compose";
import { renderEditionHtml } from "../src/lib/newsletterEdition/render";
import { editionSendAt } from "../src/lib/newsletterEdition/time";
import { editorialListens, historyArtists } from "../../../supabase/functions/newsletter-send/editorial";
import { profileRecordings, lookupRecordings } from "../../../supabase/functions/newsletter-send/tracks";
import { loadListeningStats } from "../../../supabase/functions/newsletter-send/queries";
import { loadEditionSource as apiSource } from "../../../api/_lib/newsletterSource";

const now = new Date("2026-10-11T23:00:00Z");
const users = Array.from({ length: 135 }, (_, i) => ({ user_id: `user-${i}`, email: `user${i}@example.com`, name: `Reader ${i}` }));
const empty = { users, news: [], reviews: [], stats: [], events: [], publicFives: [] };
const drafts = await generateDraftsFromSource(empty, now, "2026-10-12");
assert.equal(drafts.drafts.length, 135);
assert.equal(drafts.held, 0);
for (const draft of drafts.drafts) {
  assert.match(draft.html, /evergreen picks/);
  assert.match(draft.html, /The album detour/);
  assert.match(draft.html, /synth-newsletter-writer-6/);
  assert.ok(draft.sources.filter((source) => source.kind === "listen").length === 2);
  assert.ok(draft.sources.some((source) => source.kind === "editorial"));
  assert.doesNotMatch(draft.html, /This week in live music|Your latest was|Tickets are listed as available/);
}
const eligibility = await generateDraftsFromSource({ ...empty, users: [
  users[0], { ...users[1], is_bot: true }, { ...users[2], account_status: "inactive" },
  { user_id: "dup", email: "USER0@example.com" }, { user_id: "bad", email: "no email" },
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

const reader = { userId: "u", email: "u@example.com", firstName: "Riley", city: null, state: null,
  lifetimeShowCount: 2, fiveStarCount: 1, topArtists: ["Older favorite", "Latest"], genres: [], otherFiveStarArtists: [],
  reviews: [{ artistName: "Latest", eventDate: "2026-10-01", text: "The LAST_REVIEW phrase belongs only in the recap." },
    { artistName: "Older reviewed", rating: 5, eventDate: "2026-09-01" }],
};
const edition = composeEdition({ reader, events: [], listens: [...tracks,
  { artistName: "Latest", trackName: "Last show's song", url: "https://example.com/song" },
  { artistName: "Unrelated local act", trackName: "Wrong city", url: "https://example.com/wrong-city" },
], news: [
  { id: "latest", title: "Latest announces a tour", url: "https://example.com/latest", publishedAt: "2026-10-10T12:00:00Z" },
  { id: "history", title: "Older favorite shares a recording", url: "https://example.com/history", publishedAt: "2026-10-09T12:00:00Z" },
  { id: "general", title: "A festival reveals its lineup", url: "https://example.com/general", publishedAt: "2026-10-08T12:00:00Z" },
  { id: "future", title: "Unpublished story", url: "https://example.com/future", publishedAt: "2026-10-12T01:00:00Z" },
], sendAt: editionSendAt("2026-10-12"), editionDate: "2026-10-12", issueNumber: 1, retrievedAt: now.toISOString() })!;
assert.equal(edition.updates[0].title, "Older favorite shares a recording");
assert.equal(edition.updates.some((story) => story.title.includes("Latest")), false);
assert.equal(edition.updates.some((story) => story.title === "Unpublished story"), false);
assert.doesNotMatch(edition.listen!.body, /Last show's song|Wrong city/);
assert.equal((renderEditionHtml(edition).match(/LAST_REVIEW/g) ?? []).length, 1);
assert.ok(edition.listen!.links!.some((link) => link.url === tracks[0].url));
assert.equal(editionSendAt("2026-10-12").toISOString(), "2026-10-12T15:00:00.000Z");
assert.equal(editionSendAt("2027-01-12").toISOString(), "2027-01-12T16:00:00.000Z");
assert.notDeepEqual(editorialListens("2026-10-12"), editorialListens("2026-10-19"));

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

// The deployed API source must use the same listening schema and return accounts with no history.
const profile = { user_id: users[0].user_id, service_type: "spotify", profile_data: { topArtists: [{ name: "Older favorite" }], topTracks: [{ name: "A real title", artists: [{ name: "Older favorite" }] }] } };
const tables: Record<string, any[]> = { users, streaming_profiles: [profile, { user_id: users[0].user_id, service_type: "apple_music", profile_data: { topArtists: [{ attributes: { name: "Apple favorite" } }], topTracks: [{ attributes: { name: "Apple recording", artistName: "Apple favorite", url: "https://music.apple.com/us/song/456" } }] } }], user_preferences: [], newsletter_unsubscribes: [{ email: users[134].email }], reviews: [], news_items: [], events: [] };
const queried: string[] = [];
const db = { from(table: string) {
  queried.push(table);
  const query: any = { then(resolve: any, reject: any) { return Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve, reject); } };
  for (const method of ["select", "eq", "or", "not", "order", "range", "in", "ilike", "gte", "lte", "limit"]) query[method] = () => query;
  return query;
} };
const source = await apiSource(db, now);
assert.equal(source.users.length, 134);
assert.equal(source.stats[0].listens[0].trackName, "A real title");
assert.ok(source.stats.some((stat) => stat.listens?.[0]?.trackName === "Apple recording"), "both streaming services survive loading");
assert.equal(queried.includes("user_streaming_stats_summary"), false);
assert.equal((await loadListeningStats(db, [users[0].user_id]))[0].listens[0].trackName, "A real title");
console.log("PASS: 135 full empty-account editions; eligibility; sourced recordings; full-history ranking; recap isolation; feed outage; catalog artist matching; API source; DST and weekly rotation.");
