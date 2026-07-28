import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';

const DEFAULT_API_VERSION = 'v24.0';
const INSTAGRAM_API_VERSION = (
  Deno.env.get('INSTAGRAM_API_VERSION') ?? DEFAULT_API_VERSION
).replace(/^\/+|\/+$/g, '');
const FACEBOOK_GRAPH_HOST = 'https://graph.facebook.com';
const INSTAGRAM_GRAPH_HOST = 'https://graph.instagram.com';
const FACEBOOK_GRAPH_BASE = `${FACEBOOK_GRAPH_HOST}/${INSTAGRAM_API_VERSION}`;
const INSTAGRAM_GRAPH_BASE = `${INSTAGRAM_GRAPH_HOST}/${INSTAGRAM_API_VERSION}`;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const TIKTOK_CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_APIFY_TIKTOK_ACTOR_ID = 'clockworks~tiktok-scraper';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const LOG_PREFIX = '[SocialAnalytics]';
const isDevLoggingEnabled = () =>
  Deno.env.get('ENVIRONMENT') === 'development' ||
  Deno.env.get('SUPABASE_ENV') === 'local' ||
  Deno.env.get('DENO_ENV') === 'development';
const logInfo = (message: string, meta?: Record<string, unknown>) =>
  console.log(`${LOG_PREFIX} ${message}`, meta ?? {});
const logWarn = (message: string, meta?: Record<string, unknown>) =>
  console.warn(`${LOG_PREFIX} ${message}`, meta ?? {});
const logError = (message: string, meta?: Record<string, unknown>) =>
  console.error(`${LOG_PREFIX} ${message}`, meta ?? {});
const debugLog = (message: string, meta?: Record<string, unknown>) => {
  if (isDevLoggingEnabled()) {
    console.log(`${LOG_PREFIX} ${message}`, meta ?? {});
  }
};
const sanitizeLogValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'string') {
    return value.length > 200 ? `${value.slice(0, 200)}...` : value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

type PlatformName = 'Facebook' | 'Instagram' | 'TikTok';

interface PlatformStat {
  label: string;
  value: string | null;
  subLabel?: string;
}

interface TopPostCardProps {
  title: string;
  platform: PlatformName;
  metricLabel: string;
  metricValue: string | null;
  detail: string;
  className?: string;
}

interface RecentPostRow {
  platform: PlatformName;
  date: string;
  caption: string;
  reach: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  engagementRate: string | null;
}

interface SocialPlatformMetrics {
  followers: number | null;
  followers7: number;
  followers30: number;
  postViews: number | null;
  postViews7: number;
  postViews30: number;
  likes: number | null;
  likes7: number;
  likes30: number;
  comments: number | null;
  comments7: number;
  comments30: number;
  shares: number | null;
  shares7: number;
  shares30: number;
  saves: number | null;
  saves7: number;
  saves30: number;
  reach?: number | null;
  reach7?: number;
  reach30?: number;
}

type SocialPlatformMetricsMap = Record<PlatformName, SocialPlatformMetrics>;

interface PlatformInsightCardProps {
  label: string;
  value: string | null;
  description?: string;
  accent?: boolean;
  className?: string;
}

type SocialInsightsMap = Record<PlatformName, PlatformInsightCardProps[]>;

interface SocialAnalyticsPayload {
  overview: {
    label: string;
    value: string | null;
    description?: string;
    accent?: boolean;
  }[];
  platformComparisons: {
    platform: PlatformName;
    stats: PlatformStat[];
  }[];
  contentPerformance: TopPostCardProps[];
  recentPosts: RecentPostRow[];
  insights: SocialInsightsMap;
  platformMetrics?: SocialPlatformMetricsMap;
  metricReasons?: Record<string, string>;
}

const EMPTY_TIKTOK_PLATFORM_STATS = {
  platform: 'TikTok' as const,
  stats: [
    { label: 'Followers', value: null, subLabel: 'Public profile stat' },
    { label: 'Follower Growth', value: null, subLabel: 'Not public' },
    { label: 'Video Views', value: null, subLabel: 'Scraped post sample' },
    { label: 'Impressions', value: null, subLabel: 'Not public' },
    { label: 'Engagement Rate', value: null, subLabel: 'Scraped post sample' },
    { label: 'Profile Visits', value: null, subLabel: 'Not public' },
    { label: 'Link Clicks', value: null, subLabel: 'Not public' },
    { label: 'Posts Published', value: null, subLabel: 'Public profile stat' },
  ],
};

const EMPTY_TIKTOK_INSIGHTS: PlatformInsightCardProps[] = [
  { label: 'Best Posting Day', value: null, description: 'Public post sample' },
  { label: 'Best Posting Time', value: null, description: 'Public post sample' },
  { label: 'Best Content Type', value: null, description: 'Public post sample' },
  { label: 'Follower Growth', value: null, description: 'Not available from public data' },
];

const EMPTY_FACEBOOK_PLATFORM_STATS = {
  platform: 'Facebook' as const,
  stats: [
    { label: 'Followers', value: null, subLabel: 'Page followers' },
    { label: 'Page Likes', value: null, subLabel: 'Page fans' },
    { label: 'Reach', value: null, subLabel: 'Last 30d' },
    { label: 'Impressions', value: null, subLabel: 'Last 30d' },
    { label: 'Engagements', value: null, subLabel: 'Last 30d' },
    { label: 'Page Views', value: null, subLabel: 'Last 30d' },
    { label: 'Recent Posts', value: null, subLabel: 'Fetched from Page' },
  ],
};

const EMPTY_FACEBOOK_INSIGHTS: PlatformInsightCardProps[] = [
  { label: 'Best Posting Day', value: null, description: 'Highest public interactions' },
  { label: 'Best Posting Time', value: null, description: 'Highest public interactions' },
  { label: 'Top Post', value: null, description: 'Highest public interactions' },
];

interface TikTokActorItem {
  id?: string | null;
  text?: string | null;
  createTime?: number | null;
  createTimeISO?: string | null;
  webVideoUrl?: string | null;
  diggCount?: number | null;
  shareCount?: number | null;
  playCount?: number | null;
  commentCount?: number | null;
  collectCount?: number | null;
  isSlideshow?: boolean | null;
  authorMeta?: {
    fans?: number | null;
    following?: number | null;
    heart?: number | null;
    video?: number | null;
  } | null;
  error?: string | null;
}

interface TikTokAnalyticsResult {
  platformComparison: SocialAnalyticsPayload['platformComparisons'][number];
  contentPerformance: TopPostCardProps[];
  recentPosts: RecentPostRow[];
  insights: PlatformInsightCardProps[];
  overview: SocialAnalyticsPayload['overview'];
  metrics: SocialPlatformMetrics;
  warnings: string[];
  metricReasons?: Record<string, string>;
}

type PlatformAnalyticsResult = TikTokAnalyticsResult;

let tikTokCache: { username: string; value: TikTokAnalyticsResult; expiresAt: number } | null = null;

const emptyMetrics = (): SocialPlatformMetrics => ({
  followers: null,
  followers7: 0,
  followers30: 0,
  postViews: null,
  postViews7: 0,
  postViews30: 0,
  likes: null,
  likes7: 0,
  likes30: 0,
  comments: null,
  comments7: 0,
  comments30: 0,
  shares: null,
  shares7: 0,
  shares30: 0,
  saves: null,
  saves7: 0,
  saves30: 0,
  reach: null,
  reach7: 0,
  reach30: 0,
});

const emptyTikTokResult = (warnings: string[]): TikTokAnalyticsResult => ({
  platformComparison: EMPTY_TIKTOK_PLATFORM_STATS,
  contentPerformance: [],
  recentPosts: [],
  insights: EMPTY_TIKTOK_INSIGHTS,
  overview: [],
  metrics: emptyMetrics(),
  warnings,
});

const fetchTikTokAnalytics = async (): Promise<TikTokAnalyticsResult> => {
  const token = Deno.env.get('APIFY_TOKEN');
  const username = Deno.env.get('TIKTOK_USERNAME')?.replace(/^@/, '').trim();
  if (!token || !username) {
    const missing = [!token && 'APIFY_TOKEN', !username && 'TIKTOK_USERNAME'].filter(Boolean).join(', ');
    return emptyTikTokResult([`TikTok: missing server-side env vars: ${missing}.`]);
  }

  if (tikTokCache?.username === username && tikTokCache.expiresAt > Date.now()) {
    return tikTokCache.value;
  }

  const configuredActor = Deno.env.get('APIFY_TIKTOK_ACTOR_ID') ?? DEFAULT_APIFY_TIKTOK_ACTOR_ID;
  const actorId = configuredActor.replace('/', '~');
  const configuredMaxItems = Number.parseInt(Deno.env.get('APIFY_TIKTOK_MAX_ITEMS') ?? '1000', 10);
  const itemLimit = Number.isFinite(configuredMaxItems) && configuredMaxItems > 0 ? configuredMaxItems : 1000;
  const endpoint = new URL(
    `https://api.apify.com/v2/actors/${encodeURIComponent(actorId)}/run-sync-get-dataset-items`
  );
  endpoint.searchParams.set('clean', 'true');
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('limit', String(itemLimit));
  endpoint.searchParams.set('timeout', '120');
  endpoint.searchParams.set('maxItems', String(itemLimit));

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        profiles: [username],
        profileScrapeSections: ['videos'],
        profileSorting: 'latest',
        resultsPerPage: Math.min(itemLimit, 100),
        maxItems: itemLimit,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        shouldDownloadAvatars: false,
        commentsPerPost: 0,
      }),
    });
    if (!response.ok) {
      const errorBody = sanitizeLogValue(await response.text());
      throw new Error(`Apify request failed with status ${response.status}: ${errorBody}`);
    }

    const rawItems = await response.json();
    debugLog('Raw TikTok response shape', {
      isArray: Array.isArray(rawItems),
      length: Array.isArray(rawItems) ? rawItems.length : null,
      firstItemKeys: Array.isArray(rawItems) && rawItems[0] ? Object.keys(rawItems[0]).slice(0, 20) : [],
    });
    const items: TikTokActorItem[] = Array.isArray(rawItems)
      ? rawItems.filter(item => item && !item.error)
      : [];
    if (!items.length) throw new Error('Apify returned no public TikTok posts');

    const author = items.find(item => item.authorMeta)?.authorMeta ?? null;
    const totalViews = items.reduce((sum, item) => sum + (item.playCount ?? 0), 0);
    const scrapedTotalLikes = items.reduce((sum, item) => sum + (item.diggCount ?? 0), 0);
    const totalComments = items.reduce((sum, item) => sum + (item.commentCount ?? 0), 0);
    const totalShares = items.reduce((sum, item) => sum + (item.shareCount ?? 0), 0);
    const profileTotalLikes = author?.heart ?? null;
    const totalLikes = profileTotalLikes ?? scrapedTotalLikes;
    const totalLikesSubLabel =
      profileTotalLikes != null ? 'Public profile stat' : `${items.length} scraped posts`;
    const totalInteractions = items.reduce(
      (sum, item) => sum + (item.diggCount ?? 0) + (item.commentCount ?? 0) + (item.shareCount ?? 0),
      0
    );
    const engagementRate = totalViews > 0 ? totalInteractions / totalViews : null;
    const timestampFor = (item: TikTokActorItem) =>
      item.createTimeISO ?? (item.createTime ? new Date(item.createTime * 1000).toISOString() : null);
    const datedItems = items.filter(item => timestampFor(item));
    const normalizedPerformancePosts: NormalizedPerformancePost[] = items.map(item => ({
      timestamp: timestampFor(item),
      views: item.playCount ?? null,
      likes: item.diggCount ?? null,
      comments: item.commentCount ?? null,
      shares: item.shareCount ?? null,
    }));
    const tiktokScore = (item: TikTokActorItem) => calculateScore('TikTok', {
      views: item.playCount,
      likes: item.diggCount,
      comments: item.commentCount,
      shares: item.shareCount,
    });
    const sortedByScore = [...items].sort((a, b) => tiktokScore(b) - tiktokScore(a));

    const toCard = (title: string, item: TikTokActorItem, metricLabel: string, value: number | null) => ({
      title,
      platform: 'TikTok' as const,
      metricLabel,
      metricValue: value == null ? null : `${value.toLocaleString()} ${metricLabel}`,
      detail: item.text?.slice(0, 80) || 'Untitled post',
    });
    const contentPerformance = [
      sortedByScore[0] && toCard('Best TikTok post', sortedByScore[0], 'Score', tiktokScore(sortedByScore[0])),
    ].filter(Boolean) as TopPostCardProps[];

    debugLog('Normalized TikTok aggregation', {
      postsLength: items.length,
      datedPostsLength: datedItems.length,
      views: totalViews,
      likes: totalLikes,
      comments: totalComments,
      shares: totalShares,
    });

    const recentPosts = [...datedItems]
      .sort((a, b) => new Date(timestampFor(b)!).getTime() - new Date(timestampFor(a)!).getTime())
      .slice(0, 8)
      .map(item => {
        const interactions =
          item.diggCount == null && item.commentCount == null && item.shareCount == null
            ? null
            : (item.diggCount ?? 0) + (item.commentCount ?? 0) + (item.shareCount ?? 0);
        return {
          platform: 'TikTok' as const,
          date: new Date(timestampFor(item)!).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          }),
          caption: item.text || 'Untitled post',
          reach: item.playCount == null ? null : formatNumber(item.playCount),
          likes: item.diggCount ?? null,
          comments: item.commentCount ?? null,
          shares: item.shareCount ?? null,
          saves: null,
          engagementRate:
            item.playCount && interactions != null
              ? `${((interactions / item.playCount) * 100).toFixed(1)}%`
              : null,
        };
      });

    const tikTokWarnings: string[] = [];
    const snapshotGrowth = await recordFollowerSnapshot('TikTok', author?.fans ?? null, tikTokWarnings);
    const metrics: SocialPlatformMetrics = {
      followers: author?.fans ?? null,
      followers7: snapshotGrowth.followers7,
      followers30: snapshotGrowth.followers30,
      postViews: totalViews,
      postViews7: sumByWindow(items, 7, timestampFor, item => item.playCount),
      postViews30: sumByWindow(items, 30, timestampFor, item => item.playCount),
      likes: totalLikes,
      likes7: sumByWindow(items, 7, timestampFor, item => item.diggCount),
      likes30: sumByWindow(items, 30, timestampFor, item => item.diggCount),
      comments: totalComments,
      comments7: sumByWindow(items, 7, timestampFor, item => item.commentCount),
      comments30: sumByWindow(items, 30, timestampFor, item => item.commentCount),
      shares: totalShares,
      shares7: sumByWindow(items, 7, timestampFor, item => item.shareCount),
      shares30: sumByWindow(items, 30, timestampFor, item => item.shareCount),
      saves: null,
      saves7: 0,
      saves30: 0,
    };

    debugLog('TikTok post totals', {
      videosFetched: items.length,
      profileTotalLikesAvailable: profileTotalLikes != null,
    });

    const result: TikTokAnalyticsResult = {
      platformComparison: {
        platform: 'TikTok',
        stats: [
          { label: 'Followers', value: author?.fans == null ? null : formatNumber(author.fans), subLabel: 'Public profile stat' },
          { label: 'Following', value: author?.following == null ? null : formatNumber(author.following), subLabel: 'Public profile stat' },
          { label: 'Total Likes', value: formatNumber(totalLikes), subLabel: totalLikesSubLabel },
          { label: 'Total Comments', value: formatNumber(totalComments), subLabel: `${items.length} scraped posts` },
          { label: 'Total Shares', value: formatNumber(totalShares), subLabel: `${items.length} scraped posts` },
          { label: 'Video Views', value: formatNumber(totalViews), subLabel: `${items.length} scraped posts` },
          { label: 'Engagement Rate', value: engagementRate == null ? null : formatPercentOrNull(engagementRate), subLabel: 'Scraped post sample' },
          { label: 'Posts Published', value: author?.video == null ? null : formatNumber(author.video), subLabel: 'Public profile stat' },
          { label: 'Followers Gained 7d', value: formatNumber(snapshotGrowth.followers7), subLabel: 'Daily snapshot' },
          { label: 'Followers Gained 30d', value: formatNumber(snapshotGrowth.followers30), subLabel: 'Daily snapshot' },
          { label: 'Impressions', value: null, subLabel: 'Not public' },
          { label: 'Profile Visits', value: null, subLabel: 'Not public' },
          { label: 'Link Clicks', value: null, subLabel: 'Not public' },
        ],
      },
      contentPerformance,
      recentPosts,
      insights: [
        { label: 'Best Posting Day', value: rankPostingBuckets(normalizedPerformancePosts, 'TikTok', 'day'), description: 'Top 3 by average score' },
        { label: 'Best Posting Time', value: rankPostingBuckets(normalizedPerformancePosts, 'TikTok', 'time'), description: 'Top 3 by average score' },
        { label: 'Best Content Type', value: items.some(item => item.isSlideshow) ? 'Slideshow' : 'Video', description: 'Public post sample' },
        { label: 'Follower Growth', value: formatNumber(snapshotGrowth.followers30), description: '30-day daily snapshot' },
      ],
      metrics,
      overview: [
        { label: 'TikTok Followers', value: author?.fans == null ? null : formatNumber(author.fans), description: 'Public profile stat' },
        { label: 'TikTok Video Views', value: formatNumber(totalViews), description: `${items.length} scraped public posts` },
      ],
      warnings: tikTokWarnings,
    };
    tikTokCache = { username, value: result, expiresAt: Date.now() + TIKTOK_CACHE_TTL_MS };
    return result;
  } catch (error) {
    logWarn('TikTok Apify fetch failed', { error: sanitizeLogValue((error as Error)?.message) });
    if (tikTokCache?.username === username) {
      return {
        ...tikTokCache.value,
        warnings: [...tikTokCache.value.warnings, 'TikTok: Apify refresh failed; showing stale cached public data.'],
      };
    }
    return emptyTikTokResult([
      `TikTok analytics unavailable: ${sanitizeLogValue((error as Error)?.message ?? 'unknown error')}`,
    ]);
  }
};

const mergeTikTokData = (
  instagram: SocialAnalyticsPayload,
  tiktok: TikTokAnalyticsResult
): SocialAnalyticsPayload => ({
  ...instagram,
  overview: [...instagram.overview, ...tiktok.overview],
  platformComparisons: [
    ...instagram.platformComparisons.filter(item => item.platform !== 'TikTok'),
    tiktok.platformComparison,
  ],
  contentPerformance: [...instagram.contentPerformance, ...tiktok.contentPerformance],
  recentPosts: [...instagram.recentPosts, ...tiktok.recentPosts],
  insights: { ...instagram.insights, TikTok: tiktok.insights },
  platformMetrics: {
    Facebook: instagram.platformMetrics?.Facebook ?? emptyMetrics(),
    Instagram: instagram.platformMetrics?.Instagram ?? emptyMetrics(),
    TikTok: tiktok.metrics,
  },
  metricReasons: {
    ...(instagram.metricReasons ?? {}),
    ...(tiktok.metricReasons ?? {}),
  },
});

const extractPlatformResult = (
  payload: SocialAnalyticsPayload,
  platform: PlatformName,
  warnings: string[] = []
): PlatformAnalyticsResult => ({
  platformComparison:
    payload.platformComparisons.find(item => item.platform === platform) ??
    (platform === 'TikTok' ? EMPTY_TIKTOK_PLATFORM_STATS : EMPTY_FACEBOOK_PLATFORM_STATS),
  contentPerformance: payload.contentPerformance.filter(card => card.platform === platform),
  recentPosts: payload.recentPosts.filter(post => post.platform === platform),
  insights: payload.insights[platform] ?? (
    platform === 'TikTok' ? EMPTY_TIKTOK_INSIGHTS : EMPTY_FACEBOOK_INSIGHTS
  ),
  overview: payload.overview.filter(metric =>
    metric.label.toLowerCase().includes(platform.toLowerCase())
  ),
  metrics: payload.platformMetrics?.[platform] ?? emptyMetrics(),
  metricReasons: Object.fromEntries(
    Object.entries(payload.metricReasons ?? {}).filter(([key]) => key.startsWith(`${platform}.`))
  ),
  warnings,
});

const replacePlatformData = (
  payload: SocialAnalyticsPayload,
  platform: PlatformName,
  result: PlatformAnalyticsResult
): SocialAnalyticsPayload => ({
  ...payload,
  overview: [
    ...payload.overview.filter(metric => !metric.label.toLowerCase().includes(platform.toLowerCase())),
    ...result.overview,
  ],
  platformComparisons: [
    result.platformComparison,
    ...payload.platformComparisons.filter(item => item.platform !== platform),
  ],
  contentPerformance: [
    ...payload.contentPerformance.filter(card => card.platform !== platform),
    ...result.contentPerformance,
  ],
  recentPosts: [
    ...payload.recentPosts.filter(post => post.platform !== platform),
    ...result.recentPosts,
  ],
  insights: {
    ...payload.insights,
    [platform]: result.insights,
  },
  platformMetrics: {
    Facebook: payload.platformMetrics?.Facebook ?? emptyMetrics(),
    Instagram: payload.platformMetrics?.Instagram ?? emptyMetrics(),
    TikTok: payload.platformMetrics?.TikTok ?? emptyMetrics(),
    [platform]: result.metrics,
  },
  metricReasons: {
    ...(payload.metricReasons ?? {}),
    ...(result.metricReasons ?? {}),
  },
});

const respondJSON = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const preflightResponse = () =>
  new Response('ok', {
    status: 200,
    headers: corsHeaders,
  });

const formatNumber = (value: number) => {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toString();
};

const sumNumberArray = (values: number[]) => values.reduce((sum, value) => sum + value, 0);

const formatNumberOrNull = (value?: number | null) => (value != null ? formatNumber(value) : null);
const formatPercentOrNull = (value?: number | null) =>
  value != null ? `${(value * 100).toFixed(1)}%` : null;
const formatMetricValueOrNull = (value: number | undefined, label: string) =>
  value != null ? `${value.toLocaleString()} ${label}` : null;
const formatNumberWithReason = (value: number | null | undefined, reason?: string) =>
  value != null ? formatNumber(value) : reason ? `N/A (${reason})` : null;
const formatMetricWithReason = (
  value: number | null | undefined,
  platform: PlatformName,
  key: keyof SocialPlatformMetrics,
  reasonMap?: Record<string, string>
) => formatNumberWithReason(value, reasonMap?.[`${platform}.${key}`]);

const daysAgo = (days: number) => Date.now() - days * 24 * 60 * 60 * 1000;

const isTimestampWithinDays = (timestamp: string | null | undefined, days: number) => {
  if (!timestamp) return false;
  const parsed = new Date(timestamp).getTime();
  if (Number.isNaN(parsed)) return false;
  return parsed >= daysAgo(days);
};

const sumByWindow = <T>(
  items: T[],
  days: number,
  timestampFor: (item: T) => string | null | undefined,
  valueFor: (item: T) => number | null | undefined
) => items
  .filter(item => isTimestampWithinDays(timestampFor(item), days))
  .reduce((sum, item) => sum + (valueFor(item) ?? 0), 0);

const calculateScore = (
  platform: PlatformName,
  metrics: { reach?: number | null; views?: number | null; likes?: number | null; comments?: number | null; shares?: number | null; saves?: number | null }
) => {
  const reach = metrics.reach ?? metrics.views ?? 0;
  const likes = metrics.likes ?? 0;
  const comments = metrics.comments ?? 0;
  const shares = metrics.shares ?? 0;
  const saves = metrics.saves ?? 0;

  if (platform === 'TikTok') {
    return (reach + likes * 10) + (comments * 20) + (shares * 30);
  }
  if (platform === 'Instagram') {
    return (reach + likes * 10) + (comments * 20) + (shares * 30) + (saves * 30);
  }
  return (reach + likes * 5) + (comments * 20) + (shares * 40);
};

interface NormalizedPerformancePost {
  timestamp: string | null;
  views?: number | null;
  reach?: number | null;
  likes?: number | null;
  reactions?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
}

const rankPostingBuckets = (
  posts: NormalizedPerformancePost[],
  platform: PlatformName,
  type: 'day' | 'time'
) => {
  const validPosts = posts
    .map(post => {
      if (!post.timestamp) return null;
      const date = new Date(post.timestamp);
      return Number.isNaN(date.getTime()) ? null : { post, date };
    })
    .filter(Boolean) as Array<{ post: NormalizedPerformancePost; date: Date }>;

  if (validPosts.length < 3) return 'Not enough data';

  const groups: Record<string, { total: number; count: number }> = {};
  validPosts.forEach(({ post, date }) => {
    const key = type === 'day'
      ? date.toLocaleDateString('en-US', { weekday: 'long' })
      : `${date.getHours() % 12 === 0 ? 12 : date.getHours() % 12} ${date.getHours() >= 12 ? 'PM' : 'AM'}`;
    groups[key] = groups[key] ?? { total: 0, count: 0 };
    groups[key].total += calculateScore(platform, {
      views: post.views,
      reach: post.reach,
      likes: platform === 'Facebook' ? post.reactions : post.likes,
      comments: post.comments,
      shares: post.shares,
      saves: post.saves,
    });
    groups[key].count += 1;
  });

  const ranked = Object.entries(groups)
    .filter(([, value]) => value.count > 0)
    .sort((a, b) => {
      const averageDifference = (b[1].total / b[1].count) - (a[1].total / a[1].count);
      if (averageDifference !== 0) return averageDifference;
      const countDifference = b[1].count - a[1].count;
      return countDifference !== 0 ? countDifference : a[0].localeCompare(b[0]);
    })
    .slice(0, 3)
    .map(([label], index) => `${index + 1}. ${label}`);

  return ranked.length ? ranked.join(', ') : 'Not enough data';
};

const getSnapshotDate = (offsetDays = 0) => {
  const date = new Date(Date.now() - offsetDays * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
};

const fetchSupabaseRest = async (path: string, init: RequestInit = {}) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service credentials unavailable');
  }

  const response = await fetch(`${supabaseUrl.replace(/\/+$/g, '')}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase REST ${response.status}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
};

const platformResultHasData = (result: PlatformAnalyticsResult) => {
  const metricValues = Object.values(result.metrics ?? {});
  return (
    metricValues.some(value => typeof value === 'number' && value > 0) ||
    result.contentPerformance.some(card => card.metricValue != null) ||
    result.recentPosts.length > 0 ||
    result.platformComparison.stats.some(stat => stat.value != null)
  );
};

const formatSnapshotDate = (capturedAt: string) =>
  new Date(capturedAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

const savePlatformSnapshot = async (platform: PlatformName, result: PlatformAnalyticsResult) => {
  if (!platformResultHasData(result)) return;

  try {
    await fetchSupabaseRest('social_media_analytics_snapshots', {
      method: 'POST',
      body: JSON.stringify([{
        platform,
        payload: result,
        captured_at: new Date().toISOString(),
      }]),
    });
  } catch (error) {
    logWarn('Social analytics snapshot save failed', {
      platform,
      error: sanitizeLogValue((error as Error)?.message),
    });
  }
};

const loadLatestPlatformSnapshot = async (platform: PlatformName) => {
  try {
    const rows = await fetchSupabaseRest(
      `social_media_analytics_snapshots?platform=eq.${encodeURIComponent(platform)}&select=payload,captured_at&order=captured_at.desc&limit=1`
    ) as Array<{ payload: PlatformAnalyticsResult; captured_at: string }>;
    return rows?.[0] ?? null;
  } catch (error) {
    logWarn('Social analytics snapshot load failed', {
      platform,
      error: sanitizeLogValue((error as Error)?.message),
    });
    return null;
  }
};

const withSavedPlatformFallback = async (
  platform: PlatformName,
  result: PlatformAnalyticsResult
): Promise<PlatformAnalyticsResult> => {
  if (platformResultHasData(result)) {
    await savePlatformSnapshot(platform, result);
    return result;
  }

  const snapshot = await loadLatestPlatformSnapshot(platform);
  if (!snapshot?.payload) return result;

  const capturedLabel = formatSnapshotDate(snapshot.captured_at);
  return {
    ...snapshot.payload,
    warnings: [
      ...(result.warnings ?? []),
      ...(snapshot.payload.warnings ?? []),
      `${platform}: live analytics unavailable; showing saved data from ${capturedLabel}.`,
    ],
  };
};

const recordFollowerSnapshot = async (
  platform: PlatformName,
  followers: number | null,
  warnings: string[]
) => {
  if (followers == null) return { followers7: 0, followers30: 0 };

  try {
    const today = getSnapshotDate();
    await fetchSupabaseRest('social_media_follower_snapshots?on_conflict=platform,snapshot_date', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([{ platform, snapshot_date: today, followers }]),
    });

    const rows = await fetchSupabaseRest(
      `social_media_follower_snapshots?platform=eq.${encodeURIComponent(platform)}&snapshot_date=lte.${today}&select=snapshot_date,followers&order=snapshot_date.desc&limit=40`
    ) as Array<{ snapshot_date: string; followers: number }>;
    const findPrevious = (days: number) => rows.find(row => row.snapshot_date <= getSnapshotDate(days));
    const sevenDay = findPrevious(7);
    const thirtyDay = findPrevious(30);

    return {
      followers7: sevenDay ? Math.max(0, followers - sevenDay.followers) : 0,
      followers30: thirtyDay ? Math.max(0, followers - thirtyDay.followers) : 0,
    };
  } catch (error) {
    logWarn('Follower snapshot unavailable', {
      platform,
      error: sanitizeLogValue((error as Error)?.message),
    });
    warnings.push(`${platform}: follower growth snapshots unavailable.`);
    return { followers7: 0, followers30: 0 };
  }
};

const getBestContentType = (posts: { media_type: string }[]) => {
  if (!posts.length) return null;
  const counts: Record<string, number> = {};
  posts.forEach(post => {
    counts[post.media_type] = (counts[post.media_type] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

const METRIC_CONFIGS = [
  { metric: 'reach', label: 'reach' },
];
const METRIC_TO_STATS_KEY: Record<string, keyof SocialPlatformMetrics> = {
  reach: 'reach',
};

type GraphHostLabel = 'facebook' | 'instagram';

const GRAPH_HOSTS: Record<GraphHostLabel, { base: string }> = {
  facebook: { base: FACEBOOK_GRAPH_BASE },
  instagram: { base: INSTAGRAM_GRAPH_BASE },
};

interface GraphApiError extends Error {
  status?: number;
  body?: string;
}

interface GraphListResponse<T> {
  data?: T[];
  paging?: {
    next?: string;
  };
}

interface InstagramBusinessAccountResponse {
  id?: string;
  username?: string;
  followers_count?: number;
  media_count?: number;
}

interface FacebookPageInstagramResponse {
  instagram_business_account?: InstagramBusinessAccountResponse | null;
}

type InstagramAccountResponse = Record<string, unknown> & InstagramBusinessAccountResponse;
interface InstagramMediaItem {
  id: string;
  caption?: string | null;
  timestamp?: string | null;
  like_count?: number | null;
  comments_count?: number | null;
  media_type?: string | null;
  permalink?: string | null;
}
type InstagramMediaResponse = GraphListResponse<InstagramMediaItem>;

interface GraphClient {
  request: <T>(
    path: string,
    description: string,
    options?: { hosts?: GraphHostLabel[] }
  ) => Promise<T>;
  getResolvedHost: () => GraphHostLabel | null;
  getBaseUrl: () => string;
}

const fetchGraph = async (url: string, token: string) => {
  const requestUrl = new URL(url);
  requestUrl.searchParams.set('access_token', token);
  const response = await fetch(requestUrl.toString());
  const text = await response.text();
  if (!response.ok) {
    const error: GraphApiError = new Error(`Graph API error ${response.status}`);
    error.status = response.status;
    error.body = sanitizeLogValue(text);
    throw error;
  }
  if (!text) return null;
  return JSON.parse(text);
};

const createGraphClient = (token: string): GraphClient => {
  let resolvedHost: GraphHostLabel | null = null;

  const buildHostOrder = (options?: { hosts?: GraphHostLabel[] }) => {
    if (options?.hosts?.length) {
      const uniqueHosts: GraphHostLabel[] = [];
      options.hosts.forEach(host => {
        if (!uniqueHosts.includes(host)) uniqueHosts.push(host);
      });
      return uniqueHosts;
    }
    const order: GraphHostLabel[] = [];
    if (resolvedHost) order.push(resolvedHost);
    (['facebook', 'instagram'] as GraphHostLabel[]).forEach(host => {
      if (!order.includes(host)) order.push(host);
    });
    return order;
  };

  const fetchWithHost = async (host: GraphHostLabel, path: string, description: string) => {
    const url = `${GRAPH_HOSTS[host].base}${path}`;
    logInfo('Meta Graph request', { description, host, url });
    return fetchGraph(url, token);
  };

  const request = async <T>(
    path: string,
    description: string,
    options?: { hosts?: GraphHostLabel[] }
  ): Promise<T> => {
    const hostOrder = buildHostOrder(options);
    let lastError: GraphApiError | Error | null = null;
    for (const host of hostOrder) {
      try {
        const payload = await fetchWithHost(host, path, description);
        resolvedHost = host;
        return payload as T;
      } catch (error) {
        const graphError = (error as GraphApiError) ?? new Error('Unknown Graph error');
        lastError = lastError ?? graphError;
        logWarn('Meta Graph request failed', {
          description,
          host,
          status: graphError.status ?? 'unknown',
          error: sanitizeLogValue(graphError.message ?? 'unknown'),
          responseBody: sanitizeLogValue(graphError.body ?? undefined),
        });
      }
    }
    throw lastError ?? new Error('Meta Graph request failed');
  };

  const getResolvedHost = () => resolvedHost;
  const getBaseUrl = () => GRAPH_HOSTS[resolvedHost ?? 'facebook'].base;

  return { request, getResolvedHost, getBaseUrl };
};

interface MetricSeries {
  metric: string;
  values: number[];
  latest: number | null;
}

interface PostData {
  id: string;
  caption: string;
  timestamp: string;
  media_type: string;
  permalink: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
  engagement: number | null;
  impressions: number | null;
}

interface FacebookPostData {
  id: string;
  caption: string;
  timestamp: string;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  reach: number | null;
  impressions: number | null;
  interactions: number | null;
}

const parseMetricSeries = (metric: string, response: any): MetricSeries => {
  const entry = Array.isArray(response?.data) ? response.data[0] : null;
  const rawValues: Array<{ value?: unknown }> = Array.isArray(entry?.values) ? entry.values : [];
  const values = rawValues
    .map(value => (typeof value?.value === 'number' ? value.value : null))
    .filter((value): value is number => value != null);
  const latest = values.length ? values[values.length - 1] : null;
  return { metric, values, latest };
};

const emptyFacebookResult = (warnings: string[]): PlatformAnalyticsResult => ({
  platformComparison: EMPTY_FACEBOOK_PLATFORM_STATS,
  contentPerformance: [],
  recentPosts: [],
  insights: EMPTY_FACEBOOK_INSIGHTS,
  overview: [],
  metrics: emptyMetrics(),
  metricReasons: {},
  warnings,
});

const fetchFacebookAnalytics = async (
  pageId: string | undefined,
  accessToken: string | undefined
): Promise<PlatformAnalyticsResult> => {
  if (!pageId || !accessToken) {
    const tokenMissingDescription = !accessToken
      ? 'FACEBOOK_PAGE_ACCESS_TOKEN or FACEBOOK_ACCESS_TOKEN or INSTAGRAM_ACCESS_TOKEN'
      : null;
    const missing = [!pageId && 'FACEBOOK_PAGE_ID', tokenMissingDescription].filter(Boolean).join(', ');
    return emptyFacebookResult([`Facebook: missing server-side env vars: ${missing}.`]);
  }

  const warnings: string[] = [];
  const metricReasons: Record<string, string> = {};
  const recordFacebookMetricReason = (metric: keyof SocialPlatformMetrics, reason: string) => {
    const mapKey = `Facebook.${metric}`;
    if (!metricReasons[mapKey]) {
      metricReasons[mapKey] = reason;
    }
  };
  const invalidTokenWarning = 'Facebook Page Access Token invalid/expired';
  const addUniqueWarning = (message: string) => {
    if (!warnings.includes(message)) {
      warnings.push(message);
    }
  };
  recordFacebookMetricReason('saves', 'Facebook saves not available via public Graph API');
  const request = async (
    path: string,
    warning: string,
    impactedMetrics: Array<keyof SocialPlatformMetrics> = []
  ) => {
    try {
      return await fetchGraph(`${FACEBOOK_GRAPH_BASE}${path}`, accessToken);
    } catch (error) {
      const graphError = error as GraphApiError;
      const errorMessage = graphError?.body || graphError?.message || 'unknown error';
      const sanitizedError = sanitizeLogValue(errorMessage);
      logWarn('Facebook Graph fetch failed', {
        path,
        error: sanitizedError,
      });
      addUniqueWarning(`${warning}: ${sanitizedError}`);
      const reason =
        graphError.status === 190
          ? invalidTokenWarning
          : `${warning} ${sanitizedError}`;
      impactedMetrics.forEach(metric => recordFacebookMetricReason(metric, reason));
      if (graphError.status === 190) addUniqueWarning(invalidTokenWarning);
      return null;
    }
  };

  const unavailableInsightsReason =
    'Meta Graph API did not accept Page/Post insights metrics for this Page/API version';
  recordFacebookMetricReason('reach', unavailableInsightsReason);
  recordFacebookMetricReason('postViews', unavailableInsightsReason);

  const [page, postsResponse] = await Promise.all([
    request(
      `/${pageId}?fields=id,name,followers_count,fan_count,link`,
      'Facebook Page metadata unavailable.',
      ['followers']
    ),
    request(
      `/${pageId}/posts?fields=id,message,created_time,permalink_url,shares,comments.limit(0).summary(true),reactions.limit(0).summary(true)&limit=100`,
      'Facebook recent posts unavailable.',
      ['likes', 'comments', 'shares']
    ),
  ]);

  debugLog('Raw Facebook response shape', {
    pageKeys: page ? Object.keys(page).slice(0, 20) : [],
    postsLength: Array.isArray(postsResponse?.data) ? postsResponse.data.length : null,
    postsFirstKeys: Array.isArray(postsResponse?.data) && postsResponse.data[0] ? Object.keys(postsResponse.data[0]).slice(0, 20) : [],
    warnings,
  });

  if (!page && !postsResponse) return emptyFacebookResult(warnings);

  const posts: FacebookPostData[] = (Array.isArray(postsResponse?.data) ? postsResponse.data : []).map((post: any) => {
    const reactions = typeof post?.reactions?.summary?.total_count === 'number'
      ? post.reactions.summary.total_count
      : null;
    const comments = typeof post?.comments?.summary?.total_count === 'number'
      ? post.comments.summary.total_count
      : null;
    const shares = typeof post?.shares?.count === 'number' ? post.shares.count : null;
    const interactions =
      reactions == null && comments == null && shares == null
        ? null
        : (reactions ?? 0) + (comments ?? 0) + (shares ?? 0);
    const id = String(post?.id ?? '');
    return {
      id,
      caption: typeof post?.message === 'string' ? post.message : 'Untitled post',
      timestamp: typeof post?.created_time === 'string' ? post.created_time : new Date().toISOString(),
      reactions,
      comments,
      shares,
      reach: null,
      impressions: null,
      interactions,
    };
  });
  debugLog('Facebook posts fetched', { count: posts.length });
  const facebookScore = (post: typeof posts[number]) => calculateScore('Facebook', {
    reach: post.reach ?? post.impressions,
    likes: post.reactions,
    comments: post.comments,
    shares: post.shares,
  });
  const normalizedPerformancePosts: NormalizedPerformancePost[] = posts.map(post => ({
    timestamp: post.timestamp,
    reach: post.reach ?? post.impressions,
    reactions: post.reactions,
    comments: post.comments,
    shares: post.shares,
  }));
  const sortedByInteractions = [...posts].sort((a, b) => facebookScore(b) - facebookScore(a));
  const topPost = sortedByInteractions[0];
  const totalReactions = posts.reduce((sum, post) => sum + (post.reactions ?? 0), 0);
  const totalComments = posts.reduce((sum, post) => sum + (post.comments ?? 0), 0);
  const totalShares = posts.reduce((sum, post) => sum + (post.shares ?? 0), 0);
  const totalPostReach = posts.reduce((sum, post) => sum + (post.reach ?? 0), 0);
  const totalPostImpressions = posts.reduce((sum, post) => sum + (post.impressions ?? 0), 0);
  const hasPostReach = posts.some(post => post.reach != null);
  const hasPostImpressions = posts.some(post => post.impressions != null);
  const reachTotal = hasPostReach ? totalPostReach : null;
  const impressionsTotal = hasPostImpressions ? totalPostImpressions : null;
  const facebookWarnings = [...warnings];
  const facebookFollowers = typeof page?.followers_count === 'number'
    ? page.followers_count
    : typeof page?.fan_count === 'number'
      ? page.fan_count
      : null;
  const followerGrowth = await recordFollowerSnapshot(
    'Facebook',
    facebookFollowers,
    facebookWarnings
  );
  debugLog('Normalized Facebook aggregation', {
    postsLength: posts.length,
    reactions: totalReactions,
    comments: totalComments,
    shares: totalShares,
    reach: totalPostReach,
    impressions: totalPostImpressions,
    followers: facebookFollowers,
  });
  const metrics: SocialPlatformMetrics = {
    followers: facebookFollowers,
    followers7: followerGrowth.followers7,
    followers30: followerGrowth.followers30,
    postViews: impressionsTotal,
    postViews7: sumByWindow(posts, 7, post => post.timestamp, post => post.impressions),
    postViews30: sumByWindow(posts, 30, post => post.timestamp, post => post.impressions),
    likes: totalReactions,
    likes7: sumByWindow(posts, 7, post => post.timestamp, post => post.reactions),
    likes30: sumByWindow(posts, 30, post => post.timestamp, post => post.reactions),
    comments: totalComments,
    comments7: sumByWindow(posts, 7, post => post.timestamp, post => post.comments),
    comments30: sumByWindow(posts, 30, post => post.timestamp, post => post.comments),
    shares: totalShares,
    shares7: sumByWindow(posts, 7, post => post.timestamp, post => post.shares),
    shares30: sumByWindow(posts, 30, post => post.timestamp, post => post.shares),
    saves: null,
    saves7: 0,
    saves30: 0,
    reach: reachTotal,
    reach7: sumByWindow(posts, 7, post => post.timestamp, post => post.reach),
    reach30: sumByWindow(posts, 30, post => post.timestamp, post => post.reach),
  };

  return {
    platformComparison: {
      platform: 'Facebook',
      stats: [
        {
          label: 'Followers',
          value: formatMetricWithReason(facebookFollowers, 'Facebook', 'followers', metricReasons),
          subLabel: typeof page?.followers_count === 'number' ? 'Page followers' : 'Page fans fallback',
        },
        { label: 'Followers Gained 7d', value: formatNumber(followerGrowth.followers7), subLabel: 'Daily snapshot' },
        { label: 'Followers Gained 30d', value: formatNumber(followerGrowth.followers30), subLabel: 'Daily snapshot' },
        { label: 'Page Likes', value: typeof page?.fan_count === 'number' ? formatNumber(page.fan_count) : null, subLabel: 'Page fans' },
        {
          label: 'Reach',
          value: formatMetricWithReason(reachTotal, 'Facebook', 'reach', metricReasons),
          subLabel: 'Last 30d',
        },
        {
          label: 'Impressions',
          value: formatMetricWithReason(impressionsTotal, 'Facebook', 'postViews', metricReasons),
          subLabel: 'Last 30d',
        },
        {
          label: 'Total Reactions',
          value: formatMetricWithReason(totalReactions, 'Facebook', 'likes', metricReasons),
          subLabel: `${posts.length} recent posts`,
        },
        {
          label: 'Total Comments',
          value: formatMetricWithReason(totalComments, 'Facebook', 'comments', metricReasons),
          subLabel: `${posts.length} recent posts`,
        },
        {
          label: 'Total Shares',
          value: formatMetricWithReason(totalShares, 'Facebook', 'shares', metricReasons),
          subLabel: `${posts.length} recent posts`,
        },
        { label: 'Recent Posts', value: posts.length ? String(posts.length) : null, subLabel: 'Fetched from Page' },
      ],
    },
    contentPerformance: topPost
      ? [{
          title: 'Best Facebook post',
          platform: 'Facebook',
          metricLabel: 'Score',
          metricValue: `${facebookScore(topPost).toLocaleString()} Score`,
          detail: topPost.caption.slice(0, 80),
        }]
      : [],
    recentPosts: posts.map(post => ({
      platform: 'Facebook',
      date: new Date(post.timestamp).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      }),
      caption: post.caption,
      reach: formatNumberOrNull(post.reach ?? post.impressions),
      likes: post.reactions,
      comments: post.comments,
      shares: post.shares,
      saves: null,
      engagementRate: null,
    })),
    insights: [
      { label: 'Best Posting Day', value: rankPostingBuckets(normalizedPerformancePosts, 'Facebook', 'day'), description: 'Top 3 by average score' },
      { label: 'Best Posting Time', value: rankPostingBuckets(normalizedPerformancePosts, 'Facebook', 'time'), description: 'Top 3 by average score' },
      { label: 'Top Post', value: topPost?.caption.slice(0, 40) ?? null, description: 'Highest public interactions' },
    ],
    overview: [],
    metrics,
    metricReasons,
    warnings: facebookWarnings,
  };
};

const buildPayloadFromData = (
  account: Record<string, unknown> | null,
  metricSeries: Record<string, MetricSeries | null>,
  posts: PostData[],
  viewsSeries?: MetricSeries | null,
  followerSnapshotGrowth: { followers7: number; followers30: number } = { followers7: 0, followers30: 0 },
  metricReasons: Record<string, string> = {},
  mediaLabelSuffix = ''
): SocialAnalyticsPayload => {
  const reachSeries = metricSeries['reach'];
  const impressionsSeries = metricSeries['impressions'];
  const profileViewsSeries = metricSeries['profile_views'];
  const accountsEngagedSeries = metricSeries['accounts_engaged'];
  const totalInteractionsSeries = metricSeries['total_interactions'];
  const followerSeries = metricSeries['follower_count'];

  const totalReach = reachSeries?.values.length ? sumNumberArray(reachSeries.values) : null;
  const totalImpressions =
    impressionsSeries?.values.length ? sumNumberArray(impressionsSeries.values) : null;
  const profileViewsLatest = profileViewsSeries?.latest ?? null;
  const accountsEngagedLatest = accountsEngagedSeries?.latest ?? null;
  const totalInteractionsLatest = totalInteractionsSeries?.latest ?? null;
  const viewsTotal = viewsSeries?.values.length ? sumNumberArray(viewsSeries.values) : null;
  const postViewsTotal = viewsTotal ?? totalImpressions;
  const viewsValue = formatMetricWithReason(viewsTotal, 'Instagram', 'postViews', metricReasons);
  const totalFollowers = typeof account?.['followers_count'] === 'number' ? Number(account['followers_count']) : null;
  const mediaCount = typeof account?.['media_count'] === 'number' ? Number(account['media_count']) : null;

  const totalEngagement = posts.reduce((sum, post) => sum + (post.engagement ?? 0), 0);
  const totalLikes = posts.reduce((sum, post) => sum + (post.likes ?? 0), 0);
  const totalComments = posts.reduce((sum, post) => sum + (post.comments ?? 0), 0);
  const totalShares = posts.reduce((sum, post) => sum + (post.shares ?? 0), 0);
  const totalSaves = posts.reduce((sum, post) => sum + (post.saves ?? 0), 0);
  const hasPostImpressions = posts.some(post => post.impressions != null);
  const hasPostReach = posts.some(post => post.reach != null);
  const totalPostViews = hasPostImpressions
    ? posts.reduce((sum, post) => sum + (post.impressions ?? 0), 0)
    : null;
  const totalPostReach = hasPostReach
    ? posts.reduce((sum, post) => sum + (post.reach ?? 0), 0)
    : null;
  const engagementFraction = totalReach && totalReach > 0 ? totalEngagement / totalReach : null;
  const mediaDescriptor = `${posts.length} posts${mediaLabelSuffix}`;
  const totalFollowersValue = formatMetricWithReason(totalFollowers, 'Instagram', 'followers', metricReasons);
  const reachValue = formatMetricWithReason(totalReach, 'Instagram', 'reach', metricReasons);
  const impressionsValue = formatMetricWithReason(totalImpressions, 'Instagram', 'postViews', metricReasons);
  const totalLikesValue = formatMetricWithReason(totalLikes, 'Instagram', 'likes', metricReasons);
  const totalCommentsValue = formatMetricWithReason(totalComments, 'Instagram', 'comments', metricReasons);
  const totalSharesValue = formatMetricWithReason(totalShares, 'Instagram', 'shares', metricReasons);
  const totalSavesValue = formatMetricWithReason(totalSaves, 'Instagram', 'saves', metricReasons);

  let followerGrowth: number | null = null;
  const followerValues = followerSeries?.values ?? [];
  if (followerValues.length >= 2) {
    const first = followerValues[0];
    const last = followerValues[followerValues.length - 1];
    followerGrowth = first !== 0 ? (last - first) / first : last > 0 ? 1 : 0;
  }

  const now = Date.now();
  const postsThisMonth = posts.filter(post => new Date(post.timestamp).getTime() >= now - THIRTY_DAYS_MS).length;

  const followerGrowthValue = formatPercentOrNull(followerGrowth);
  const engagementRateValue = formatPercentOrNull(engagementFraction);
  const profileClicksValue = formatNumberOrNull(profileViewsLatest);
  const postsThisMonthValue = posts.length ? `${postsThisMonth}` : null;
  const postsPublishedValue = mediaCount != null ? `${mediaCount}` : null;
  const instagramScore = (post: PostData) => calculateScore('Instagram', {
    reach: post.reach ?? post.impressions,
    likes: post.likes,
    comments: post.comments,
    shares: post.shares,
    saves: post.saves,
  });
  const normalizedPerformancePosts: NormalizedPerformancePost[] = posts.map(post => ({
    timestamp: post.timestamp,
    views: post.impressions,
    reach: post.reach,
    likes: post.likes,
    comments: post.comments,
    shares: post.shares,
    saves: post.saves,
  }));

  const sortedByEngagement = [...posts].sort((a, b) => instagramScore(b) - instagramScore(a));
  const sortedByReach = [...posts].sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0));
  const mostRecentPost = [...posts].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )[0];

  const cardBuilder = (
    title: string,
    post: PostData | undefined,
    metricLabel: string,
    metricValue?: number | null
  ): TopPostCardProps => ({
    title,
    platform: 'Instagram',
    metricLabel,
    metricValue: formatMetricValueOrNull(metricValue ?? undefined, metricLabel),
    detail: post?.caption?.slice(0, 80) || 'Untitled post',
  });

  const contentPerformance: TopPostCardProps[] = [];
  if (sortedByEngagement[0]) {
    contentPerformance.push(
      cardBuilder('Best Instagram post', sortedByEngagement[0], 'Score', instagramScore(sortedByEngagement[0]))
    );
  }
  if (sortedByReach[0]) {
    contentPerformance.push(
      cardBuilder('Top Post by Reach', sortedByReach[0], 'Reach', sortedByReach[0]?.reach ?? null)
    );
  }
  if (mostRecentPost) {
    contentPerformance.push(
      cardBuilder('Most Recent Post', mostRecentPost, 'Engagement', mostRecentPost.engagement ?? null)
    );
  }

  const recentPosts: RecentPostRow[] = sortedByReach.slice(0, 3).map(post => {
    const engagementRate =
      post.reach && post.engagement != null && post.reach > 0
        ? `${((post.engagement / post.reach) * 100).toFixed(1)}%`
        : null;
    return {
      platform: 'Instagram',
      date: new Date(post.timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      caption: post.caption || 'Untitled post',
      reach: formatNumberOrNull(post.reach),
      likes: post.likes,
      comments: post.comments,
      shares: post.shares,
      saves: post.saves,
      engagementRate,
    };
  });

  const overview = [
    { label: 'Total Followers', value: totalFollowersValue, description: 'Instagram followers', accent: true },
    { label: 'Follower Growth · 30 days', value: formatNumber(followerSnapshotGrowth.followers30), description: 'Instagram follower trend', accent: true },
    { label: 'Total Reach', value: reachValue, description: 'Instagram reach (last 30d)' },
    { label: 'Total Impressions', value: impressionsValue, description: 'Instagram impressions (last 30d)' },
    { label: 'Engagement Rate', value: engagementRateValue, description: 'Instagram engagement' },
    { label: 'Profile Views', value: profileClicksValue, description: 'Profile views latest day' },
    { label: 'Posts This Month', value: postsThisMonthValue, description: 'Instagram last 30 days' },
  ];
  if (viewsValue != null) {
    overview.splice(4, 0, {
      label: 'Total Views',
      value: viewsValue,
      description: 'Instagram views',
    });
  }

  const insights: PlatformInsightCardProps[] = [
    { label: 'Best Posting Day', value: rankPostingBuckets(normalizedPerformancePosts, 'Instagram', 'day'), description: 'Top 3 by average score' },
    { label: 'Best Posting Time', value: rankPostingBuckets(normalizedPerformancePosts, 'Instagram', 'time'), description: 'Top 3 by average score' },
    { label: 'Best Content Type', value: getBestContentType(posts), description: 'Most repeated media type' },
    { label: 'Accounts Engaged', value: formatNumberOrNull(accountsEngagedLatest), description: 'Latest day' },
    { label: 'Total Interactions', value: formatNumberOrNull(totalInteractionsLatest), description: 'Latest day' },
  ];

  const instagramStats: PlatformStat[] = [
    { label: 'Followers', value: totalFollowersValue, subLabel: 'Total' },
    { label: 'Followers Gained 7d', value: formatNumber(followerSnapshotGrowth.followers7), subLabel: 'Daily snapshot' },
    { label: 'Followers Gained 30d', value: formatNumber(followerSnapshotGrowth.followers30), subLabel: 'Daily snapshot' },
    { label: 'Follower Growth', value: followerGrowthValue, subLabel: 'Meta follower_count trend' },
    { label: 'Reach', value: reachValue, subLabel: 'Last 30d' },
    { label: 'Impressions', value: impressionsValue, subLabel: 'Last 30d' },
    { label: 'Total Likes', value: totalLikesValue, subLabel: mediaDescriptor },
    { label: 'Total Comments', value: totalCommentsValue, subLabel: mediaDescriptor },
    { label: 'Total Shares', value: totalSharesValue, subLabel: mediaDescriptor },
    { label: 'Total Saves', value: totalSavesValue, subLabel: mediaDescriptor },
    { label: 'Engagement Rate', value: engagementRateValue, subLabel: 'Reels & Stories' },
    { label: 'Profile Views', value: profileClicksValue },
    { label: 'Posts Published', value: postsPublishedValue },
  ];
  if (viewsValue != null) {
    instagramStats.push({
      label: 'Views',
      value: viewsValue,
      subLabel: 'Fallback metric',
    });
  }

  const platformComparisons: SocialAnalyticsPayload['platformComparisons'] = [
    {
      platform: 'Instagram',
      stats: instagramStats,
    },
    EMPTY_TIKTOK_PLATFORM_STATS,
  ];

  return {
    overview,
    platformComparisons,
    contentPerformance,
    recentPosts,
    insights: {
      Facebook: EMPTY_FACEBOOK_INSIGHTS,
      Instagram: insights,
      TikTok: EMPTY_TIKTOK_INSIGHTS,
    }, 
    platformMetrics: {
      Facebook: emptyMetrics(),
      Instagram: {
        followers: totalFollowers,
        followers7: followerSnapshotGrowth.followers7,
        followers30: followerSnapshotGrowth.followers30,
        postViews: totalPostViews ?? postViewsTotal,
        postViews7: sumByWindow(posts, 7, post => post.timestamp, post => post.impressions),
        postViews30: sumByWindow(posts, 30, post => post.timestamp, post => post.impressions),
        likes: totalLikes,
        likes7: sumByWindow(posts, 7, post => post.timestamp, post => post.likes),
        likes30: sumByWindow(posts, 30, post => post.timestamp, post => post.likes),
        comments: totalComments,
        comments7: sumByWindow(posts, 7, post => post.timestamp, post => post.comments),
        comments30: sumByWindow(posts, 30, post => post.timestamp, post => post.comments),
        shares: totalShares,
        shares7: sumByWindow(posts, 7, post => post.timestamp, post => post.shares),
        shares30: sumByWindow(posts, 30, post => post.timestamp, post => post.shares),
        saves: totalSaves,
        saves7: sumByWindow(posts, 7, post => post.timestamp, post => post.saves),
        saves30: sumByWindow(posts, 30, post => post.timestamp, post => post.saves),
        reach: totalPostReach ?? totalReach,
        reach7: sumByWindow(posts, 7, post => post.timestamp, post => post.reach),
        reach30: sumByWindow(posts, 30, post => post.timestamp, post => post.reach),
      },
      TikTok: emptyMetrics(),
    },
    metricReasons,
  };
};

const collectUnavailableWarnings = (payload: SocialAnalyticsPayload): string[] => {
  const warnings = new Set<string>();

  const metricLabels: Array<[keyof SocialPlatformMetrics, string]> = [
    ['followers', 'Total followers'],
    ['postViews', 'Total post views'],
    ['likes', 'Total likes'],
    ['comments', 'Total comments'],
    ['shares', 'Total shares'],
  ];

  const reasonMap = payload.metricReasons ?? {};
  const formatWarning = (
    platform: PlatformName,
    key: keyof SocialPlatformMetrics,
    base: string
  ) => {
    const reason = reasonMap[`${platform}.${key}`];
    return reason ? `${base} (${reason}).` : `${base}.`;
  };

  (['TikTok', 'Instagram', 'Facebook'] as PlatformName[]).forEach(platform => {
    const metrics = payload.platformMetrics?.[platform];
    metricLabels.forEach(([key, label]) => {
      if (metrics?.[key] == null) {
        warnings.add(formatWarning(platform, key, `${platform}: ${label} unavailable`));
      }
    });

    if (platform !== 'TikTok' && metrics?.reach == null) {
      warnings.add(formatWarning(platform, 'reach', `${platform}: Reach unavailable`));
    }
    if (platform !== 'TikTok' && metrics?.saves == null) {
      warnings.add(formatWarning(platform, 'saves', `${platform}: Total saves unavailable`));
    }

    const bestPost = payload.contentPerformance.find(card =>
      card.platform === platform && card.title.toLowerCase().includes(`best ${platform.toLowerCase()}`)
    );
    if (!bestPost || bestPost.metricValue == null) {
      warnings.add(`${platform}: Best post unavailable.`);
    }

    const insights = payload.insights[platform] ?? [];
    (['Best Posting Day', 'Best Posting Time'] as const).forEach(label => {
      const insight = insights.find(item => item.label === label);
      if (!insight?.value || insight.value === 'Not enough data') {
        warnings.add(`${platform}: ${label} unavailable.`);
      }
    });
  });

  return Array.from(warnings);
};

serve(async req => {
  if (req.method === 'OPTIONS') {
    logInfo('OPTIONS preflight');
    return preflightResponse();
  }
  logInfo('Incoming request', { method: req.method, url: req.url });

  const userId = Deno.env.get('INSTAGRAM_USER_ID') ?? Deno.env.get('INSTAGRAM_GRAPH_USER_ID');
  const accessToken =
    Deno.env.get('INSTAGRAM_ACCESS_TOKEN') ?? Deno.env.get('INSTAGRAM_GRAPH_ACCESS_TOKEN');
  const facebookPageAccessToken = Deno.env.get('FACEBOOK_PAGE_ACCESS_TOKEN');
  const facebookAccessToken = Deno.env.get('FACEBOOK_ACCESS_TOKEN');
  const facebookTokenToUse = facebookPageAccessToken ?? facebookAccessToken ?? accessToken;
  const facebookTokenSource = facebookPageAccessToken
    ? 'FACEBOOK_PAGE_ACCESS_TOKEN'
    : facebookAccessToken
      ? 'FACEBOOK_ACCESS_TOKEN'
      : accessToken
        ? 'INSTAGRAM_ACCESS_TOKEN'
        : 'missing';
  const appId = Deno.env.get('INSTAGRAM_APP_ID') ?? Deno.env.get('INSTAGRAM_GRAPH_APP_ID');
  const appSecret =
    Deno.env.get('INSTAGRAM_APP_SECRET') ?? Deno.env.get('INSTAGRAM_GRAPH_APP_SECRET');
  const facebookPageId = Deno.env.get('FACEBOOK_PAGE_ID');
  const tikTokPromise = fetchTikTokAnalytics();
  const facebookPromise = fetchFacebookAnalytics(facebookPageId ?? undefined, facebookTokenToUse ?? undefined);

  const envChecks: Record<string, boolean> = {
    INSTAGRAM_USER_ID: Boolean(userId),
    INSTAGRAM_ACCESS_TOKEN: Boolean(accessToken),
    INSTAGRAM_APP_ID: Boolean(appId),
    INSTAGRAM_APP_SECRET: Boolean(appSecret),
    FACEBOOK_PAGE_ID: Boolean(facebookPageId),
    FACEBOOK_PAGE_ACCESS_TOKEN: Boolean(facebookPageAccessToken),
    FACEBOOK_ACCESS_TOKEN: Boolean(facebookAccessToken),
  };
  const envStatus = Object.fromEntries(
    Object.entries(envChecks).map(([key, present]) => [key, present ? 'present' : 'missing'])
  ) as Record<string, 'present' | 'missing'>;
  const missingEnvVars = Object.keys(envChecks).filter(key => !envChecks[key]);
  logInfo('Environment status', {
    envStatus,
    missingEnvVars,
    facebookTokenSource,
    GRAPH_API_VERSION: INSTAGRAM_API_VERSION,
  });

  const emptyMetricSeries = METRIC_CONFIGS.reduce<Record<string, MetricSeries | null>>((acc, config) => {
    acc[config.metric] = null;
    return acc;
  }, {} as Record<string, MetricSeries | null>);

  const fallbackPayload = buildPayloadFromData(null, emptyMetricSeries, [], null);
  const respondWithProviders = async (
    instagramPayload: SocialAnalyticsPayload,
    instagramFallback: boolean,
    message: string,
    instagramWarnings: string[]
  ) => {
    const [rawFacebook, rawTikTok] = await Promise.all([facebookPromise, tikTokPromise]);
    const instagram = await withSavedPlatformFallback(
      'Instagram',
      extractPlatformResult(instagramPayload, 'Instagram', instagramWarnings)
    );
    const facebook = await withSavedPlatformFallback('Facebook', rawFacebook);
    const tiktok = await withSavedPlatformFallback('TikTok', rawTikTok);
    const payloadWithInstagram = replacePlatformData(instagramPayload, 'Instagram', instagram);
    const withFacebook: SocialAnalyticsPayload = {
      ...payloadWithInstagram,
      platformComparisons: [
        facebook.platformComparison,
        ...payloadWithInstagram.platformComparisons.filter(item => item.platform !== 'Facebook'),
      ],
      contentPerformance: [...facebook.contentPerformance, ...payloadWithInstagram.contentPerformance],
      recentPosts: [...facebook.recentPosts, ...payloadWithInstagram.recentPosts],
      insights: { ...payloadWithInstagram.insights, Facebook: facebook.insights },
      platformMetrics: {
        Facebook: facebook.metrics,
        Instagram: payloadWithInstagram.platformMetrics?.Instagram ?? emptyMetrics(),
        TikTok: payloadWithInstagram.platformMetrics?.TikTok ?? emptyMetrics(),
      },
      metricReasons: {
        ...(payloadWithInstagram.metricReasons ?? {}),
        ...(facebook.metricReasons ?? {}),
      },
    };
    const withProviders = mergeTikTokData(withFacebook, tiktok);
    const unavailableWarnings = collectUnavailableWarnings(withProviders);
    return respondJSON({
      data: withProviders,
      fallback:
        instagramFallback &&
        facebook.contentPerformance.length === 0 &&
        tiktok.contentPerformance.length === 0,
      message,
      warnings: [...new Set([...facebook.warnings, ...instagram.warnings, ...tiktok.warnings, ...unavailableWarnings])],
    });
  };

  if (!userId || !accessToken || !appId || !appSecret) {
    const missing = [
      !userId && 'INSTAGRAM_USER_ID',
      !accessToken && 'INSTAGRAM_ACCESS_TOKEN',
      !appId && 'INSTAGRAM_APP_ID',
      !appSecret && 'INSTAGRAM_APP_SECRET',
    ].filter(Boolean) as string[];
    const warning = `Missing env vars: ${missing.join(', ')}`;
    logWarn('Missing credentials', { missing });
    return respondWithProviders(
      fallbackPayload,
      true,
      'Instagram Platform API credentials are missing; TikTok was loaded independently.',
      [warning]
    );
  }

  const graphClient = createGraphClient(accessToken);
  const warnings = new Set<string>();
  const realDataPoints = new Set<string>();
  const recordReal = (label: string) => realDataPoints.add(label);
  const metricReasons: Record<string, string> = {};
  const describeReason = (label: string, meta?: { status?: number; message?: string }) => {
    const statusText = meta?.status != null ? ` status ${meta.status}` : '';
    const detail = meta?.message ? `: ${meta.message}` : '';
    return `${label}${statusText}${detail}`;
  };
  const recordInstagramMetricReason = (key: keyof SocialPlatformMetrics, reason: string) => {
    const mapKey = `Instagram.${key}`;
    if (!metricReasons[mapKey]) {
      metricReasons[mapKey] = reason;
    }
  };

  const safeGraphCall = async <T>(
    description: string,
    path: string,
    warningLabel: string,
    options?: { hosts?: GraphHostLabel[] },
    onError?: (meta: { path: string; metric: string; status?: number; message: string }) => void,
    warnOnError = true
  ): Promise<T | null> => {
    try {
      return await graphClient.request<T>(path, description, options);
    } catch (error) {
      const graphError = error as GraphApiError;
      const sanitizedMessage = sanitizeLogValue(graphError?.message ?? 'unknown');
      if (warnOnError) warnings.add(`${warningLabel} unavailable.`);
      logWarn('Graph fetch failed', {
        description,
        hosts: options?.hosts ?? ['facebook', 'instagram'],
        status: graphError?.status ?? 'unknown',
        error: sanitizedMessage,
        responseBody: sanitizeLogValue(graphError?.body ?? undefined),
      });
      onError?.({
        path,
        metric: warningLabel,
        status: graphError?.status,
        message: sanitizedMessage,
      });
      return null;
    }
  };

  try {
    let targetId = userId;
    if (facebookPageId) {
      const pageResponse = await safeGraphCall<FacebookPageInstagramResponse>(
        'Facebook Page metadata',
        `/${facebookPageId}?fields=instagram_business_account{id,username,followers_count,media_count}`,
        'Facebook Page metadata',
        { hosts: ['facebook'] }
      );
      const instagramAccount = pageResponse?.instagram_business_account;
      if (instagramAccount?.id) {
        targetId = instagramAccount.id;
        if (instagramAccount.username) recordReal('instagram_business_account_username');
        if (typeof instagramAccount.followers_count === 'number') recordReal('instagram_business_account_followers');
        if (typeof instagramAccount.media_count === 'number') recordReal('instagram_business_account_media_count');
      } else if (pageResponse) {
        warnings.add('Instagram: Facebook Page has no connected Instagram business account.');
      }
    }

    const accountResponse = await safeGraphCall<InstagramAccountResponse>(
      'Instagram account metadata',
      `/${targetId}?fields=id,username,followers_count,media_count`,
      'Instagram account metadata',
      undefined,
      meta => recordInstagramMetricReason(
        'followers',
        describeReason('Instagram account metadata unavailable', meta)
      )
    );
    const account: InstagramAccountResponse | null =
      accountResponse && typeof accountResponse === 'object' ? accountResponse : null;
    if (account?.username) recordReal('username');
    if (typeof account?.followers_count === 'number') recordReal('followers_count');
    if (typeof account?.media_count === 'number') recordReal('media_count');

    const since = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
    const metricSeriesMap: Record<string, MetricSeries | null> = {};
    let viewsSeries: MetricSeries | null = null;

    type ImpressionsFetchResult = {
      primarySeries: MetricSeries | null;
      fallbackSeries: MetricSeries | null;
      fallbackMetric: 'views' | null;
    };

    const logImpressionAttempt = (
      metric: string,
      path: string,
      status: string | number,
      errorMessage: string | null,
      fallbackUsed: boolean
    ) => {
      logInfo('Impressions metric attempt', {
        metric,
        path,
        status,
        error: errorMessage ?? 'none',
        fallbackUsed,
      });
    };

    const fetchImpressionsSeries = async (): Promise<ImpressionsFetchResult> => {
      const primaryPath = `/${targetId}/insights?metric=impressions&period=day&since=${since}`;
      let primaryFailureReason: string | null = null;
      let fallbackFailureReason: string | null = null;
      const primaryResponse = await safeGraphCall(
        'Instagram impressions insights',
        primaryPath,
        'Instagram impressions',
        undefined,
        meta => {
          logImpressionAttempt('impressions', primaryPath, meta.status ?? 'unknown', meta.message, false);
          primaryFailureReason = describeReason('Instagram impressions unavailable', meta);
        },
        false
      );
      if (primaryResponse) {
        logImpressionAttempt('impressions', primaryPath, 'success', null, false);
        recordReal('impressions');
        return { primarySeries: parseMetricSeries('impressions', primaryResponse), fallbackSeries: null, fallbackMetric: null };
      }

      const fallbackPath = `/${targetId}/insights?metric=views&period=day&since=${since}`;
      const fallbackResponse = await safeGraphCall(
        'Instagram views insights',
        fallbackPath,
        'Instagram views',
        undefined,
        meta => {
          logImpressionAttempt('views', fallbackPath, meta.status ?? 'unknown', meta.message, true);
          fallbackFailureReason = describeReason('Instagram views unavailable', meta);
        },
        false
      );
      if (fallbackResponse) {
        logImpressionAttempt('views', fallbackPath, 'success', null, true);
        recordReal('views');
        return {
          primarySeries: null,
          fallbackSeries: parseMetricSeries('views', fallbackResponse),
          fallbackMetric: 'views',
        };
      }

      logImpressionAttempt('impressions', primaryPath, 'failed', 'Meta did not return impressions or views', false);
      warnings.add('Instagram post views unavailable.');
      recordInstagramMetricReason(
        'postViews',
        primaryFailureReason ?? fallbackFailureReason ?? 'Instagram impressions/views unavailable'
      );
      return { primarySeries: null, fallbackSeries: null, fallbackMetric: null };
    };

    const impressionsResult = await fetchImpressionsSeries();
    metricSeriesMap['impressions'] =
      impressionsResult.fallbackMetric === 'views' ? null : impressionsResult.primarySeries;
    if (impressionsResult.fallbackMetric === 'views') {
      viewsSeries = impressionsResult.fallbackSeries ?? null;
    }
    for (const { metric, label } of METRIC_CONFIGS) {
      let metricFailureReason: string | null = null;
      const response = await safeGraphCall(
        `Instagram ${metric} insights`,
        `/${targetId}/insights?metric=${metric}&period=day&since=${since}`,
        `Instagram ${label}`,
        undefined,
        meta => {
          metricFailureReason = describeReason(`Instagram ${label} unavailable`, meta);
        }
      );
      metricSeriesMap[metric] = response ? parseMetricSeries(metric, response) : null;
      const mappedKey = METRIC_TO_STATS_KEY[metric];
      if (!response && mappedKey) {
        recordInstagramMetricReason(
          mappedKey,
          metricFailureReason ?? `Instagram ${label} unavailable`
        );
      }
      if (metricSeriesMap[metric]?.values.length) recordReal(metric);
    }

    const mediaResponseReasonLabel = 'Instagram media list unavailable';
    const mediaResponse = await safeGraphCall<InstagramMediaResponse>(
      'Instagram media list',
      `/${targetId}/media?fields=id,caption,timestamp,like_count,comments_count,media_type,permalink&limit=100`,
      'Instagram media list',
      undefined,
      meta => {
        const reason = describeReason(mediaResponseReasonLabel, meta);
        (['likes', 'comments', 'shares', 'saves'] as Array<keyof SocialPlatformMetrics>).forEach(metric =>
          recordInstagramMetricReason(metric, reason)
        );
      }
    );
    const mediaItems = Array.isArray(mediaResponse?.data) ? [...mediaResponse.data] : [];
    debugLog('Raw Instagram response shape', {
      accountKeys: account ? Object.keys(account).slice(0, 20) : [],
      firstMediaPageLength: Array.isArray(mediaResponse?.data) ? mediaResponse.data.length : null,
      firstMediaKeys: Array.isArray(mediaResponse?.data) && mediaResponse.data[0] ? Object.keys(mediaResponse.data[0]).slice(0, 20) : [],
      hasNextPage: Boolean(mediaResponse?.paging?.next),
    });

    const maxInstagramMedia = Number.parseInt(Deno.env.get('INSTAGRAM_MAX_MEDIA_ITEMS') ?? '500', 10);
    const instagramMediaLimit = Number.isFinite(maxInstagramMedia) && maxInstagramMedia > 0 ? maxInstagramMedia : 500;
    let nextMediaUrl = typeof mediaResponse?.paging?.next === 'string' ? mediaResponse.paging.next : null;
    while (nextMediaUrl && mediaItems.length < instagramMediaLimit) {
      try {
        const nextPage = await fetchGraph(nextMediaUrl, accessToken);
        const nextItems = Array.isArray(nextPage?.data) ? nextPage.data : [];
        mediaItems.push(...nextItems);
        nextMediaUrl = typeof nextPage?.paging?.next === 'string' ? nextPage.paging.next : null;
      } catch (error) {
        const paginationReason = sanitizeLogValue((error as GraphApiError)?.body || (error as Error)?.message || 'unknown error');
        warnings.add(`Instagram media pagination unavailable: ${paginationReason}`);
        (['likes', 'comments', 'shares', 'saves'] as Array<keyof SocialPlatformMetrics>).forEach(metric =>
          recordInstagramMetricReason(metric, `Instagram media pagination unavailable: ${paginationReason}`)
        );
        nextMediaUrl = null;
      }
    }
    if (mediaItems.length > instagramMediaLimit) {
      mediaItems.length = instagramMediaLimit;
    }
    const instagramMediaCapReached = mediaItems.length >= instagramMediaLimit;
    debugLog('Instagram media pagination result', {
      mediaFetched: mediaItems.length,
      mediaLimit: instagramMediaLimit,
      capReached: instagramMediaCapReached,
    });

    const fetchMediaMetric = async (mediaId: string, metric: string) => {
      const response = await safeGraphCall(
        `Instagram media ${metric}`,
        `/${mediaId}/insights?metric=${metric}`,
        `Instagram media ${metric}`,
        undefined,
        undefined,
        false
      );
      const series = response ? parseMetricSeries(metric, response) : null;
      if (series?.latest != null) recordReal(`media_${metric}`);
      return series?.latest ?? null;
    };

    const posts: PostData[] = await Promise.all(
      mediaItems.map(async item => {
        const [engagement, reach, impressions, shares, saved, saves] = await Promise.all([
          fetchMediaMetric(item.id, 'total_interactions'),
          fetchMediaMetric(item.id, 'reach'),
          fetchMediaMetric(item.id, 'views'),
          fetchMediaMetric(item.id, 'shares'),
          fetchMediaMetric(item.id, 'saved'),
          fetchMediaMetric(item.id, 'saves'),
        ]);
        const likes = typeof item.like_count === 'number' ? item.like_count : null;
        const comments = typeof item.comments_count === 'number' ? item.comments_count : null;
        if (likes != null) recordReal('like_count');
        if (comments != null) recordReal('comments_count');
        if (typeof item.permalink === 'string') recordReal('permalink');
        return {
          id: item.id,
          caption: item.caption ?? '',
          timestamp: item.timestamp ?? new Date().toISOString(),
          media_type: item.media_type ?? 'UNKNOWN',
          permalink: typeof item.permalink === 'string' ? item.permalink : null,
          likes,
          comments,
          shares,
          saves: saved ?? saves,
          reach,
          engagement,
          impressions,
        };
      })
    );
    debugLog('Normalized Instagram aggregation', {
      mediaLength: mediaItems.length,
      postsLength: posts.length,
      views: posts.reduce((sum, post) => sum + (post.impressions ?? 0), 0),
      likes: posts.reduce((sum, post) => sum + (post.likes ?? 0), 0),
      comments: posts.reduce((sum, post) => sum + (post.comments ?? 0), 0),
      shares: posts.reduce((sum, post) => sum + (post.shares ?? 0), 0),
      saves: posts.reduce((sum, post) => sum + (post.saves ?? 0), 0),
      reach: posts.reduce((sum, post) => sum + (post.reach ?? 0), 0),
    });

    if (mediaItems.length && posts.every(post => post.reach == null)) {
      warnings.add('Instagram media reach unavailable.');
    }
    if (mediaItems.length && posts.every(post => post.impressions == null)) {
      warnings.add('Instagram media views unavailable.');
    }

    if (posts.length) recordReal('recent_media');

    const instagramWarnings = Array.from(warnings);
    const instagramFollowerGrowth = await recordFollowerSnapshot(
      'Instagram',
      typeof account?.followers_count === 'number' ? account.followers_count : null,
      instagramWarnings
    );
    const mediaLabelSuffix = instagramMediaCapReached ? ' (partial)' : '';
    const payload = buildPayloadFromData(
      account,
      metricSeriesMap,
      posts,
      viewsSeries,
      instagramFollowerGrowth,
      metricReasons,
      mediaLabelSuffix
    ); 
    const usedFallback = realDataPoints.size === 0;
    const message = usedFallback
      ? 'Instagram analytics data unavailable. Please verify credentials and permissions.'
      : warnings.size
        ? 'Instagram analytics partially available.'
        : 'Instagram Graph API data loaded successfully.';

    logInfo('Analytics summary', {
      usedFallback,
      realFields: realDataPoints.size,
      warnings: warnings.size,
      graphHost: graphClient.getResolvedHost(),
    });

    return respondWithProviders(payload, usedFallback, message, instagramWarnings);
  } catch (error) {
    logError('Instagram analytics error', { error: sanitizeLogValue((error as Error)?.message ?? 'unknown') });
    warnings.add('Instagram analytics temporarily unavailable.');
    return respondWithProviders(
      fallbackPayload,
      true,
      'Instagram analytics temporarily unavailable; TikTok was loaded independently.',
      Array.from(warnings)
    );
  }
});