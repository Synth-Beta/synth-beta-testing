/**
 * Single Hobby-plan entry for the mobile -> web session bridge.
 *
 * Was two functions (api/auth/bridge-session.ts mints a one-time code, redeem-session.ts
 * exchanges it for real tokens). Adding them took the repo to 14 Serverless Functions and
 * Vercel's Hobby plan caps a deployment at 12, so the whole deploy failed and neither
 * endpoint ever went live. The bodies now live in api/_lib/auth/ (not counted as functions)
 * and this file dispatches to them, the same way api/ai-scene-guides.ts does.
 *
 * The original URLs are preserved by rewrites in vercel.json:
 *   /api/auth/bridge-session -> /api/auth/session?job=bridge
 *   /api/auth/redeem-session -> /api/auth/session?job=redeem
 * so mobile (streamingSyncActions.withSessionHash) and web (StreamingStatsPage) keep
 * calling the paths they already call.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

type Job = 'bridge' | 'redeem';

function queryJob(req: VercelRequest): string {
  const raw = req.query.job;
  return String(Array.isArray(raw) ? raw[0] : raw || '').trim();
}

function pathOf(req: VercelRequest): string {
  const url = String(req.url || '');
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return url.split('?')[0] || '';
  }
}

function resolveJob(req: VercelRequest): Job | null {
  const q = queryJob(req);
  if (q === 'bridge' || q === 'redeem') return q;

  const path = pathOf(req);
  if (path.includes('bridge-session')) return 'bridge';
  if (path.includes('redeem-session')) return 'redeem';

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const job = resolveJob(req);

  if (job === 'bridge') {
    const { default: bridgeSession } = await import('../_lib/auth/bridgeSession.js');
    return bridgeSession(req, res);
  }
  if (job === 'redeem') {
    const { default: redeemSession } = await import('../_lib/auth/redeemSession.js');
    return redeemSession(req, res);
  }

  // No implicit default here: minting and redeeming a session are not interchangeable,
  // and guessing wrong would be a security question rather than a convenience.
  res.setHeader('Content-Type', 'application/json');
  return res.status(400).json({ error: 'Unknown job. Expected job=bridge or job=redeem.' });
}
