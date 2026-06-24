#!/usr/bin/env node
/**
 * Synth production infra setup (Vercel + Supabase + GitHub).
 *
 * Prerequisites:
 *   - vercel login (TejandSam / getplus1events account)
 *   - supabase login --token <token>  OR  export SUPABASE_ACCESS_TOKEN=...
 *   - .env.local with PUSH_WEBHOOK_SECRET (for webhook smoke test)
 *
 * Usage:
 *   node scripts/infra-setup.mjs              # run all steps
 *   node scripts/infra-setup.mjs --vercel     # Vercel env + redeploy only
 *   node scripts/infra-setup.mjs --supabase   # link + apply trigger migration
 *   node scripts/infra-setup.mjs --test       # webhook smoke test only
 *
 * Optional env:
 *   DB_PASSWORD              — apply migration via pooler if CLI link fails
 *   EXPO_ACCESS_TOKEN        — set GitHub EXPO_TOKEN secret for EAS CI
 *   SUPABASE_ACCESS_TOKEN    — Supabase CLI auth (Synth org account)
 */

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const PROJECT_REF = 'glpiolbrafqikqhnseto';
const VERCEL_SCOPE = 'tejandsams-projects';
const VERCEL_PROJECT = 'synth-beta-testing';
const WEBHOOK_URL = 'https://join.getsynth.app/api/push-notification-webhook';
const GITHUB_REPO = 'Synth-Beta/synth-beta-testing';
const MIGRATION_FILE = path.join(
  repoRoot,
  'supabase/migrations/20260624140000_disable_push_queue_trigger_use_webhook.sql',
);

const flags = new Set(process.argv.slice(2));
const runAll = flags.size === 0;
const runVercel = runAll || flags.has('--vercel');
const runSupabase = runAll || flags.has('--supabase');
const runTest = runAll || flags.has('--test');

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}\n`);
  return execSync(cmd, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, ...opts.env },
  });
}

function runCapture(cmd) {
  return execSync(cmd, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function loadPushSecret() {
  if (process.env.PUSH_WEBHOOK_SECRET?.trim()) {
    return process.env.PUSH_WEBHOOK_SECRET.trim();
  }
  const envLocal = path.join(repoRoot, '.env.local');
  if (!fs.existsSync(envLocal)) return null;
  const match = fs.readFileSync(envLocal, 'utf8').match(/^PUSH_WEBHOOK_SECRET=(.+)$/m);
  return match?.[1]?.trim() || null;
}

function vercelEnvExists(name) {
  try {
    const out = runCapture(
      `vercel env ls production -S ${VERCEL_SCOPE} 2>/dev/null | rg "^ ${name} " || true`,
    );
    return out.includes(name);
  } catch {
    return false;
  }
}

function stepVercel() {
  console.log('\n=== Vercel (join.getsynth.app) ===\n');
  run(`vercel link --yes --project ${VERCEL_PROJECT} --scope ${VERCEL_SCOPE}`);

  const secret = loadPushSecret();
  if (!secret) {
    console.warn('⚠️  No PUSH_WEBHOOK_SECRET in .env.local — skip vercel env add.');
    console.warn('   Run: npm run push:setup-webhook -- --write-env-local');
  } else if (!vercelEnvExists('PUSH_WEBHOOK_SECRET')) {
    spawnSync(
      'vercel',
      ['env', 'add', 'PUSH_WEBHOOK_SECRET', 'production', '-S', VERCEL_SCOPE],
      { cwd: repoRoot, input: secret, stdio: ['pipe', 'inherit', 'inherit'] },
    );
    console.log('✅ Added PUSH_WEBHOOK_SECRET to Vercel production');
  } else {
    console.log('✅ PUSH_WEBHOOK_SECRET already set on Vercel');
  }

  console.log('\nRedeploying current production (picks up env without full git build)…');
  const deploymentId = runCapture(
    `vercel inspect join.getsynth.app -S ${VERCEL_SCOPE} 2>/dev/null | rg '^\\s+id\\s' | awk '{print $2}'`,
  );
  if (deploymentId) {
    run(`vercel redeploy ${deploymentId} --target production -S ${VERCEL_SCOPE}`);
  } else {
    console.warn('⚠️  Could not resolve deployment id; push to main or redeploy manually.');
  }
}

function stepSupabase() {
  console.log('\n=== Supabase (glpiolbrafqikqhnseto) ===\n');

  if (!fs.existsSync(MIGRATION_FILE)) {
    throw new Error(`Migration not found: ${MIGRATION_FILE}`);
  }

  const dbPassword = process.env.DB_PASSWORD?.trim();
  const hasSupabaseToken =
    Boolean(process.env.SUPABASE_ACCESS_TOKEN?.trim()) ||
    Boolean(process.env.SB_ACCESS_TOKEN?.trim());

  if (!hasSupabaseToken && !dbPassword) {
    console.log('Supabase CLI needs the Synth org account (not NexusAnalyst).');
    console.log('');
    console.log('  1. Create token: https://supabase.com/dashboard/account/tokens');
    console.log('  2. Login:        npx supabase login --token YOUR_TOKEN');
    console.log('  3. Re-run:        node scripts/infra-setup.mjs --supabase');
    console.log('');
    console.log('Or set DB_PASSWORD and this script will apply via pooler URL.');
    process.exit(1);
  }

  if (hasSupabaseToken) {
    run(`npx supabase link --project-ref ${PROJECT_REF} --yes`);
    run(`npx supabase db query --linked -f "${MIGRATION_FILE}"`);
  } else {
    const dbUrl = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(dbPassword)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
    run(`npx supabase db query --db-url "${dbUrl}" -f "${MIGRATION_FILE}"`);
  }

  console.log('\n✅ Applied migration (disabled trigger_queue_push_notification).');
  console.log('');
  console.log('Manual step — Supabase Dashboard → Database → Webhooks → Create:');
  console.log('  Name:    push-notifications-insert');
  console.log('  Table:   public.notifications');
  console.log('  Event:   Insert');
  console.log('  Method:  POST');
  console.log(`  URL:     ${WEBHOOK_URL}`);
  console.log('  Header:  x-webhook-secret = (same PUSH_WEBHOOK_SECRET as Vercel)');
}

function stepGithubExpo() {
  const expo = process.env.EXPO_ACCESS_TOKEN?.trim();
  if (!expo) {
    console.log('\n⚠️  EXPO_ACCESS_TOKEN not in env — skip GitHub secret (set manually for EAS CI).');
    return;
  }
  spawnSync('gh', ['secret', 'set', 'EXPO_TOKEN', '--repo', GITHUB_REPO], {
    cwd: repoRoot,
    input: expo,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  console.log(`✅ Set EXPO_TOKEN secret on ${GITHUB_REPO}`);
}

function stepTest() {
  console.log('\n=== Webhook smoke test ===\n');
  run('npm run push:test-webhook');
}

try {
  if (runVercel) stepVercel();
  if (runSupabase) {
    stepSupabase();
    stepGithubExpo();
  }
  if (runTest) stepTest();
  console.log('\nDone.\n');
} catch (e) {
  console.error('\n❌ Infra setup failed:', e instanceof Error ? e.message : e);
  process.exit(1);
}
