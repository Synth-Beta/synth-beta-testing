#!/usr/bin/env node
/**
 * Security: Pre-flight check that required env vars are present.
 * Used by backend startup and CI/deploy scripts.
 *
 * Usage: node scripts/check-env.mjs [--allow-missing-dev]
 */

import { createRequire } from 'module';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

dotenv.config({ path: join(root, '.env') });
dotenv.config({ path: join(root, '.env.local'), override: true });

const { validateRequiredEnv } = require('../backend/config/checkEnv.js');

const allowMissingDev = process.argv.includes('--allow-missing-dev');
const result = validateRequiredEnv(allowMissingDev);

for (const w of result.warnings) {
  console.warn(`⚠️  ${w}`);
}

if (!result.ok) {
  console.error('❌ Environment check failed:\n' + result.errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}

console.log('✅ Environment check passed');
