#!/usr/bin/env node
/**
 * Classic Slack Incoming Webhook → Vercel env setup (no Slack next-gen CLI).
 *
 * Usage:
 *   export SLACK_SIGNUP_WEBHOOK_URL='https://hooks.slack.com/services/...'
 *   node scripts/setup-slack-signup-webhook.mjs --write-env-local --push-vercel
 *
 * Requires: vercel login (working CLI session or VERCEL_TOKEN)
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const WEBHOOK_API_URL =
  process.env.SLACK_SIGNUP_API_URL?.trim() ||
  'https://join.getsynth.app/api/slack-signup-webhook';

const writeEnvLocal = process.argv.includes('--write-env-local');
const pushVercel = process.argv.includes('--push-vercel');

const existingSecret = process.env.SLACK_SIGNUP_WEBHOOK_SECRET?.trim();
const SECRET = existingSecret || crypto.randomBytes(32).toString('base64url');

const slackWebhookUrl = process.env.SLACK_SIGNUP_WEBHOOK_URL?.trim() || '';

console.log('');
console.log('=== Synth Slack signup webhook setup (classic Incoming Webhook) ===');
console.log('');
console.log('SLACK_SIGNUP_WEBHOOK_SECRET:');
console.log(`  ${SECRET}`);
console.log('');
if (slackWebhookUrl) {
  console.log('SLACK_SIGNUP_WEBHOOK_URL (from env):');
  console.log(`  ${slackWebhookUrl.slice(0, 40)}…`);
  console.log('');
} else {
  console.log('SLACK_SIGNUP_WEBHOOK_URL: not set yet.');
  console.log('  1. Open https://api.slack.com/apps → Create New App → From scratch');
  console.log('  2. Name: Synth Signup Alerts → pick workspace');
  console.log('  3. Incoming Webhooks → On → Add New Webhook to Workspace');
  console.log('  4. Pick your #channel → copy the Webhook URL');
  console.log('  5. export SLACK_SIGNUP_WEBHOOK_URL=<url>');
  console.log('  6. Re-run with --push-vercel');
  console.log('');
}

if (writeEnvLocal) {
  const envLocalPath = path.join(repoRoot, '.env.local');
  const lines = [
    `SLACK_SIGNUP_WEBHOOK_SECRET=${SECRET}`,
    slackWebhookUrl ? `SLACK_SIGNUP_WEBHOOK_URL=${slackWebhookUrl}` : null,
  ].filter(Boolean);

  let existing = '';
  if (fs.existsSync(envLocalPath)) {
    existing = fs.readFileSync(envLocalPath, 'utf8');
  }

  let next = existing;
  for (const line of lines) {
    const key = line.split('=')[0];
    if (new RegExp(`^${key}=`, 'm').test(next)) {
      next = next.replace(new RegExp(`^${key}=.*$`, 'm'), line);
    } else {
      next = `${next.trimEnd()}\n# Slack signup webhook (classic)\n${line}\n`;
    }
  }
  fs.writeFileSync(envLocalPath, next.startsWith('\n') ? next.slice(1) : next, 'utf8');
  console.log(`✅ Wrote Slack signup env vars to ${envLocalPath}`);
  console.log('');
}

function vercelEnvAdd(key, value, environment) {
  const result = spawnSync(
    'vercel',
    ['env', 'add', key, environment, '--value', value, '--yes', '--force'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: process.env,
    },
  );
  if (result.status !== 0) {
    const fallback = spawnSync('vercel', ['env', 'add', key, environment, '--force'], {
      cwd: repoRoot,
      encoding: 'utf8',
      input: `${value}\n`,
      env: process.env,
    });
    if (fallback.status !== 0) {
      console.error(fallback.stderr || fallback.stdout || result.stderr || result.stdout);
      throw new Error(`Failed to set ${key} for ${environment}`);
    }
  }
  console.log(`✅ Vercel ${environment}: ${key}`);
}

if (pushVercel) {
  if (!slackWebhookUrl) {
    console.error('Missing SLACK_SIGNUP_WEBHOOK_URL — export it before --push-vercel');
    process.exit(1);
  }
  const environments = ['production', 'preview', 'development'];
  for (const env of environments) {
    vercelEnvAdd('SLACK_SIGNUP_WEBHOOK_SECRET', SECRET, env);
    vercelEnvAdd('SLACK_SIGNUP_WEBHOOK_URL', slackWebhookUrl, env);
  }
  console.log('');
  console.log('Redeploy production so the function picks up env vars:');
  console.log('  vercel --prod');
  console.log('');
}

console.log('Supabase → Database → Webhooks → Create');
console.log(`  Table: public.users | Events: Insert`);
console.log(`  URL: ${WEBHOOK_API_URL}`);
console.log('  Header: x-webhook-secret = (secret above)');
console.log('');
console.log('Test:');
console.log(`  curl -X POST ${WEBHOOK_API_URL} \\`);
console.log(`    -H "Content-Type: application/json" \\`);
console.log(`    -H "x-webhook-secret: ${SECRET}" \\`);
console.log(
  `    -d '{"type":"INSERT","table":"users","schema":"public","record":{"user_id":"test","username":"testuser","email":"test@example.com"}}'`,
);
console.log('');
