#!/usr/bin/env node
/**
 * Production build for the unified Vercel project:
 * - join.getsynth.app → dist/ (consumer app + api/)
 * - getsynth.app      → dist/_site/getsynth/ (admin + marketing from apps/admin)
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

console.log('Building consumer app (join.getsynth.app)…');
execSync('npm run build', { stdio: 'inherit' });

console.log('Building admin portal (getsynth.app)…');
execSync('npm run admin:build', { stdio: 'inherit' });

const adminDist = join('apps', 'admin', 'dist');
const target = join('dist', '_site', 'getsynth');
if (!existsSync(adminDist)) {
  console.error('Missing admin build output at', adminDist);
  process.exit(1);
}
if (existsSync(target)) rmSync(target, { recursive: true, force: true });
cpSync(adminDist, target, { recursive: true });
console.log('Copied admin build → dist/_site/getsynth');
