#!/usr/bin/env node
/**
 * Security check — run with `npm run security:audit` (also part of `npm run build:verify`
 * and the security-check GitHub workflow).
 *
 * 1. Scans every git-tracked file for things that look like real secrets
 *    (Supabase secret/service-role keys, Stripe live keys, OpenAI/Anthropic keys,
 *    AWS keys, private keys, Slack tokens/webhooks, GitHub tokens).
 * 2. Fails if a .env file (other than *.example) is tracked.
 * 3. If a build exists in dist/, scans the shipped JS for server-only secrets
 *    (anything in the browser bundle is public).
 *
 * Supabase publishable / anon keys are meant to be public and are not flagged.
 * Exit code 1 on any finding.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PATTERNS = [
  ['Supabase secret key', /\bsb_secret_[A-Za-z0-9_-]{16,}/],
  ['Supabase service_role JWT', /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJ[A-Za-z0-9_-]*InJvbGUiOiJzZXJ2aWNlX3JvbGUi[A-Za-z0-9_-]*\.[A-Za-z0-9_-]{20,}/],
  ['Stripe live secret key', /\b(sk|rk)_live_[A-Za-z0-9]{16,}/],
  ['OpenAI key', /\bsk-(proj-)?[A-Za-z0-9_-]{32,}/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Private key block', /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['Slack token', /\bxox[baprs]-[0-9]{6,}-[A-Za-z0-9-]{10,}/],
  ['Slack webhook URL', /hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]{16,}/],
  ['GitHub token', /\b(ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{30,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
];

const SKIP = [/^graphify-out\//, /package-lock\.json$/, /\.(png|jpe?g|gif|webp|mp3|mp4|woff2?|ttf|ico|pdf)$/i, /^scripts\/security-check\.mjs$/];

const findings = [];

function scanText(label, text) {
  for (const [name, re] of PATTERNS) {
    const m = text.match(re);
    if (m) findings.push(`${label}: ${name} (${m[0].slice(0, 12)}…)`);
  }
}

// 1 + 2: tracked files
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
for (const file of tracked) {
  const base = file.split('/').pop();
  if (/^\.env(\..+)?$/.test(base) && !/example/i.test(base)) {
    findings.push(`${file}: .env file is committed — remove it and rotate its keys`);
  }
  if (SKIP.some((re) => re.test(file))) continue;
  let st;
  try { st = statSync(file); } catch { continue; }
  if (!st.isFile() || st.size > 2_000_000) continue;
  scanText(file, readFileSync(file, 'utf8'));
}

// 3: built bundle
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (/\.(js|mjs|html|json)$/.test(name)) {
      const text = readFileSync(p, 'utf8');
      scanText(p, text);
      if (/SUPABASE_SERVICE_ROLE_KEY|service_role/.test(text) && /eyJ[A-Za-z0-9_-]{20,}\.eyJ/.test(text)) {
        findings.push(`${p}: bundle mentions service_role next to a JWT — check nothing server-only shipped`);
      }
    }
  }
}
if (existsSync('dist')) walk('dist');

if (findings.length) {
  console.error(`✗ security-check: ${findings.length} finding(s)`);
  for (const f of findings) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ security-check: ${tracked.length} tracked files${existsSync('dist') ? ' + dist/' : ''} clean`);
