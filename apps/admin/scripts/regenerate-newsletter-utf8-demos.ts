import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { newsletters } from "../src/data/newsletters";
import {
  buildPersonalizationContextForUser,
  getMockPersonalizationContext,
  resolveNewsletterForContext,
} from "../src/lib/newsletterPersonalization";
import { renderNewsletterHtml } from "../src/lib/newsletterRenderer";
import { supabase } from "../src/integrations/supabase/client";

const OUT_DIR = resolve(process.cwd(), "public/newsletter-demos/design-previews");
const SAM_OUT = resolve(process.cwd(), "public/newsletter-demos/sam-v2-demo.html");
const TARGET_USERNAME = "sloiterstein";

const PRESETS = [
  { id: "active-user", file: "active-user.html" },
  { id: "spotify-connected-user", file: "streaming-connected-user.html" },
  { id: "inactive-with-history", file: "historical-data-user.html" },
  { id: "brand-new-user", file: "zero-data-user.html" },
] as const;

const MOJIBAKE_PATTERNS = ["Â", "â€™", "â€œ", "â€", "�"] as const;

const scanMojibake = (html: string) =>
  MOJIBAKE_PATTERNS.filter((pattern) => html.includes(pattern));

const assertUtf8Document = (html: string, label: string) => {
  if (!/<meta\s+charset=["']?utf-8["']?\s*\/?>/i.test(html)) {
    throw new Error(`${label} is missing <meta charset="utf-8">`);
  }
  const hits = scanMojibake(html);
  if (hits.length > 0) {
    throw new Error(`${label} contains mojibake patterns: ${hits.join(", ")}`);
  }
};

const writeUtf8Html = async (path: string, html: string) => {
  await writeFile(path, html, { encoding: "utf8" });
};

const run = async () => {
  const issue = newsletters.find((item) => item.slug === "august-5-2026") ?? newsletters[0];
  await mkdir(OUT_DIR, { recursive: true });

  for (const preset of PRESETS) {
    const context = getMockPersonalizationContext(preset.id);
    if (preset.id === "brand-new-user") {
      context.user.city = undefined;
      context.user.location = undefined;
      context.recommendations.nearbyShows = [];
      context.recommendations.relevantArtists = [];
      context.recommendations.relevantVenues = [];
    }
    const resolved = resolveNewsletterForContext(issue, context, "resolved");
    const html = renderNewsletterHtml(resolved.newsletter, {
      mode: "email",
      absoluteBaseUrl: "https://getsynth.app",
    });
    assertUtf8Document(html, preset.file);
    const outPath = resolve(OUT_DIR, preset.file);
    await writeUtf8Html(outPath, html);
  }

  const { data: matchedUsers, error } = await (supabase as any)
    .from("users")
    .select("user_id, username")
    .eq("username", TARGET_USERNAME);

  if (error) throw new Error(`Failed user lookup: ${error.message}`);
  const exactMatches = (matchedUsers ?? []).filter(
    (row: any) => String(row.username) === TARGET_USERNAME
  );
  if (exactMatches.length !== 1) {
    throw new Error(
      `Expected exactly 1 user for username "${TARGET_USERNAME}", found ${exactMatches.length}.`
    );
  }

  const userId = String(exactMatches[0].user_id);
  const context = await buildPersonalizationContextForUser(userId);
  const resolved = resolveNewsletterForContext(issue, context, "resolved");
  const samHtml = renderNewsletterHtml(resolved.newsletter, {
    mode: "email",
    absoluteBaseUrl: "https://getsynth.app",
  });
  assertUtf8Document(samHtml, "sam-v2-demo.html");
  await writeUtf8Html(SAM_OUT, samHtml);

  const generatedPaths = [
    ...PRESETS.map((preset) => resolve(OUT_DIR, preset.file)),
    SAM_OUT,
  ];

  const scanResults = [];
  for (const path of generatedPaths) {
    const { readFile } = await import("node:fs/promises");
    const html = await readFile(path, "utf8");
    scanResults.push({
      path,
      hasCharsetMeta: /<meta\s+charset=["']?utf-8["']?\s*\/?>/i.test(html),
      mojibakeMatches: scanMojibake(html),
    });
  }

  const failed = scanResults.filter(
    (row) => !row.hasCharsetMeta || row.mojibakeMatches.length > 0
  );

  console.log(
    JSON.stringify(
      {
        samUserId: userId,
        samPath: SAM_OUT,
        scanResults,
        failedCount: failed.length,
      },
      null,
      2
    )
  );

  if (failed.length > 0) process.exit(1);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
