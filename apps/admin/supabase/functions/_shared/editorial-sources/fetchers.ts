import { normalizeSignal } from './normalize';
import type { DiscoveryContext, NormalizedSignal, SignalType } from './types';

export function extractRssItems(xml: string): Array<{
  title: string;
  link: string;
  description: string;
  pubDate?: string;
}> {
  const items: Array<{ title: string; link: string; description: string; pubDate?: string }> = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const block of blocks.slice(0, 20)) {
    const title = textBetween(block, 'title');
    const link =
      textBetween(block, 'link') ||
      attrBetween(block, 'link', 'href') ||
      textBetween(block, 'guid');
    const description =
      textBetween(block, 'description') ||
      textBetween(block, 'summary') ||
      textBetween(block, 'content');
    const pubDate = textBetween(block, 'pubDate') || textBetween(block, 'updated') || textBetween(block, 'published');
    if (title || description) {
      items.push({
        title: stripTags(title),
        link: stripTags(link),
        description: stripTags(description),
        pubDate: pubDate || undefined,
      });
    }
  }
  return items;
}

export function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      /* ignore bad json-ld */
    }
  }
  return out;
}

export function extractLikelyWebsite(html: string, pageUrl: string): string | null {
  const canonical = matchAttr(html, /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)
    || matchAttr(html, /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
  if (canonical) {
    try {
      return new URL(canonical, pageUrl).toString();
    } catch {
      /* continue */
    }
  }
  const og = matchAttr(html, /<meta[^>]+property=["']og:url["'][^>]*content=["']([^"']+)["']/i)
    || matchAttr(html, /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:url["']/i);
  if (og) {
    try {
      return new URL(og, pageUrl).toString();
    } catch {
      /* continue */
    }
  }
  return pageUrl;
}

function matchAttr(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m?.[1]?.trim() || null;
}

function textBetween(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m?.[1]?.trim() || '';
}

function attrBetween(block: string, tagPattern: string, attr: string): string {
  const m = block.match(new RegExp(`<${tagPattern}[^>]*${attr}=["']([^"']+)["'][^>]*>`, 'i'));
  return m?.[1]?.trim() || '';
}

function stripTags(html: string): string {
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export async function signalsFromRss(opts: {
  ctx: DiscoveryContext;
  source: string;
  feedUrl: string;
  subject: string;
  signal_type?: SignalType;
  query?: string;
}): Promise<NormalizedSignal[]> {
  const xml = await opts.ctx.fetchText(opts.feedUrl);
  const items = extractRssItems(xml);
  const q = (opts.query || '').toLowerCase();
  const filtered = q
    ? items.filter((i) => `${i.title} ${i.description}`.toLowerCase().includes(q))
    : items;
  return Promise.all(
    filtered.slice(0, 8).map((i) =>
      normalizeSignal({
        source: opts.source,
        url: i.link || opts.feedUrl,
        title: i.title,
        excerpt: i.description || i.title,
        published_at: i.pubDate ? new Date(i.pubDate).toISOString() : null,
        subject: opts.subject,
        signal_type: opts.signal_type || 'news',
        confidence: 0.55,
      }),
    ),
  );
}

export async function signalsFromJsonLdEvents(opts: {
  ctx: DiscoveryContext;
  source: string;
  pageUrl: string;
  subject: string;
}): Promise<NormalizedSignal[]> {
  const html = await opts.ctx.fetchText(opts.pageUrl);
  const nodes = extractJsonLd(html);
  const out: NormalizedSignal[] = [];
  for (const node of nodes) {
    const list = flattenJsonLd(node);
    for (const item of list) {
      const type = String((item as { '@type'?: string })['@type'] || '');
      if (!/Event|MusicEvent|Festival/i.test(type)) continue;
      const name = String((item as { name?: string }).name || '');
      const url = String((item as { url?: string }).url || opts.pageUrl);
      const desc = String((item as { description?: string }).description || name);
      const start = (item as { startDate?: string }).startDate || null;
      out.push(
        await normalizeSignal({
          source: opts.source,
          url,
          title: name,
          excerpt: desc,
          published_at: start,
          subject: opts.subject,
          signal_type: 'listing',
          confidence: 0.7,
          raw: { jsonld_type: type },
        }),
      );
    }
  }
  return out;
}

function flattenJsonLd(node: unknown): unknown[] {
  if (!node || typeof node !== 'object') return [];
  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj['@graph'])) return obj['@graph'] as unknown[];
  return [node];
}

export async function signalsFromHtmlPage(opts: {
  ctx: DiscoveryContext;
  source: string;
  pageUrl: string;
  subject: string;
  signal_type?: SignalType;
}): Promise<NormalizedSignal[]> {
  const html = await opts.ctx.fetchText(opts.pageUrl);
  const title =
    textBetween(html, 'title') ||
    matchAttr(html, /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
    matchAttr(html, /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i) ||
    opts.subject;
  const desc =
    matchAttr(html, /<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
    matchAttr(html, /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']description["']/i) ||
    matchAttr(html, /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
    matchAttr(html, /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:description["']/i) ||
    title;
  return [
    await normalizeSignal({
      source: opts.source,
      url: extractLikelyWebsite(html, opts.pageUrl) || opts.pageUrl,
      title: stripTags(title),
      excerpt: stripTags(desc),
      subject: opts.subject,
      signal_type: opts.signal_type || 'website',
      confidence: 0.45,
    }),
  ];
}
