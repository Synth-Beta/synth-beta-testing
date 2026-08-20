import { writeFileSync } from "node:fs";
import { newsletters } from "../src/data/newsletters";
import { supabase } from "../src/integrations/supabase/client";
import {
  buildPersonalizationContextForUser,
  resolveNewsletterForContext,
  collectRecipientFacingText,
  findRecipientFacingLeaks,
} from "../src/lib/newsletterPersonalization";
import { renderNewsletterHtml } from "../src/lib/newsletterRenderer";

const TARGET_USERNAME = "sloiterstein";
const TARGET_SLUG = "august-5-2026";
const DEMO_DATE = "2026-08-11T12:00:00.000Z";
const OUTPUT_PATH = "public/newsletter-demos/sam-v2-demo.html";

const tokenRegex = /\{\{\s*[a-zA-Z0-9]+\s*\}\}/g;

const run = async () => {
  const { data: matches, error } = await (supabase as any)
    .from("users")
    .select("user_id, username")
    .eq("username", TARGET_USERNAME);

  if (error) throw new Error(`Failed to resolve user: ${error.message}`);
  const exact = (matches ?? []).filter((row: any) => row.username === TARGET_USERNAME);
  if (exact.length !== 1) throw new Error(`Expected one user for ${TARGET_USERNAME}, found ${exact.length}`);

  const userId = String(exact[0].user_id);
  const context = await buildPersonalizationContextForUser(userId);
  const issue = newsletters.find((item) => item.slug === TARGET_SLUG);
  if (!issue) throw new Error(`Missing newsletter slug: ${TARGET_SLUG}`);

  // Demo-only metadata adjustments (no personalization hardcoding).
  const demoIssue = {
    ...issue,
    publishDate: DEMO_DATE,
    sections: issue.sections.map((section) =>
      section.type === "footer"
        ? {
            ...section,
            // Hide links without real destinations for this internal demo.
            eyebrowText: undefined,
            label: undefined,
          }
        : section
    ),
  };

  const resolved = resolveNewsletterForContext(demoIssue, context, "resolved");
  let html = renderNewsletterHtml(resolved.newsletter, {
    mode: "web",
    absoluteBaseUrl: "https://getsynth.app",
  });

  // Demo-only footer cleanup when location is not intentionally configured.
  html = html.replace(
    /<div style="font-size:12px;line-height:1\.6;font-weight:500;color:#8A8F98;margin-top:14px;">Synth · Washington, DC<\/div>/g,
    ""
  );

  writeFileSync(OUTPUT_PATH, html, "utf8");

  const recipientText = collectRecipientFacingText(resolved.newsletter);
  const unresolvedTokens = html.match(tokenRegex) ?? [];
  const leakageHits = findRecipientFacingLeaks(recipientText);
  const rawLower = html.toLowerCase();
  const textLower = recipientText.toLowerCase();
  const mojibakeHits = (html.match(/Ã|Â|â€™|â€œ|â€|�/g) ?? []).length;
  const localhostHits = (html.match(/localhost|127\.0\.0\.1/g) ?? []).length;
  const falseSpotifyConnectPrompt =
    context.musicConnections.spotifyConnected &&
    /(connect spotify|connect your music|connect spotify or apple music)/i.test(recipientText);
  const backendLimitationCopy =
    /(still building out your listening insights|listening insights are still catching up)/i.test(recipientText);
  const fakeUpcomingClaim =
    context.synthActivity.upcomingShows.length === 0 &&
    !context.synthActivity.recentlyInterestedEvents.some(
      (event) => new Date(event.eventDate).getTime() >= Date.now()
    ) &&
    /(next on your calendar|coming up near)/i.test(recipientText);

  const primaryCtas = resolved.newsletter.sections
    .filter((section) => !section.hidden && section.ctaLabel)
    .map((section) => ({
      type: section.type,
      label: String(section.ctaLabel),
    }));
  const ctaCounts = new Map<string, number>();
  primaryCtas.forEach((cta) => {
    ctaCounts.set(cta.label, (ctaCounts.get(cta.label) ?? 0) + 1);
  });
  const duplicatePrimaryCtas = [...ctaCounts.entries()]
    .filter((entry) => entry[1] > 1)
    .map((entry) => ({ cta: entry[0], count: entry[1] }));

  const editorialLinks = resolved.newsletter.sections
    .flatMap((section) => section.cards ?? [])
    .map((card) => card.ctaUrl)
    .filter((url): url is string => Boolean(url));
  const brokenEditorialLinks = editorialLinks.filter((url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol !== "http:" && parsed.protocol !== "https:";
    } catch {
      return true;
    }
  });
  const unrelatedEditorialLinks = editorialLinks.filter((url) => /localhost|127\.0\.0\.1/i.test(url));

  const checks = {
    unresolvedTokens,
    leakageHits,
    containsMockDataPhrases: /mock data|admin mock|admin-selected|fallback section|this block/i.test(textLower),
    containsAdminMetadata: /admin-selected|template mode|internal/i.test(textLower),
    implementationLanguageLeak: /personalized|fallback|interest signals|module/i.test(textLower),
    mojibakeHits,
    localhostHits,
    duplicatePrimaryCtas,
    falseSpotifyConnectPrompt,
    backendLimitationCopy,
    fakeUpcomingClaim,
    brokenEditorialLinks,
    unrelatedEditorialLinks,
  };

  console.log(
    JSON.stringify(
      {
        outputPath: OUTPUT_PATH,
        userId,
        state: resolved.state,
        contextSummary: {
          firstName: context.user.firstName,
          city: context.user.city,
          lifetimeConcertCount: context.synthActivity.lifetimeConcertCount,
          lifetimeReviewCount: context.synthActivity.lifetimeReviewCount,
          recentPhotos: context.synthActivity.recentPhotos.length,
          spotifyConnected: context.musicConnections.spotifyConnected,
          spotifyDataAvailable: context.musicConnections.spotifyDataAvailable,
          upcomingShows: context.synthActivity.upcomingShows.length,
          nearbyShows: context.recommendations.nearbyShows.length,
        },
        renderedSections: resolved.newsletter.sections
          .filter((section) => !section.hidden)
          .map((section) => ({
            id: section.id,
            type: section.type,
            label: section.label,
            headline: section.headline,
            ctaLabel: section.ctaLabel,
          })),
        checks,
      },
      null,
      2
    )
  );
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
