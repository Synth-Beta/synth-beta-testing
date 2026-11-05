/**
 * HTML checks for newsletter dark-mode support.
 * Run: npx tsx apps/admin/scripts/test-newsletter-dark-mode.ts
 */
import assert from "node:assert/strict";
import { renderEditionHtml } from "../src/lib/newsletterEdition/render";
import type { ComposedEdition } from "../src/lib/newsletterEdition/types";
import {
  NEWSLETTER_DARK_MODE_MARK,
  applyNewsletterColorPreviewMode,
  ensureNewsletterDarkModeHead,
  newsletterDarkModeHtmlChecks,
} from "../src/lib/newsletterEmailDarkMode";
import { renderNewsletterHtml } from "../src/lib/newsletterRenderer";
import type { NewsletterIssue } from "../src/types/newsletter";

const emptyQuality = {
  sections: [],
  sourceCounts: {
    reviews: 0,
    fiveStarReviews: 0,
    streamingArtists: 0,
    candidateEvents: 0,
    newsStories: 0,
    personalListens: 0,
  },
  personalizationEvidence: [],
  missingData: [],
  warnings: [],
  featuredArtists: [],
};

const longEdition: ComposedEdition = {
  subject: "Your weekend shows are stacked",
  preheader: "Three picks near you, plus a listen and a story.",
  issueLabel: "Friday · Issue No. 42",
  headline: "Your next three nights, already sorted.",
  intro: "We pulled shows that match the artists you follow and the rooms you keep going back to.",
  showsHeading: "On your radar",
  showsDek: "Closest matches first.",
  shows: [
    {
      eyebrow: "Tonight · 9th Street",
      title: "Headliner at the big room",
      body: "If you liked last month's set, this one lands in the same lane.",
      ctaLabel: "See the show",
      ctaUrl: "https://join.getsynth.app/event/1",
      availabilityNote: "A few tickets left.",
      caution: false,
    },
    {
      eyebrow: "Saturday · Warehouse",
      title: "Late set with friends on the bill",
      body: "A local favorite opens; the room usually fills by 10.",
      ctaLabel: "Open on Synth",
      ctaUrl: "https://join.getsynth.app/event/2",
      caution: false,
    },
  ],
  listens: [
    {
      eyebrow: "Listen",
      title: "A track that bridges your two favorite lanes",
      body: "Short, sharp, and easy to replay before doors.",
      ctaLabel: "Play it",
      ctaUrl: "https://open.spotify.com/track/x",
      tone: "pink",
    },
  ],
  updates: [
    {
      eyebrow: "News",
      title: "Tour dates just dropped for an artist you follow",
      body: "The city stop is later this season — worth a calendar note.",
      ctaLabel: "Read the story",
      ctaUrl: "https://example.com/news",
      tone: "yellow",
    },
  ],
  features: [],
  connect: {
    eyebrow: "People",
    title: "Someone nearby shares three of your artists",
    body: "Say hi before the next show — the overlap is real.",
    ctaLabel: "Find them on Synth",
    ctaUrl: "https://join.getsynth.app/",
    tone: "white",
  },
  sources: [],
  qualityReport: emptyQuality,
};

const shortEdition: ComposedEdition = {
  subject: "A quiet week, still worth opening",
  preheader: "One show and one listen.",
  issueLabel: "Friday · Issue No. 43",
  headline: "One night that fits.",
  intro: "Not every week is stacked — this one still has a clear pick.",
  shows: [
    {
      eyebrow: "Sunday · Small room",
      title: "Intimate set downtown",
      body: "Perfect if you want a shorter night out.",
      ctaLabel: "See details",
      ctaUrl: "https://join.getsynth.app/event/3",
      caution: false,
    },
  ],
  listens: [],
  updates: [],
  features: [],
  sources: [],
  qualityReport: emptyQuality,
};

const sampleIssue: NewsletterIssue = {
  id: "dark-mode-test",
  slug: "dark-mode-test",
  title: "Dark Mode Test",
  description: "Test issue",
  publishDate: "2026-11-04",
  issueNumber: "99",
  subjectLine: "Dark mode test",
  preheader: "Checking contrast",
  coverImage: "",
  isPublicSample: false,
  status: "draft",
  sections: [
    {
      id: "hero",
      type: "hero",
      label: "For the love of live music",
      headline: "Hero headline",
      body: "Hero body stays readable.",
    },
    {
      id: "music",
      type: "yourMusic",
      label: "Your music",
      headline: "A card with a button",
      body: "Muted body copy.",
      ctaLabel: "Open Synth",
      ctaUrl: "https://join.getsynth.app/",
      ctaStyle: "button",
    },
    {
      id: "cta",
      type: "cta",
      label: "See it on Synth",
      headline: "Dark panel CTA",
      body: "White text on charcoal.",
      ctaLabel: "Explore",
      ctaUrl: "https://join.getsynth.app/",
    },
    {
      id: "footer",
      type: "footer",
      headline: "Discover, Connect, Share.",
      body: "Footer meta",
      ctaLabel: "Website",
      ctaUrl: "https://getsynth.app/",
      label: "{{unsubscribe_url}}",
    },
  ],
};

const longHtml = renderEditionHtml(longEdition);
const shortHtml = renderEditionHtml(shortEdition);
const builderHtml = renderNewsletterHtml(sampleIssue, {
  mode: "email",
  absoluteBaseUrl: "https://getsynth.app",
});

for (const [name, html] of [
  ["long edition", longHtml],
  ["short edition", shortHtml],
  ["builder renderer", builderHtml],
] as const) {
  const checks = newsletterDarkModeHtmlChecks(html);
  assert.equal(checks.ok, true, `${name} missing: ${checks.missing.join(", ")}`);
  assert.match(html, /#F6F4F5|#F5F5F5|#FCFCFC/);
  assert.match(html, /#CC2486/);
  assert.doesNotMatch(html, /color-scheme" content="light only"/i);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.match(html, /data-ogsc/);
}

assert.equal(ensureNewsletterDarkModeHead(longHtml), longHtml);

const legacy = `<!DOCTYPE html><html><head><title>x</title></head><body><p>hi</p></body></html>`;
const upgraded = ensureNewsletterDarkModeHead(legacy);
assert.match(upgraded, new RegExp(NEWSLETTER_DARK_MODE_MARK));
assert.match(upgraded, /prefers-color-scheme:\s*dark/);
assert.equal(ensureNewsletterDarkModeHead(upgraded), upgraded);

const darkPreview = applyNewsletterColorPreviewMode(longHtml, "dark");
assert.match(darkPreview, /data-nl-preview-mode="dark"/);
assert.match(darkPreview, /nl-preview-root/);
assert.match(darkPreview, /color-scheme: dark only/);

const lightPreview = applyNewsletterColorPreviewMode(longHtml, "light");
assert.match(lightPreview, /data-nl-preview-mode="light"/);
assert.match(lightPreview, /color-scheme: light only/);

const gmailSim = applyNewsletterColorPreviewMode(longHtml, "gmail-invert-sim");
assert.match(gmailSim, /SIMULATION/);
assert.match(gmailSim, /invert\(1\) hue-rotate\(180deg\)/);

const outlookSim = applyNewsletterColorPreviewMode(longHtml, "outlook-invert-sim");
assert.match(outlookSim, /SIMULATION — not real Outlook/);

// Light-mode inline colors must remain present (not replaced).
assert.match(longHtml, /background:#FFFFFF/);
assert.match(longHtml, /color:#161616/);
assert.match(longHtml, /color:#505662/);
assert.match(longHtml, /background:#CC2486/);
assert.match(longHtml, /background:#101010/);

console.log("newsletter dark mode checks passed");
