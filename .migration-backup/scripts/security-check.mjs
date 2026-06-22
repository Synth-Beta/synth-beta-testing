#!/usr/bin/env node
/**
 * Security: Pre-deploy checklist — env vars, git hygiene, dependency audit.
 *
 * Usage: node scripts/security-check.mjs
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

dotenv.config({ path: join(root, '.env') });
dotenv.config({ path: join(root, '.env.local'), override: true });

const { validateRequiredEnv } = require('../backend/config/checkEnv.js');

const results = [];

function pass(label) {
  results.push({ label, ok: true });
  console.log(`✅ ${label}`);
}

function fail(label, detail) {
  results.push({ label, ok: false, detail });
  console.error(`❌ ${label}${detail ? `: ${detail}` : ''}`);
}

// 1) Required env vars
const envCheck = validateRequiredEnv(false);
if (envCheck.ok) {
  pass('Required environment variables');
} else {
  fail('Required environment variables', envCheck.errors.join('; '));
}

// 2) No tracked .env files
try {
  const tracked = execSync('git ls-files', { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  const bad = tracked.filter(
    (f) =>
      (/^\.env($|\.)/.test(f) || f.endsWith('.env')) &&
      !f.endsWith('.env.example') &&
      !f.includes('.xcode.env')
  );
  if (bad.length === 0) {
    pass('No .env secrets tracked in git');
  } else {
    fail('No .env secrets tracked in git', bad.join(', '));
  }
} catch {
  fail('Git ls-files check', 'Could not run git');
}

// 3) .env.example exists
if (existsSync(join(root, '.env.example'))) {
  pass('.env.example present');
} else {
  fail('.env.example present');
}

// 4) npm audit (high+) in root, backend, mobile
function runAudit(cwd, name) {
  const pkg = join(cwd, 'package.json');
  if (!existsSync(pkg)) return;

  const r = spawnSync('npm', ['audit', '--audit-level=high', '--json'], {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  let summary = null;
  try {
    summary = JSON.parse(r.stdout || '{}')?.metadata?.vulnerabilities;
  } catch {
    // ignore parse errors
  }

  const high = summary?.high ?? 0;
  const critical = summary?.critical ?? 0;

  if (high + critical === 0) {
    pass(`npm audit (${name}) — no HIGH/CRITICAL`);
  } else {
    fail(`npm audit (${name})`, `${critical} critical, ${high} high — run npm audit fix`);
  }
}

runAudit(root, 'root');
runAudit(join(root, 'backend'), 'backend');
runAudit(join(root, 'mobile'), 'mobile');

// 5) Quick scan for committed service_role JWT pattern in scripts (not exhaustive)
const jwtPattern = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;
const scanDirs = ['scripts', 'src', 'mobile/src', 'api'];
let foundJwt = false;
for (const dir of scanDirs) {
  const full = join(root, dir);
  if (!existsSync(full)) continue;
  try {
    const files = execSync(`git ls-files "${dir}"`, { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter((f) => /\.(js|mjs|ts|tsx|py)$/.test(f));
    for (const file of files) {
      const content = readFileSync(join(root, file), 'utf8');
      if (jwtPattern.test(content) && !file.includes('.env.example')) {
        foundJwt = true;
        fail('No hardcoded JWTs in source', file);
      }
    }
  } catch {
    // ignore
  }
}
if (!foundJwt) {
  pass('No hardcoded JWTs in tracked scripts/src/api');
}

console.log('\n--- Summary ---');
const failed = results.filter((r) => !r.ok);
if (failed.length === 0) {
  console.log('PASS — all security checks passed');
  process.exit(0);
} else {
  console.log(`FAIL — ${failed.length} check(s) failed`);
  process.exit(1);
}
