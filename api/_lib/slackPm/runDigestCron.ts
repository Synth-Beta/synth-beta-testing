import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'crypto';
import { catchUpMissedSignups } from '../slackSignup.js';
import { getSupabaseService } from './client.js';
import { postDigestForWorkspace, type DigestKind } from './digest.js';

function secureEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function handleDigestCron(
  req: VercelRequest,
  res: VercelResponse,
  kind: DigestKind,
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error(`[cron/slack-pm-digest:${kind}] CRON_SECRET not configured`);
    return res.status(500).json({ error: 'Cron not configured' });
  }

  const authHeader = (req.headers.authorization as string) ?? '';
  if (!secureEquals(authHeader, `Bearer ${cronSecret}`)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabaseService();
  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    let signupCatchUp = { posted: 0, skipped: 0 };
    try {
      signupCatchUp = await catchUpMissedSignups();
      if (signupCatchUp.posted > 0 || signupCatchUp.skipped > 0) {
        console.log(`[cron/slack-pm-digest:${kind}] signup catch-up`, signupCatchUp);
      }
    } catch (signupErr) {
      console.warn(
        `[cron/slack-pm-digest:${kind}] signup catch-up failed`,
        (signupErr as Error).message,
      );
    }

    const { data: workspaces, error } = await supabase.from('pm_workspaces').select('*');
    if (error) throw error;

    const results = [];
    for (const ws of workspaces || []) {
      const r = await postDigestForWorkspace({
        supabase,
        workspace: ws,
        kind,
        force: false,
      });
      results.push({ workspaceId: ws.id, ...r });
    }
    console.log(`[cron/slack-pm-digest:${kind}]`, results);
    return res.status(200).json({ ok: true, kind, results, signupCatchUp });
  } catch (err) {
    const message = (err as Error).message || 'unknown';
    console.error(`[cron/slack-pm-digest:${kind}] Failed:`, message);
    return res.status(500).json({ error: message });
  }
}
