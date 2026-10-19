/**
 * Local HTML previews from public Synth data. Does not write drafts or send mail.
 * Run from apps/admin: npx vite-node scripts/preview-active-editions.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateDraftsFromSource } from "../src/lib/newsletterEdition/gather";
import { fetchMusicNews } from "../../../supabase/functions/newsletter-send/news";
import { lookupRecordings } from "../../../supabase/functions/newsletter-send/tracks";
import { windowSlices } from "../../../supabase/functions/newsletter-send/nearby";

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), "../../.env"), "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
    })
);
const base = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
if (!base || !key) throw new Error("Missing Supabase anon config.");
const headers = { apikey: key, Authorization: `Bearer ${key}` };

const get = async (path: string) => {
  const response = await fetch(`${base}/rest/v1/${path}`, { headers });
  const body = await response.json().catch(() => null);
  if (!response.ok) return { ok: false as const, status: response.status, body };
  return { ok: true as const, body };
};

const targets = [
  { label: "lauren", id: "7d727ff6-fb7f-4e86-b272-f5ac31bd08d4", name: "Lauren" },
  { label: "sam", id: "349bda34-7878-4c10-9f86-ec5888e55571", name: "Sam" },
  { label: "third-active", id: "690d27ae-d803-4ff5-a381-162f8863dd9b", name: "Reader" },
];

const knownIds = targets.map((target) => target.id);
const reviewRows = await get(
  `reviews?select=user_id,rating,review_text,Event_date,artists(name),venues(name)&is_draft=eq.false&order=Event_date.desc&limit=200`
);
if (!reviewRows.ok || !Array.isArray(reviewRows.body)) throw new Error("Could not load public reviews.");

const counts = new Map<string, number>();
for (const row of reviewRows.body as any[]) counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
const ordinary = [...counts.entries()]
  .filter(([id, count]) => !knownIds.includes(id) && count >= 3 && count <= 8)
  .sort((left, right) => right[1] - left[1])[0];
if (ordinary) targets.push({ label: "ordinary", id: ordinary[0], name: "Reader" });

const ids = targets.map((target) => target.id);
const selectedReviews = (reviewRows.body as any[]).filter((row) => ids.includes(row.user_id));
const interests = await get(
  `user_event_relationships?select=user_id,event_id,relationship_type&user_id=in.(${ids.join(",")})&limit=300`
);
const interestRows = interests.ok && Array.isArray(interests.body) ? interests.body as any[] : [];

const now = new Date();
const until = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
const slices = windowSlices(now.toISOString(), until.toISOString());
const eventSelect = "id,title,event_date,doors_time,venue_city,venue_state,latitude,longitude,ticket_available,ticket_urls,genres,event_status,artists(name),venues(name)";
const events: any[] = [];
const seen = new Set<string>();
const add = (rows: any[]) => {
  for (const row of rows) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    events.push(row);
  }
};

for (const city of ["Chicago", "Washington", "New York"]) {
  for (const slice of slices) {
    const rows = await get(
      `events?select=${eventSelect}&venue_city=ilike.${encodeURIComponent(city)}&event_date=gte.${encodeURIComponent(slice.from)}&event_date=lte.${encodeURIComponent(slice.until)}&order=event_date.asc&limit=12`
    );
    if (rows.ok && Array.isArray(rows.body)) add(rows.body);
  }
}

const artists = [...new Set(selectedReviews.map((row) => row.artists?.name).filter(Boolean))].slice(0, 24);
for (const artist of artists) {
  const pattern = `${String(artist).replace(/[%_]/g, " ")} at*`;
  const rows = await get(
    `events?select=${eventSelect}&title=ilike.${encodeURIComponent(pattern)}&event_date=gte.${encodeURIComponent(now.toISOString())}&event_date=lte.${encodeURIComponent(until.toISOString())}&order=event_date.asc&limit=8`
  );
  if (rows.ok && Array.isArray(rows.body)) {
    add((rows.body as any[]).filter((row) => String(row.artists?.name || "").toLowerCase() === String(artist).toLowerCase()));
  }
}

const interestIds = [...new Set(interestRows.map((row) => row.event_id).filter(Boolean))];
for (let index = 0; index < interestIds.length; index += 40) {
  const group = interestIds.slice(index, index + 40);
  const rows = await get(`events?select=${eventSelect}&id=in.(${group.join(",")})`);
  if (rows.ok && Array.isArray(rows.body)) add(rows.body);
}

const profile = await get(`users?select=user_id,name,location_city,location_state&user_id=in.(${ids.join(",")})`);
const profiles = profile.ok && Array.isArray(profile.body) ? profile.body as any[] : [];
const news = await fetchMusicNews(now);
const listens = await lookupRecordings(artists as string[]);

const users = targets.map((target) => {
  const saved = profiles.find((row) => row.user_id === target.id);
  const mine = interestRows.filter((row) => row.user_id === target.id);
  return {
    user_id: target.id,
    email: `${target.label}@preview.invalid`,
    name: saved?.name || target.name,
    username: target.label,
    location_city: saved?.location_city ?? null,
    location_state: saved?.location_state ?? null,
    interestedEventIds: mine.filter((row) => row.relationship_type !== "going").map((row) => row.event_id),
    goingEventIds: mine.filter((row) => row.relationship_type === "going").map((row) => row.event_id),
  };
});
users.push({
  user_id: "empty-preview",
  email: "empty@preview.invalid",
  name: "Riley",
  username: "empty",
  location_city: null,
  location_state: null,
  interestedEventIds: [],
  goingEventIds: [],
});

const generated = await generateDraftsFromSource({
  users,
  news,
  reviews: selectedReviews,
  stats: [],
  events,
  publicFives: (reviewRows.body as any[]).filter((row) => Number(row.rating) >= 5),
  listens,
}, now);

const outDir = resolve(process.cwd(), "public/newsletter-demos/generated");
mkdirSync(outDir, { recursive: true });
const labels = [...targets.map((target) => target.label), "empty"];
for (const [index, draft] of generated.drafts.entries()) {
  const label = labels[index] ?? `reader-${index}`;
  writeFileSync(resolve(outDir, `preview-${label}.html`), draft.html);
  const report = (draft.sources.find((source) => source.kind === "quality") as { report?: any } | undefined)?.report;
  console.log(JSON.stringify({
    file: `preview-${label}.html`,
    subject: draft.subject,
    sections: report?.sections ?? [],
    shows: (draft.html.match(/<h2[^>]*>([^<]+)<\/h2>/g) ?? []).slice(0, 8),
    featuredArtists: report?.featuredArtists ?? [],
    missingData: report?.missingData ?? [],
    warnings: report?.warnings ?? [],
    evidence: report?.personalizationEvidence ?? [],
    locationReadable: profile.ok,
  }));
}
console.log(JSON.stringify({
  reviewAccounts: targets.map((target) => ({ label: target.label, reviews: counts.get(target.id) ?? 0, savedShows: interestRows.filter((row) => row.user_id === target.id).length })),
  eventCandidates: events.length,
  newsStories: news.length,
  newsWithSummary: news.filter((story) => story.summary).length,
  profileStatus: profile.ok ? "readable" : profile.status,
  interestStatus: interests.ok ? "readable" : interests.status,
  held: generated.held,
}));
