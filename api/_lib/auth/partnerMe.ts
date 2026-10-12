import { timingSafeEqual } from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/partner/me — tells a partner app's backend which Synth user a token belongs to,
 * so the partner can create (or find) its own account with the same UUID.
 *
 * Contract (both apps implement the same endpoint):
 *   Headers:  Authorization: Bearer <the user's Synth access token>
 *             X-Partner-Key: <server-to-server key we issued to the partner>
 *   200 ->    { id, email, display_name }  (only accounts with a confirmed email)
 *
 * The user token proves who the person is (they just signed into Synth Auth themselves);
 * the partner key proves the caller is the partner's server, not a random client.
 * Only these fields are shared; add a field here only after both apps agree.
 *
 * Env: PICKFIVE_PARTNER_KEY — long random string, shared with Pick Five out of band.
 * shortcut: one partner, one env var; move to a partner_apps table if a second partner joins.
 */

function secureEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function header(req: VercelRequest, name: string): string {
  const raw = req.headers[name];
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const partnerKey = process.env.PICKFIVE_PARTNER_KEY?.trim();
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!partnerKey || !supabaseUrl || !supabaseServiceKey) {
    return res.status(503).json({ error: 'Partner access not configured' });
  }

  if (!secureEquals(header(req, 'x-partner-key'), partnerKey)) {
    return res.status(401).json({ error: 'Invalid partner key' });
  }

  const token = header(req, 'authorization').replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: 'Missing user token' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // getUser asks Synth Auth itself, so expired, signed-out and deleted users are rejected.
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) {
    return res.status(401).json({ error: 'Invalid or expired user token' });
  }
  const user = auth.user;
  if (!user.email || !user.email_confirmed_at) {
    // The partner creates its account with this email already confirmed, so only hand out
    // emails Synth has verified. Accounts without one cannot be matched across apps.
    return res.status(422).json({ error: 'Synth account has no confirmed email' });
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('name, username')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('[partner/me] profile lookup failed', profileError.message);
  }

  return res.status(200).json({
    id: user.id,
    email: user.email,
    display_name: profile?.name || profile?.username || null,
  });
}
