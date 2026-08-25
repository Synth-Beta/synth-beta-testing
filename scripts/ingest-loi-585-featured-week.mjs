#!/usr/bin/env node
/**
 * Ingest LOI-585 featured DC set into weekly_featured_* SoT (LOI-601).
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or VITE_* / .env.vercel equivalents).
 * Tables must exist (LOI-615 migration applied, including RPC join fix).
 *
 * Usage:
 *   node scripts/ingest-loi-585-featured-week.mjs
 *   node scripts/ingest-loi-585-featured-week.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const seedPath = path.join(root, 'docs/curation/loi-585-featured-week-2026-W35.json');
const dryRun = process.argv.includes('--dry-run');

function loadEnvFile(file) {
  try {
    const env = fs.readFileSync(file, 'utf8');
    const out = {};
    for (const line of env.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    return out;
  } catch {
    return {};
  }
}

const fileEnv = {
  ...loadEnvFile(path.join(root, '.env.local')),
  ...loadEnvFile(path.join(root, '.env.vercel')),
};

const url =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  fileEnv.SUPABASE_URL ||
  fileEnv.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const pins = seed.pins.map((p) => ({
  event_id: p.eventId,
  position: p.position,
  genre: p.genre,
  curator_note: p.curatorNote,
}));

console.log(
  `Ingest ${seed.weekId} · ${pins.length} pins · status=${seed.status}` +
    (dryRun ? ' (dry-run)' : '')
);

if (dryRun) {
  console.log(JSON.stringify({ weekId: seed.weekId, pins }, null, 2));
  process.exit(0);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function rest(method, pathSuffix, body, extraHeaders = {}) {
  const res = await fetch(`${url}/rest/v1/${pathSuffix}`, {
    method,
    headers: { ...headers, ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    console.error(`${method} ${pathSuffix} -> ${res.status}`, data);
    process.exit(1);
  }
  return data;
}

const setRows = await rest(
  'POST',
  'weekly_featured_sets?on_conflict=metro,week_id',
  {
    metro: seed.metro,
    week_id: seed.weekId,
    week_start_date: seed.weekStartDate,
    status: 'draft',
    target_count: seed.targetCount,
    notes: seed.notes,
  },
  { Prefer: 'resolution=merge-duplicates,return=representation' }
);
const setRow = Array.isArray(setRows) ? setRows[0] : setRows;
if (!setRow?.id) {
  console.error('upsert set returned no id', setRows);
  process.exit(1);
}

await rest('DELETE', `weekly_featured_items?set_id=eq.${setRow.id}`);

await rest(
  'POST',
  'weekly_featured_items',
  pins.map((p) => ({ set_id: setRow.id, ...p }))
);

if (seed.status === 'published') {
  await rest('PATCH', `weekly_featured_sets?id=eq.${setRow.id}`, {
    status: 'published',
    published_at: new Date().toISOString(),
  });
}

const verifyRes = await fetch(`${url}/rest/v1/rpc/get_weekly_featured_set`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ p_metro: seed.metro, p_week_id: seed.weekId }),
});
const verifyText = await verifyRes.text();
let verify;
try {
  verify = verifyText ? JSON.parse(verifyText) : null;
} catch {
  verify = verifyText;
}
if (!verifyRes.ok) {
  console.error('verify rpc failed', verifyRes.status, verify);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      setId: setRow.id,
      weekId: seed.weekId,
      showCount: (verify || []).length,
      titles: (verify || []).map((r) => `${r.position}. ${r.event_title}`),
    },
    null,
    2
  )
);
