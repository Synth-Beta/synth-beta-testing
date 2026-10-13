/**
 * Generate and publish SEO pages for every active target search that does not have one yet.
 *   npx tsx scripts/seo-generate-target-pages.ts
 *   npx tsx scripts/seo-generate-target-pages.ts --dry-run
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY + OPENAI_API_KEY from .env.vercel / .env.local.
 */
import { config } from 'dotenv';
import { generateAndPublishTarget, targetsNeedingPages } from '../api/_lib/cron/seoContent.ts';
import { seoServiceClient } from '../api/_lib/seo/jobAuth.ts';
import { openAiKey } from '../api/_lib/seo/llm.ts';

config({ path: ['.env.vercel', '.env.local', '.env'], quiet: true });

const dryRun = process.argv.includes('--dry-run');

const db = seoServiceClient();
if (!db) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!openAiKey()) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}
const targets = await targetsNeedingPages(db);
console.log(`${targets.length} target(s) without a published page.`);
if (dryRun) {
  for (const t of targets) console.log(`- [${t.page_type}] ${t.query}`);
  process.exit(0);
}

const results: Array<{ query: string; url?: string; error?: string }> = [];
for (let i = 0; i < targets.length; i += 1) {
  const target = targets[i];
  process.stdout.write(`[${i + 1}/${targets.length}] ${target.query} … `);
  try {
    const out = await generateAndPublishTarget(db, target);
    results.push({ query: target.query, url: out.url });
    console.log(out.url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({ query: target.query, error: message });
    console.log('FAILED');
    console.error(`  ${message}`);
  }
}

const ok = results.filter((r) => r.url);
const bad = results.filter((r) => r.error);
console.log(`\nPublished ${ok.length}/${targets.length}.`);
if (ok.length) {
  console.log('\nLive URLs:');
  for (const r of ok) console.log(`  ${r.url}`);
}
if (bad.length) {
  console.log('\nFailures:');
  for (const r of bad) console.log(`  ${r.query}: ${r.error}`);
  process.exit(1);
}
