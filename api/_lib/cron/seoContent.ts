/**
 * AI content pipeline: writes guide / brand / comparison drafts for seo_target_queries
 * and parks them in seo_content with status 'review'. Nothing publishes without an admin
 * approving it in the admin SEO tab.
 *
 * Triggers:
 *   - daily cron (Bearer CRON_SECRET): the highest-priority targets with no live or
 *     pending page, SEO_DRAFTS_PER_RUN at a time (default 2)
 *   - admin "Generate draft" (Bearer <admin access token>): ?target=<seo_target_queries.id>
 *
 * Every specific claim in a draft has to come from the facts block built here from the
 * database (shows, venues, genres, Synth's own pages), which is stored with the draft as
 * `grounding` so reviewers can check it.
 *
 * Env: OPENAI_API_KEY, OPENAI_SEO_MODEL (default gpt-4o), SEO_DRAFTS_PER_RUN.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authorizeSeoJob, seoServiceClient } from '../seo/jobAuth.js';
import { openAiJson, openAiKey } from '../seo/llm.js';
import { validateDraft } from '../seo/contentDraft.js';
import { loadCandidates, loadDcEvents, loadGenreCounts, loadPublishedContent } from '../seo/handler.js';
import {
  GETSYNTH_ORIGIN,
  JOIN_ORIGIN,
  contentUrl,
  eventHasGenre,
  eventUrl,
  venueUrl,
  weekendWindow,
  type ContentType,
} from '../seo/render.js';

type Target = {
  id: string;
  query: string;
  cluster: string;
  page_type: ContentType;
  priority: number;
  city_slug: string | null;
  venue_id: string | null;
  genre_slug: string | null;
  notes: string | null;
};

const TARGET_SELECT = 'id,query,cluster,page_type,priority,city_slug,venue_id,genre_slug,notes';
const UUID_RE = /^[0-9a-f-]{36}$/i;
const DC_HUB = `${GETSYNTH_ORIGIN}/concerts/washington-dc`;

// Only claims the marketing site and the app already make; keep in sync with the product.
const SYNTH_FACTS = [
  'Synth (getsynth.app) is an app for live-music fans: discover concerts and live shows near you, then find people going to the same ones.',
  'You can see who else on Synth is interested in or going to a show, and connect with people who share your music taste.',
  'Members can message each other to make plans before a show.',
  'Synth keeps a history of the shows you have been to, and members write reviews of shows, artists, and venues.',
  'You can connect Spotify or Apple Music so recommendations follow what you actually listen to.',
  'Synth is on iPhone (App Store) and the web at join.getsynth.app.',
  'Synth is piloting in Washington, DC, so its local listings are deepest there.',
  'Show listings are powered by JamBase.',
];

const PAGE_BRIEF: Record<ContentType, string> = {
  guide:
    'A practical guide, 1,000 to 1,600 words. Concrete steps and local specifics a person can act on tonight. Synth appears where it genuinely solves the problem, not as the subject of the page.',
  brand:
    'An explainer about Synth itself, 700 to 1,100 words, meant to be the page AI assistants quote when asked about Synth. Open with a one-sentence definition ("Synth is ..."), then how it works, who it is for, where it is available, and what it is not. Strictly factual.',
  comparison:
    'A fair comparison, 900 to 1,300 words: a quick answer, what each product is for, who each fits best, and whether to use both. Describe the other product only in widely known general terms; never state its prices, numbers, or features you are not sure of, and never disparage it.',
};

const SYSTEM = `You write pages for Synth's website. The goal of every page: be the answer a search engine or an AI assistant would choose to show or cite for the target search.

Rules:
- The summary answers the search directly in two or three sentences. A reader who only sees the summary should get the answer.
- Be specific and useful. Any specific claim about Synth, venues, shows, counts, or dates must come from FACTS. Never invent statistics, quotes, prices, features, partnerships, or user numbers.
- Synth is one genuinely useful option, not an advert. One natural call to action at most.
- Voice: a knowledgeable local friend. Plain words, short sentences, no hype. American English.
- Markdown body: no H1 (the title is shown separately). Use ## and ### headings, phrased as the questions people actually search where natural. Short paragraphs, bullet lists for steps. No tables or images.
- Links: only URLs listed in FACTS, written as [text](url). Link generously to the venue, genre, and guide pages listed there.
- Live listings: you may put up to three embed lines, each on its own line, from this set:
  {{events window=weekend limit=6}}
  {{events window=month limit=6}}
  {{events genre=<genre slug from FACTS> window=month limit=6}}
  {{events venue=<venue slug from FACTS> limit=6}}
  {{venues limit=8}}
  They render current shows when the page loads, so do not describe what they contain, and avoid wording that goes stale ("this Friday", "next month").
- FAQ: 4 to 6 questions people really ask about this topic, each answered in under 60 words.

Return JSON only:
{"slug": "short-keyword-slug", "title": "under 60 characters, contains the core search phrase", "meta_description": "under 155 characters", "summary": "the direct answer", "body_md": "markdown", "faq": [{"q": "...", "a": "..."}], "keywords": ["5 to 10 related searches"]}`;

async function buildFacts(db: SupabaseClient, target: Target) {
  const [candidates, genres, events, published] = await Promise.all([
    loadCandidates(db),
    loadGenreCounts(db).catch(() => []),
    loadDcEvents(db).catch(() => []),
    loadPublishedContent(db),
  ]);
  const venues = candidates
    .filter((c) => c.entity_type === 'venue' && c.slug && c.upcoming_events > 0)
    .sort((a, b) => b.upcoming_events - a.upcoming_events);
  const { start, end } = weekendWindow(new Date());
  const weekendCount = events.filter((e) => {
    const t = new Date(e.event_date).getTime();
    return t >= start.getTime() && t < end.getTime();
  }).length;

  let focusEvents = events;
  if (target.genre_slug) focusEvents = focusEvents.filter((e) => eventHasGenre(e, target.genre_slug!));
  if (target.venue_id) focusEvents = focusEvents.filter((e) => e.venue?.id === target.venue_id);
  const focusVenue = target.venue_id ? venues.find((v) => v.entity_id === target.venue_id) ?? null : null;

  const facts = {
    synth: SYNTH_FACTS,
    synth_pages: {
      home: GETSYNTH_ORIGIN,
      join: JOIN_ORIGIN,
      dc_concerts: DC_HUB,
      dc_this_weekend: `${DC_HUB}/this-weekend`,
      guides: `${GETSYNTH_ORIGIN}/guides`,
    },
    dc: {
      upcoming_shows: events.length,
      shows_this_weekend: weekendCount,
      venues_with_shows: venues.length,
    },
    top_venues: venues.slice(0, 15).map((v) => ({ name: v.name, slug: v.slug, upcoming_shows: v.upcoming_events, url: venueUrl(v.slug!) })),
    genres: genres.slice(0, 15).map((g) => ({ label: g.label, slug: g.slug, upcoming_shows: g.count, url: `${DC_HUB}/${g.slug}` })),
    focus_venue: focusVenue ? { name: focusVenue.name, slug: focusVenue.slug, upcoming_shows: focusVenue.upcoming_events, url: venueUrl(focusVenue.slug!) } : null,
    sample_upcoming_shows: focusEvents.slice(0, 12).map((e) => ({
      artist: e.artist?.name ?? e.title,
      venue: e.venue?.name ?? null,
      date: e.event_date.slice(0, 10),
      url: e.slug ? eventUrl(e.slug) : null,
    })),
    existing_synth_pages: published.slice(0, 40).map((p) => ({ title: p.title, url: contentUrl(p.page_type, p.slug) })),
  };
  return facts;
}

async function pickTargets(db: SupabaseClient, limit: number): Promise<Target[]> {
  const [{ data: targets, error }, { data: content }] = await Promise.all([
    db.from('seo_target_queries').select(TARGET_SELECT).eq('active', true).order('priority', { ascending: false }).limit(200),
    db.from('seo_content').select('target_query_id,status,updated_at').not('target_query_id', 'is', null),
  ]);
  if (error) throw new Error(`seo_target_queries: ${error.message}`);
  const recentRejectCutoff = Date.now() - 3 * 86_400_000;
  const taken = new Set(
    ((content ?? []) as Array<{ target_query_id: string; status: string; updated_at: string }>)
      .filter((c) => c.status === 'review' || c.status === 'published' || c.status === 'archived' || new Date(c.updated_at).getTime() > recentRejectCutoff)
      .map((c) => c.target_query_id),
  );
  return ((targets ?? []) as Target[]).filter((t) => !taken.has(t.id)).slice(0, limit);
}

async function uniqueSlug(db: SupabaseClient, pageType: ContentType, slug: string, ownId: string | null): Promise<string> {
  for (let i = 1; i < 20; i += 1) {
    const candidate = i === 1 ? slug : `${slug}-${i}`;
    const { data } = await db.from('seo_content').select('id').eq('page_type', pageType).eq('slug', candidate).maybeSingle();
    if (!data || data.id === ownId) return candidate;
  }
  return `${slug}-${Date.now().toString(36)}`;
}

export async function generateDraft(db: SupabaseClient, target: Target): Promise<{ id: string; slug: string; warnings: string[] }> {
  const { data: existing } = await db
    .from('seo_content')
    .select('id,status,review_notes')
    .eq('target_query_id', target.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing && existing.status === 'published') throw new Error('This target already has a published page; edit it in the queue instead.');

  const facts = await buildFacts(db, target);
  const feedback = existing?.status === 'rejected' && existing.review_notes ? `\nAn editor rejected the previous draft with this note; fix it:\n${existing.review_notes}\n` : '';
  const user = `Target search: "${target.query}"
Page type: ${target.page_type}
Brief: ${PAGE_BRIEF[target.page_type]}
Topic cluster: ${target.cluster}${target.notes ? `\nEditor notes: ${target.notes}` : ''}${feedback}
FACTS (JSON):
${JSON.stringify(facts, null, 1)}`;

  const { data, model } = await openAiJson<unknown>({ system: SYSTEM, user, maxTokens: 5000 });
  const result = validateDraft(data);
  if (!result.ok) throw new Error(`Draft rejected by validation: ${result.errors.join('; ')}`);
  const { draft, warnings } = result;

  const ownId = existing && existing.status !== 'published' ? (existing.id as string) : null;
  const slug = await uniqueSlug(db, target.page_type, draft.slug, ownId);
  const row = {
    target_query_id: target.id,
    page_type: target.page_type,
    ...draft,
    slug,
    status: 'review',
    review_notes: warnings.length ? `Automated checks:\n- ${warnings.join('\n- ')}` : null,
    model,
    grounding: facts,
    updated_at: new Date().toISOString(),
  };
  if (ownId) {
    const { error } = await db.from('seo_content').update(row).eq('id', ownId);
    if (error) throw new Error(`seo_content update: ${error.message}`);
    return { id: ownId, slug, warnings };
  }
  const { data: inserted, error } = await db.from('seo_content').insert(row).select('id').single();
  if (error) throw new Error(`seo_content insert: ${error.message}`);
  return { id: inserted.id as string, slug, warnings };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await authorizeSeoJob(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  if (!openAiKey()) return res.status(200).json({ ok: true, skipped: 'OPENAI_API_KEY not set' });
  const db = seoServiceClient();
  if (!db) return res.status(500).json({ error: 'Supabase service role not configured' });

  const targetId = String(req.query.target ?? '').trim();
  let targets: Target[];
  if (targetId) {
    if (!UUID_RE.test(targetId)) return res.status(400).json({ error: 'Invalid target id' });
    const { data, error } = await db.from('seo_target_queries').select(TARGET_SELECT).eq('id', targetId).maybeSingle();
    if (error || !data) return res.status(404).json({ error: 'Target not found' });
    targets = [data as Target];
  } else {
    const perRun = Math.min(5, Math.max(1, Number(process.env.SEO_DRAFTS_PER_RUN) || 2));
    targets = await pickTargets(db, perRun);
  }

  const results: Array<{ query: string; id?: string; slug?: string; warnings?: string[]; error?: string }> = [];
  for (const target of targets) {
    try {
      results.push({ query: target.query, ...(await generateDraft(db, target)) });
    } catch (err) {
      results.push({ query: target.query, error: err instanceof Error ? err.message : String(err) });
    }
  }
  console.log('[cron/seo-content]', JSON.stringify(results.map((r) => ({ query: r.query, slug: r.slug, error: r.error }))));
  const failed = targetId && results[0]?.error;
  return res.status(failed ? 502 : 200).json({ ok: !failed, results });
}
