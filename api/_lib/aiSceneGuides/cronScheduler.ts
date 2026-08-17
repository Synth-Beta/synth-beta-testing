/**
 * Shared helpers for AI Scene Guides cron schedule + publish.
 * Posts are disclosed (author_type=ai_scene_guide). Not human-impersonating bots.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const LAUNCH_GENRES = ['indie', 'hip-hop', 'edm', 'metal', 'pop'] as const;

export type ScheduleSettings = {
  enabled: boolean;
  cron_enabled: boolean;
  dry_run: boolean;
  mode: string;
  max_ai_messages_per_room_day: number;
  pause_on_human_activity: boolean;
  quiet_hours: { startHour?: number; endHour?: number } | null;
  cron_posts_per_genre_min: number;
  cron_posts_per_genre_max: number;
  cron_genres: string[];
  writing_strategy: { voice?: string; strategy?: string; openerTemplates?: string[] } | null;
};

const TEMPLATE_POOL: Array<{ intent: string; build: (ctx: TemplateCtx) => string }> = [
  {
    intent: 'question',
    build: (c) =>
      `${c.artist ?? 'This act'} is on the radar for ${c.genreLabel}. Anyone already tracking dates?`,
  },
  {
    intent: 'fact',
    build: (c) =>
      c.venue
        ? `${c.artist ?? 'A date'} at ${c.venue}${c.city ? ` in ${c.city}` : ''}. Worth confirming doors before you commit.`
        : `Keeping an eye on ${c.genreLabel} dates this week.`,
  },
  {
    intent: 'discovery',
    build: (c) =>
      `If you're new to ${c.artist ?? 'the scene'}, start with one recent live cut, then the studio record.`,
  },
  {
    intent: 'question',
    build: (c) =>
      `Openers matter for ${c.genreLabel} nights. Prefer a local support or a touring pair?`,
  },
  {
    intent: 'fact',
    build: (c) =>
      `${c.artist ?? 'The bill'}: I'd re-check start time before heading out.`,
  },
];

type TemplateCtx = {
  genreLabel: string;
  artist?: string;
  venue?: string;
  city?: string;
};

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function getServiceSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function loadScheduleSettings(supabase: SupabaseClient): Promise<ScheduleSettings> {
  const { data } = await supabase
    .from('ai_scene_guides_settings')
    .select('*')
    .eq('id', 'global')
    .maybeSingle();

  return {
    enabled: Boolean(data?.enabled),
    cron_enabled: Boolean(data?.cron_enabled),
    dry_run: data?.dry_run !== false,
    mode: data?.mode ?? 'fixture',
    max_ai_messages_per_room_day: data?.max_ai_messages_per_room_day ?? 30,
    pause_on_human_activity: data?.pause_on_human_activity !== false,
    quiet_hours: (data?.quiet_hours as ScheduleSettings['quiet_hours']) ?? {
      startHour: 1,
      endHour: 7,
    },
    cron_posts_per_genre_min: data?.cron_posts_per_genre_min ?? 5,
    cron_posts_per_genre_max: data?.cron_posts_per_genre_max ?? 30,
    cron_genres: (data?.cron_genres as string[])?.length
      ? (data!.cron_genres as string[])
      : [...LAUNCH_GENRES],
    writing_strategy: (data?.writing_strategy as ScheduleSettings['writing_strategy']) ?? null,
  };
}

function inQuietHours(date: Date, quiet: ScheduleSettings['quiet_hours']): boolean {
  if (!quiet) return false;
  const start = quiet.startHour ?? 1;
  const end = quiet.endHour ?? 7;
  const hour = date.getUTCHours();
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** Random timestamp today (UTC) outside quiet hours, between now+15m and end of day. */
export function randomScheduleTimeToday(quiet: ScheduleSettings['quiet_hours']): Date | null {
  const now = Date.now();
  const end = new Date();
  end.setUTCHours(23, 50, 0, 0);
  const earliest = now + 15 * 60_000;
  if (earliest >= end.getTime()) return null;

  for (let attempt = 0; attempt < 40; attempt++) {
    const t = earliest + Math.floor(Math.random() * (end.getTime() - earliest));
    const d = new Date(t);
    if (!inQuietHours(d, quiet)) return d;
  }
  return new Date(Math.min(earliest + 2 * 3600_000, end.getTime()));
}

async function resolveSenderUserIds(supabase: SupabaseClient): Promise<string[]> {
  // Prefer users explicitly marked as AI scene guides if column exists; else is_bot pool.
  const { data: aiUsers, error: aiErr } = await supabase
    .from('users')
    .select('user_id')
    .eq('is_ai_scene_guide', true)
    .limit(100);

  if (!aiErr && aiUsers?.length) {
    return aiUsers.map((u) => u.user_id as string);
  }

  const { data: bots } = await supabase
    .from('users')
    .select('user_id')
    .eq('is_bot', true)
    .limit(100);

  return (bots ?? []).map((u) => u.user_id as string);
}

async function getGenreChat(
  supabase: SupabaseClient,
  genreId: string,
): Promise<{ id: string; chat_name: string | null } | null> {
  const { data } = await supabase
    .from('chats')
    .select('id, chat_name')
    .eq('entity_type', 'genre')
    .eq('entity_id', genreId)
    .eq('is_group_chat', true)
    .maybeSingle();
  return data;
}

async function recentEventContext(
  supabase: SupabaseClient,
  genreId: string,
): Promise<TemplateCtx> {
  const genreLabel = genreId.replace(/-/g, ' ');
  // Best-effort: pull a near-term event name if the schema has events
  try {
    const { data } = await supabase
      .from('events')
      .select('title, name, venue_name, city, start_time, event_date')
      .order('start_time', { ascending: true, nullsFirst: false })
      .limit(30);
    const row = (data ?? []).find(() => Math.random() > 0.5) ?? data?.[0];
    if (row) {
      return {
        genreLabel,
        artist: (row.title || row.name || undefined) as string | undefined,
        venue: (row.venue_name || undefined) as string | undefined,
        city: (row.city || undefined) as string | undefined,
      };
    }
  } catch {
    // ignore schema mismatches
  }
  return { genreLabel };
}

function interpolate(template: string, ctx: TemplateCtx): string | null {
  const vars: Record<string, string> = {
    artist: ctx.artist ?? '',
    venue: ctx.venue ?? '',
    city: ctx.city ?? '',
    genre: ctx.genreLabel,
    date: '',
    doors: '',
    start: '',
  };
  const needed = [...template.matchAll(/\{([a-z]+)\}/gi)].map((m) => m[1]!);
  for (const key of needed) {
    if (!vars[key]) return null;
  }
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(value);
  }
  return out.replace(/\s+/g, ' ').trim();
}

function buildMessage(
  ctx: TemplateCtx,
  openerTemplates?: string[] | null,
): { text: string; intent: string } {
  const custom = (openerTemplates ?? [])
    .map((t) => interpolate(t, ctx))
    .filter((t): t is string => !!t);
  if (custom.length) {
    const text = pick(custom);
    const intent = text.includes('?') ? 'question' : 'fact';
    return { text, intent };
  }
  const t = pick(TEMPLATE_POOL);
  return { text: t.build(ctx), intent: t.intent };
}

export type ScheduleResult = {
  scheduled: number;
  genres: string[];
  skipped: string[];
};

/**
 * Build today's randomized post schedule for configured genres.
 * Idempotent for the same UTC day: skips genres that already have scheduled/posted rows today.
 */
export async function buildDailyRandomSchedule(
  supabase: SupabaseClient,
  settings: ScheduleSettings,
): Promise<ScheduleResult> {
  const senders = await resolveSenderUserIds(supabase);
  if (!senders.length) {
    return {
      scheduled: 0,
      genres: [],
      skipped: ['no_sender_users'],
    };
  }

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date();
  dayEnd.setUTCHours(23, 59, 59, 999);

  let scheduled = 0;
  const genresDone: string[] = [];
  const skipped: string[] = [];

  for (const genreId of settings.cron_genres) {
    const chat = await getGenreChat(supabase, genreId);
    if (!chat) {
      skipped.push(`${genreId}:no_chat`);
      continue;
    }

    const { count } = await supabase
      .from('ai_scene_guide_scheduled_posts')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', chat.id)
      .gte('scheduled_at', dayStart.toISOString())
      .lte('scheduled_at', dayEnd.toISOString())
      .in('status', ['scheduled', 'posting', 'posted']);

    const existing = count ?? 0;
    const target = randInt(settings.cron_posts_per_genre_min, settings.cron_posts_per_genre_max);
    const remaining = Math.max(0, Math.min(target, settings.max_ai_messages_per_room_day) - existing);
    if (remaining <= 0) {
      skipped.push(`${genreId}:already_scheduled`);
      continue;
    }

    const { data: personas } = await supabase
      .from('ai_guide_personas')
      .select('id, display_name, sender_user_id, archetype')
      .eq('genre_id', genreId)
      .eq('is_active', true)
      .limit(100);

    const personaPool = personas ?? [];
    const ctx = await recentEventContext(supabase, genreId);

    for (let i = 0; i < remaining; i++) {
      const when = randomScheduleTimeToday(settings.quiet_hours);
      if (!when) {
        skipped.push(`${genreId}:no_time_slot`);
        break;
      }

      const persona = personaPool.length ? pick(personaPool) : null;
      const sender =
        (persona?.sender_user_id as string | undefined) &&
        senders.includes(persona.sender_user_id as string)
          ? (persona.sender_user_id as string)
          : pick(senders);

      const msg = buildMessage(ctx, settings.writing_strategy?.openerTemplates);

      const { error } = await supabase.from('ai_scene_guide_scheduled_posts').insert({
        genre_id: genreId,
        room_id: chat.id,
        persona_id: persona?.id ?? null,
        sender_user_id: sender,
        scheduled_at: when.toISOString(),
        status: 'scheduled',
        content: msg.text,
        intent: msg.intent,
        contains_setlist_spoiler: false,
        data_segment: 'live',
      });

      if (error) {
        skipped.push(`${genreId}:insert_failed:${error.message}`);
        continue;
      }
      scheduled += 1;
    }
    genresDone.push(genreId);
  }

  await supabase
    .from('ai_scene_guides_settings')
    .update({ last_cron_schedule_at: new Date().toISOString() })
    .eq('id', 'global');

  return { scheduled, genres: genresDone, skipped };
}

export type PublishResult = {
  posted: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
  ids: string[];
};

/**
 * Publish scheduled posts that are due. Fail-closed on kill switch / cron_enabled.
 */
export async function publishDueScheduledPosts(
  supabase: SupabaseClient,
  settings: ScheduleSettings,
  opts?: { limit?: number; now?: Date },
): Promise<PublishResult> {
  const now = opts?.now ?? new Date();
  const limit = opts?.limit ?? 20;

  if (!settings.cron_enabled || !settings.enabled) {
    return { posted: 0, skipped: 0, failed: 0, dryRun: true, ids: [] };
  }

  const { data: due, error } = await supabase
    .from('ai_scene_guide_scheduled_posts')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(limit);

  if (error) throw error;

  let posted = 0;
  let skipped = 0;
  let failed = 0;
  const ids: string[] = [];

  for (const row of due ?? []) {
    await supabase
      .from('ai_scene_guide_scheduled_posts')
      .update({ status: 'posting', updated_at: now.toISOString() })
      .eq('id', row.id)
      .eq('status', 'scheduled');

    // Sample/fixture seed rows stay in the admin log; only publish when mode=fixture
    if (row.data_segment === 'fixture' && settings.mode !== 'fixture') {
      await supabase
        .from('ai_scene_guide_scheduled_posts')
        .update({
          status: 'skipped',
          skip_reason: 'fixture_sample_not_live',
          updated_at: now.toISOString(),
        })
        .eq('id', row.id);
      skipped += 1;
      continue;
    }

    // Daily cap re-check
    const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
    const { count: recentAi } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('chat_id', row.room_id)
      .eq('author_type', 'ai_scene_guide')
      .gte('created_at', since);

    if ((recentAi ?? 0) >= settings.max_ai_messages_per_room_day) {
      await supabase
        .from('ai_scene_guide_scheduled_posts')
        .update({
          status: 'skipped',
          skip_reason: 'daily_cap',
          updated_at: now.toISOString(),
        })
        .eq('id', row.id);
      skipped += 1;
      continue;
    }

    if (settings.pause_on_human_activity) {
      const { data: lastHuman } = await supabase
        .from('messages')
        .select('created_at, author_type')
        .eq('chat_id', row.room_id)
        .or('author_type.eq.human,author_type.is.null')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastHuman?.created_at) {
        const ageMin = (now.getTime() - Date.parse(lastHuman.created_at)) / 60_000;
        if (ageMin < 20) {
          await supabase
            .from('ai_scene_guide_scheduled_posts')
            .update({
              status: 'skipped',
              skip_reason: 'human_recently_active',
              updated_at: now.toISOString(),
            })
            .eq('id', row.id);
          skipped += 1;
          continue;
        }
      }
    }

    if (settings.dry_run || settings.mode === 'fixture' || settings.mode === 'shadow_slack') {
      await supabase
        .from('ai_scene_guide_scheduled_posts')
        .update({
          status: 'skipped',
          skip_reason: `dry_run_mode_${settings.mode}`,
          updated_at: now.toISOString(),
        })
        .eq('id', row.id);
      skipped += 1;
      ids.push(row.id);
      continue;
    }

    const content = row.content as string;
    const { data: inserted, error: insertErr } = await supabase
      .from('messages')
      .insert({
        chat_id: row.room_id,
        sender_id: row.sender_user_id,
        content,
        message_type: 'text',
        is_encrypted: false,
        author_type: 'ai_scene_guide',
        persona_id: row.persona_id,
        plan_id: row.plan_id,
        cited_fact_ids: row.cited_fact_ids ?? [],
        contains_setlist_spoiler: Boolean(row.contains_setlist_spoiler),
        metadata: {
          author_type: 'ai_scene_guide',
          disclosure_label: 'AI Scene Guide',
          persona_id: row.persona_id,
          scheduled_post_id: row.id,
          intent: row.intent,
          cron: true,
        },
      })
      .select('id')
      .maybeSingle();

    if (insertErr) {
      await supabase
        .from('ai_scene_guide_scheduled_posts')
        .update({
          status: 'failed',
          error: insertErr.message,
          updated_at: now.toISOString(),
        })
        .eq('id', row.id);
      failed += 1;
      continue;
    }

    await supabase
      .from('ai_scene_guide_scheduled_posts')
      .update({
        status: 'posted',
        message_id: inserted?.id ?? null,
        posted_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', row.id);

    await supabase.from('ai_message_audits').insert({
      message_id: inserted?.id ?? null,
      candidate_message_id: row.id,
      plan_id: row.plan_id,
      persona_id: row.persona_id,
      generated_text: content,
      intent: row.intent,
      publisher_decision: 'published',
      data_segment: row.data_segment ?? 'live',
      moderation_results: { cron: true },
      verifier_results: { cron_random_schedule: true },
    });

    posted += 1;
    ids.push(row.id);
  }

  await supabase
    .from('ai_scene_guides_settings')
    .update({ last_cron_publish_at: now.toISOString() })
    .eq('id', 'global');

  return {
    posted,
    skipped,
    failed,
    dryRun: settings.dry_run,
    ids,
  };
}
