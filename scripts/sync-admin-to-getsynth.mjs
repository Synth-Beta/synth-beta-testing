#!/usr/bin/env node
/**
 * Admin portal is in-repo at apps/admin (getsynth.app).
 * Legacy samandtej-plusone/plusone-event-crew has been deleted.
 */
console.log(`
Synth admin portal:

  apps/admin/     →  https://getsynth.app  (/admin)

Canonical repo: Synth-Beta/synth-beta-testing

From repo root:
  npm run admin:install
  npm run admin:dev
  npm run admin:build

Vercel (getsynth.app project, historically named plusone-event-crew):
  Git = Synth-Beta/synth-beta-testing
  Root Directory = apps/admin

Consumer app (repo root) → https://join.getsynth.app
`);
