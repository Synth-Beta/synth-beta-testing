import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { newsletters } from "../src/data/newsletters";
import {
  findRecipientFacingLeaks,
  getMockPersonalizationContext,
  resolveNewsletterForContext,
  validateNewsletterPersonalization,
} from "../src/lib/newsletterPersonalization";
import { renderNewsletterHtml } from "../src/lib/newsletterRenderer";

const OUT_DIR = resolve(process.cwd(), "public/newsletter-demos/design-previews");

const PRESETS = [
  { id: "active-user", file: "active-user.html" },
  { id: "spotify-connected-user", file: "streaming-connected-user.html" },
  { id: "inactive-with-history", file: "historical-data-user.html" },
  { id: "brand-new-user", file: "zero-data-user.html" },
] as const;

const FABRICATED_COMMUNITY = [
  "a member wrote",
  "skipped the encore traffic",
  "favorite part of the night outside the venue",
];

const ADMIN_HELPER = [
  "use this block each week",
  "for launches, tips, and product feedback",
  "final cta",
];

const run = async () => {
  const issue = newsletters.find((item) => item.slug === "august-5-2026") ?? newsletters[0];
  await mkdir(OUT_DIR, { recursive: true });

  const reports = [];

  for (const preset of PRESETS) {
    const context = getMockPersonalizationContext(preset.id);
    // Zero-data should not inherit mock nearby show from brand-new defaults if present.
    if (preset.id === "brand-new-user") {
      context.user.city = undefined;
      context.user.location = undefined;
      context.recommendations.nearbyShows = [];
      context.recommendations.relevantArtists = [];
      context.recommendations.relevantVenues = [];
    }

    const validation = validateNewsletterPersonalization(issue, context);
    const resolved = resolveNewsletterForContext(issue, context, "resolved");
    const html = renderNewsletterHtml(resolved.newsletter, {
      mode: "email",
      absoluteBaseUrl: "https://getsynth.app",
    });

    const outPath = resolve(OUT_DIR, preset.file);
    await writeFile(outPath, html, "utf8");

    const unresolvedTokens = html.match(/\{\{\s*[a-zA-Z0-9]+\s*\}\}/g) ?? [];
    const localhostHits = html.match(/(?:localhost|127\.0\.0\.1)/gi) ?? [];
    const leakHits = findRecipientFacingLeaks(html);
    const fabricatedCommunity = FABRICATED_COMMUNITY.filter((phrase) =>
      html.toLowerCase().includes(phrase.toLowerCase())
    );
    const adminHelper = ADMIN_HELPER.filter((phrase) =>
      html.toLowerCase().includes(phrase.toLowerCase())
    );
    const editorialLinksToSynthApp = (
      html.match(/href="https:\/\/join\.getsynth\.app\/"/g) ?? []
    ).length;
    const hasHero = /linear-gradient\(135deg,#CC2486/.test(html);
    const hasPillButton = /border-radius:999px/.test(html);
    const hasQuickHitsLabel = /Quick hits/i.test(html);
    const hasThisWeekTitle = /This Week in Live Music/i.test(html);
    const hasPitchforkUrl = html.includes("pitchfork.com");

    reports.push({
      preset: preset.id,
      path: outPath,
      derivedState: resolved.state,
      renderedTypes: resolved.newsletter.sections
        .filter((section) => !section.hidden)
        .map((section) => section.type),
      validationErrors: validation.errors,
      validationWarnings: validation.warnings,
      checks: {
        unresolvedTokenCount: unresolvedTokens.length,
        localhostCount: localhostHits.length,
        leakHits,
        fabricatedCommunity,
        adminHelper,
        hasHero,
        hasPillButton,
        hasQuickHitsLabel,
        hasThisWeekTitle,
        hasPitchforkUrl,
        joinGetSynthHrefCount: editorialLinksToSynthApp,
      },
    });
  }

  const failed = reports.filter(
    (report) =>
      report.validationErrors.length > 0 ||
      report.checks.unresolvedTokenCount > 0 ||
      report.checks.localhostCount > 0 ||
      report.checks.leakHits.length > 0 ||
      report.checks.fabricatedCommunity.length > 0 ||
      report.checks.adminHelper.length > 0 ||
      !report.checks.hasHero ||
      !report.checks.hasPillButton ||
      report.checks.hasQuickHitsLabel ||
      !report.checks.hasThisWeekTitle ||
      !report.checks.hasPitchforkUrl
  );

  console.log(JSON.stringify({ reports, failedCount: failed.length }, null, 2));
  if (failed.length > 0) {
    process.exit(1);
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
