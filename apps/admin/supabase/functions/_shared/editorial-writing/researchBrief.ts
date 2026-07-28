/** Build editor-facing research brief after source collection. */

export interface ResearchBrief {
  summary: string;
  highlights: string[];
  article_topics: string[];
  interesting_snippets: Array<{
    title: string | null;
    excerpt: string;
    url: string | null;
    source: string;
  }>;
  related_events: Array<{
    id: string;
    title: string;
    event_date: string | null;
    artist_name: string | null;
  }>;
  caveats: string[];
  editor_prompt: string;
}

export async function buildResearchBrief(opts: {
  subjectName: string;
  subjectType: string;
  facets: { artist?: string | null; venue?: string | null; event?: string | null };
  snippets: Array<{
    platform: string;
    url: string | null;
    title: string | null;
    excerpt: string;
    confidence?: number | null;
  }>;
  relatedEvents?: Array<{
    id: string;
    title: string;
    event_date: string | null;
    artist_name?: string | null;
  }>;
  callOpenAI: (system: string, user: string, maxTokens?: number) => Promise<string>;
}): Promise<ResearchBrief> {
  const top = opts.snippets.slice(0, 18).map((s) => ({
    source: s.platform,
    title: s.title,
    excerpt: String(s.excerpt || '').slice(0, 220),
    url: s.url,
  }));

  const related = (opts.relatedEvents || []).slice(0, 8);

  if (!top.length) {
    return {
      summary: `${opts.subjectName}: public source material is thin after relevance filtering. Prefer first-party venue or event facts, or ask the editor for a local angle before drafting.`,
      highlights: related.length
        ? related.slice(0, 3).map((e) => `Upcoming: ${e.title}${e.event_date ? ` (${e.event_date.slice(0, 10)})` : ''}`)
        : ['No strongly relevant public snippets matched this subject.'],
      article_topics: [
        'Venue file with verified history and current calendar',
        'Practical before-you-go guide using first-party policies',
        related[0] ? `Preview of ${related[0].title}` : 'Ask the editor which show to spotlight',
      ].filter(Boolean),
      interesting_snippets: [],
      related_events: related.map((e) => ({
        id: e.id,
        title: e.title,
        event_date: e.event_date,
        artist_name: e.artist_name || null,
      })),
      caveats: [
        'Do not invent sentiment or "signals" counts.',
        'Wait for editor direction before drafting.',
      ],
      editor_prompt: 'What angle should Synth take, and which upcoming show (if any) should we prioritize?',
    };
  }

  const system = `You are Synth's DC music research editor. Turn relevant source snippets into a brief for a human editor.
Rules:
- No em/en dashes.
- Never mention signal counts or retrieval metrics.
- Only use details supported by the snippets or related events list.
- Be specific and useful for drafting Instagram, LinkedIn, Substack, or Reddit.
Return JSON with keys: summary (2-4 sentences), highlights (3-6 short bullets), article_topics (3-5), interesting_snippets (up to 5 objects with title, excerpt, url, source), caveats (array), editor_prompt (one question asking what the editor wants emphasized before drafting).`;

  const user = JSON.stringify({
    subject: opts.subjectName,
    subject_type: opts.subjectType,
    facets: opts.facets,
    related_events: related,
    snippets: top,
  });

  try {
    const raw = await opts.callOpenAI(system, user, 1200);
    const parsed = JSON.parse(raw);
    return {
      summary: String(parsed.summary || '').replace(/[\u2014\u2013—–]/g, (m) => (m === '–' || m === '\u2013' ? '-' : '.')),
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights.map(String).slice(0, 8) : [],
      article_topics: Array.isArray(parsed.article_topics)
        ? parsed.article_topics.map(String).slice(0, 6)
        : [],
      interesting_snippets: Array.isArray(parsed.interesting_snippets)
        ? parsed.interesting_snippets.slice(0, 5).map((s: Record<string, unknown>) => ({
            title: (s.title as string) || null,
            excerpt: String(s.excerpt || '').slice(0, 280),
            url: (s.url as string) || null,
            source: String(s.source || 'source'),
          }))
        : top.slice(0, 5).map((s) => ({
            title: s.title,
            excerpt: s.excerpt,
            url: s.url,
            source: s.source,
          })),
      related_events: related.map((e) => ({
        id: e.id,
        title: e.title,
        event_date: e.event_date,
        artist_name: e.artist_name || null,
      })),
      caveats: Array.isArray(parsed.caveats) ? parsed.caveats.map(String) : [],
      editor_prompt: String(
        parsed.editor_prompt ||
          'What should we emphasize before drafting (history, upcoming show, neighborhood, fan tips)?',
      ),
    };
  } catch {
    return {
      summary: `${opts.subjectName}: gathered ${top.length} relevant snippets across ${[
        ...new Set(top.map((t) => t.source)),
      ].join(', ')}. Review highlights before drafting.`,
      highlights: top.slice(0, 5).map((t) => t.title || t.excerpt.slice(0, 80)),
      article_topics: [
        'Sourced venue or show file',
        'One concrete detail readers can picture',
        related[0] ? `Upcoming: ${related[0].title}` : 'Editor-chosen angle',
      ],
      interesting_snippets: top.slice(0, 5).map((s) => ({
        title: s.title,
        excerpt: s.excerpt,
        url: s.url,
        source: s.source,
      })),
      related_events: related.map((e) => ({
        id: e.id,
        title: e.title,
        event_date: e.event_date,
        artist_name: e.artist_name || null,
      })),
      caveats: ['AI brief fallback used; verify facts against source URLs.'],
      editor_prompt: 'What angle and CTA should the drafts use?',
    };
  }
}
