/**
 * Seed / ensure density scene rooms exist (service role).
 * Safe to re-run. Uses reserved genre entity ids until scene migration is applied.
 *
 * Usage:
 *   node scripts/seed-scene-rooms.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    let k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const env = {
  ...loadEnv(join(__dirname, '../.env.vercel')),
  ...loadEnv(join(__dirname, '../.env.local')),
};

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const ROOMS = [
  { id: 'dc-this-week', name: 'This week in DC' },
  { id: 'dc-going-out', name: 'Going out tonight / this weekend' },
];

const sb = createClient(url, key, { auth: { persistSession: false } });

for (const room of ROOMS) {
  // Prefer scene type if migration applied; else genre reserved id via RPC.
  const { data: sceneExisting } = await sb
    .from('chats')
    .select('id')
    .eq('entity_type', 'scene')
    .eq('entity_id', room.id)
    .maybeSingle();

  if (sceneExisting?.id) {
    console.log('scene ok', room.id, sceneExisting.id);
    continue;
  }

  const { data: chatId, error } = await sb.rpc('get_or_create_genre_chat', {
    p_genre_id: room.id,
    p_chat_name: room.name,
  });
  if (error) {
    console.error('fail', room.id, error.message);
    process.exitCode = 1;
    continue;
  }
  console.log('genre-reserved ok', room.id, chatId);
}
