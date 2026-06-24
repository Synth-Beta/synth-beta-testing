#!/usr/bin/env node
/**
 * Generate PUSH_WEBHOOK_SECRET and print Vercel + Supabase webhook setup steps.
 *
 * Usage:
 *   node scripts/setup-push-webhook.mjs
 *   node scripts/setup-push-webhook.mjs --write-env-local
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const WEBHOOK_URL =
  process.env.PUSH_WEBHOOK_URL?.trim() || 'https://join.getsynth.app/api/push-notification-webhook';
const SUPABASE_URL =
  process.env.SUPABASE_URL?.trim() || 'https://glpiolbrafqikqhnseto.supabase.co';
const SECRET = crypto.randomBytes(32).toString('base64url');

const writeEnvLocal = process.argv.includes('--write-env-local');
const envLocalPath = path.join(repoRoot, '.env.local');

console.log('');
console.log('=== Synth push webhook setup (Vercel path) ===');
console.log('');
console.log('Generated PUSH_WEBHOOK_SECRET (save this — shown once):');
console.log('');
console.log(`  ${SECRET}`);
console.log('');

if (writeEnvLocal) {
  const line = `PUSH_WEBHOOK_SECRET=${SECRET}`;
  if (fs.existsSync(envLocalPath)) {
    const existing = fs.readFileSync(envLocalPath, 'utf8');
    if (/^PUSH_WEBHOOK_SECRET=/m.test(existing)) {
      console.log('⚠️  .env.local already has PUSH_WEBHOOK_SECRET — not overwriting.');
    } else {
      fs.appendFileSync(envLocalPath, `\n# Push notification webhook (local testing only)\n${line}\n`);
      console.log(`✅ Appended PUSH_WEBHOOK_SECRET to ${envLocalPath}`);
    }
  } else {
    fs.writeFileSync(envLocalPath, `# Local secrets — never commit\n${line}\n`, 'utf8');
    console.log(`✅ Created ${envLocalPath} with PUSH_WEBHOOK_SECRET`);
  }
  console.log('');
}

console.log('1) Vercel → Project (join.getsynth.app) → Settings → Environment Variables');
console.log('   Add for Production (+ Preview if you test there):');
console.log('');
console.log('   PUSH_WEBHOOK_SECRET       = (secret above)');
console.log('   EXPO_ACCESS_TOKEN         = Expo access token (expo.dev → Access tokens)');
console.log(`   SUPABASE_URL              = ${SUPABASE_URL}`);
console.log('   SUPABASE_SERVICE_ROLE_KEY = (service role key from Supabase dashboard)');
console.log('');
console.log('2) Redeploy production after saving env vars.');
console.log('');
console.log('3) Supabase → Database → Webhooks → Create hook');
console.log('   Name:     push-notifications-insert');
console.log('   Table:    public.notifications');
console.log('   Events:   Insert');
console.log('   Method:   POST');
console.log(`   URL:      ${WEBHOOK_URL}`);
console.log('   Headers:  x-webhook-secret = (same PUSH_WEBHOOK_SECRET as Vercel)');
console.log('');
console.log('4) Verify: npm run push:test-webhook');
console.log('');
console.log('5) E2E: run scripts/test-push-e2e.sql in Supabase SQL Editor');
console.log('');
