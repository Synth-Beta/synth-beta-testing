/**
 * AI visibility tracking: asks ChatGPT search (OpenAI web search), Perplexity, and Gemini
 * (Google Search grounding) the questions in seo_ai_prompts and records whether the answer
 * names or cites Synth, and which competitors it names, in seo_ai_mentions.
 *
 * Runs daily but re-asks a prompt on a platform only once a week, so results form a weekly
 * series; a run stops starting new questions after ~4 minutes and the next day picks up
 * the rest. Admins can force a full run with ?force=1.
 *
 * Env: OPENAI_API_KEY (+ OPENAI_AIO_MODEL), optional PERPLEXITY_API_KEY, GEMINI_API_KEY.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authorizeSeoJob, seoServiceClient } from '../seo/jobAuth.js';
import { SEARCH_PLATFORMS } from '../seo/llm.js';
import { detectMentions } from '../seo/aiMentions.js';

const RERUN_AFTER_MS = 6 * 86_400_000;
const BUDGET_MS = 240_000;
const CONCURRENCY = 3;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await authorizeSeoJob(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const db = seoServiceClient();
  if (!db) return res.status(500).json({ error: 'Supabase service role not configured' });

  const platforms = SEARCH_PLATFORMS.filter((p) => p.enabled());
  if (platforms.length === 0) return res.status(200).json({ ok: true, skipped: 'No AI platform keys set' });

  const force = auth.via === 'admin' && String(req.query.force ?? '') === '1';
  const [{ data: prompts, error }, { data: recent }] = await Promise.all([
    db.from('seo_ai_prompts').select('id,prompt').eq('active', true),
    db
      .from('seo_ai_mentions')
      .select('prompt_id,platform')
      .is('error', null)
      .gte('run_at', new Date(Date.now() - RERUN_AFTER_MS).toISOString()),
  ]);
  if (error) return res.status(500).json({ error: error.message });
  const done = new Set(force ? [] : ((recent ?? []) as Array<{ prompt_id: string; platform: string }>).map((r) => `${r.prompt_id}|${r.platform}`));

  const queue = ((prompts ?? []) as Array<{ id: string; prompt: string }>).flatMap((p) =>
    platforms.filter((pl) => !done.has(`${p.id}|${pl.platform}`)).map((pl) => ({ prompt: p, platform: pl })),
  );

  const started = Date.now();
  let asked = 0;
  let mentioned = 0;
  let failed = 0;
  const worker = async () => {
    while (queue.length && Date.now() - started < BUDGET_MS) {
      const job = queue.shift()!;
      const row: Record<string, unknown> = { prompt_id: job.prompt.id, platform: job.platform.platform };
      try {
        const answer = await job.platform.run(job.prompt.prompt);
        const result = detectMentions(answer.text, answer.citedUrls);
        Object.assign(row, {
          model: answer.model,
          mentioned: result.mentioned,
          synth_cited: result.synthCited,
          synth_rank: result.synthRank,
          brands_mentioned: result.brands,
          cited_urls: answer.citedUrls.slice(0, 30),
          answer_excerpt: answer.text.slice(0, 2000),
        });
        if (result.mentioned) mentioned += 1;
      } catch (err) {
        row.error = (err instanceof Error ? err.message : String(err)).slice(0, 500);
        failed += 1;
      }
      asked += 1;
      const { error: insertError } = await db.from('seo_ai_mentions').insert(row);
      if (insertError) console.warn('[cron/seo-ai-visibility] insert failed', insertError.message);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const summary = { platforms: platforms.map((p) => p.platform), asked, mentioned, failed, remaining: queue.length };
  console.log('[cron/seo-ai-visibility]', summary);
  return res.status(200).json({ ok: true, ...summary });
}
