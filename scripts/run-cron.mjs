#!/usr/bin/env node
/**
 * Run a Vercel cron handler on this machine, using .env.local.
 *
 *   node scripts/run-cron.mjs slack-pm-digest
 *   node scripts/run-cron.mjs seo-indexnow
 *   node scripts/run-cron.mjs ai-scene-guides schedule
 *
 * Jobs: sync-events, seed-bot-messages, slack-pm-digest, engagement-notifications,
 * newsletter-send, seo-indexnow, seo-content, seo-search-data, seo-ai-visibility,
 * ai-scene-guides <schedule|publish|shadow>
 */
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env.local');
try {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    if (process.env[key]) continue;
    let value = line.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
} catch {
  console.error(`Could not read ${envPath}`);
  process.exit(1);
}

register('./cron-ts-loader.mjs', { parentURL: import.meta.url });

const job = process.argv[2];
const sub = process.argv[3];
if (!job) {
  console.error('Usage: node scripts/run-cron.mjs <job> [ai-scene-guides subjob]');
  process.exit(1);
}
if (!process.env.CRON_SECRET) {
  console.error('CRON_SECRET is missing from .env.local');
  process.exit(1);
}

const entry =
  job === 'ai-scene-guides'
    ? '../api/ai-scene-guides.ts'
    : '../api/cron/index.ts';
const queryJob = job === 'ai-scene-guides' ? sub || 'publish' : job;

const { default: handler } = await import(entry);
if (process.argv.includes('--check')) {
  console.log(`loaded ${queryJob}`);
  process.exit(0);
}

const req = {
  method: 'POST',
  url: `http://localhost/api/cron?job=${encodeURIComponent(queryJob)}`,
  headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  query: { job: queryJob },
  body: {},
};

let statusCode = 200;
const res = {
  status(code) {
    statusCode = code;
    return this;
  },
  setHeader() {
    return this;
  },
  json(body) {
    console.log(JSON.stringify({ status: statusCode, body }, null, 2));
    return this;
  },
  end(body) {
    if (body) console.log(String(body));
    return this;
  },
};

await handler(req, res);
process.exit(statusCode >= 400 ? 1 : 0);
