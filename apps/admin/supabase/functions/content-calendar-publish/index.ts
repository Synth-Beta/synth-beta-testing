import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import {
  FALLBACK_IG_IMAGE,
  fetchSupabaseRest,
  jsonResponse,
  optionsResponse,
} from '../_shared/editorialRest.ts';

const LOG = '[content-calendar-publish]';
const DEFAULT_API_VERSION = 'v24.0';

type CalendarPost = {
  id: string;
  platform: string;
  status: string;
  title: string | null;
  body: string;
  hashtags: string[] | null;
  media_urls: string[] | null;
  scheduled_at: string | null;
  target_forum: string | null;
};

function igEnv() {
  const userId =
    Deno.env.get('INSTAGRAM_USER_ID') ?? Deno.env.get('INSTAGRAM_GRAPH_USER_ID');
  const token =
    Deno.env.get('INSTAGRAM_ACCESS_TOKEN') ?? Deno.env.get('INSTAGRAM_GRAPH_ACCESS_TOKEN');
  const version = (Deno.env.get('INSTAGRAM_API_VERSION') ?? DEFAULT_API_VERSION).replace(
    /^\/+|\/+$/g,
    '',
  );
  return { userId, token, version };
}

async function requireAdminOrCron(authHeader: string | null, body: Record<string, unknown>): Promise<{
  ok: boolean;
  userId: string | null;
  isCron: boolean;
}> {
  const cronSecret = Deno.env.get('CONTENT_CALENDAR_CRON_SECRET');
  if (cronSecret && body.cron_secret === cronSecret) {
    return { ok: true, userId: null, isCron: true };
  }

  if (!authHeader?.startsWith('Bearer ')) return { ok: false, userId: null, isCron: false };
  const token = authHeader.slice(7);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anon) return { ok: false, userId: null, isCron: false };

  const userRes = await fetch(`${supabaseUrl.replace(/\/+$/g, '')}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anon },
  });
  if (!userRes.ok) return { ok: false, userId: null, isCron: false };
  const user = await userRes.json();
  const uid = user?.id as string | undefined;
  if (!uid) return { ok: false, userId: null, isCron: false };

  const rows = (await fetchSupabaseRest(
    `users?user_id=eq.${uid}&select=account_type&limit=1`,
  )) as Array<{ account_type: string }>;
  if (rows?.[0]?.account_type !== 'admin') return { ok: false, userId: null, isCron: false };
  return { ok: true, userId: uid, isCron: false };
}

function captionFor(post: CalendarPost): string {
  const tags = (post.hashtags ?? []).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
  const parts = [post.body.trim()];
  if (tags) parts.push(tags);
  return parts.join('\n\n').slice(0, 2200);
}

async function publishInstagram(post: CalendarPost): Promise<{ mediaId: string }> {
  const { userId, token, version } = igEnv();
  if (!userId || !token) {
    throw new Error('Instagram credentials missing (INSTAGRAM_USER_ID / INSTAGRAM_ACCESS_TOKEN)');
  }

  const imageUrl = post.media_urls?.[0] || FALLBACK_IG_IMAGE;
  const caption = captionFor(post);
  const base = `https://graph.facebook.com/${version}`;

  const createUrl = new URL(`${base}/${userId}/media`);
  createUrl.searchParams.set('image_url', imageUrl);
  createUrl.searchParams.set('caption', caption);
  createUrl.searchParams.set('access_token', token);

  const createRes = await fetch(createUrl.toString(), { method: 'POST' });
  const createJson = await createRes.json();
  if (!createRes.ok || !createJson.id) {
    throw new Error(`IG container failed: ${JSON.stringify(createJson).slice(0, 300)}`);
  }

  const publishUrl = new URL(`${base}/${userId}/media_publish`);
  publishUrl.searchParams.set('creation_id', createJson.id);
  publishUrl.searchParams.set('access_token', token);

  const publishRes = await fetch(publishUrl.toString(), { method: 'POST' });
  const publishJson = await publishRes.json();
  if (!publishRes.ok || !publishJson.id) {
    throw new Error(`IG publish failed: ${JSON.stringify(publishJson).slice(0, 300)}`);
  }

  return { mediaId: String(publishJson.id) };
}

async function markPublishing(id: string) {
  await fetchSupabaseRest(`content_calendar_posts?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'publishing', error: null }),
  });
}

async function markPublished(id: string, externalId: string) {
  await fetchSupabaseRest(`content_calendar_posts?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'published',
      published_at: new Date().toISOString(),
      external_post_id: externalId,
      error: null,
    }),
  });
}

async function markFailed(id: string, error: string) {
  await fetchSupabaseRest(`content_calendar_posts?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'failed', error: error.slice(0, 500) }),
  });
}

async function publishOne(post: CalendarPost, dryRun: boolean) {
  if (post.platform !== 'instagram') {
    return {
      id: post.id,
      platform: post.platform,
      action: 'manual_only',
      message:
        'LinkedIn/Substack/Reddit are copy-ready drafts in v1. Copy the body and mark published manually.',
      copy: {
        title: post.title,
        body: captionFor(post),
        target_forum: post.target_forum,
      },
    };
  }

  if (dryRun) {
    return {
      id: post.id,
      platform: 'instagram',
      action: 'dry_run',
      caption: captionFor(post),
      image_url: post.media_urls?.[0] || FALLBACK_IG_IMAGE,
    };
  }

  await markPublishing(post.id);
  try {
    const { mediaId } = await publishInstagram(post);
    await markPublished(post.id, mediaId);
    return { id: post.id, platform: 'instagram', action: 'published', external_post_id: mediaId };
  } catch (err) {
    await markFailed(post.id, (err as Error).message);
    throw err;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const auth = await requireAdminOrCron(req.headers.get('Authorization'), body);
    if (!auth.ok) return jsonResponse({ error: 'Admin auth required' }, 401);

    const dryRun = Boolean(body.dry_run);
    const mode = (body.mode as string) || 'single'; // single | due
    const postId = body.post_id as string | undefined;
    const force = Boolean(body.force); // publish now even if not due

    if (mode === 'due') {
      const nowIso = new Date().toISOString();
      const due = (await fetchSupabaseRest(
        `content_calendar_posts?status=in.(approved,scheduled)&platform=eq.instagram&scheduled_at=lte.${encodeURIComponent(nowIso)}&select=*&order=scheduled_at.asc&limit=10`,
      )) as CalendarPost[];

      const results = [];
      for (const post of due ?? []) {
        try {
          results.push(await publishOne(post, dryRun));
        } catch (err) {
          results.push({ id: post.id, error: (err as Error).message });
        }
      }
      return jsonResponse({ data: { mode: 'due', results, count: results.length } });
    }

    if (!postId) return jsonResponse({ error: 'post_id required for single mode' }, 400);

    const rows = (await fetchSupabaseRest(
      `content_calendar_posts?id=eq.${postId}&select=*&limit=1`,
    )) as CalendarPost[];
    const post = rows?.[0];
    if (!post) return jsonResponse({ error: 'Post not found' }, 404);

    const publishable = ['approved', 'scheduled', 'failed'].includes(post.status);
    if (!force && !publishable && post.platform === 'instagram') {
      return jsonResponse(
        { error: `Post status ${post.status} is not publishable. Approve first.` },
        400,
      );
    }

    if (
      !force &&
      post.platform === 'instagram' &&
      post.scheduled_at &&
      new Date(post.scheduled_at) > new Date() &&
      mode === 'single' &&
      body.respect_schedule
    ) {
      return jsonResponse({ error: 'Post is scheduled for the future. Use force or wait.' }, 400);
    }

    const result = await publishOne(post, dryRun);
    return jsonResponse({ data: result });
  } catch (err) {
    console.error(LOG, err);
    return jsonResponse({ error: (err as Error).message ?? 'Publish failed' }, 500);
  }
});
