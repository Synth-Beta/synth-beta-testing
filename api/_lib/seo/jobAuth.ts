/**
 * Auth for SEO jobs in api/cron/index.ts: Vercel cron (Bearer CRON_SECRET) or an admin
 * clicking a button in the admin SEO tab (Bearer <Supabase access token>).
 */
import { timingSafeEqual } from 'crypto';
import type { VercelRequest } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null | undefined;

export function seoServiceClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  cached = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return cached;
}

function secureEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export type JobAuth = { ok: true; via: 'cron' | 'admin'; userId: string | null } | { ok: false; status: number; error: string };

export async function authorizeSeoJob(req: VercelRequest): Promise<JobAuth> {
  const header = (req.headers.authorization as string | undefined) ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && secureEquals(header, `Bearer ${cronSecret}`)) return { ok: true, via: 'cron', userId: null };

  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const db = seoServiceClient();
  if (!token || !db) return { ok: false, status: 401, error: 'Unauthorized' };
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return { ok: false, status: 401, error: 'Unauthorized' };
  const { data: profile } = await db.from('users').select('account_type').eq('user_id', data.user.id).maybeSingle();
  if (profile?.account_type !== 'admin') return { ok: false, status: 403, error: 'Admins only' };
  return { ok: true, via: 'admin', userId: data.user.id };
}
