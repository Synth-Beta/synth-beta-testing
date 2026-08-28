/**
 * PUT /api/admin/featured/week
 * Editorial pin API: replace the weekly featured set without an app release.
 *
 * Auth: Bearer token for a user with users.account_type = admin
 * Body:
 * {
 *   weekId?: string,          // defaults to current DC week
 *   weekStartDate?: string,   // YYYY-MM-DD Monday; defaults from weekId/now
 *   status?: "draft"|"published",
 *   targetCount?: number,     // default 12
 *   notes?: string,
 *   pins: [{ eventId, position?, genre?, curatorNote? }]
 * }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  FEATURED_METRO_DC,
  FEATURED_TARGET,
  dcWeekId,
  dcWeekStartDate,
  featuredShowChatKey,
  validateFeaturedPins,
  type FeaturedPinInput,
} from '../../_lib/weeklyFeatured';

async function requireAdmin(
  supabaseUrl: string,
  serviceKey: string,
  token: string
): Promise<string | null> {
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
  const { data: userData, error } = await supabase.auth.getUser(token);
  if (error || !userData?.user?.id) return null;

  const { data: row } = await supabase
    .from('users')
    .select('account_type')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (row?.account_type !== 'admin') return null;
  return userData.user.id;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const authHeaderRaw = (req.headers.authorization || req.headers.Authorization) as
    | string
    | undefined;
  const token =
    typeof authHeaderRaw === 'string' && authHeaderRaw.startsWith('Bearer ')
      ? authHeaderRaw.slice('Bearer '.length)
      : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });

  const adminId = await requireAdmin(supabaseUrl, serviceKey, token);
  if (!adminId) return res.status(403).json({ error: 'Admin required' });

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) || {};
  const pinsRaw = Array.isArray(body.pins) ? body.pins : null;
  if (!pinsRaw) return res.status(400).json({ error: 'pins array required' });

  const pins: FeaturedPinInput[] = pinsRaw.map(
    (p: { eventId?: string; event_id?: string; position?: number; genre?: string; curatorNote?: string; curator_note?: string }, i: number) => ({
      eventId: String(p.eventId || p.event_id || ''),
      position: typeof p.position === 'number' ? p.position : i + 1,
      genre: p.genre ?? null,
      curatorNote: p.curatorNote ?? p.curator_note ?? null,
    })
  );

  if (pins.some((p) => !p.eventId)) {
    return res.status(400).json({ error: 'Each pin needs eventId' });
  }

  const status = body.status === 'published' ? 'published' : 'draft';
  const validation = validateFeaturedPins(pins, { forPublish: status === 'published' });
  if (!validation.ok) {
    return res.status(400).json({ error: validation.error, genres: validation.genres });
  }

  const weekStart = typeof body.weekStartDate === 'string' ? body.weekStartDate : dcWeekStartDate();
  const weekId = typeof body.weekId === 'string' && body.weekId.trim() ? body.weekId.trim() : dcWeekId();
  const targetCount =
    typeof body.targetCount === 'number' ? body.targetCount : FEATURED_TARGET;

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Always stage as draft first so the publish trigger sees the final item rows.
  const { data: setRow, error: upsertErr } = await supabase
    .from('weekly_featured_sets')
    .upsert(
      {
        metro: FEATURED_METRO_DC,
        week_id: weekId,
        week_start_date: weekStart,
        status: 'draft',
        target_count: targetCount,
        notes: body.notes ?? null,
        updated_by: adminId,
      },
      { onConflict: 'metro,week_id' }
    )
    .select('id')
    .single();

  if (upsertErr || !setRow) {
    console.error('[admin/featured/week] upsert', upsertErr);
    return res.status(500).json({ error: 'Failed to upsert set', detail: upsertErr?.message });
  }

  const { error: delErr } = await supabase
    .from('weekly_featured_items')
    .delete()
    .eq('set_id', setRow.id);
  if (delErr) {
    return res.status(500).json({ error: 'Failed to clear pins', detail: delErr.message });
  }

  if (pins.length > 0) {
    const { error: insErr } = await supabase.from('weekly_featured_items').insert(
      pins.map((pin) => ({
        set_id: setRow.id,
        event_id: pin.eventId,
        position: pin.position,
        genre: pin.genre,
        curator_note: pin.curatorNote,
      }))
    );
    if (insErr) {
      return res.status(500).json({ error: 'Failed to insert pins', detail: insErr.message });
    }
  }

  if (status === 'published') {
    const { error: pubErr } = await supabase
      .from('weekly_featured_sets')
      .update({ status: 'published', published_at: new Date().toISOString(), updated_by: adminId })
      .eq('id', setRow.id);
    if (pubErr) {
      return res.status(400).json({ error: 'Publish rejected', detail: pubErr.message });
    }
  }

  return res.status(200).json({
    ok: true,
    setId: setRow.id,
    weekId,
    weekStartDate: weekStart,
    status,
    showCount: pins.length,
    genres: validation.genres,
    chatProvisionKeys: pins.map((p) => featuredShowChatKey(weekId, p.eventId)),
  });
}
