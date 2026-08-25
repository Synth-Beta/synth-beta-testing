#!/usr/bin/env node
/**
 * Ingest LOI-590 Aug 25-31 featured pin into weekly_featured_* SoT (LOI-608).
 *
 * Requires:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   Migration 20260825130000_weekly_featured_sets.sql applied (LOI-615)
 *
 * Usage (from repo root):
 *   node scripts/editorial/ingest-2026-W35-featured.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'ingest-2026-W35-featured-pins.json'), 'utf8')
);

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const baseHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

async function rest(method, pathAndQuery, { body, prefer } = {}) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      ...baseHeaders,
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = new Error(typeof data === 'string' ? data : JSON.stringify(data));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function main() {
  try {
    await rest('GET', 'weekly_featured_sets?select=id&limit=1');
  } catch (err) {
    console.error(
      'weekly_featured_sets unavailable. Apply LOI-615 migration first.',
      err.data || err.message
    );
    process.exit(2);
  }

  const setRows = await rest('POST', 'weekly_featured_sets?on_conflict=metro,week_id', {
    body: {
      metro: payload.metro || 'dc',
      week_id: payload.weekId,
      week_start_date: payload.weekStartDate,
      status: 'draft',
      target_count: payload.targetCount || 12,
      notes: payload.notes || null,
    },
    prefer: 'resolution=merge-duplicates,return=representation',
  });

  const setId = setRows?.[0]?.id;
  if (!setId) throw new Error('Failed to upsert weekly featured set');

  await rest('DELETE', `weekly_featured_items?set_id=eq.${setId}`, {
    prefer: 'return=minimal',
  });

  await rest('POST', 'weekly_featured_items', {
    body: payload.pins.map((p) => ({
      set_id: setId,
      event_id: p.eventId,
      position: p.position,
      genre: p.genre,
      curator_note: p.curatorNote || null,
    })),
    prefer: 'return=representation',
  });

  if (payload.status === 'published') {
    await rest('PATCH', `weekly_featured_sets?id=eq.${setId}`, {
      body: {
        status: 'published',
        published_at: new Date().toISOString(),
      },
      prefer: 'return=minimal',
    });
  }

  const readBack = await rest('POST', 'rpc/get_weekly_featured_set', {
    body: { p_metro: 'dc', p_week_id: payload.weekId },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        setId,
        weekId: payload.weekId,
        weekStartDate: payload.weekStartDate,
        opsWeekKey: payload.opsWeekKey,
        status: payload.status,
        showCount: payload.pins.length,
        roomKeys: payload.pins.map((p) => p.roomKey),
        chatProvisionKeys: payload.pins.map(
          (p) => `featured_show:${payload.weekId}:${p.eventId}`
        ),
        readBackCount: Array.isArray(readBack) ? readBack.length : 0,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
