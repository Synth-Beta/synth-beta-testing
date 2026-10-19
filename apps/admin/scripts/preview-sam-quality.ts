/**
 * Local preview of one account from public reviews and events. Does not save or send.
 * Run from apps/admin: npx vite-node scripts/preview-sam-quality.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateDraftsFromSource } from "../src/lib/newsletterEdition/gather";
import { rankArtists } from "../src/lib/newsletterEdition/editorial";
import { artistTitleOr } from "../../../supabase/functions/newsletter-send/nearby";
import { fetchMusicNews } from "../../../supabase/functions/newsletter-send/news";
import { listensForReviews } from "../../../supabase/functions/newsletter-send/tracks-review-lookup";

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
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const get = async (path: string) => {
  const response = await fetch(`${base}/rest/v1/${path}`, { headers });
  const body = await response.json();
  if (!response.ok) throw new Error(`${path} ${response.status} ${JSON.stringify(body).slice(0, 180)}`);
  return body;
};

const userId = "349bda34-7878-4c10-9f86-ec5888e55571";
const reviews = await get(
  `reviews?select=user_id,rating,review_text,Event_date,artists(name),venues(name)&user_id=eq.${userId}&is_draft=eq.false&order=Event_date.desc&limit=40`
);
const ranked = rankArtists(reviews.map((row: any) => ({
  artistName: row.artists?.name,
  rating: row.rating,
  text: row.review_text,
})));
const artists = ranked.slice(0, 10).map((artist) => artist.name).filter(Boolean);
const select = "id,title,event_date,doors_time,venue_city,venue_state,latitude,longitude,ticket_available,ticket_urls,genres,event_status,artists(name),venues(name)";
const events: any[] = [];
for (const artist of artists) {
  const rows = await get(
    `events?select=${select}&or=${encodeURIComponent(`(${artistTitleOr(artist)})`)}&event_date=gte.2026-10-08&event_date=lte.2027-01-08&order=event_date.asc&limit=8`
  );
  events.push(...rows);
}
const news = await fetchMusicNews(new Date());
const listens = (await listensForReviews(reviews.map((row: any) => ({
  artistName: row.artists?.name,
  venueName: row.venues?.name,
  text: row.review_text,
})))).map((listen) => ({ ...listen, userId }));

const generated = await generateDraftsFromSource({
  users: [{
    user_id: userId,
    email: "sam@example.com",
    name: "Sam",
    username: "sloiterstein",
    location_city: "Washington",
    location_state: "DC",
    latitude: 38.9072,
    longitude: -77.0369,
  }],
  news,
  reviews,
  stats: [],
  events,
  publicFives: [],
  listens,
  retrievalNotes: [
    "Saved location could not be read from the users table with the public key. This preview uses Washington, DC because his latest logged venues are The Anthem and Lincoln Theatre.",
    "artist_follows returned no rows. user_streaming_stats_summary and event_interests are not in the public schema.",
  ],
}, new Date("2026-10-07T16:30:00.000Z"));

const draft = generated.drafts[0];
const out = resolve(process.cwd(), "public/newsletter-demos/generated/sam-edition.html");
mkdirSync(resolve(out, ".."), { recursive: true });
writeFileSync(out, draft.html);
console.log(JSON.stringify({
  ranked: ranked.slice(0, 8),
  events: events.map((row) => ({
    artist: row.artists?.name,
    city: row.venue_city,
    date: row.event_date,
  })),
  news: news.filter((item) => artists.some((artist) => item.title.toLowerCase().includes(artist.toLowerCase().slice(0, 8)))).map((item) => item.title),
  subject: draft.subject,
  flags: draft.sources.filter((source) => source.kind === "editorial").map((source) => source.label),
}, null, 2));
console.log("\n---HTML TEXT---\n");
console.log(draft.html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, "\n").replace(/\n+/g, "\n").trim());
