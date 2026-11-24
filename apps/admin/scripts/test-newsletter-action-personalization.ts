/**
 * Regression suite for action-oriented Synth Setlist personalization.
 * Run from apps/admin: npx tsx scripts/test-newsletter-action-personalization.ts
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { composeEdition } from "../src/lib/newsletterEdition/compose";
import { renderEditionHtml } from "../src/lib/newsletterEdition/render";
import { isMusicRelatedStory } from "../../../supabase/functions/newsletter-send/news";
import type { EditionEvent, EditionListen, EditionNews, EditionReader } from "../src/lib/newsletterEdition/types";

const retrievedAt = "2026-10-06T21:00:00.000Z";

const event = (overrides: Partial<EditionEvent> & Pick<EditionEvent, "id" | "artistName" | "city">): EditionEvent => ({
  venueName: "9:30 Club",
  eventDate: "2026-10-20T23:00:00.000Z",
  ticketAvailable: true,
  ticketUrl: `https://www.axs.com/events/${overrides.id}`,
  genres: ["rock"],
  state: "DC",
  latitude: 38.9072,
  longitude: -77.0369,
  ...overrides,
});

const reader = (overrides: Partial<EditionReader> = {}): EditionReader => ({
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
  topArtists: ["Sylvan Esso"],
  genres: ["pop"],
  otherFiveStarArtists: [],
  ...overrides,
});

const compose = (opts: {
  reader?: EditionReader;
  events?: EditionEvent[];
  news?: EditionNews[];
  listens?: EditionListen[];
  editionDate?: string;
  sendAt?: Date;
  excludedUrls?: string[];
}) => composeEdition({
  reader: opts.reader ?? reader(),
  events: opts.events ?? [event({ id: "sylvan", artistName: "Sylvan Esso", city: "Washington", genres: ["pop"] })],
  news: opts.news ?? [],
  listens: opts.listens ?? [],
  sendAt: opts.sendAt ?? new Date("2026-10-07T14:00:00.000Z"),
  editionDate: opts.editionDate ?? "2026-10-07",
  issueNumber: 1,
  retrievedAt,
  excludedUrls: opts.excludedUrls,
});

// 1) Zero-show / no-city inventory -> still draft (listens + location prompt)
const zeroShow = compose({ events: [] })!;
assert.equal(zeroShow.shows.length, 0, "zero-show -> no radar cards");
assert.ok((zeroShow.listens?.length ?? 0) >= 1, "zero-show still includes listens");
const noCity = compose({
  reader: reader({ city: null, state: null, latitude: null, longitude: null }),
  events: [event({ id: "far", artistName: "Wilco", city: "Chicago", state: "IL", latitude: 41.88, longitude: -87.63 })],
})!;
assert.equal(noCity.shows.length, 0, "no city -> no invented local shows");
assert.ok(noCity.locationPrompt);

// 2) No-ticket valid show -> displayed with in-app URL
const noTicket = compose({
  events: [event({ id: "noticket", artistName: "Local Opener", city: "Washington", ticketUrl: null, ticketAvailable: null })],
})!;
assert.equal(noTicket.shows.length, 1);
assert.match(noTicket.shows[0].ctaUrl, /join\.getsynth\.app\/share\?event=noticket/);
assert.equal(noTicket.shows[0].links?.some((link) => /Official tickets/i.test(link.label)), false);
assert.match(renderEditionHtml(noTicket), /Open this show on Synth/);
assert.match(renderEditionHtml(noTicket), /join\.getsynth\.app\/share\?event=noticket/);

// 3) Upcoming Interested -> plan CTA with event deep link
const interested = compose({
  reader: reader({ interestedEventIds: ["plan-1"] }),
  events: [
    event({ id: "plan-1", artistName: "Mt. Joy", city: "Washington", eventDate: "2026-10-18T23:00:00.000Z" }),
    event({ id: "discover", artistName: "Horsegirl", city: "Washington", eventDate: "2026-11-01T23:00:00.000Z" }),
  ],
})!;
assert.ok(interested.features?.some((card) => /concert plans/i.test(card.eyebrow)));
assert.ok(interested.features?.some((card) => /Make plans on Synth/i.test(card.ctaLabel)));
assert.match(interested.features![0].ctaUrl, /share\?event=plan-1/);
assert.ok(interested.features![0].links?.some((link) => /Find people to go with/i.test(link.label)));
assert.ok(interested.features![0].links?.some((link) => /Official tickets/i.test(link.label)));
assert.equal(interested.shows.some((card) => card.title === "Mt. Joy"), false, "saved planning artist stays in concert plans, not radar");
assert.ok(interested.shows.some((card) => card.title === "Horsegirl"));
assert.doesNotMatch(interested.features!.map((card) => card.body).join(" "), /you attended|you went|thanks for going/i);

// 4) Past Interested, no review -> conditional review CTA
const pastUnreviewed = compose({
  reader: reader({ interestedEventIds: ["past-1"] }),
  events: [
    event({ id: "past-1", artistName: "Jungle", city: "Washington", eventDate: "2026-10-02T23:00:00.000Z" }),
    event({ id: "upcoming", artistName: "Sylvan Esso", city: "Washington" }),
  ],
  sendAt: new Date("2026-10-07T14:00:00.000Z"),
})!;
assert.ok(pastUnreviewed.features?.some((card) => /How was Jungle/i.test(card.title)));
assert.doesNotMatch(pastUnreviewed.features!.map((card) => card.body).join(" "), /thanks for attending|you attended/i);
assert.match(pastUnreviewed.features!.find((card) => /How was Jungle/i.test(card.title))!.body, /If you went|If you didn't/i);

// 5) Same event already reviewed -> no review CTA
const alreadyReviewed = compose({
  reader: reader({
    interestedEventIds: ["past-reviewed"],
    reviews: [{ artistName: "Jungle", eventId: "past-reviewed", eventDate: "2026-10-02T23:00:00.000Z", rating: 5 }],
  }),
  events: [
    event({ id: "past-reviewed", artistName: "Jungle", city: "Washington", eventDate: "2026-10-02T23:00:00.000Z" }),
    event({ id: "upcoming", artistName: "Sylvan Esso", city: "Washington" }),
  ],
})!;
assert.equal(alreadyReviewed.features?.some((card) => /How was Jungle/i.test(card.title)), false);

// 6) Old saves (>10 days) -> no review CTA
const oldSave = compose({
  reader: reader({ interestedEventIds: ["old-1"] }),
  events: [
    event({ id: "old-1", artistName: "Old Act", city: "Washington", eventDate: "2026-09-01T23:00:00.000Z" }),
    event({ id: "upcoming", artistName: "Sylvan Esso", city: "Washington" }),
  ],
})!;
assert.equal(oldSave.features?.some((card) => /How was Old Act/i.test(card.title)), false);

// 7) 56-day repeat suppression via labels
const repeat = compose({
  reader: reader({
    recentSourceLabels: ["Show sylvan", "Artist Sylvan Esso", "Action planning plan-1"],
    recentSourceUrls: ["https://www.axs.com/events/sylvan"],
  }),
  events: [
    event({ id: "sylvan", artistName: "Sylvan Esso", city: "Washington", genres: ["pop"] }),
    event({ id: "alt", artistName: "Glass Animals", city: "Washington", genres: ["pop"] }),
  ],
})!;
assert.equal(repeat.shows.some((show) => show.title === "Sylvan Esso"), false);
assert.ok(repeat.shows.some((show) => show.title === "Glass Animals"));

// 8) Sports / football tips rejected
assert.equal(isMusicRelatedStory({
  title: "Football tips for this weekend",
  summary: "NFL picks and new album chatter",
  url: "https://www.billboard.com/music/music-news/football-tips",
  source: "Billboard",
}), false);
assert.equal(isMusicRelatedStory({
  title: "Super Bowl " + "halftime show announces its musical performer",
  summary: "The league confirmed the musical guest.",
}), false);

// 9) Cross-issue variation without new reviews
const weekA = compose({ editionDate: "2026-10-05", sendAt: new Date("2026-10-05T14:00:00.000Z") })!;
const weekB = compose({
  editionDate: "2026-10-12",
  sendAt: new Date("2026-10-12T14:00:00.000Z"),
  reader: reader({
    recentSourceLabels: weekA.sources.map((source) => source.label),
    recentSourceUrls: weekA.sources.map((source) => source.url),
    recentListenKeys: weekA.sources.filter((source) => source.kind === "listen").map((source) => source.label),
  }),
  events: [
    event({ id: "sylvan", artistName: "Sylvan Esso", city: "Washington", genres: ["pop"] }),
    event({ id: "week-b", artistName: "Japanese Breakfast", city: "Washington", genres: ["indie"] }),
  ],
})!;
assert.notEqual(weekA.subject, weekB.subject);
assert.ok(weekB.shows.some((show) => show.title === "Japanese Breakfast"));
assert.equal(weekB.shows.some((show) => show.title === "Sylvan Esso"), false);

// 10) Cross-user personalization
const lauren = compose({
  reader: reader({
    userId: "lauren",
    firstName: "Lauren",
    topArtists: ["Jon Batiste"],
    reviews: [{ artistName: "Jon Batiste", rating: 5, eventDate: "2026-08-01" }],
  }),
  events: [
    event({ id: "batiste", artistName: "Jon Batiste", city: "Washington", genres: ["jazz"] }),
    event({ id: "wilco-dc", artistName: "Wilco", city: "Washington", genres: ["rock"] }),
  ],
})!;
const sam = compose({
  reader: reader({
    userId: "sam",
    firstName: "Sam",
    city: "Chicago",
    state: "IL",
    latitude: 41.8781,
    longitude: -87.6298,
    topArtists: ["Wilco"],
    reviews: [{ artistName: "Wilco", rating: 5, eventDate: "2025-06-01" }],
  }),
  events: [
    event({ id: "wilco-chi", artistName: "Wilco", city: "Chicago", state: "IL", latitude: 41.8781, longitude: -87.6298, venueName: "Metro", genres: ["rock"] }),
    event({ id: "batiste-chi", artistName: "Jon Batiste", city: "Chicago", state: "IL", latitude: 41.8781, longitude: -87.6298, venueName: "Chicago Theatre", genres: ["jazz"] }),
  ],
})!;
assert.ok(lauren.shows.some((show) => show.title === "Jon Batiste"));
assert.ok(sam.shows.some((show) => show.title === "Wilco"));
assert.notEqual(lauren.subject, sam.subject);

// 11) No broken / homepage-only event CTAs when event-specific routes exist
for (const edition of [noTicket, interested, lauren, sam, weekA, weekB]) {
  for (const show of edition.shows) {
    assert.match(show.ctaUrl, /^https:\/\/join\.getsynth\.app\/share\?event=/);
    assert.doesNotMatch(show.ctaUrl, /^https:\/\/join\.getsynth\.app\/?$/);
  }
  for (const feature of edition.features ?? []) {
    assert.match(feature.ctaUrl, /^https:\/\/join\.getsynth\.app\/share\?event=/);
  }
}

// 12) No false attendance claims
for (const edition of [interested, pastUnreviewed, alreadyReviewed, oldSave]) {
  const blob = [
    edition.intro,
    ...edition.shows.map((show) => show.body),
    ...(edition.features ?? []).map((card) => card.body),
  ].join(" ");
  assert.doesNotMatch(blob, /thanks for (attending|going)|you attended|glad you went/i);
}

console.log("PASS: action-personalization regressions");

// ---- Representative 4 users × 4 weeks (no real send) ----
const weeks = ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"];
const personas: Array<{ name: string; reader: EditionReader; events: EditionEvent[]; news: EditionNews[] }> = [
  {
    name: "lauren-dc-active",
    reader: reader({
      userId: "lauren",
      firstName: "Lauren",
      email: "lauren@example.com",
      topArtists: ["Jon Batiste", "Glass Animals"],
      followedArtists: ["Sylvan Esso"],
      interestedEventIds: ["lauren-plan"],
      reviews: [
        { artistName: "Jon Batiste", rating: 5, eventDate: "2026-08-21", venueName: "Wolf Trap" },
        { artistName: "Glass Animals", rating: 4, eventDate: "2026-06-01" },
      ],
      otherFiveStarArtists: ["Jon Batiste"],
    }),
    events: [
      event({ id: "lauren-plan", artistName: "Mt. Joy", city: "Washington", eventDate: "2026-10-16T23:00:00.000Z" }),
      event({ id: "lauren-a", artistName: "Sylvan Esso", city: "Washington", genres: ["pop"], eventDate: "2026-10-22T23:00:00.000Z" }),
      event({ id: "lauren-b", artistName: "Glass Animals", city: "Washington", genres: ["pop"], eventDate: "2026-11-05T23:00:00.000Z" }),
      event({ id: "lauren-c", artistName: "Local Natives", city: "Washington", genres: ["indie"], eventDate: "2026-11-12T23:00:00.000Z" }),
      event({ id: "lauren-d", artistName: "Japanese Breakfast", city: "Washington", genres: ["indie"], eventDate: "2026-11-19T23:00:00.000Z" }),
    ],
    news: [
      { id: "n1", title: "Jon Batiste announces a winter concert run", url: "https://www.billboard.com/music/music-news/jon-batiste-winter", source: "Billboard", publishedAt: "2026-10-01T12:00:00.000Z", summary: "Jon Batiste added winter concert dates, with routing posted by the promoter." },
      { id: "n2", title: "Football tips for this weekend", url: "https://www.billboard.com/music/music-news/football-tips", source: "Billboard", publishedAt: "2026-10-02T12:00:00.000Z", summary: "NFL picks land beside a Spotify playlist mention." },
    ],
  },
  {
    name: "sam-chicago-wilco",
    reader: reader({
      userId: "sam",
      firstName: "Sam",
      email: "sam@example.com",
      city: "Chicago",
      state: "IL",
      latitude: 41.8781,
      longitude: -87.6298,
      topArtists: ["Wilco"],
      genres: ["rock"],
      goingEventIds: ["sam-going"],
      reviews: [{ artistName: "Wilco", rating: 5, eventDate: "2025-06-01", venueName: "Riviera Theatre" }],
    }),
    events: [
      event({ id: "sam-going", artistName: "Horsegirl", city: "Chicago", state: "IL", latitude: 41.9, longitude: -87.65, venueName: "Empty Bottle", eventDate: "2026-10-17T23:00:00.000Z", genres: ["rock"] }),
      event({ id: "sam-a", artistName: "Wilco", city: "Chicago", state: "IL", latitude: 41.88, longitude: -87.63, venueName: "Metro", eventDate: "2026-10-25T23:00:00.000Z", genres: ["rock"] }),
      event({ id: "sam-b", artistName: "Twilight Hotel", city: "Chicago", state: "IL", latitude: 41.89, longitude: -87.64, venueName: "Lincoln Hall", eventDate: "2026-11-08T23:00:00.000Z", genres: ["rock"] }),
      event({ id: "sam-c", artistName: "Ratboys", city: "Evanston", state: "IL", latitude: 42.0451, longitude: -87.6877, venueName: "SPACE", eventDate: "2026-11-15T23:00:00.000Z", genres: ["indie"] }),
    ],
    news: [
      { id: "c1", title: "A fall calendar lands for a Chicago room", url: "https://pitchfork.com/news/chicago-calendar", source: "Pitchfork", publishedAt: "2026-10-03T12:00:00.000Z", summary: "The Chicago venue posted its fall calendar, with dates on its own site." },
    ],
  },
  {
    name: "alex-sparse-austin",
    reader: reader({
      userId: "alex",
      firstName: "Alex",
      email: "alex@example.com",
      city: "Austin",
      state: "TX",
      latitude: 30.2672,
      longitude: -97.7431,
      topArtists: [],
      genres: [],
      reviews: [],
    }),
    events: [
      event({ id: "alex-a", artistName: "Local Natives", city: "Austin", state: "TX", latitude: 30.2672, longitude: -97.7431, venueName: "Mohawk", eventDate: "2026-10-21T23:00:00.000Z", genres: ["indie"] }),
      event({ id: "alex-b", artistName: "Black Pumas", city: "Austin", state: "TX", latitude: 30.27, longitude: -97.74, venueName: "ACL Live", eventDate: "2026-11-02T23:00:00.000Z", genres: ["soul"] }),
      event({ id: "alex-c", artistName: "Khruangbin", city: "Austin", state: "TX", latitude: 30.26, longitude: -97.75, venueName: "Stubb's", eventDate: "2026-11-18T23:00:00.000Z", genres: ["funk"], ticketUrl: null, ticketAvailable: null }),
    ],
    news: [],
  },
  {
    name: "riley-stale-taste",
    reader: reader({
      userId: "riley",
      firstName: "Riley",
      email: "riley@example.com",
      topArtists: ["Phoebe Bridgers", "Japanese Breakfast"],
      genres: ["indie"],
      followedVenues: ["9:30 Club"],
      // No recent reviews — months of silence should still yield discovery.
      reviews: [{ artistName: "Phoebe Bridgers", rating: 5, eventDate: "2025-01-12", venueName: "Anthem" }],
    }),
    events: [
      event({ id: "riley-a", artistName: "Japanese Breakfast", city: "Washington", genres: ["indie"], eventDate: "2026-10-23T23:00:00.000Z" }),
      event({ id: "riley-b", artistName: "Big Thief", city: "Washington", genres: ["indie"], eventDate: "2026-11-06T23:00:00.000Z", venueName: "Lincoln Theatre" }),
      event({ id: "riley-c", artistName: "Wednesday", city: "Washington", genres: ["indie"], eventDate: "2026-11-20T23:00:00.000Z" }),
      event({ id: "riley-d", artistName: "MJ Lenderman", city: "Washington", genres: ["indie"], eventDate: "2026-11-27T23:00:00.000Z" }),
    ],
    news: [
      { id: "r1", title: "Japanese Breakfast shares a new single", url: "https://pitchfork.com/news/jb-single", source: "Pitchfork", publishedAt: "2026-10-04T12:00:00.000Z", summary: "Japanese Breakfast shared a new single, with credits listed at the source." },
    ],
  },
];

const outDir = resolve(process.cwd(), "public/newsletter-demos/personalization-4x4");
mkdirSync(outDir, { recursive: true });
const summary: Array<Record<string, unknown>> = [];

for (const persona of personas) {
  let recentSourceUrls: string[] = [];
  let recentSourceLabels: string[] = [];
  let recentListenKeys: string[] = [];
  for (const week of weeks) {
    const sendAt = new Date(`${week}T14:00:00.000Z`);
    const edition = composeEdition({
      reader: {
        ...persona.reader,
        recentSourceUrls,
        recentSourceLabels,
        recentListenKeys,
      },
      events: persona.events,
      news: persona.news.map((item) => ({
        ...item,
        // Keep news "fresh" relative to each mock week.
        publishedAt: new Date(Date.parse(week + "T12:00:00Z") - 3 * 86400000).toISOString(),
      })),
      listens: [],
      sendAt,
      editionDate: week,
      issueNumber: weeks.indexOf(week) + 1,
      retrievedAt,
    });
    assert.ok(edition, `${persona.name} week ${week} must produce a show-backed edition`);
    assert.ok(edition.shows.length >= 1, `${persona.name} week ${week} needs >=1 show`);
    const html = renderEditionHtml(edition);
    assert.match(html, /join\.getsynth\.app\/share\?event=/);
    assert.doesNotMatch(html, /Football tips|Super Bowl|NFL picks/i);
    assert.doesNotMatch(html, /you attended|thanks for attending/i);
    const file = `${persona.name}-${week}.html`;
    writeFileSync(resolve(outDir, file), html);
    summary.push({
      persona: persona.name,
      week,
      subject: edition.subject,
      headline: edition.headline,
      sections: edition.qualityReport.sections,
      shows: edition.shows.map((show) => ({ title: show.title, ctaUrl: show.ctaUrl })),
      features: (edition.features ?? []).map((card) => card.title),
      listens: (edition.listens ?? []).map((card) => card.title),
      updates: edition.updates.map((card) => card.title),
      file,
    });
    recentSourceUrls = [...new Set([...recentSourceUrls, ...edition.sources.map((source) => source.url)])];
    recentSourceLabels = [...new Set([...recentSourceLabels, ...edition.sources.map((source) => source.label)])];
    recentListenKeys = [
      ...new Set([
        ...recentListenKeys,
        ...edition.sources.filter((source) => source.kind === "listen").map((source) => source.label),
      ]),
    ];
  }
}

writeFileSync(resolve(outDir, "summary.json"), JSON.stringify(summary, null, 2));
const indexRows = summary.map((row) =>
  `<tr><td>${row.persona}</td><td>${row.week}</td><td>${row.subject}</td><td>${(row.shows as any[]).map((show) => show.title).join(", ")}</td><td><a href="./${row.file}">open</a></td></tr>`
).join("\n");
writeFileSync(resolve(outDir, "index.html"), `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Synth Setlist 4×4</title>
<style>body{font-family:Inter,system-ui,sans-serif;margin:24px;background:#F6F4F5;color:#161616}table{border-collapse:collapse;width:100%;background:#fff}td,th{border:1px solid #E8E3E7;padding:10px;text-align:left;font-size:14px}th{background:#FFF6FA}</style>
</head><body><h1>The Synth Setlist — 4 users × 4 weeks</h1><p>Mock HTML only. No emails were sent.</p><table><thead><tr><th>Persona</th><th>Week</th><th>Subject</th><th>Shows</th><th>HTML</th></tr></thead><tbody>${indexRows}</tbody></table></body></html>`);

console.log(`Wrote ${summary.length} representative newsletters to ${outDir}`);
console.log("PASS: 4x4 representative newsletter generation");
