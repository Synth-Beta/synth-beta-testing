export const NEWS_WINDOW_MS = 21 * 24 * 60 * 60 * 1000;

export const MUSIC_NEWS_FEEDS = [
  { source: "Pitchfork", url: "https://pitchfork.com/rss/news/" },
  { source: "Rolling Stone", url: "https://www.rollingstone.com/music/rss/" },
  { source: "NME", url: "https://www.nme.com/news/music/feed" },
  // Prefer the music-news feed over the sitewide feed so sports/culture noise stays out.
  { source: "Billboard", url: "https://www.billboard.com/music/music-news/feed/" },
] as const;

/**
 * Editorial relevance must be established by the HEADLINE, not a generic page
 * description, publisher domain or one passing mention of a song. Fail closed.
 * Sports coverage is completely excluded from Synth newsletters — even music
 * crossovers (halftime shows, anthems) stay out so the Setlist never reads like
 * a sports digest.
 */
const SPORTS_TOPIC = /\b(?:nfl|nba|mlb|nhl|mls|fifa|uefa|ncaa|football|soccer|basketball|baseball|hockey|golf|tennis|rugby|cricket|quarterback|touchdown|fantasy (?:football|sports)|football tips|betting|odds|picks|predictions|playoffs?|super bowl|world series|stanley cup|march madness|champions league|premier league|la liga|serie a|bundesliga|formula[ -]?1|\bf1\b|ufc|boxing|wrestling|matchday|coach|linebacker|wide receiver|running back|field goal|kickoff|gridiron|box score|stadium food|transfer window|goalkeeper|striker|midfielder|clean sheet|relegation)\b/i;
const MUSIC_HEADLINE = /\b(?:song|single|album|ep|mixtape|track|playlist|remix|soundtrack|music|musician|singer|songwriter|rapper|band|artist|recording|vinyl|concert|festival|tour|gig|setlist|performance|performer|headlin(?:e|er|ing)|grammy|spotify|jazz|orchestra|punk|indie|metal|hip.hop|r&b|dj|live show|lineup|on[-\s]?sale|residency|birthday bill|\bbill\b)\b/i;
/** Local-scene headlines that are music-adjacent without naming a genre word. */
export const LOCAL_MUSIC_HEADLINE = /\b(?:song|single|album|ep|mixtape|track|playlist|remix|soundtrack|music|musician|singer|songwriter|rapper|band|artist|recording|vinyl|concert|festival|tour|gig|setlist|performance|performer|headlin(?:e|er|ing)|grammy|spotify|jazz|orchestra|punk|indie|metal|hip.hop|r&b|dj|live show|venue|club|lineup|calendar|on[-\s]?sale|residency)\b/i;
const NON_MUSIC_ADVICE = /\b(?:tips?|advice|best bets?|betting|odds|predictions?|fantasy|how to watch|live score|results?|power rankings?|analysis|preview|recap)\b/i;
const MUSIC_JOURNALISM_URL = /(?:pitchfork\.com|rollingstone\.com\/music|nme\.com\/(?:news\/)?music|billboard\.com\/(?:music|c\/music)|relix\.com|consequence\.net|stereogum\.com|thefader\.com|complex\.com\/music)/i;

/** Headline-grounded editorial eligibility; a trusted domain alone never qualifies. */
export const isMusicRelatedStory = (item: {
  title?: string | null;
  summary?: string | null;
  url?: string | null;
  source?: string | null;
}) => {
  const title = String(item.title ?? "").trim();
  if (!title) return false;
  const text = `${title} ${String(item.summary ?? "")}`;
  // Completely exclude sports — no Super Bowl / NFL / league crossover exceptions.
  if (SPORTS_TOPIC.test(title) || SPORTS_TOPIC.test(text)) return false;
  if (MUSIC_HEADLINE.test(title)) return true;
  // Artist-name headlines may omit the word 'music'. Only permit them on a
  // clearly music-specific URL path; final personalization still requires a
  // matching reader artist or taste signal.
  return MUSIC_JOURNALISM_URL.test(String(item.url ?? "")) && !NON_MUSIC_ADVICE.test(title);
};

export interface RssStory {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  summary?: string | null;
}

const decode = (value: string) =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();

const tag = (block: string, name: string) => {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decode(match[1]) : "";
};

const BOILERPLATE = /appeared first on|continue reading|read the full|subscribe to|comments on:|posted a new comment|^(read more|continue reading)\b/i;

export const plainText = (value: string) =>
  decode(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** A usable blurb states a fact. Headlines and boilerplate do not count. */
export const meaningfulSummary = (value?: string | null) => {
  const text = plainText(String(value ?? ""));
  if (text.length < 40 || BOILERPLATE.test(text)) return null;
  if (/recent music story|details at the source|current artist update|the other picks are different/i.test(text)) return null;
  // Do not split "D.C." or "U.S." in half; this previously produced teaser
  // text ending with "at the D.C.". Prefer a complete thought over a hard cut.
  const boundary = /[.!?](?=\s+[A-Z0-9“"']|$)/g;
  for (const match of text.matchAll(boundary)) {
    const end = (match.index ?? 0) + 1;
    const candidate = text.slice(0, end);
    if (/(?:\bD\.C\.|\bU\.S\.|\bMr\.|\bMs\.|\bDr\.|\bSt\.|\be\.g\.)$/i.test(candidate)) continue;
    if (candidate.length >= 40 && candidate.length <= 280) return candidate;
    if (candidate.length > 280) break;
  }
  if (text.length <= 240) return text;
  const excerpt = text.slice(0, 237).replace(/\s+\S*$/, "").trim();
  return `${excerpt}…`;
};

const summaryOf = (block: string) => {
  const chunks = ["description", "content:encoded", "summary", "content"].map((name) => tag(block, name));
  for (const chunk of chunks) {
    const summary = meaningfulSummary(chunk);
    if (summary) return summary;
  }
  return null;
};

const linkOf = (block: string) => {
  const text = httpUrl(tag(block, "link"));
  if (text) return text;
  const href = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return href ? httpUrl(decode(href[1])) : null;
};

const publishedOf = (block: string) =>
  Date.parse(tag(block, "pubDate") || tag(block, "published") || tag(block, "updated") || tag(block, "dc:date"));

const httpUrl = (value: string) => {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
};

export const parseRssItems = (xml: string, source: string, now = new Date()): RssStory[] => {
  const stories: RssStory[] = [];
  const seen = new Set<string>();
  const blocks = [...xml.split(/<item[\s>]/i).slice(1), ...xml.split(/<entry[\s>]/i).slice(1)];
  for (const block of blocks) {
    const title = tag(block, "title");
    const link = linkOf(block);
    const published = publishedOf(block);
    if (!title || !link || !Number.isFinite(published)) continue;
    if (/^comments on:/i.test(title)) continue;
    if (published > now.getTime() + 24 * 60 * 60 * 1000) continue;
    if (now.getTime() - published > NEWS_WINDOW_MS) continue;
    if (seen.has(link)) continue;
    const summary = summaryOf(block);
    if (!isMusicRelatedStory({ title, summary, url: link, source })) continue;
    seen.add(link);
    stories.push({
      id: link,
      title,
      url: link,
      source,
      publishedAt: new Date(published).toISOString(),
      summary,
    });
  }
  return stories;
};

export interface NewsFetchResult {
  stories: RssStory[];
  errors: string[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchMusicNewsReport = async (now = new Date()): Promise<NewsFetchResult> => {
  const errors: string[] = [];
  const batches = await Promise.all(
    MUSIC_NEWS_FEEDS.map(async (feed) => {
      let lastError = `${feed.source} feed failed.`;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await fetch(feed.url, {
            signal: AbortSignal.timeout(7000),
            headers: {
              Accept: "application/rss+xml, application/xml, text/xml",
              "User-Agent": "SynthNewsletter/1.0",
            },
          });
          if (!response.ok) {
            lastError = `${feed.source} feed returned ${response.status}.`;
          } else {
            return parseRssItems(await response.text(), feed.source, now);
          }
        } catch (error) {
          lastError = `${feed.source} feed failed: ${error instanceof Error ? error.message : String(error)}.`;
        }
        if (attempt < 2) await sleep(400 * (attempt + 1));
      }
      errors.push(lastError);
      return [];
    })
  );
  const seen = new Set<string>();
  const stories = batches.flat().filter((story) => {
    if (seen.has(story.url)) return false;
    seen.add(story.url);
    return true;
  });
  const missing = stories.filter((story) => !story.summary).slice(0, 8);
  await Promise.all(missing.map(async (story) => {
    try {
      const response = await fetch(story.url, {
        signal: AbortSignal.timeout(5000),
        headers: { Accept: "text/html", "User-Agent": "SynthNewsletter/1.0" },
      });
      if (!response.ok) return;
      const html = (await response.text()).slice(0, 80000);
      const meta = html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:description|description)["']/i);
      if (meta) story.summary = meaningfulSummary(decode(meta[1].replace(/&amp;/g, "&")));
    } catch {
      /* The headline stays unused when the page has no reliable summary. */
    }
  }));
  return { stories, errors };
};

export const fetchMusicNews = async (now = new Date()): Promise<RssStory[]> =>
  (await fetchMusicNewsReport(now)).stories;
