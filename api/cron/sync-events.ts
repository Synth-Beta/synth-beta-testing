/**
 * Vercel Cron — Daily event sync trigger
 *
 * Runs at 9:30 AM UTC daily (see vercel.json crons config).
 * Vercel automatically passes Authorization: Bearer <CRON_SECRET> on cron invocations.
 *
 * This function just calls the Express backend's /internal/sync-events endpoint
 * and returns immediately. The actual sync runs on the backend server with no
 * time constraints.
 *
 * Required env vars (set in Vercel dashboard):
 *   CRON_SECRET   — shared secret, also set on the backend server
 *   BACKEND_URL   — full URL of the Express backend, e.g. https://your-app.railway.app
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET (Vercel cron uses GET) and POST (manual trigger)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/sync-events] CRON_SECRET not configured');
    return res.status(500).json({ error: 'Cron not configured' });
  }

  // Vercel passes Authorization: Bearer <CRON_SECRET> automatically for cron jobs.
  // For manual POST triggers, callers must supply the same header.
  const authHeader = (req.headers.authorization as string) ?? '';
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, '');
  if (!backendUrl) {
    console.error('[cron/sync-events] BACKEND_URL not configured');
    return res.status(500).json({ error: 'BACKEND_URL not configured' });
  }

  try {
    const response = await fetch(`${backendUrl}/internal/sync-events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
      // Vercel serverless timeout is 10s — backend returns 202 fast, so this is fine
      signal: AbortSignal.timeout(8000),
    });

    const data = await response.json();
    console.log(`[cron/sync-events] Backend responded ${response.status}:`, data);

    return res.status(200).json({
      ok: true,
      triggeredAt: new Date().toISOString(),
      backend: data,
    });
  } catch (err: any) {
    console.error('[cron/sync-events] Failed to trigger backend sync:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
