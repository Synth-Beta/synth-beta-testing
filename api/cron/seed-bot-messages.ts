/**
 * Vercel Cron — Daily bot message seeding for genre chats.
 *
 * Runs at 10:00 AM UTC daily (see vercel.json crons config).
 *
 * ANALYTICS EXCLUSION: Bot users have is_bot=true.
 * Filter from DAU/MAU: WHERE COALESCE(is_bot, false) = false
 *
 * Required env vars (Vercel dashboard):
 *   CRON_SECRET
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import {
  generateDailyBotMessage,
  randomInt,
  shuffle,
} from '../../scripts/lib/bot-seed-shared.mjs';

// Constant-time comparison so response timing can't leak secret prefixes
function secureEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/seed-bot-messages] CRON_SECRET not configured');
    return res.status(500).json({ error: 'Cron not configured' });
  }

  const authHeader = (req.headers.authorization as string) ?? '';
  if (!secureEquals(authHeader, `Bearer ${cronSecret}`)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('[cron/seed-bot-messages] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const today = new Date().toISOString().slice(0, 10);

    const { data: bots, error: botsErr } = await supabase
      .from('users')
      .select('user_id, name, username')
      .eq('is_bot', true);

    if (botsErr) throw botsErr;
    if (!bots?.length) {
      return res.status(200).json({
        ok: true,
        message: 'No bot users found',
        chatsUpdated: 0,
        messagesInserted: 0,
      });
    }

    const botPool = bots.map((b) => ({
      user_id: b.user_id,
      displayName: b.name,
      username: b.username ?? undefined,
    }));

    const { data: chats, error: chatsErr } = await supabase
      .from('chats')
      .select('id, entity_id, chat_name')
      .eq('entity_type', 'genre')
      .eq('is_group_chat', true);

    if (chatsErr) throw chatsErr;
    if (!chats?.length) {
      return res.status(200).json({
        ok: true,
        message: 'No genre chats found',
        chatsUpdated: 0,
        messagesInserted: 0,
      });
    }

    const selectedChats = shuffle(chats).slice(0, randomInt(2, 3));
    let messagesInserted = 0;
    let chatsUpdated = 0;
    let botRotateIndex = Math.floor(Math.random() * botPool.length);

    for (const chat of selectedChats) {
      const genreSlug = chat.entity_id;
      if (!genreSlug) continue;

      const bot = botPool[botRotateIndex % botPool.length];
      botRotateIndex++;

      const row = generateDailyBotMessage({ genreSlug, bot });
      if (!row) continue;

      const insertRow = {
        ...row,
        chat_id: chat.id,
        metadata: { ...row.metadata, date: today },
      };

      const { error: insertErr } = await supabase.from('messages').insert(insertRow);
      if (insertErr) {
        console.error(`[cron/seed-bot-messages] insert #${genreSlug}:`, insertErr.message);
        continue;
      }

      await supabase
        .from('chats')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', chat.id);

      messagesInserted += 1;
      chatsUpdated++;
      console.log(
        `[BOT-SEED] ✓ Inserted daily question in #${genreSlug} (${chat.chat_name})`
      );
    }

    return res.status(200).json({
      ok: true,
      triggeredAt: new Date().toISOString(),
      chatsUpdated,
      messagesInserted,
      date: today,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cron/seed-bot-messages] Failed:', message);
    return res.status(500).json({ error: message });
  }
}
