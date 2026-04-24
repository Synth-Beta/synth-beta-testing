/**
 * Internal sync trigger endpoint.
 * Called by Vercel cron (via api/cron/sync-events.ts).
 * Spawns the incremental JamBase sync script in the background and
 * returns 202 immediately — the sync runs to completion on its own.
 *
 * Protected by CRON_SECRET so only the cron job (or an admin) can trigger it.
 */

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

const router = express.Router();

router.post('/internal/sync-events', (req, res) => {
  const cronSecret = process.env.CRON_SECRET;

  // Require a configured secret — never allow open execution in production
  if (!cronSecret) {
    console.error('[sync-route] CRON_SECRET env var is not set — refusing request');
    return res.status(500).json({ ok: false, error: 'Sync not configured (missing CRON_SECRET)' });
  }

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (token !== cronSecret) {
    console.warn('[sync-route] Unauthorized sync attempt');
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const startedAt = new Date().toISOString();
  // Respond immediately — sync runs in background
  res.status(202).json({ ok: true, message: 'Sync started', startedAt });

  // Resolve project root (backend/ is one level below root)
  const projectRoot = path.resolve(__dirname, '..');
  const scriptPath = path.join(projectRoot, 'scripts', 'sync-jambase-incremental-3nf.mjs');

  console.log(`[sync] Starting incremental JamBase sync at ${startedAt}`);

  const child = spawn(process.execPath, [scriptPath], {
    cwd: projectRoot,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach((line) => console.log(`[sync] ${line}`));
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach((line) => console.error(`[sync:err] ${line}`));
  });

  child.on('close', (code) => {
    if (code === 0) {
      console.log(`[sync] Completed successfully at ${new Date().toISOString()}`);
    } else {
      console.error(`[sync] Exited with code ${code} at ${new Date().toISOString()}`);
    }
  });

  child.on('error', (err) => {
    console.error(`[sync] Failed to spawn sync process: ${err.message}`);
  });
});

module.exports = router;
