#!/usr/bin/env node
/**
 * Production build for the unified Vercel project:
 * - join.getsynth.app → dist/ (consumer app + api/)
 * - getsynth.app      → dist/_site/getsynth/ (admin + marketing from apps/admin)
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function stampIndexHtml(dir, label) {
  const indexPath = join(dir, 'index.html');
  const buildId = `${label}@${new Date().toISOString()}`;
  let html = readFileSync(indexPath, 'utf8');
  const meta = `<meta name="synth-build" content="${buildId}" />`;
  if (html.includes('name="synth-build"')) {
    html = html.replace(/<meta name="synth-build" content="[^"]*" \/>/, meta);
  } else {
    html = html.replace('<head>', `<head>\n    ${meta}`);
  }
  writeFileSync(indexPath, html);
  console.log(`Stamped ${indexPath} → ${buildId}`);
}

console.log('Building consumer app (join.getsynth.app)…');
execSync('npm run build', { stdio: 'inherit' });
stampIndexHtml('dist', 'join');

console.log('Building admin portal (getsynth.app)…');
execSync('npm run admin:build', { stdio: 'inherit' });
stampIndexHtml(join('apps', 'admin', 'dist'), 'getsynth-admin');

const adminDist = join('apps', 'admin', 'dist');
const target = join('dist', '_site', 'getsynth');
if (!existsSync(adminDist)) {
  console.error('Missing admin build output at', adminDist);
  process.exit(1);
}
if (existsSync(target)) rmSync(target, { recursive: true, force: true });
cpSync(adminDist, target, { recursive: true });
console.log('Copied admin build → dist/_site/getsynth');
