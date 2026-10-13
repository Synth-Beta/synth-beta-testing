import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Partner account connections (tables: supabase/migrations/20261012180000_partner_account_links.sql).
 * Each app keeps its own accounts and Auth; a connection only associates two accounts.
 * Every partner implements the same four endpoints under {api_base_url}/partner/link/:
 *
 *   start    POST  user JWT        { partner }                      -> { code, expires_at, connect_url }
 *   redeem   POST  partner key     { code, partner_user_id }        -> { user_id, link_token }
 *   complete POST  user JWT        { partner, code }                -> { connected: true }
 *   revoke   POST  user JWT        { partner }                      -> { revoked }
 *                  or partner key  { partner_user_id }
 *
 * "partner_user_id" in a request is always the caller's own user id. Partner calls send
 * X-Partner-Id (the caller's id as the receiver knows it, e.g. "pickfive") and X-Partner-Key.
 *
 * Env per partner (id upper-cased, "-" -> "_"):
 *   PARTNER_<ID>_INBOUND_KEY   key the partner sends us
 *   PARTNER_<ID>_OUTBOUND_KEY  key we send the partner (they call us "synth")
 */

export type LinkJob = 'link-start' | 'link-redeem' | 'link-complete' | 'link-revoke';

const SYNTH_PARTNER_ID = 'synth';
const CODE_TTL_MS = 10 * 60 * 1000;
// No 0/O/1/I: codes are typed by hand.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeLinkCode(): string {
  return Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

export function normalizeCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
}

export function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** The partner page the user is sent to, with the code added; null when the partner has none (or it isn't https). */
export function connectUrlFor(base: string | null, code: string): string | null {
  if (!base) return null;
  try {
    const url = new URL(base);
    if (url.protocol !== 'https:') return null;
    url.searchParams.set('code', code);
    return url.toString();
  } catch {
    return null;
  }
}

export function partnerKeyEnv(partnerId: string, direction: 'INBOUND' | 'OUTBOUND'): string {
  return `PARTNER_${partnerId.toUpperCase().replace(/-/g, '_')}_${direction}_KEY`;
}

function secureEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function header(req: VercelRequest, name: string): string {
  const raw = req.headers[name];
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
}

function bodyField(req: VercelRequest, key: string): string {
  const value = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>)[key] : undefined;
  return typeof value === 'string' ? value.trim() : '';
}

/** The partner a server-to-server call comes from, or null if the key doesn't match. */
function authenticatePartner(req: VercelRequest): string | null {
  const partnerId = header(req, 'x-partner-id').toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(partnerId)) return null;
  const expected = process.env[partnerKeyEnv(partnerId, 'INBOUND')]?.trim();
  return expected && secureEquals(header(req, 'x-partner-key'), expected) ? partnerId : null;
}

async function authenticateUser(admin: SupabaseClient, req: VercelRequest): Promise<string | null> {
  const token = header(req, 'authorization').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

async function loadPartner(admin: SupabaseClient, partnerId: string) {
  if (!/^[a-z0-9-]{2,40}$/.test(partnerId)) return null;
  const { data } = await admin.from('partners').select('id, api_base_url, connect_url').eq('id', partnerId).maybeSingle();
  return data as { id: string; api_base_url: string | null; connect_url: string | null } | null;
}

/** Replaces any live link for this user or partner user (re-connecting is allowed). */
async function saveLink(admin: SupabaseClient, partnerId: string, synthUserId: string, partnerUserId: string, linkToken: string) {
  const now = new Date().toISOString();
  await admin.from('partner_links').update({ revoked_at: now }).eq('partner_id', partnerId).eq('synth_user_id', synthUserId).is('revoked_at', null);
  await admin.from('partner_links').update({ revoked_at: now }).eq('partner_id', partnerId).eq('partner_user_id', partnerUserId).is('revoked_at', null);
  const { error } = await admin.from('partner_links').insert({
    partner_id: partnerId,
    synth_user_id: synthUserId,
    partner_user_id: partnerUserId,
    link_token_hash: hashSecret(linkToken),
  });
  if (error) throw new Error(`partner_links insert: ${error.message}`);
}

async function callPartner(partnerId: string, baseUrl: string, path: string, body: unknown) {
  const key = process.env[partnerKeyEnv(partnerId, 'OUTBOUND')]?.trim();
  if (!key) throw new Error(`${partnerKeyEnv(partnerId, 'OUTBOUND')} not set`);
  return fetch(`${baseUrl.replace(/\/+$/, '')}/partner/link/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Partner-Id': SYNTH_PARTNER_ID, 'X-Partner-Key': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse, job: LinkJob) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server configuration error' });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    if (job === 'link-redeem') {
      const partnerId = authenticatePartner(req);
      if (!partnerId) return res.status(401).json({ error: 'Invalid partner credentials' });
      const code = normalizeCode(bodyField(req, 'code'));
      const partnerUserId = bodyField(req, 'partner_user_id');
      if (!code || !partnerUserId || partnerUserId.length > 200) {
        return res.status(400).json({ error: 'code and partner_user_id are required' });
      }
      // Single use: only the first redeem flips used_at.
      const { data: claimed } = await admin
        .from('partner_link_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('code_hash', hashSecret(code))
        .eq('partner_id', partnerId)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .select('synth_user_id')
        .maybeSingle();
      if (!claimed) return res.status(404).json({ error: 'Code is invalid, used or expired' });

      const linkToken = randomBytes(32).toString('base64url');
      await saveLink(admin, partnerId, claimed.synth_user_id, partnerUserId, linkToken);
      return res.status(200).json({ user_id: claimed.synth_user_id, link_token: linkToken });
    }

    if (job === 'link-revoke' && header(req, 'x-partner-key')) {
      const partnerId = authenticatePartner(req);
      if (!partnerId) return res.status(401).json({ error: 'Invalid partner credentials' });
      const partnerUserId = bodyField(req, 'partner_user_id');
      if (!partnerUserId) return res.status(400).json({ error: 'partner_user_id is required' });
      const { data } = await admin
        .from('partner_links')
        .update({ revoked_at: new Date().toISOString() })
        .eq('partner_id', partnerId)
        .eq('partner_user_id', partnerUserId)
        .is('revoked_at', null)
        .select('id');
      return res.status(200).json({ revoked: (data ?? []).length });
    }

    // The remaining jobs are called by the Synth app for the signed-in user.
    const userId = await authenticateUser(admin, req);
    if (!userId) return res.status(401).json({ error: 'Sign in required' });
    const partner = await loadPartner(admin, bodyField(req, 'partner').toLowerCase());
    if (!partner) return res.status(404).json({ error: 'Unknown partner' });

    if (job === 'link-start') {
      await admin.from('partner_link_codes').delete().eq('synth_user_id', userId).eq('partner_id', partner.id).is('used_at', null);
      const code = makeLinkCode();
      const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
      const { error } = await admin.from('partner_link_codes').insert({
        code_hash: hashSecret(code),
        partner_id: partner.id,
        synth_user_id: userId,
        expires_at: expiresAt,
      });
      if (error) throw new Error(`partner_link_codes insert: ${error.message}`);
      return res.status(200).json({ code, expires_at: expiresAt, connect_url: connectUrlFor(partner.connect_url, code) });
    }

    if (job === 'link-complete') {
      if (!partner.api_base_url) return res.status(503).json({ error: 'Partner is not connected yet' });
      const code = normalizeCode(bodyField(req, 'code'));
      if (!code) return res.status(400).json({ error: 'code is required' });
      const response = await callPartner(partner.id, partner.api_base_url, 'redeem', { code, partner_user_id: userId });
      if (!response.ok) {
        return res.status(response.status === 404 ? 404 : 502).json({ error: 'Code is invalid, used or expired' });
      }
      const body = (await response.json()) as { user_id?: unknown; link_token?: unknown };
      if (typeof body.user_id !== 'string' || !body.user_id || typeof body.link_token !== 'string' || body.link_token.length < 32) {
        return res.status(502).json({ error: 'Partner returned an unexpected response' });
      }
      await saveLink(admin, partner.id, userId, body.user_id, body.link_token);
      return res.status(200).json({ connected: true });
    }

    // link-revoke by the user: disconnect here, then tell the partner (best effort).
    const { data: revoked } = await admin
      .from('partner_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('partner_id', partner.id)
      .eq('synth_user_id', userId)
      .is('revoked_at', null)
      .select('id');
    if (partner.api_base_url) {
      await callPartner(partner.id, partner.api_base_url, 'revoke', { partner_user_id: userId }).catch((err) =>
        console.warn('[partner/link] partner revoke notify failed', err),
      );
    }
    return res.status(200).json({ revoked: (revoked ?? []).length });
  } catch (err) {
    console.error(`[partner/link] ${job} failed`, err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
