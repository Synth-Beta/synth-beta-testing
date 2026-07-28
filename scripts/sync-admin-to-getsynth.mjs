#!/usr/bin/env node
/**
 * Admin portal lives in-repo at apps/admin (getsynth.app).
 * This script no longer copies across repos — it prints the layout.
 */
console.log(`
Synth admin portal is vendored at:

  apps/admin/     →  https://getsynth.app  (/admin unchanged)

From repo root:
  npm run admin:install
  npm run admin:dev
  npm run admin:build

Vercel (plusone-event-crew / getsynth.app):
  Root Directory = apps/admin

Consumer app stays at repo root → https://join.getsynth.app
`);
