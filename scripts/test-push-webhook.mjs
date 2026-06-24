#!/usr/bin/env node
/**
 * Smoke-test the production push webhook configuration.
 * Reads PUSH_WEBHOOK_SECRET from .env.local (or process.env).
 *
 * Usage: npm run push:test-webhook
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const WEBHOOK_URL =
  process.env.PUSH_WEBHOOK_URL?.trim() || 'https://join.getsynth.app/api/push-notification-webhook';

function loadSecretFromEnvLocal() {
  const envPath = path.join(repoRoot, '.env.local');
  if (!fs.existsSync(envPath)) return null;
  const match = fs.readFileSync(envPath, 'utf8').match(/^PUSH_WEBHOOK_SECRET=(.+)$/m);
  return match?.[1]?.trim() || null;
}

const secret = process.env.PUSH_WEBHOOK_SECRET?.trim() || loadSecretFromEnvLocal();

async function probe(label, headers) {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({}),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  console.log(`${label}: HTTP ${res.status}`);
  console.log(JSON.stringify(json, null, 2));
  console.log('');
  return res.status;
}

console.log(`Testing ${WEBHOOK_URL}\n`);

const noSecretStatus = await probe('Without secret', {});

if (!secret) {
  console.log('⚠️  No PUSH_WEBHOOK_SECRET in env or .env.local — cannot test authorized path.');
  console.log('   Run: npm run push:setup-webhook -- --write-env-local');
  if (noSecretStatus === 500) {
    console.log('❌ Production webhook is not configured (HTTP 500).');
    process.exit(1);
  }
  process.exit(1);
}

const badSecretStatus = await probe('Wrong secret', { 'x-webhook-secret': 'intentionally-wrong' });
const goodStatus = await probe('Valid secret (dry payload)', { 'x-webhook-secret': secret });

if (noSecretStatus === 500) {
  console.log('❌ Webhook returns 500 without secret → PUSH_WEBHOOK_SECRET is not set on Vercel (or deploy is stale).');
  process.exit(1);
}

if (badSecretStatus !== 401) {
  console.log('⚠️  Expected 401 for wrong secret; check webhook auth logic.');
}

if (goodStatus === 200) {
  console.log('✅ Webhook is configured. Dry payload accepted (skipped as non-notification INSERT).');
  process.exit(0);
}

console.log(`❌ Expected 200 with valid secret, got ${goodStatus}. Check Vercel env and redeploy.`);
process.exit(1);
