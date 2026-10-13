/**
 * Minimal, escape-first Markdown for AI-drafted SEO pages (guides, brand, comparison).
 * Supports ## / ### headings, paragraphs, - and 1. lists, > quotes, **bold**, *italic*,
 * and [links](https://... or /path). Anything else renders as escaped text.
 *
 * Live-data embeds sit on their own line, e.g. {{events genre=indie limit=6}}. They come
 * back as <!--embed:N--> placeholders plus a parsed list so the handler can fill them with
 * current listings at render time.
 *
 * No imports: node:test loads this file directly.
 */

export type EmbedKind = 'events' | 'venues';

export interface Embed {
  kind: EmbedKind;
  params: Record<string, string>;
}

const EMBED_RE = /^\{\{\s*(events|venues)((?:\s+[a-z]+=[a-z0-9-]+)*)\s*\}\}$/i;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^https?:\/\/[^\s]+$/i.test(href)) return href;
  if (/^\/[a-z0-9\-/]*$/i.test(href)) return href;
  return null;
}

/** Inline formatting on already-escaped text. */
function inline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, rawHref: string) => {
    const href = safeHref(rawHref.replace(/&amp;/g, '&'));
    if (!href) return label;
    const external = /^https?:/i.test(href) && !/^https:\/\/(join\.)?getsynth\.app/i.test(href);
    return `<a href="${escapeHtml(href)}"${external ? ' rel="noopener" target="_blank"' : ''}>${label}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return out;
}

export function parseEmbed(line: string): Embed | null {
  const match = line.trim().match(EMBED_RE);
  if (!match) return null;
  const params: Record<string, string> = {};
  for (const pair of match[2].trim().split(/\s+/).filter(Boolean)) {
    const [key, value] = pair.split('=');
    params[key.toLowerCase()] = value.toLowerCase();
  }
  return { kind: match[1].toLowerCase() as EmbedKind, params };
}

export function markdownToHtml(markdown: string): { html: string; embeds: Embed[] } {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  const embeds: Embed[] = [];
  let paragraph: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const embed = parseEmbed(line);
    if (embed) {
      flushParagraph();
      flushList();
      out.push(`<!--embed:${embeds.length}-->`);
      embeds.push(embed);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      // The page title is the only h1.
      const level = Math.max(2, heading[1].length);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (bullet || ordered) {
      flushParagraph();
      const tag = bullet ? 'ul' : 'ol';
      if (!list || list.tag !== tag) {
        flushList();
        list = { tag, items: [] };
      }
      list.items.push((bullet ?? ordered)![1]);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      out.push(`<blockquote>${inline(quote[1])}</blockquote>`);
      continue;
    }

    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return { html: out.join('\n'), embeds };
}

/** Plain text for meta descriptions, llms.txt, and length checks. */
export function markdownToText(markdown: string): string {
  return markdown
    .split('\n')
    .filter((line) => !parseEmbed(line))
    .join(' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
