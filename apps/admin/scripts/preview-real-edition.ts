/**
 * Builds local HTML previews from public Synth data. Does not write drafts or send mail.
 * Run from apps/admin: npx vite-node scripts/preview-real-edition.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateDraftsFromSource } from "../src/lib/newsletterEdition/gather";

const envText = readFileSync(resolve(process.cwd(), "../../.env"), "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .map((line) => line.trim())
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
  return { ok: response.ok, status: response.status, body };
};

const reviews = await get(
  "reviews?select=user_id,rating,review_text,Event_date,artists(name),venues(name,city,state),users(username)&is_draft=eq.false&order=Event_date.desc&limit=800"
);
if (!reviews.ok) throw new Error(`reviews ${reviews.status}`);

const byUser = new Map<string, any[]>();
for (const row of reviews.body as any[]) {
  const list = byUser.get(row.user_id) ?? [];
  list.push(row);
  byUser.set(row.user_id, list);
}

const laurenId = "7d727ff6-fb7f-4e86-b272-f5ac31bd08d4";
const ranked = [...byUser.entries()].sort((left, right) => right[1].length - left[1].length);
const lauren = ranked.find(([id]) => id === laurenId);
const different = ranked.find(([id, rows]) => {
  if (id === laurenId || rows.length < 3) return false;
  const artists = new Set(rows.map((row) => row.artists?.name).filter(Boolean));
  const laurenArtists = new Set((lauren?.[1] ?? []).map((row) => row.artists?.name).filter(Boolean));
  return [...artists].some((artist) => !laurenArtists.has(artist));
});
const sparse = ranked.find(([id, rows]) => id !== laurenId && rows.length > 0 && rows.length <= 2) ?? ranked[ranked.length - 1];

const chosen = [lauren, different, sparse].filter(Boolean) as Array<[string, any[]]>;
const userIds = chosen.map(([id]) => id);
const location = await get(
  `users?select=user_id,name,username,location_city,location_state&user_id=in.(${userIds.join(",")})`
);

const artistNames = [...new Set(chosen.flatMap(([, rows]) => rows.slice(0, 3).map((row) => row.artists?.name).filter(Boolean)))].slice(0, 12);
const cities = location.ok
  ? [...new Set((location.body as any[]).map((row) => row.location_city).filter(Boolean))]
  : [];
const nowIso = new Date().toISOString();
const until = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
const eventSelect = "id,title,event_date,doors_time,venue_city,venue_state,ticket_available,ticket_urls,genres,event_status,artists(name),venues(name)";
const events: any[] = [];
for (const city of cities) {
  const rows = await get(
    `events?select=${eventSelect}&venue_city=ilike.${encodeURIComponent(city)}&event_date=gte.${encodeURIComponent(nowIso)}&event_date=lte.${encodeURIComponent(until)}&order=event_date.asc&limit=12`
  );
  if (rows.ok && Array.isArray(rows.body)) events.push(...rows.body);
}
for (const artist of artistNames) {
  const rows = await get(
    `events?select=${eventSelect}&title=ilike.${encodeURIComponent(`*${artist}*`)}&event_date=gte.${encodeURIComponent(nowIso)}&event_date=lte.${encodeURIComponent(until)}&order=event_date.asc&limit=8`
  );
  if (rows.ok && Array.isArray(rows.body)) {
    events.push(...rows.body.filter((row) => String(row.artists?.name || "").toLowerCase() === artist.toLowerCase()));
  } else console.log(JSON.stringify({ artist, status: rows.status, error: rows.body?.message ?? rows.body }));
}
const news = await get("news_items?select=id,title,url,source,created_at&order=created_at.desc&limit=40");
const fives = await get("reviews?select=user_id,artists(name)&is_public=eq.true&is_draft=eq.false&rating=gte.5&limit=300");

const users = chosen.map(([id, rows]) => {
  const profile = location.ok ? (location.body as any[]).find((row) => row.user_id === id) : null;
  const username = rows.find((row) => row.users?.username)?.users?.username ?? "reader";
  return {
    user_id: id,
    email: `${username}@preview.invalid`,
    name: profile?.name || username,
    username,
    location_city: profile?.location_city ?? null,
    location_state: profile?.location_state ?? null,
  };
});

const generated = await generateDraftsFromSource(
  {
    users,
    news: news.ok ? news.body : [],
    reviews: chosen.flatMap(([, rows]) => rows),
    stats: [],
    events,
    publicFives: fives.ok ? fives.body : [],
  },
  new Date()
);

const outDir = resolve(process.cwd(), "public/newsletter-demos/generated");
mkdirSync(outDir, { recursive: true });
const labels = ["lauren", "different", "sparse"];
generated.drafts.forEach((draft, index) => {
  const file = resolve(outDir, `real-${labels[index] ?? index}.html`);
  writeFileSync(file, draft.html);
  const showLinks = (draft.html.match(/See the show|Check the official listing/g) ?? []).length;
  console.log(
    JSON.stringify({
      file: `real-${labels[index] ?? index}.html`,
      subject: draft.subject,
      sources: draft.sources.map((source) => ({ kind: source.kind, label: source.label, url: source.url })),
      showLinks,
    })
  );
});
console.log(JSON.stringify({
  locationReadable: location.ok,
  locationStatus: location.status,
  newsStatus: news.status,
  eventCount: events.length,
  held: generated.held,
  draftCount: generated.drafts.length,
}));
