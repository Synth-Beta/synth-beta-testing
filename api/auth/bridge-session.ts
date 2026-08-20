import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

/**
 * Mints a short-lived, single-use code that the web reconnect page can redeem for a
 * real session (see redeem-session.ts). Used so the mobile app never has to put the
 * actual access/refresh token in a URL opened via WebBrowser.openBrowserAsync — only
 * this opaque, one-time code, which is useless to anyone after it's redeemed once or
 * BRIDGE_CODE_TTL_MS passes.
 */

const BRIDGE_CODE_TTL_MS = 2 * 60 * 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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

  const authHeaderRaw = (req.headers.authorization || req.headers.Authorization) as string | undefined;
  const token =
    typeof authHeaderRaw === 'string' && authHeaderRaw.startsWith('Bearer ')
      ? authHeaderRaw.slice('Bearer '.length)
      : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // The caller's own session is what gets bridged to the web — refresh_token isn't in
    // the validated JWT, so it must be supplied in the request body by the caller (who
    // already holds it from supabase.auth.getSession() on-device).
    const refreshToken =
      typeof req.body === 'object' && req.body && typeof req.body.refresh_token === 'string'
        ? req.body.refresh_token
        : null;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Missing refresh_token' });
    }

    const code = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + BRIDGE_CODE_TTL_MS).toISOString();

    const { error: insertError } = await supabase.from('web_session_bridge').insert({
      code,
      user_id: userData.user.id,
      access_token: token,
      refresh_token: refreshToken,
      expires_at: expiresAt,
    });

    if (insertError) {
      return res.status(500).json({ error: 'Failed to create bridge code' });
    }

    return res.status(200).json({ code });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
