#!/usr/bin/env node
/**
 * Classic Slack app env setup for Synth PM (same tooling as signup/alerts webhooks).
 *
 * 1. Create app from slack/synth-pm/manifest.json at https://api.slack.com/apps
 * 2. Install to workspace → copy Bot token + Signing Secret
 * 3. export SLACK_PM_BOT_TOKEN=… SLACK_PM_SIGNING_SECRET=…
 * 4. node scripts/setup-slack-pm.mjs --write-env-local --push-vercel
 * 5. Apply supabase/migrations/20260729120000_slack_pm.sql
 * 6. vercel --prod
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const writeEnvLocal = process.argv.includes('--write-env-local');
const pushVercel = process.argv.includes('--push-vercel');

const botToken = process.env.SLACK_PM_BOT_TOKEN?.trim() || '';
const signingSecret = process.env.SLACK_PM_SIGNING_SECRET?.trim() || '';
const openaiKey = process.env.OPENAI_API_KEY?.trim() || '';

console.log('');
console.log('=== Synth Slack PM setup (classic app) ===');
console.log('');

if (!botToken || !signingSecret) {
  console.log('Set these first:');
  console.log('  export SLACK_PM_BOT_TOKEN=xoxb-…');
  console.log('  export SLACK_PM_SIGNING_SECRET=…');
  console.log('  # optional: export OPENAI_API_KEY=…');
  console.log('');
  console.log('Create the app from slack/synth-pm/manifest.json');
  console.log('  https://api.slack.com/apps → Create New App → From an app manifest');
  console.log('');
  if (pushVercel) process.exit(1);
}

function upsertEnvFile(filePath, entries) {
  let existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  for (const [key, value] of Object.entries(entries)) {
    if (!value) continue;
    const line = `${key}=${value}`;
    if (new RegExp(`^${key}=`, 'm').test(existing)) {
      existing = existing.replace(new RegExp(`^${key}=.*$`, 'm'), line);
    } else {
      existing = `${existing.trimEnd()}\n# Synth Slack PM\n${line}\n`;
    }
  }
  fs.writeFileSync(filePath, existing, 'utf8');
}

if (writeEnvLocal && botToken && signingSecret) {
  const envLocalPath = path.join(repoRoot, '.env.local');
  upsertEnvFile(envLocalPath, {
    SLACK_PM_BOT_TOKEN: botToken,
    SLACK_PM_SIGNING_SECRET: signingSecret,
    ...(openaiKey ? { OPENAI_API_KEY: openaiKey } : {}),
  });
  console.log(`✅ Wrote Slack PM env vars to ${envLocalPath}`);
  console.log('');
}

function vercelEnvAdd(key, value, environment) {
  const result = spawnSync(
    'vercel',
    ['env', 'add', key, environment, '--force', '--value', value, '--yes'],
    { cwd: repoRoot, encoding: 'utf8', env: process.env },
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
  if (!botToken || !signingSecret) {
    console.error('Missing SLACK_PM_BOT_TOKEN or SLACK_PM_SIGNING_SECRET');
    process.exit(1);
  }
  for (const env of ['production', 'preview', 'development']) {
    vercelEnvAdd('SLACK_PM_BOT_TOKEN', botToken, env);
    vercelEnvAdd('SLACK_PM_SIGNING_SECRET', signingSecret, env);
    if (openaiKey) vercelEnvAdd('OPENAI_API_KEY', openaiKey, env);
  }
  console.log('');
  console.log('Apply SQL migration, then: vercel --prod');
  console.log('  supabase/migrations/20260729120000_slack_pm.sql');
  console.log('');
}

console.log('Endpoints (after deploy):');
console.log('  Commands:      https://join.getsynth.app/api/slack-pm/commands');
console.log('  Interactions: https://join.getsynth.app/api/slack-pm/interactions');
console.log('');
console.log('Test in Slack: /task help');
console.log('');
