import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/partner/exchange — a Pick Five user signs into Synth with their Pick Five login.
 *
 * The Synth app already signed the user into Pick Five Auth (their email + password went
 * straight to Pick Five) and sends that Pick Five access token here. We ask Pick Five's
 * /partner/me who it is, then:
 *   - a Synth account with the same UUID exists and the emails match -> sign them in
 *   - no account with that UUID: create one with the SAME UUID (profile row comes from the
 *     auth.users trigger, so Synth onboarding runs), then sign them in
 *   - a different Synth account already uses that email -> 409; never auto-link two
 *     accounts on email alone, the user signs in with their Synth password instead
 *
 * Body:   { partner_token: string }
 * 200 ->  { access_token, refresh_token, created }   (the app calls supabase.auth.setSession)
 *
 * Env: PICKFIVE_ME_URL (their /partner/me), PICKFIVE_API_KEY (key Pick Five issued to us),
 *      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and an anon/publishable key.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PartnerIdentity = { id: string; email: string; display_name: string | null };

async function fetchPartnerIdentity(meUrl: string, apiKey: string, token: string): Promise<PartnerIdentity | null> {
  const response = await fetch(meUrl, {
    headers: { Authorization: `Bearer ${token}`, 'X-Partner-Key': apiKey },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    console.warn('[partner/exchange] partner /me rejected token', response.status);
    return null;
  }
  const body = (await response.json()) as Partial<PartnerIdentity>;
  if (typeof body.id !== 'string' || !UUID_RE.test(body.id) || typeof body.email !== 'string' || !body.email.includes('@')) {
    console.error('[partner/exchange] partner /me returned an unexpected shape');
    return null;
  }
  return { id: body.id.toLowerCase(), email: body.email.trim().toLowerCase(), display_name: body.display_name ?? null };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const meUrl = process.env.PICKFIVE_ME_URL?.trim();
  const apiKey = process.env.PICKFIVE_API_KEY?.trim();
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!meUrl || !apiKey || !supabaseUrl || !serviceKey || !anonKey) {
    return res.status(503).json({ error: 'Partner sign-in not configured' });
  }

  const partnerToken =
    typeof req.body === 'object' && req.body && typeof req.body.partner_token === 'string'
      ? req.body.partner_token.trim()
      : '';
  if (!partnerToken) {
    return res.status(400).json({ error: 'Missing partner_token' });
  }

  let identity: PartnerIdentity | null;
  try {
    identity = await fetchPartnerIdentity(meUrl, apiKey, partnerToken);
  } catch (err) {
    console.error('[partner/exchange] partner /me unreachable', err);
    return res.status(502).json({ error: 'Partner unavailable' });
  }
  if (!identity) {
    return res.status(401).json({ error: 'Partner sign-in rejected' });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let created = false;
  const { data: existing } = await admin.auth.admin.getUserById(identity.id);
  if (existing?.user) {
    if (existing.user.email?.toLowerCase() !== identity.email) {
      return res.status(409).json({ error: 'account_mismatch' });
    }
  } else {
    const { error: createError } = await admin.auth.admin.createUser({
      id: identity.id,
      email: identity.email,
      // Pick Five's /partner/me only returns emails it has confirmed (shared contract).
      email_confirm: true,
      user_metadata: identity.display_name ? { name: identity.display_name } : {},
      app_metadata: { partner_origin: 'pickfive' },
    });
    if (createError) {
      // email_exists: a separate Synth account owns this email; do not merge on email alone.
      if (createError.code === 'email_exists' || /already been registered/i.test(createError.message)) {
        return res.status(409).json({ error: 'account_exists' });
      }
      console.error('[partner/exchange] createUser failed', createError.message);
      return res.status(500).json({ error: 'Could not create account' });
    }
    created = true;
  }

  // Mint a Synth session without a password: a magic-link token generated and redeemed
  // server-side (no email is sent).
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: identity.email });
  if (linkError || !link?.properties?.hashed_token) {
    console.error('[partner/exchange] generateLink failed', linkError?.message);
    return res.status(500).json({ error: 'Could not start session' });
  }
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (verifyError || !verified.session) {
    console.error('[partner/exchange] verifyOtp failed', verifyError?.message);
    return res.status(500).json({ error: 'Could not start session' });
  }

  return res.status(200).json({
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
    created,
  });
}
