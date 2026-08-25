#!/usr/bin/env node
/**
 * LOI-598: apply enrollment RPC and print per-room dcIcpMemberCount.
 *
 * Prerequisites:
 *   - Migrations applied:
 *       20260825130000_chat_warmth_evaluator.sql
 *       20260825155202_enroll_wave1_seed_proxies.sql
 *   - Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *     (or VITE_SUPABASE_URL + key from .env.vercel)
 *
 * Usage (from repo root):
 *   node scripts/enroll-wave1-seed-proxies.mjs
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]]?.trim()) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

loadEnvFile(path.join(root, '.env.vercel'));
loadEnvFile(path.join(root, '.env.local'));
loadEnvFile(path.join(root, '.env'));

const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase.rpc('enroll_wave1_seed_proxies');
if (error) {
  console.error('enroll_wave1_seed_proxies failed:', error.message);
  console.error('Hint: apply warmth + enroll migrations first (see LOI-598 / LOI-577).');
  process.exit(1);
}

const rooms = Array.isArray(data?.rooms) ? data.rooms : [];
console.log(JSON.stringify(data, null, 2));

let ok = true;
for (const room of rooms) {
  const count = Number(room.dcIcpMemberCount ?? 0);
  const live = room.demoSeedLive === true;
  const membersOk = count >= 8;
  console.log(
    `${room.chatKey}: dcIcpMemberCount=${count} demoSeedLive=${live} membersOk=${membersOk} homeEligible=${room.homeEligible}`
  );
  if (!membersOk || !live) ok = false;
}

if (!ok) {
  console.error('FAIL: one or more live rooms under gate or missing demoSeedLive');
  process.exit(2);
}

console.log('OK: all live rooms report dcIcpMemberCount >= 8 with demoSeedLive');
