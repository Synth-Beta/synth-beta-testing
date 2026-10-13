/**
 * Validation for AI-written guide/brand/comparison drafts before they enter the review
 * queue. Hard problems reject the draft; soft ones become review notes for the admin.
 * No local imports: render.test.ts loads this file directly.
 */

export interface ContentDraft {
  slug: string;
  title: string;
  meta_description: string;
  summary: string;
  body_md: string;
  faq: Array<{ q: string; a: string }>;
  keywords: string[];
}

export type DraftResult = { ok: true; draft: ContentDraft; warnings: string[] } | { ok: false; errors: string[] };

const SLUG_RE = /^[a-z0-9-]{1,120}$/;
const OWN_HOST_RE = /^https:\/\/([a-z0-9-]+\.)?getsynth\.app(\/|$)/i;
const EMBED_LINE_RE = /^\{\{\s*(events|venues)((\s+[a-z]+=[a-z0-9-]+)*)\s*\}\}$/;
const FILLER = [
  'as an ai',
  'in conclusion',
  'delve',
  'vibrant tapestry',
  'in today\u2019s fast-paced',
  "in today's fast-paced",
  'look no further',
  'unforgettable experience',
  'whether you\u2019re a seasoned',
  "whether you're a seasoned",
];

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

/** Links may only point at our own pages; anything else keeps its text and loses the link. */
export function stripExternalLinks(md: string): { md: string; removed: number } {
  let removed = 0;
  const out = md.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label: string, href: string) => {
    if (href.startsWith('/') || OWN_HOST_RE.test(href)) return whole;
    removed += 1;
    return label;
  });
  return { md: out, removed };
}

function cleanEmbeds(md: string): { md: string; removed: number } {
  let removed = 0;
  const lines = md.split('\n').filter((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{{')) return true;
    if (EMBED_LINE_RE.test(trimmed)) return true;
    removed += 1;
    return false;
  });
  return { md: lines.join('\n'), removed };
}

export function validateDraft(raw: unknown): DraftResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const title = text(r.title);
  const meta = text(r.meta_description);
  const summary = text(r.summary);
  let body = text(r.body_md);
  const slug = slugify(text(r.slug) || title);

  if (!title) errors.push('Missing title');
  if (!summary) errors.push('Missing summary');
  if (wordCount(body) < 400) errors.push(`Body too short (${wordCount(body)} words, need 400+)`);
  if (!SLUG_RE.test(slug)) errors.push('Could not build a valid slug');
  if (errors.length) return { ok: false, errors };

  if (title.length > 70) warnings.push(`Title is ${title.length} characters; Google shows about 60.`);
  if (!meta) warnings.push('Missing meta description; the summary will be used.');
  if (meta.length > 160) warnings.push(`Meta description is ${meta.length} characters; keep it under 160.`);
  if (wordCount(summary) > 90) warnings.push('Summary runs long; AI answers quote short, direct summaries.');

  const links = stripExternalLinks(body);
  body = links.md;
  if (links.removed) warnings.push(`Removed ${links.removed} external link(s).`);
  const embeds = cleanEmbeds(body);
  body = embeds.md;
  if (embeds.removed) warnings.push(`Removed ${embeds.removed} malformed embed line(s).`);

  const lower = `${title}\n${summary}\n${body}`.toLowerCase();
  const filler = FILLER.filter((phrase) => lower.includes(phrase));
  if (filler.length) warnings.push(`Generic phrasing to edit: ${filler.join(', ')}.`);
  if (!/\bsynth\b/i.test(body)) warnings.push('The body never mentions Synth.');

  const faq = (Array.isArray(r.faq) ? r.faq : [])
    .map((item) => {
      const f = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      return { q: text(f.q ?? f.question), a: text(f.a ?? f.answer) };
    })
    .filter((f) => f.q && f.a)
    .slice(0, 8);
  if (faq.length < 3) warnings.push('Fewer than 3 FAQ entries.');

  const keywords = (Array.isArray(r.keywords) ? r.keywords : [])
    .map((k) => text(k).toLowerCase())
    .filter(Boolean)
    .slice(0, 12);

  return {
    ok: true,
    draft: {
      slug,
      title: title.slice(0, 120),
      meta_description: (meta || summary).slice(0, 300),
      summary: summary.slice(0, 1200),
      body_md: body,
      faq,
      keywords,
    },
    warnings,
  };
}
