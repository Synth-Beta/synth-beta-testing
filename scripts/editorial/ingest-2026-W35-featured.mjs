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
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const payloadPath = path.join(__dirname, 'ingest-2026-W35-featured-pins.json');
const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

const pins = payload.pins.map((p) => ({
  eventId: p.eventId,
  position: p.position,
  genre: p.genre,
  curatorNote: p.curatorNote || null,
  roomKey: p.roomKey,
}));

async function main() {
  const { data: existing, error: probeErr } = await supabase
    .from('weekly_featured_sets')
    .select('id')
    .limit(1);
  if (probeErr) {
    console.error(
      'weekly_featured_sets unavailable. Apply LOI-615 migration first.',
      probeErr.message
    );
    process.exit(2);
  }

  const { data: setRow, error: upsertErr } = await supabase
    .from('weekly_featured_sets')
    .upsert(
      {
        metro: payload.metro || 'dc',
        week_id: payload.weekId,
        week_start_date: payload.weekStartDate,
        status: 'draft',
        target_count: payload.targetCount || 12,
        notes: payload.notes || null,
      },
      { onConflict: 'metro,week_id' }
    )
    .select('id')
    .single();

  if (upsertErr || !setRow) {
    console.error('upsert set failed', upsertErr);
    process.exit(3);
  }

  const { error: delErr } = await supabase
    .from('weekly_featured_items')
    .delete()
    .eq('set_id', setRow.id);
  if (delErr) {
    console.error('clear pins failed', delErr);
    process.exit(4);
  }

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
    console.error('insert pins failed', insErr);
    process.exit(5);
  }

  if (payload.status === 'published') {
    const { error: pubErr } = await supabase
      .from('weekly_featured_sets')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .eq('id', setRow.id);
    if (pubErr) {
      console.error('publish failed', pubErr);
      process.exit(6);
    }
  }

  const { data: readBack, error: readErr } = await supabase.rpc(
    'get_weekly_featured_set',
    { p_metro: 'dc', p_week_id: payload.weekId }
  );
  if (readErr) {
    console.error('readback failed', readErr);
    process.exit(7);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        setId: setRow.id,
        weekId: payload.weekId,
        weekStartDate: payload.weekStartDate,
        opsWeekKey: payload.opsWeekKey,
        status: payload.status,
        showCount: pins.length,
        roomKeys: pins.map((p) => p.roomKey),
        chatProvisionKeys: pins.map(
          (p) => `featured_show:${payload.weekId}:${p.eventId}`
        ),
        readBackCount: (readBack || []).length,
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
