import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Redeems a one-time bridge code (see bridge-session.ts) for the real session tokens.
 * Called by the web reconnect page on load, with the code from its own URL — the code
 * is deleted on first successful redemption, so replaying an old link (or its browser
 * history entry) after that point gets a 410, not a live session.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const code =
    typeof req.body === 'object' && req.body && typeof req.body.code === 'string'
      ? req.body.code
      : null;
  if (!code) {
    return res.status(400).json({ error: 'Missing code' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Delete-and-return in one round trip so two near-simultaneous redemptions of the
    // same code can't both succeed (only the row returned by the delete is valid).
    const { data: row, error: deleteError } = await supabase
      .from('web_session_bridge')
      .delete()
      .eq('code', code)
      .select('access_token, refresh_token, expires_at')
      .maybeSingle();

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to redeem bridge code' });
    }

    if (!row || new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: 'Code expired or already used' });
    }

    return res.status(200).json({
      access_token: row.access_token,
      refresh_token: row.refresh_token,
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
