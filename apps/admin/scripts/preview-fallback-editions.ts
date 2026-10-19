/**
 * Local previews of the three fallback editions. Does not save or send.
 * Run from apps/admin: npx vite-node scripts/preview-fallback-editions.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { composeEdition } from "../src/lib/newsletterEdition/compose";
import { renderEditionHtml } from "../src/lib/newsletterEdition/render";
import { fetchMusicNewsReport } from "../../../supabase/functions/newsletter-send/news";
import { discoveryTracks } from "../../../supabase/functions/newsletter-send/tracks-review-lookup";
import type { EditionEvent, EditionReader } from "../src/lib/newsletterEdition/types";

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), "../../.env"), "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
    })
);
const headers = { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` };
const select = "id,title,event_date,venue_city,venue_state,latitude,longitude,ticket_available,ticket_urls,genres,event_status,artists(name),venues(name)";

const eventsFor = async (city: string): Promise<EditionEvent[]> => {
  const response = await fetch(
    `${env.VITE_SUPABASE_URL}/rest/v1/events?select=${select}&venue_city=eq.${encodeURIComponent(city)}&event_date=gte.2026-10-08&event_date=lte.2027-01-08&order=event_date.asc&limit=40`,
    { headers }
  );
  const rows = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(rows).slice(0, 180));
  return (rows as any[]).flatMap((row) => {
    const urls = Array.isArray(row.ticket_urls) ? row.ticket_urls : [];
    const ticketUrl = urls.find((url: string) => /^https?:\/\//.test(url));
    const artistName = row.artists?.name;
    if (!ticketUrl || !artistName || !row.venues?.name || /cancel/i.test(String(row.event_status ?? ""))) return [];
    return [{
      id: String(row.id),
      artistName: String(artistName),
      venueName: String(row.venues.name),
      city: String(row.venue_city),
      state: row.venue_state ?? null,
      eventDate: String(row.event_date),
      ticketAvailable: row.ticket_available === true ? true : /sold.?out/i.test(String(row.event_status ?? "")) ? false : null,
      ticketUrl,
      genres: Array.isArray(row.genres) ? row.genres.map(String) : [],
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
    }];
  });
};

const now = new Date("2026-10-07T16:30:00.000Z");
const newsReport = await fetchMusicNewsReport(now);
const discovered = await discoveryTracks();
const chicagoEvents = await eventsFor("Chicago");
const austinEvents = await eventsFor("Austin");
const base = {
  news: newsReport.stories,
  discoveryListens: discovered.listens,
  listens: [],
  sendAt: now,
  editionDate: "2026-10-07",
  issueNumber: 1,
  retrievedAt: now.toISOString(),
  notices: [...newsReport.errors, ...(discovered.listens.length ? [] : discovered.errors)],
};
const reader = (overrides: Partial<EditionReader>): EditionReader => ({
  userId: "preview",
  email: "preview@example.com",
  firstName: "Alex",
  city: null,
  state: null,
  reviews: [],
  lifetimeShowCount: 0,
  fiveStarCount: 0,
  topArtists: [],
  genres: [],
  otherFiveStarArtists: [],
  ...overrides,
});

const sparse = composeEdition({
  ...base,
  events: austinEvents,
  reader: reader({
    userId: "sparse",
    firstName: "Alex",
    city: "Austin",
    state: "TX",
    latitude: 30.2672,
    longitude: -97.7431,
  }),
});
const located = composeEdition({
  ...base,
  events: chicagoEvents.length ? chicagoEvents : austinEvents,
  reader: reader({
    userId: "local",
    firstName: "Jordan",
    city: chicagoEvents.length ? "Chicago" : "Austin",
    state: chicagoEvents.length ? "IL" : "TX",
    latitude: chicagoEvents.length ? 41.8781 : 30.2672,
    longitude: chicagoEvents.length ? -87.6298 : -97.7431,
  }),
});
const general = composeEdition({
  ...base,
  events: [],
  reader: reader({ userId: "general", firstName: "Riley" }),
});

const out = resolve(process.cwd(), "public/newsletter-demos/generated");
mkdirSync(out, { recursive: true });
const textOf = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, "\n").replace(/\n+/g, "\n").trim();
for (const [name, edition] of [["fallback-sparse", sparse], ["fallback-location", located], ["fallback-general", general]] as const) {
  if (!edition) {
    console.log(`\n=== ${name}: NO SOURCED EDITION ===\n`);
    continue;
  }
  writeFileSync(resolve(out, `${name}.html`), renderEditionHtml(edition));
  console.log(`\n=== ${name} ===\n`);
  console.log(textOf(renderEditionHtml(edition)));
  console.log("\nFLAGS", edition.editorialFlags);
}
console.log("\nNEWS ERRORS", newsReport.errors);
console.log("DISCOVERY", discovered.listens.map((listen) => `${listen.trackName} — ${listen.artistName}`), discovered.errors);
console.log("CHICAGO EVENTS", chicagoEvents.length, "AUSTIN EVENTS", austinEvents.length);
