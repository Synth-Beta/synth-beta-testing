export const NEWS_WINDOW_MS = 21 * 24 * 60 * 60 * 1000;

export const MUSIC_NEWS_FEEDS = [
  { source: "Pitchfork", url: "https://pitchfork.com/rss/news/" },
  { source: "Rolling Stone", url: "https://www.rollingstone.com/music/rss/" },
  { source: "NME", url: "https://www.nme.com/music/feed/" },
  { source: "Billboard", url: "https://www.billboard.com/feed/" },
] as const;

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

const summaryOf = (block: string) => {
  const raw = tag(block, "description") || tag(block, "content:encoded");
  const text = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length < 40) return null;
  const sentence = text.match(/^.{40,220}?[.!](\s|$)/);
  return (sentence ? sentence[0] : text.slice(0, 180)).trim();
};

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
  for (const block of xml.split(/<item[\s>]/i).slice(1)) {
    const title = tag(block, "title");
    const link = httpUrl(tag(block, "link"));
    const published = Date.parse(tag(block, "pubDate"));
    if (!title || !link || !Number.isFinite(published)) continue;
    if (published > now.getTime() + 24 * 60 * 60 * 1000) continue;
    if (now.getTime() - published > NEWS_WINDOW_MS) continue;
    if (seen.has(link)) continue;
    seen.add(link);
    stories.push({
      id: link,
      title,
      url: link,
      source,
      publishedAt: new Date(published).toISOString(),
      summary: summaryOf(block),
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
  return { stories, errors };
};

export const fetchMusicNews = async (now = new Date()): Promise<RssStory[]> =>
  (await fetchMusicNewsReport(now)).stories;
