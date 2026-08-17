/**
 * Admin-side AI Scene Guides cron monitor + schedule rebuild (via user JWT + RLS).
 */

import { supabase } from '@/integrations/supabase/client';

export type ScheduledPost = {
  id: string;
  genre_id: string;
  room_id: string;
  persona_id: string | null;
  sender_user_id: string;
  scheduled_at: string;
  status: string;
  content: string | null;
  intent: string | null;
  skip_reason: string | null;
  error: string | null;
  posted_at: string | null;
  created_at: string;
  data_segment?: string | null;
  conversation_id?: string | null;
  turn_number?: number | null;
  reply_to_turn?: number | null;
  event_id?: string | null;
  artist_name?: string | null;
  venue_name?: string | null;
  event_local_date?: string | null;
  source_url?: string | null;
  reviewer_decision?: string | null;
  failure_reasons?: string | null;
  gate_summary?: string | null;
  sender_name?: string | null;
  persona_name?: string | null;
  chat_name?: string | null;
};

export type CronSettings = {
  enabled: boolean;
  cron_enabled: boolean;
  dry_run: boolean;
  mode: string;
  max_ai_messages_per_room_day: number;
  cron_posts_per_genre_min: number;
  cron_posts_per_genre_max: number;
  cron_genres: string[];
  last_cron_schedule_at: string | null;
  last_cron_publish_at: string | null;
  pause_on_human_activity: boolean;
  writing_strategy: {
    voice: string;
    strategy: string;
    openerTemplates: string[];
  };
};

const DEFAULT_GENRES = ['indie', 'hip-hop', 'edm', 'metal', 'pop'];

function randInt(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomTimeToday(): Date | null {
  const now = Date.now();
  const end = new Date();
  end.setUTCHours(23, 50, 0, 0);
  const earliest = now + 15 * 60_000;
  if (earliest >= end.getTime()) return null;
  for (let i = 0; i < 30; i++) {
    const t = new Date(earliest + Math.floor(Math.random() * (end.getTime() - earliest)));
    const h = t.getUTCHours();
    if (!(h >= 1 && h < 7)) return t;
  }
  return new Date(Math.min(earliest + 3 * 3600_000, end.getTime()));
}

const TEMPLATES = [
  (g: string, a?: string) =>
    `${a ?? 'This act'} is on the radar for ${g}. Anyone already tracking dates?`,
  (g: string, a?: string) =>
    `Keeping an eye on ${g} dates this week${a ? ` (${a})` : ''} — confirm the listing before you commit.`,
  (g: string, a?: string) =>
    `If you're new to ${a ?? 'the scene'}, start with a recent live cut or the latest studio record?`,
  (g: string) => `Openers matter for ${g} nights. Prefer a local support or a touring pair?`,
  (g: string, a?: string) =>
    `Practical ${g} tip: re-check doors and age policy on the venue page before you go${a ? ` (${a})` : ''}.`,
  (g: string, a?: string) =>
    `Anyone comparing early vs late set energy for ${a ?? `this ${g} bill`}?`,
  (g: string) => `For ${g} newcomers — festival stage or club date first?`,
  (g: string, a?: string) =>
    `${a ?? 'A listing'} popped for ${g}. Worth confirming ticket source before sharing.`,
  (g: string) => `What makes a ${g} show feel packed vs empty for you — room size or lineup depth?`,
  (g: string, a?: string) =>
    `Looking at ${g} calendars this month${a ? ` around ${a}` : ''}. Any must-see undercards?`,
];

/** Required contextual test size (POST + SILENCE decisions). */
const SAMPLE_SEED_COUNT = 200;
const SAMPLE_HORIZON_DAYS = 7;

function randomSampleTime(horizonDays = SAMPLE_HORIZON_DAYS): Date {
  const earliest = Date.now() + 5 * 60_000;
  const latest = earliest + horizonDays * 24 * 3600_000;
  return new Date(earliest + Math.floor(Math.random() * (latest - earliest)));
}

async function loadSenderPool(): Promise<string[]> {
  const { data: sendersAi } = await supabase
    .from('users')
    .select('user_id')
    .eq('is_ai_scene_guide', true)
    .limit(200);

  let senders = (sendersAi ?? []).map((u) => u.user_id as string);
  if (!senders.length) {
    const { data: bots } = await supabase.from('users').select('user_id').eq('is_bot', true).limit(200);
    senders = (bots ?? []).map((u) => u.user_id as string);
  }
  if (!senders.length) {
    throw new Error('No sender users found. Mark users with is_ai_scene_guide=true or is_bot=true.');
  }
  return senders;
}

type GenreChat = { genreId: string; roomId: string; chatName: string | null };

async function loadGenreChats(genres: string[]): Promise<GenreChat[]> {
  const out: GenreChat[] = [];
  for (const genreId of genres) {
    const { data: chat } = await supabase
      .from('chats')
      .select('id, chat_name')
      .eq('entity_type', 'genre')
      .eq('entity_id', genreId)
      .eq('is_group_chat', true)
      .maybeSingle();
    if (chat) out.push({ genreId, roomId: chat.id, chatName: chat.chat_name });
  }
  return out;
}

export async function fetchCronSettings(): Promise<CronSettings> {
  const { data } = await supabase
    .from('ai_scene_guides_settings')
    .select('*')
    .eq('id', 'global')
    .maybeSingle();

  return {
    enabled: Boolean(data?.enabled),
    cron_enabled: Boolean(data?.cron_enabled),
    dry_run: data?.dry_run !== false,
    mode: (data?.mode as string) ?? 'fixture',
    max_ai_messages_per_room_day: data?.max_ai_messages_per_room_day ?? 30,
    cron_posts_per_genre_min: data?.cron_posts_per_genre_min ?? 5,
    cron_posts_per_genre_max: data?.cron_posts_per_genre_max ?? 30,
    cron_genres: (data?.cron_genres as string[])?.length
      ? (data!.cron_genres as string[])
      : DEFAULT_GENRES,
    last_cron_schedule_at: data?.last_cron_schedule_at ?? null,
    last_cron_publish_at: data?.last_cron_publish_at ?? null,
    pause_on_human_activity: data?.pause_on_human_activity !== false,
    writing_strategy: mergeWritingStrategyFromRow(data?.writing_strategy),
  };
}

function mergeWritingStrategyFromRow(raw: unknown): CronSettings['writing_strategy'] {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const openerTemplates = Array.isArray(obj.openerTemplates)
    ? (obj.openerTemplates as unknown[]).map((t) => String(t).trim()).filter(Boolean)
    : [];
  return {
    voice: typeof obj.voice === 'string' && obj.voice.trim() ? obj.voice.trim() : '',
    strategy: typeof obj.strategy === 'string' && obj.strategy.trim() ? obj.strategy.trim() : '',
    openerTemplates,
  };
}

export async function saveCronSettings(patch: Partial<CronSettings>): Promise<void> {
  const { error } = await supabase.from('ai_scene_guides_settings').upsert({
    id: 'global',
    ...patch,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function fetchScheduledPosts(limit = 5000): Promise<ScheduledPost[]> {
  const PAGE = 1000;
  const max = Math.max(1, limit);
  const rows: ScheduledPost[] = [];

  for (let from = 0; from < max; from += PAGE) {
    const to = Math.min(from + PAGE - 1, max - 1);
    const { data, error } = await supabase
      .from('ai_scene_guide_scheduled_posts')
      .select('*')
      .order('scheduled_at', { ascending: true })
      .range(from, to);
    if (error) throw error;
    const page = (data ?? []) as ScheduledPost[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  if (!rows.length) return [];

  const senderIds = [...new Set(rows.map((r) => r.sender_user_id).filter(Boolean))];
  const personaIds = [...new Set(rows.map((r) => r.persona_id).filter(Boolean))];
  const roomIds = [...new Set(rows.map((r) => r.room_id).filter(Boolean))];

  // Enrich in chunks — .in() also caps around 1000 ids
  const userMap = new Map<string, string | null>();
  const personaMap = new Map<string, string>();
  const chatMap = new Map<string, string | null>();

  const chunk = <T,>(arr: T[], size: number) => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  for (const ids of chunk(senderIds, 200)) {
    const { data: users } = await supabase.from('users').select('user_id, name').in('user_id', ids);
    for (const u of users ?? []) userMap.set(u.user_id, u.name);
  }
  for (const ids of chunk(personaIds as string[], 200)) {
    const { data: personas } = await supabase
      .from('ai_guide_personas')
      .select('id, display_name')
      .in('id', ids);
    for (const p of personas ?? []) personaMap.set(p.id, p.display_name);
  }
  for (const ids of chunk(roomIds, 200)) {
    const { data: chats } = await supabase.from('chats').select('id, chat_name').in('id', ids);
    for (const c of chats ?? []) chatMap.set(c.id, c.chat_name);
  }

  return rows.map((r) => ({
    ...r,
    sender_name: userMap.get(r.sender_user_id) ?? null,
    persona_name:
      (r.persona_name as string | null | undefined) ||
      (r.persona_id ? personaMap.get(r.persona_id) ?? null : null),
    chat_name: chatMap.get(r.room_id) ?? null,
  })) as ScheduledPost[];
}

/** Exact total rows (not capped by the PostgREST default 1000). */
export async function countScheduledPosts(): Promise<number> {
  const { count, error } = await supabase
    .from('ai_scene_guide_scheduled_posts')
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function cancelScheduledPost(id: string): Promise<void> {
  const { error } = await supabase
    .from('ai_scene_guide_scheduled_posts')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'scheduled');
  if (error) throw error;
}

/** Wipe the entire schedule/message log so you can quality-seed from scratch. */
export async function clearScheduledPosts(): Promise<number> {
  let deleted = 0;
  // Loop: select a page, delete by id (handles PostgREST row caps)
  for (let guard = 0; guard < 50; guard++) {
    const { data, error } = await supabase
      .from('ai_scene_guide_scheduled_posts')
      .select('id')
      .limit(500);
    if (error) throw error;
    const ids = (data ?? []).map((r) => r.id as string);
    if (!ids.length) break;

    const { error: delErr, count } = await supabase
      .from('ai_scene_guide_scheduled_posts')
      .delete({ count: 'exact' })
      .in('id', ids);
    if (delErr) throw delErr;
    deleted += count ?? ids.length;
  }
  return deleted;
}

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Download the scheduled/posted message log as CSV. */
export function downloadMessageLogCsv(posts: ScheduledPost[], filename?: string): void {
  const headers = [
    'id',
    'scheduled_at',
    'scheduled_at_local',
    'posted_at',
    'created_at',
    'status',
    'skip_reason',
    'genre_id',
    'room_id',
    'room_timezone',
    'chat_name',
    'conversation_id',
    'turn_number',
    'reply_to_turn',
    'sender_user_id',
    'sender_name',
    'persona_id',
    'persona_name',
    'persona_archetype',
    'intent',
    'intent_confidence',
    'content',
    'event_id',
    'artist_name',
    'venue_name',
    'city',
    'event_local_date',
    'event_local_time',
    'event_starts_at_utc',
    'source_url',
    'source_retrieved_at',
    'source_field_path',
    'fact_confidence',
    'normalized_key',
    'structural_fingerprint',
    'template_family',
    'guide_version',
    'generator_version',
    'rule_version',
    'reviewer_decision',
    'failure_reasons',
    'gate_summary',
    'data_segment',
    'audit',
  ];

  const lines = [
    headers.join(','),
    ...posts.map((p) => {
      const row = p as ScheduledPost & Record<string, unknown>;
      return headers
        .map((h) => {
          const v = row[h];
          if (h === 'audit' && v && typeof v === 'object') {
            return csvEscape(JSON.stringify(v));
          }
          return csvEscape(v);
        })
        .join(',');
    }),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download =
    filename ??
    `ai-scene-guides-message-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Rebuild today's random schedule (admin JWT) — daily cadence (5–30 / genre). */
export async function rebuildTodaySchedule(settings: CronSettings): Promise<{ scheduled: number; detail: string[] }> {
  const senders = await loadSenderPool();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date();
  dayEnd.setUTCHours(23, 59, 59, 999);

  let scheduled = 0;
  const detail: string[] = [];

  for (const genreId of settings.cron_genres) {
    const { data: chat } = await supabase
      .from('chats')
      .select('id, chat_name')
      .eq('entity_type', 'genre')
      .eq('entity_id', genreId)
      .eq('is_group_chat', true)
      .maybeSingle();

    if (!chat) {
      detail.push(`${genreId}: no genre chat`);
      continue;
    }

    const { count } = await supabase
      .from('ai_scene_guide_scheduled_posts')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', chat.id)
      .gte('scheduled_at', dayStart.toISOString())
      .lte('scheduled_at', dayEnd.toISOString())
      .in('status', ['scheduled', 'posting', 'posted']);

    const target = randInt(settings.cron_posts_per_genre_min, settings.cron_posts_per_genre_max);
    const remaining = Math.max(
      0,
      Math.min(target, settings.max_ai_messages_per_room_day) - (count ?? 0),
    );
    if (remaining <= 0) {
      detail.push(`${genreId}: already full for today`);
      continue;
    }

    const { data: personas } = await supabase
      .from('ai_guide_personas')
      .select('id, display_name, sender_user_id')
      .eq('genre_id', genreId)
      .eq('is_active', true)
      .limit(50);

    for (let i = 0; i < remaining; i++) {
      const when = randomTimeToday();
      if (!when) {
        detail.push(`${genreId}: no time slots left today`);
        break;
      }
      const persona = personas?.length ? pick(personas) : null;
      const sender =
        persona?.sender_user_id && senders.includes(persona.sender_user_id)
          ? persona.sender_user_id
          : pick(senders);
      const genreLabel = genreId.replace(/-/g, ' ');
      const text = pick(TEMPLATES)(genreLabel, persona?.display_name);

      const { error } = await supabase.from('ai_scene_guide_scheduled_posts').insert({
        genre_id: genreId,
        room_id: chat.id,
        persona_id: persona?.id ?? null,
        sender_user_id: sender,
        scheduled_at: when.toISOString(),
        status: 'scheduled',
        content: text,
        intent: pick(['question', 'fact', 'discovery']),
        data_segment: 'live',
      });
      if (error) {
        detail.push(`${genreId}: ${error.message}`);
        continue;
      }
      scheduled += 1;
    }
    detail.push(`${genreId}: +${remaining} targeted`);
  }

  await saveCronSettings({
    last_cron_schedule_at: new Date().toISOString(),
  } as Partial<CronSettings>);

  return { scheduled, detail };
}

/**
 * Contextual contribution seed — one decision per transaction (POST / REPLY / SILENCE).
 * Personas bind 1:1 to sender accounts. Never prewrites multi-turn graphs.
 */
export async function seedSampleMessages(
  settings: CronSettings,
  options?: { count?: number },
): Promise<{ scheduled: number; detail: string[]; silences: number }> {
  const total = Math.max(50, Math.min(options?.count ?? SAMPLE_SEED_COUNT, 500));

  const { runContextualSeed } = await import('@synth/ai-scene-guides/quality');
  const senders = await loadSenderPool();
  if (!senders.length) {
    throw new Error('No AI Scene Guide sender users (is_ai_scene_guide / is_bot).');
  }

  const result = runContextualSeed({
    targetDecisions: total,
    seed: 42,
    genres: settings.cron_genres,
    senderCount: senders.length,
    strategy: settings.writing_strategy,
  });

  const chats = await loadGenreChats(settings.cron_genres);
  if (!chats.length) {
    throw new Error('No genre chats found for configured genres.');
  }
  const roomByGenre = new Map(chats.map((c) => [c.genreId, c.roomId]));

  const detail: string[] = [
    `${result.stats.decisions} decisions`,
    `${result.stats.posts} POST`,
    `${result.stats.replies} REPLY`,
    `${result.stats.silences} SILENCE (${Math.round(result.stats.silenceRate * 100)}%)`,
    `${result.stats.uniqueTexts} unique texts`,
    `${result.stats.templateFamilies} template families`,
    `length 1–7:${result.stats.lengthBuckets.under8} 8–20:${result.stats.lengthBuckets.mid8_20} 21–45:${result.stats.lengthBuckets.mid21_45}`,
  ];

  // Bind each persona permanently to one sender (slot index → senders[slot])
  const personaIdRemap = new Map<string, string>();
  const senderByPersona = new Map<string, string>();

  for (const p of result.personas) {
    const senderId = senders[p.senderSlot % senders.length]!;
    const key = `${p.genreId}::${p.displayName}`;

    const { data: existing } = await supabase
      .from('ai_guide_personas')
      .select('id, sender_user_id')
      .eq('genre_id', p.genreId)
      .eq('display_name', p.displayName)
      .maybeSingle();

    if (existing?.id) {
      personaIdRemap.set(p.id, existing.id);
      await supabase
        .from('ai_guide_personas')
        .update({
          sender_user_id: senderId,
          archetype: p.archetype,
          is_active: true,
          disclosure_label: 'AI Scene Guide',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      senderByPersona.set(existing.id, senderId);
    } else {
      const { error: pErr } = await supabase.from('ai_guide_personas').insert({
        id: p.id,
        genre_id: p.genreId,
        display_name: p.displayName,
        archetype: p.archetype,
        sender_user_id: senderId,
        disclosure_label: 'AI Scene Guide',
        is_active: true,
        voice_traits: p.voiceTraits ?? {},
        interest_weights: {},
        message_length_distribution: p.messageLengthDistribution ?? {},
        updated_at: new Date().toISOString(),
      });
      if (pErr) {
        detail.push(`persona ${key}: ${pErr.message}`);
        // Resolve by name if race/collision
        const { data: again } = await supabase
          .from('ai_guide_personas')
          .select('id')
          .eq('genre_id', p.genreId)
          .eq('display_name', p.displayName)
          .maybeSingle();
        if (again?.id) {
          personaIdRemap.set(p.id, again.id);
          senderByPersona.set(again.id, senderId);
        }
      } else {
        personaIdRemap.set(p.id, p.id);
        senderByPersona.set(p.id, senderId);
      }
    }
  }

  detail.push(`personas bound 1:1 to ${result.personas.length} senders`);

  // Insert SILENCE rows as skipped (auditable) + POST/REPLY as scheduled
  let scheduled = 0;
  let silencesInserted = 0;

  const allRows = result.decisions;
  for (let i = 0; i < allRows.length; i += 40) {
    const chunk = allRows.slice(i, i + 40);
    const payload = chunk
      .map((r) => {
        const roomId = roomByGenre.get(r.genre_id);
        if (!roomId) return null;

        if (r.action === 'SILENCE') {
          return {
            genre_id: r.genre_id,
            room_id: roomId,
            persona_id: r.persona_id ? personaIdRemap.get(r.persona_id) ?? r.persona_id : null,
            persona_name: r.persona_name,
            persona_archetype: r.persona_archetype,
            sender_user_id:
              (r.persona_id &&
                senderByPersona.get(personaIdRemap.get(r.persona_id) ?? r.persona_id)) ||
              senders[0],
            scheduled_at: r.generated_at,
            status: 'skipped',
            skip_reason: r.silence_reason,
            content: null,
            intent: 'silence',
            data_segment: 'fixture',
            conversation_id: null,
            turn_number: null,
            reply_to_turn: null,
            gate_summary: r.gate_summary,
            room_timezone: r.room_timezone,
            guide_version: r.guide_version,
            generator_version: r.generator_version,
            rule_version: r.rule_version,
            failure_reasons: r.failure_reasons || null,
            audit: r.audit,
          };
        }

        if (!r.persona_id || !r.scheduled_at || !r.content) return null;
        const resolvedPersonaId = personaIdRemap.get(r.persona_id) ?? r.persona_id;
        const sender = senderByPersona.get(resolvedPersonaId) ?? senders[0]!;
        return {
          genre_id: r.genre_id,
          room_id: roomId,
          persona_id: resolvedPersonaId,
          persona_name: r.persona_name,
          persona_archetype: r.persona_archetype,
          sender_user_id: sender,
          scheduled_at: r.scheduled_at,
          status: 'scheduled',
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
          city: r.city,
          event_local_date: r.event_local_date,
          event_local_time: r.event_local_time,
          event_starts_at_utc: r.event_starts_at_utc,
          source_url: r.source_url,
          source_retrieved_at: r.source_retrieved_at,
          source_field_path: r.source_field_path,
          fact_confidence: r.fact_confidence,
          contains_setlist_spoiler: r.contains_setlist_spoiler,
          reviewer_decision: null,
          failure_reasons: r.failure_reasons || null,
          gate_summary: r.gate_summary,
          normalized_key: r.normalized_key,
          structural_fingerprint: r.structural_fingerprint,
          template_family: r.template_family,
          guide_version: r.guide_version,
          generator_version: r.generator_version,
          rule_version: r.rule_version,
          room_timezone: r.room_timezone,
          scheduled_at_local: r.scheduled_at_local,
          human_interruption_outcome: null,
          audit: {
            ...r.audit,
            generation_id: r.generation_id,
            generated_at: r.generated_at,
            action: r.action,
            parent_span: r.parent_span,
            addressed_parent_span: r.addressed_parent_span,
            cited_fact_ids: r.cited_fact_ids,
            contribution_type: r.contribution_type,
          },
        };
      })
      .filter(Boolean);

    if (!payload.length) continue;
    const { error, data } = await supabase
      .from('ai_scene_guide_scheduled_posts')
      .insert(payload)
      .select('id, status');
    if (error) {
      detail.push(`batch ${i / 40 + 1}: ${error.message}`);
      for (const row of payload as Array<Record<string, unknown>>) {
        const { error: rowErr, data: rowData } = await supabase
          .from('ai_scene_guide_scheduled_posts')
          .insert(row)
          .select('id, status')
          .maybeSingle();
        if (rowErr) continue;
        if (rowData?.status === 'scheduled') scheduled += 1;
        else silencesInserted += 1;
      }
      continue;
    }
    for (const row of data ?? []) {
      if (row.status === 'scheduled') scheduled += 1;
      else silencesInserted += 1;
    }
  }

  for (const [g, n] of Object.entries(result.stats.genres)) {
    detail.push(`${g}: ${n} posts`);
  }

  await saveCronSettings({
    last_cron_schedule_at: new Date().toISOString(),
  } as Partial<CronSettings>);

  if (!scheduled && !silencesInserted) {
    throw new Error(`Contextual seed inserted 0 rows. ${detail.join(' · ')}`);
  }

  detail.push(`inserted ${scheduled} scheduled + ${silencesInserted} silence/skipped`);
  return { scheduled, detail, silences: silencesInserted };
}

/** In-memory preview — does not write the queue. Uses the current voice/strategy. */
export async function previewSampleMessages(
  settings: CronSettings,
  options?: { count?: number },
): Promise<{
  posts: Array<{ action: string; content: string | null; genre_id: string; persona_name: string | null }>;
  stats: {
    decisions: number;
    posts: number;
    replies: number;
    silences: number;
    silenceRate: number;
    uniqueTexts: number;
    templateFamilies: number;
    lengthBuckets: {
      under8: number;
      mid8_20: number;
      mid21_45: number;
      mid46_90: number;
    };
  };
}> {
  const total = Math.max(20, Math.min(options?.count ?? 40, 80));
  const { runContextualSeed } = await import('@synth/ai-scene-guides/quality');
  const result = runContextualSeed({
    targetDecisions: total,
    seed: Date.now() % 10_000,
    genres: settings.cron_genres,
    senderCount: 8,
    strategy: settings.writing_strategy,
  });
  return {
    posts: result.posts.slice(0, 24).map((p) => ({
      action: p.action,
      content: p.content,
      genre_id: p.genre_id,
      persona_name: p.persona_name,
    })),
    stats: {
      decisions: result.stats.decisions,
      posts: result.stats.posts,
      replies: result.stats.replies,
      silences: result.stats.silences,
      silenceRate: result.stats.silenceRate,
      uniqueTexts: result.stats.uniqueTexts,
      templateFamilies: result.stats.templateFamilies,
      lengthBuckets: result.stats.lengthBuckets,
    },
  };
}

export { SAMPLE_SEED_COUNT };
