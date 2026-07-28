/**
 * Deno editorial-generate. Parity with Vercel api/editorial-generate.ts.
 * Research snippets → claim ledger → platform-native drafts → lint/rubric → pending_review.
 */
import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import {
  runEditorialWritingPipeline,
  toEditorialMeta,
} from '../_shared/editorial-writing/mod.ts';
import {
  FALLBACK_IG_IMAGE,
  fetchSupabaseRest,
  jsonResponse,
  optionsResponse,
} from '../_shared/editorialRest.ts';

const LOG = '[editorial-generate]';

async function requireAdmin(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anon) return null;

  const userRes = await fetch(`${supabaseUrl.replace(/\/+$/g, '')}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anon },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  const uid = user?.id as string | undefined;
  if (!uid) return null;

  const rows = (await fetchSupabaseRest(
    `users?user_id=eq.${uid}&select=account_type&limit=1`,
  )) as Array<{ account_type: string }>;
  if (rows?.[0]?.account_type !== 'admin') return null;
  return uid;
}

async function callOpenAI(system: string, user: string, maxTokens = 1800): Promise<string> {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) throw new Error('OPENAI_API_KEY is not configured');
  const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.55,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? '{}';
}

function scheduleSlots(base: Date, index: number, platform: string): Date {
  const dayOffset = Math.floor(index / 2) + 1;
  const hour = platform === 'instagram' ? 11 : platform === 'linkedin' ? 9 : platform === 'reddit' ? 14 : 10;
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const adminId = await requireAdmin(req.headers.get('Authorization'));
    if (!adminId) return jsonResponse({ error: 'Admin auth required' }, 401);

    const body = await req.json().catch(() => ({}));
    const subjectId = body.subject_id as string | undefined;
    if (!subjectId) {
      return jsonResponse(
        { error: 'Pass subject_id from research. Generate one subject at a time.' },
        400,
      );
    }

    const rows = (await fetchSupabaseRest(
      `editorial_subjects?id=eq.${subjectId}&select=id,run_id,name,subject_type,sentiment_summary,sentiment_json,event_date,image_url,city,research_status&limit=1`,
    )) as Array<Record<string, unknown>>;
    const subject = rows?.[0];
    if (!subject) return jsonResponse({ error: 'Subject not found' }, 404);
    if (subject.research_status !== 'ready') {
      return jsonResponse({ error: 'Subject research is not ready yet.' }, 400);
    }

    const snippets = ((await fetchSupabaseRest(
      `editorial_source_snippets?subject_id=eq.${subjectId}&select=id,platform,url,title,excerpt,polarity,fetched_at,published_at,signal_type,confidence,sentiment,raw&order=fetched_at.desc&limit=40`,
    )) as unknown[]) || [];

    const runId = subject.run_id as string | undefined;
    if (runId) {
      await fetchSupabaseRest(`editorial_runs?id=eq.${runId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'generating', error: null }),
      });
    }

    const pipeline = await runEditorialWritingPipeline({
      subject: subject as {
        id: string;
        name: string;
        subject_type: string;
        city?: string | null;
        event_date?: string | null;
        image_url?: string | null;
        sentiment_summary?: string | null;
        sentiment_json?: Record<string, unknown> | null;
      },
      snippets: snippets as Parameters<typeof runEditorialWritingPipeline>[0]['snippets'],
      callOpenAI,
      log: (msg, meta) => console.log(LOG, msg, meta || {}),
    });

    await fetchSupabaseRest(`editorial_subjects?id=eq.${subject.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        claim_ledger: pipeline.claim_ledger,
        sentiment_json: {
          ...((subject.sentiment_json as Record<string, unknown>) || {}),
          claim_ledger: pipeline.claim_ledger,
          unusable_claims: pipeline.unusable_claims,
          sentiment_method: pipeline.sentiment_method,
        },
      }),
    }).catch(async () => {
      await fetchSupabaseRest(`editorial_subjects?id=eq.${subject.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          sentiment_json: {
            ...((subject.sentiment_json as Record<string, unknown>) || {}),
            claim_ledger: pipeline.claim_ledger,
            unusable_claims: pipeline.unusable_claims,
            sentiment_method: pipeline.sentiment_method,
          },
        }),
      });
    });

    if (!pipeline.drafts.length) {
      if (runId) {
        await fetchSupabaseRest(`editorial_runs?id=eq.${runId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'failed',
            error: pipeline.warnings.slice(0, 3).join('; ') || 'No drafts passed lint/rubric',
          }),
        });
      }
      return jsonResponse(
        {
          error: 'No drafts passed hard-fail lint and rubric.',
          warnings: pipeline.warnings,
        },
        422,
      );
    }

    const now = new Date();
    const inserts = pipeline.drafts.map((draft, index) => ({
      run_id: runId,
      subject_id: subject.id,
      platform: draft.platform,
      format: draft.format,
      status: 'pending_review',
      title: draft.title,
      body: draft.body,
      hashtags: draft.hashtags,
      media_urls:
        draft.platform === 'instagram'
          ? [(subject.image_url as string) || FALLBACK_IG_IMAGE]
          : [],
      target_forum: draft.target_forum,
      scheduled_at: scheduleSlots(now, index, draft.platform).toISOString(),
      created_by: adminId,
      editorial_meta: toEditorialMeta(draft),
    }));

    let createdRows: unknown[];
    try {
      createdRows = (await fetchSupabaseRest('content_calendar_posts', {
        method: 'POST',
        body: JSON.stringify(inserts),
      })) as unknown[];
    } catch {
      const legacy = inserts.map((row) => {
        const meta = row.editorial_meta;
        const { editorial_meta: _omit, ...rest } = row;
        const sources = (meta?.source_urls || []).map((u: string) => `- ${u}`).join('\n');
        const reviewBlock = [
          '',
          '---',
          `Editor score: ${meta?.score ?? 'n/a'} (${meta?.score_verdict || ''})`,
          meta?.editor_notes?.length ? `Notes: ${meta.editor_notes.join('; ')}` : null,
          sources ? `Sources:\n${sources}` : null,
          'Status remains pending_review until explicitly approved.',
        ]
          .filter(Boolean)
          .join('\n');
        return { ...rest, body: `${rest.body}${reviewBlock}` };
      });
      createdRows = (await fetchSupabaseRest('content_calendar_posts', {
        method: 'POST',
        body: JSON.stringify(legacy),
      })) as unknown[];
    }

    if (runId) {
      await fetchSupabaseRest(`editorial_runs?id=eq.${runId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'completed',
          post_count: createdRows?.length || inserts.length,
          error: pipeline.warnings.length ? pipeline.warnings.slice(0, 5).join('; ') : null,
        }),
      });
    }

    return jsonResponse({
      data: {
        subject_id: subject.id,
        run_id: runId,
        posts_created: createdRows?.length || inserts.length,
        subjects_processed: 1,
        warnings: pipeline.warnings,
        claim_ledger_count: pipeline.claim_ledger.filter((c) => c.public_use).length,
      },
    });
  } catch (err) {
    console.error(LOG, err);
    return jsonResponse({ error: (err as Error).message ?? 'Generate failed' }, 500);
  }
});
