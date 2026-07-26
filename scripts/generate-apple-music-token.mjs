#!/usr/bin/env node
/**
 * Generate an Apple Music DEVELOPER TOKEN (a JWT) from your MusicKit .p8 key.
 *
 * This is the token `appleMusicService.ts` expects in VITE_APPLE_MUSIC_DEVELOPER_TOKEN.
 * Setting it makes Apple Music work on the WEB — and because mobile Apple Music
 * bounces to the same web flow, it makes mobile work too. No native MusicKit needed.
 *
 * Your MusicKit key (from Apple Developer → Keys):
 *   Key ID : P44PZX82GW   (AuthKey_P44PZX82GW.p8 — "Synth Media Services Key")
 *   Team ID: R6JXB945ND
 *
 * Requires jsonwebtoken:  npm i -D jsonwebtoken
 *
 * Usage:
 *   node scripts/generate-apple-music-token.mjs /path/to/AuthKey_P44PZX82GW.p8
 *   # or:  APPLE_MUSIC_KEY_PATH=... node scripts/generate-apple-music-token.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const TEAM_ID = (process.env.APPLE_TEAM_ID || 'R6JXB945ND').trim();
const KEY_ID = (process.env.APPLE_MUSIC_KEY_ID || 'P44PZX82GW').trim();
const keyPath = (process.argv[2] || process.env.APPLE_MUSIC_KEY_PATH || '').trim();

if (!keyPath) {
  console.error('Usage: node scripts/generate-apple-music-token.mjs <path-to-AuthKey_P44PZX82GW.p8>');
  process.exit(1);
}
if (!fs.existsSync(keyPath)) {
  console.error(`Key file not found: ${path.resolve(keyPath)}`);
  process.exit(1);
}

let jwt;
try {
  jwt = (await import('jsonwebtoken')).default;
} catch {
  console.error('Missing dependency. Run:  npm i -D jsonwebtoken');
  process.exit(1);
}

const privateKey = fs.readFileSync(keyPath, 'utf8');
// Apple caps developer tokens at 6 months. Regenerate + re-set the env var before it expires.
const SIX_MONTHS_SECONDS = 15777000;

const token = jwt.sign({}, privateKey, {
  algorithm: 'ES256',
  expiresIn: SIX_MONTHS_SECONDS,
  issuer: TEAM_ID,
  header: { alg: 'ES256', kid: KEY_ID },
});

console.log('\n=== Apple Music developer token (valid ~6 months) ===\n');
console.log(token);
console.log('\nSet it in Vercel (Production) as:');
console.log('  VITE_APPLE_MUSIC_DEVELOPER_TOKEN=' + '<the token above>');
console.log('\nThen redeploy web. Mobile Apple Music (web-bounce) starts working too.');
console.log('Reminder: this token expires in ~6 months — regenerate + update the env var before then.\n');
