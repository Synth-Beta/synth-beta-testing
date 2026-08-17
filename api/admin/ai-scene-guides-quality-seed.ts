import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Admin quality seed: JamBase-grounded linked conversations with audit fields.
 * POST { count?: number, seed?: number }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !serviceKey || !anon) {
      return res.status(500).json({ error: 'Supabase env missing' });
    }

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: auth } },
    });
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const admin = createClient(url, serviceKey);
    const { data: profile } = await admin
      .from('users')
      .select('account_type')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profile?.account_type !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
    const count = Math.max(50, Math.min(Number(body.count) || 300, 1000));
    const seed = Number(body.seed) || 42;

    const { runQualitySeed } = await import('../../ai-scene-guides/src/pipeline/qualitySeed.js');
    const result = runQualitySeed({
      targetMessages: count,
      seed,
      includeHumanInterruptionDemo: true,
    });

    // Resolve genre chats + sender pool
    const { data: sendersAi } = await admin
      .from('users')
      .select('user_id')
      .eq('is_ai_scene_guide', true)
      .limit(200);
    let senders = (sendersAi ?? []).map((u) => u.user_id as string);
    if (!senders.length) {
      const { data: bots } = await admin.from('users').select('user_id').eq('is_bot', true).limit(200);
      senders = (bots ?? []).map((u) => u.user_id as string);
    }
    if (!senders.length) {
      return res.status(400).json({
        error: 'No sender users. Mark users is_ai_scene_guide=true or is_bot=true.',
      });
    }

    const genres = [...new Set(result.rows.map((r) => r.genre_id))];
    const roomByGenre = new Map<string, string>();
    for (const g of genres) {
      const { data: chat } = await admin
        .from('chats')
        .select('id')
        .eq('entity_type', 'genre')
        .eq('entity_id', g)
        .eq('is_group_chat', true)
        .maybeSingle();
      if (chat) roomByGenre.set(g, chat.id);
    }

    let inserted = 0;
    const chunkSize = 50;
    for (let i = 0; i < result.rows.length; i += chunkSize) {
      const chunk = result.rows.slice(i, i + chunkSize);
      const payload = chunk
        .map((r, idx) => {
          const roomId = roomByGenre.get(r.genre_id);
          if (!roomId) return null;
          return {
            genre_id: r.genre_id,
            room_id: roomId,
            persona_id: null,
            persona_name: r.persona_name,
            sender_user_id: senders[(i + idx) % senders.length],
            scheduled_at: r.scheduled_at,
            status: r.status,
            content: r.content,
            intent: r.intent,
            intent_confidence: r.intent_confidence,
            data_segment: 'fixture',
            conversation_id: r.conversation_id,
            turn_number: r.turn_number,
            reply_to_turn: r.reply_to_turn,
            event_id: r.event_id,
            artist_name: r.artist_name,
            venue_name: r.venue_name,
            event_local_date: r.event_local_date,
            event_local_time: r.event_local_time,
            source_url: r.source_url,
            source_retrieved_at: r.source_retrieved_at,
            contains_setlist_spoiler: r.contains_setlist_spoiler,
            reviewer_decision: r.reviewer_decision,
            failure_reasons: r.failure_reasons || null,
            gate_summary: r.gate_summary,
            similarity_score: r.similarity_score,
            guide_version: r.guide_version,
            generator_version: r.generator_version,
            human_interruption_outcome: r.human_interruption_outcome,
            audit: r.audit,
          };
        })
        .filter(Boolean);

      if (!payload.length) continue;
      const { error, data } = await admin
        .from('ai_scene_guide_scheduled_posts')
        .insert(payload)
        .select('id');
      if (error) {
        return res.status(500).json({ error: error.message, inserted });
      }
      inserted += data?.length ?? payload.length;
    }

    await admin
      .from('ai_scene_guides_settings')
      .upsert({
        id: 'global',
        last_cron_schedule_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    return res.status(200).json({
      ok: true,
      inserted,
      conversations: result.conversations,
      rejected: result.rejected,
      uniqueTexts: result.stats.uniqueTexts,
      genres: result.stats.genres,
    });
  } catch (err) {
    console.error('[api/admin/ai-scene-guides-quality-seed]', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Quality seed failed',
    });
  }
}
