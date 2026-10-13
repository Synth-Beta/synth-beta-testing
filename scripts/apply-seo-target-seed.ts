/**
 * Upsert published seo_content rows for every seo_target_queries seed (no OpenAI required).
 * Rich copy lives in supabase/migrations/20261012140000_seo_target_pages_seed.sql for SQL apply;
 * this script uses the same slugs/titles and template bodies so targets show "published" + live links.
 *
 *   DOTENV_CONFIG_PATH=.env.vercel.prod npx tsx scripts/apply-seo-target-seed.ts
 */
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: process.env.DOTENV_CONFIG_PATH ?? '.env.vercel.prod', quiet: true });

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

type Seed = { query: string; slug: string; title: string; meta: string; summary: string; body_md: string; faq: unknown[]; keywords: string[] };

/** Parse seo_seed_target_page(...) calls from the seed migration (strings only, no function needed). */
function loadSeedsFromMigration(): Seed[] {
  const sql = readFileSync(new URL('../supabase/migrations/20261012140000_seo_target_pages_seed.sql', import.meta.url), 'utf8');
  const seeds: Seed[] = [];
  const blocks = sql.split('SELECT public.seo_seed_target_page(').slice(1);
  for (const block of blocks) {
    const strings: string[] = [];
    let i = 0;
    while (i < block.length) {
      const q = block.indexOf("'", i);
      if (q < 0) break;
      // E'...' and '...' both start parsing after the opening quote (do not skip an extra char after E').
      const start = q + 1;
      let end = start;
      let value = '';
      while (end < block.length) {
        const ch = block[end];
        if (ch === "'" && block[end + 1] === "'") {
          value += "'";
          end += 2;
          continue;
        }
        if (ch === "'") {
          end += 1;
          break;
        }
        value += ch;
        end += 1;
      }
      strings.push(value);
      i = end;
      if (strings.length >= 6) break;
    }
    if (strings.length < 6) continue;
    const faqMatch = block.match(/'(\[\{.*?\}\])'::jsonb/s);
    const kwMatch = block.match(/ARRAY\[([^\]]*)\]/);
    seeds.push({
      query: strings[0],
      slug: strings[1],
      title: strings[2],
      meta: strings[3],
      summary: strings[4],
      body_md: strings[5].replace(/''/g, "'").replace(/\\n/g, '\n'),
      faq: faqMatch ? JSON.parse(faqMatch[1]) : [],
      keywords: kwMatch
        ? kwMatch[1]
            .split(',')
            .map((k) => k.trim().replace(/^'|'$/g, ''))
            .filter(Boolean)
        : [],
    });
  }
  return seeds;
}

const seeds = loadSeedsFromMigration();
console.log(`Parsed ${seeds.length} seed page(s) from migration.`);

const { data: targets, error: tErr } = await db.from('seo_target_queries').select('id,query,page_type');
if (tErr) throw new Error(tErr.message);
const byQuery = new Map((targets ?? []).map((t) => [t.query as string, t]));

const now = new Date().toISOString();
let ok = 0;
for (const seed of seeds) {
  const target = byQuery.get(seed.query);
  if (!target) {
    console.warn('No target row for:', seed.query);
    continue;
  }
  const row = {
    target_query_id: target.id,
    page_type: target.page_type,
    slug: seed.slug,
    title: seed.title,
    meta_description: seed.meta,
    summary: seed.summary,
    body_md: seed.body_md,
    faq: seed.faq,
    keywords: seed.keywords,
    status: 'published',
    model: 'seed-v1',
    published_at: now,
    updated_at: now,
  };
  const { error } = await db.from('seo_content').upsert(row, { onConflict: 'page_type,slug' });
  if (error) {
    console.error('FAIL', seed.query, error.message);
  } else {
    ok += 1;
    const prefix = target.page_type === 'guide' ? 'guides' : target.page_type === 'brand' ? 'learn' : 'compare';
    console.log(`https://getsynth.app/${prefix}/${seed.slug}`);
  }
}
console.log(`\nUpserted ${ok}/${seeds.length} published pages.`);
