import { normalizeSignal } from '../normalize';
import type {
  DiscoveryContext,
  EnrichContext,
  NormalizedSignal,
  ResearchSubjectRef,
  SourceAdapter,
} from '../types';

/** DC / DMV + live-music communities where venue/show chatter lives. */
const DC_SUBREDDITS = [
  'washingtondc',
  'nova',
  'maryland',
  'DCMusic',
  'LiveMusic',
  'concerts',
  'indieheads',
] as const;

const EXPERIENCE_OR =
  '(sound OR line OR tips OR crowd OR parking OR staff OR vibe OR recommend OR worth OR saw OR show OR concert OR venue)';

const MAX_POST_SIGNALS = 18;
const MAX_COMMENT_SIGNALS = 10;
const COMMENT_THREADS = 2;
const ENRICH_QUERY_CAP = 7;
const DISCOVER_QUERY_CAP = 4;

type RedditListing = {
  data?: {
    children?: Array<{ data?: Record<string, unknown> }>;
  };
};

type RedditPost = {
  id: string;
  title: string;
  selftext: string;
  permalink: string;
  subreddit: string;
  score: number;
  num_comments: number;
  created_utc?: number;
  url?: string;
};

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v.trim());
  }
  return out;
}

/** Common venue aliases so Reddit hits land (e.g. 9:30 ↔ 930 Club). */
export function venueSearchAliases(name: string): string[] {
  const raw = name.trim();
  if (!raw) return [];
  const aliases = [raw];
  const noThe = raw.replace(/^the\s+/i, '').trim();
  if (noThe && noThe.toLowerCase() !== raw.toLowerCase()) aliases.push(noThe);

  // 9:30 Club / 930 Club / 9:30
  if (/9:?30/i.test(raw)) {
    aliases.push('9:30 Club', '930 Club', '9:30', '930');
  }
  // Drop "Club"/"Theatre"/"Theater"/"Hall" variants
  const bare = raw.replace(/\b(club|theatre|theater|hall|ballroom|arena|amphitheatre|amphitheater)\b/gi, '').trim();
  if (bare.length >= 3) aliases.push(bare);

  return uniq(aliases).slice(0, 4);
}

export function buildRedditEnrichQueries(subject: ResearchSubjectRef): string[] {
  const venueName =
    subject.venue_name || (subject.subject_type === 'venue' ? subject.name : null) || null;
  const artistName =
    subject.artist_name || (subject.subject_type === 'artist' ? subject.name : null) || null;
  const eventTitle = subject.event_title || null;
  const queries: string[] = [];

  const venueAliases = venueName ? venueSearchAliases(venueName) : [];
  const primaryVenue = venueAliases[0];
  const altVenue = venueAliases.find(
    (a) => primaryVenue && a.toLowerCase() !== primaryVenue.toLowerCase(),
  );

  // Highest value first: band + venue (performance chatter), then venue in DC chats.
  if (artistName && primaryVenue) {
    queries.push(`"${artistName}" "${primaryVenue}"`);
    queries.push(`"${artistName}" "${primaryVenue}" (saw OR review OR set OR opener OR tickets)`);
  }

  if (primaryVenue) {
    for (const sub of ['washingtondc', 'nova', 'DCMusic'] as const) {
      queries.push(`subreddit:${sub} "${primaryVenue}"`);
    }
    queries.push(`"${primaryVenue}" (DC OR Washington OR DMV OR Arlington OR "Silver Spring")`);
    queries.push(`"${primaryVenue}" ${EXPERIENCE_OR}`);
    if (altVenue) {
      queries.push(`"${altVenue}" (DC OR Washington OR concert OR show)`);
      queries.push(`subreddit:washingtondc "${altVenue}"`);
    }
  }

  if (artistName) {
    queries.push(`"${artistName}" (DC OR Washington OR DMV) (concert OR show OR tour OR played OR gig)`);
    queries.push(`subreddit:washingtondc "${artistName}"`);
    queries.push(`subreddit:concerts "${artistName}" (DC OR Washington)`);
  }

  if (eventTitle && eventTitle !== artistName && eventTitle !== primaryVenue) {
    queries.push(`"${eventTitle}" (DC OR Washington)`);
  }

  // Fallback: subject name alone with experience language
  if (!queries.length) {
    const focus = subject.name;
    queries.push(`"${focus}" ${EXPERIENCE_OR}`);
    queries.push(`subreddit:washingtondc "${focus}"`);
  }

  return uniq(queries).slice(0, 12);
}

export function buildRedditDiscoverQueries(): string[] {
  return [
    'subreddit:washingtondc (concert OR venue OR "live music") (recommend OR tips OR saw OR worth)',
    'subreddit:nova (concert OR venue OR show) (DC OR Arlington OR Alexandria OR "Silver Spring")',
    'subreddit:DCMusic (show OR venue OR gig OR concert)',
    'subreddit:LiveMusic (DC OR "Washington" OR "9:30" OR Anthem OR "Black Cat")',
    '("9:30 Club" OR Anthem OR "Black Cat" OR "Union Stage" OR Songbyrd OR "The Fillmore") (DC OR Washington) (tips OR sound OR line OR crowd)',
  ];
}

function parsePosts(json: RedditListing | null): RedditPost[] {
  const children = json?.data?.children || [];
  const posts: RedditPost[] = [];
  for (const child of children) {
    const d = child.data || {};
    if (d.stickied) continue;
    const permalink = typeof d.permalink === 'string' ? d.permalink : '';
    if (!permalink) continue;
    const id = String(d.id || permalink);
    posts.push({
      id,
      title: String(d.title || ''),
      selftext: String(d.selftext || ''),
      permalink,
      subreddit: String(d.subreddit || ''),
      score: Number(d.score || 0),
      num_comments: Number(d.num_comments || 0),
      created_utc: typeof d.created_utc === 'number' ? d.created_utc : undefined,
      url: typeof d.url === 'string' ? d.url : undefined,
    });
  }
  return posts;
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  const raw = `${clientId}:${clientSecret}`;
  const encoded =
    typeof btoa === 'function'
      ? btoa(raw)
      : Buffer.from(raw, 'utf8').toString('base64');
  return `Basic ${encoded}`;
}

function redditUserAgent(ctx: DiscoveryContext): string {
  return (
    ctx.getEnv('REDDIT_USER_AGENT') ||
    'synth-editorial-research/2.0 (by /u/synth_ops; +https://getsynth.app)'
  );
}

/** App-only OAuth — Reddit blocks anonymous JSON; credentials unlock oauth.reddit.com. */
async function getRedditAccessToken(ctx: DiscoveryContext): Promise<string | null> {
  const clientId = ctx.getEnv('REDDIT_CLIENT_ID');
  const clientSecret = ctx.getEnv('REDDIT_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;

  const cacheKey = 'reddit:oauth:token';
  const cached = ctx.cacheGet<{ token: string; exp: number }>(cacheKey);
  if (cached && cached.exp > Date.now() + 30_000) return cached.token;

  try {
    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(clientId, clientSecret),
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': redditUserAgent(ctx),
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      ctx.log?.('[reddit] oauth token failed', { status: res.status });
      return null;
    }
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;
    const ttlMs = Math.max(60, Number(json.expires_in || 3600) - 60) * 1000;
    ctx.cacheSet(cacheKey, { token: json.access_token, exp: Date.now() + ttlMs }, ttlMs);
    return json.access_token;
  } catch (err) {
    ctx.log?.('[reddit] oauth error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function fetchRedditJson<T>(
  ctx: DiscoveryContext,
  pathWithQuery: string,
): Promise<T | null> {
  const token = await getRedditAccessToken(ctx);
  const ua = redditUserAgent(ctx);
  if (token) {
    try {
      return await ctx.fetchJson<T>(`https://oauth.reddit.com${pathWithQuery}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': ua,
          Accept: 'application/json',
        },
      });
    } catch (err) {
      ctx.log?.('[reddit] oauth fetch failed', {
        path: pathWithQuery,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Soft fallback — often 403 now, but keep for environments that still allow it.
  const publicUrls = [
    `https://old.reddit.com${pathWithQuery}${pathWithQuery.includes('?') ? '&' : '?'}raw_json=1`,
    `https://www.reddit.com${pathWithQuery}${pathWithQuery.includes('?') ? '&' : '?'}raw_json=1`,
  ];
  for (const url of publicUrls) {
    try {
      return await ctx.fetchJson<T>(url, {
        headers: { 'User-Agent': ua, Accept: 'application/json' },
      });
    } catch {
      /* try next */
    }
  }
  return null;
}

async function fetchSearch(ctx: DiscoveryContext, q: string, limit = 8): Promise<RedditPost[]> {
  const encoded = encodeURIComponent(q);
  const paths = [
    `/search?q=${encoded}&sort=relevance&t=year&limit=${limit}&include_over_18=on&raw_json=1`,
    `/search?q=${encoded}&sort=comments&t=year&limit=${Math.min(limit, 6)}&raw_json=1`,
  ];
  for (const path of paths) {
    const json = await fetchRedditJson<RedditListing>(ctx, path);
    const posts = parsePosts(json);
    if (posts.length) return posts;
  }
  return [];
}

async function fetchSubredditSearch(
  ctx: DiscoveryContext,
  subreddit: string,
  q: string,
  limit = 6,
): Promise<RedditPost[]> {
  const encoded = encodeURIComponent(q);
  const path = `/r/${subreddit}/search?q=${encoded}&restrict_sr=on&sort=relevance&t=year&limit=${limit}&raw_json=1`;
  const json = await fetchRedditJson<RedditListing>(ctx, path);
  return parsePosts(json);
}

function commentBodiesFromListing(listing: RedditListing | null, max = 6): string[] {
  const out: string[] = [];
  for (const child of listing?.data?.children || []) {
    const d = child.data || {};
    if (d.kind === 'more' || !d.body) continue;
    const body = String(d.body || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (body.length < 24 || body === '[deleted]' || body === '[removed]') continue;
    out.push(body);
    if (out.length >= max) break;
  }
  return out;
}

async function fetchThreadComments(
  ctx: DiscoveryContext,
  permalink: string,
  max = 6,
): Promise<string[]> {
  const path = permalink.replace(/\/$/, '');
  const json = await fetchRedditJson<unknown>(
    ctx,
    `${path}.json?limit=${max}&sort=top&raw_json=1`,
  );
  const commentsListing = Array.isArray(json) ? (json[1] as RedditListing) : null;
  return commentBodiesFromListing(commentsListing, max);
}

function dcRelevanceBoost(subreddit: string): number {
  const sub = subreddit.toLowerCase();
  if (DC_SUBREDDITS.map((s) => s.toLowerCase()).includes(sub)) return 0.12;
  if (/dc|nova|maryland|virginia|dmv/i.test(sub)) return 0.08;
  return 0;
}

function postToExcerpt(post: RedditPost): string {
  return [post.title, post.selftext].filter(Boolean).join('. ');
}

async function postsToSignals(
  posts: RedditPost[],
  subjectLabel: string,
  kind: 'post' | 'discover' = 'post',
): Promise<NormalizedSignal[]> {
  const ranked = [...posts].sort((a, b) => {
    const scoreA = a.score + a.num_comments * 2 + (dcRelevanceBoost(a.subreddit) > 0 ? 20 : 0);
    const scoreB = b.score + b.num_comments * 2 + (dcRelevanceBoost(b.subreddit) > 0 ? 20 : 0);
    return scoreB - scoreA;
  });

  const seen = new Set<string>();
  const picked: RedditPost[] = [];
  for (const p of ranked) {
    const key = p.permalink.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(p);
    if (picked.length >= MAX_POST_SIGNALS) break;
  }

  return Promise.all(
    picked.map((p) =>
      normalizeSignal({
        source: 'reddit',
        url: `https://www.reddit.com${p.permalink}`,
        title: p.title,
        excerpt: postToExcerpt(p),
        published_at: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : null,
        subject: subjectLabel,
        signal_type: 'social',
        confidence: Math.min(0.85, 0.55 + dcRelevanceBoost(p.subreddit) + (p.num_comments > 5 ? 0.05 : 0)),
        raw: {
          kind,
          subreddit: p.subreddit,
          score: p.score,
          num_comments: p.num_comments,
          post_id: p.id,
        },
      }),
    ),
  );
}

async function commentSignalsForThreads(
  ctx: DiscoveryContext,
  posts: RedditPost[],
  subjectLabel: string,
): Promise<NormalizedSignal[]> {
  const threads = [...posts]
    .filter((p) => p.num_comments >= 2)
    .sort((a, b) => b.num_comments - a.num_comments || b.score - a.score)
    .slice(0, COMMENT_THREADS);

  const settled = await Promise.allSettled(
    threads.map(async (post) => {
      const bodies = await fetchThreadComments(ctx, post.permalink, 5);
      return { post, bodies };
    }),
  );

  const signals: NormalizedSignal[] = [];
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    const { post, bodies } = result.value;
    for (const body of bodies) {
      if (signals.length >= MAX_COMMENT_SIGNALS) break;
      signals.push(
        await normalizeSignal({
          source: 'reddit',
          url: `https://www.reddit.com${post.permalink}`,
          title: `Comment on: ${post.title}`,
          excerpt: body,
          published_at: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : null,
          subject: subjectLabel,
          signal_type: 'social',
          confidence: Math.min(0.8, 0.62 + dcRelevanceBoost(post.subreddit)),
          raw: {
            kind: 'comment',
            subreddit: post.subreddit,
            score: post.score,
            parent_title: post.title,
            post_id: post.id,
          },
        }),
      );
    }
  }
  return signals;
}

async function runQueryBatch(
  ctx: DiscoveryContext,
  queries: string[],
  subjectLabel: string,
  opts?: { pullComments?: boolean; queryCap?: number },
): Promise<NormalizedSignal[]> {
  const capped = queries.slice(0, opts?.queryCap ?? ENRICH_QUERY_CAP);
  const settled = await Promise.allSettled(capped.map((q) => fetchSearch(ctx, q, 8)));
  const posts: RedditPost[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') posts.push(...result.value);
  }

  // Extra restricted searches on key DC subs for venue/artist tokens
  const token =
    subjectLabel
      .replace(/[^\w\s:'-]/g, ' ')
      .trim()
      .split(/\s+/)
      .slice(0, 4)
      .join(' ') || subjectLabel;
  const subSettled = await Promise.allSettled(
    (['washingtondc', 'nova', 'DCMusic'] as const).map((sub) =>
      fetchSubredditSearch(ctx, sub, token, 6),
    ),
  );
  for (const result of subSettled) {
    if (result.status === 'fulfilled') posts.push(...result.value);
  }

  ctx.log?.('[reddit] search complete', {
    queries: capped.length,
    posts: posts.length,
    subject: subjectLabel,
  });

  const postSignals = await postsToSignals(posts, subjectLabel);
  if (!opts?.pullComments) return postSignals;

  const comments = await commentSignalsForThreads(ctx, posts, subjectLabel);
  return [...postSignals, ...comments];
}

export const redditAdapter: SourceAdapter = {
  id: 'reddit',
  name: 'Reddit',
  kind: 'api',
  // Soft-optional: without these, public JSON usually 403s and Reddit returns empty.
  requiresEnv: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'],
  async discover(ctx) {
    return runQueryBatch(ctx, buildRedditDiscoverQueries(), 'Washington DC concerts', {
      pullComments: false,
      queryCap: DISCOVER_QUERY_CAP,
    });
  },
  async enrich(ctx) {
    const queries = buildRedditEnrichQueries(ctx.subject);
    return runQueryBatch(ctx, queries, ctx.subject.name, {
      pullComments: true,
      queryCap: ENRICH_QUERY_CAP,
    });
  },
};

export type _RedditEnrich = EnrichContext;
