import * as React from 'react';
import { AlertTriangle, ArrowDown, ArrowUp } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import MetricCard from '@/components/admin/social-media/MetricCard';
import PlatformInsightCard from '@/components/admin/social-media/PlatformInsightCard';
import TopPostCard from '@/components/admin/social-media/TopPostCard';
import {
  SOCIAL_PLATFORMS,
  PlatformName,
  RecentPostRow,
  SocialAnalyticsPayload,
  SocialPlatformMetrics,
  TopPostCardProps,
} from '@/services/socialMediaAnalytics/types';

export interface SocialAnalyticsDashboardProps {
  data: SocialAnalyticsPayload;
  warnings?: string[];
}

type PlatformMetrics = SocialPlatformMetrics;

type DashboardMetric = {
  title: string;
  value: number | null;
  description?: string;
  trendCurrent?: number;
  trendPrevious?: number;
  accent?: boolean;
};

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

export const safeNumber = (value: unknown): number => {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;

  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'n/a' || normalized === 'na') return 0;

  const multiplier = normalized.includes('b')
    ? 1_000_000_000
    : normalized.includes('m')
      ? 1_000_000
      : normalized.includes('k')
        ? 1_000
        : 1;
  const parsed = Number.parseFloat(normalized.replace(/[$,%\s,]/g, ''));
  return Number.isFinite(parsed) ? parsed * multiplier : 0;
};

export const calculateGrowthPercent = (current: number, previous: number): number => {
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
};

export const formatTrend = (current: number, previous: number): React.ReactNode => {
  const percent = calculateGrowthPercent(current, previous);
  if (percent === 0) {
    return <p className="text-xs text-foreground">0</p>;
  }

  const isPositive = percent > 0;
  const Icon = isPositive ? ArrowUp : ArrowDown;
  return (
    <p className="flex items-center gap-1 text-xs text-foreground">
      <Icon className={isPositive ? 'h-3 w-3 text-green-600' : 'h-3 w-3 text-red-600'} />
      {Math.abs(percent).toFixed(1)}%
    </p>
  );
};

export const calculateBestPostScore = (platform: PlatformName, post: RecentPostRow): number => {
  const reach = safeNumber(post.reach);
  const likes = safeNumber(post.likes);
  const comments = safeNumber(post.comments);
  const shares = safeNumber(post.shares);
  const saves = safeNumber(post.saves);

  if (platform === 'TikTok') {
    return (reach + likes * 10) + (comments * 20) + (shares * 30);
  }

  if (platform === 'Instagram') {
    return (reach + likes * 10) + (comments * 20) + (shares * 30) + (saves * 30);
  }

  return (reach + likes * 5) + (comments * 20) + (shares * 40);
};

export const sumMetricAcrossPlatforms = (
  metricsByPlatform: Record<PlatformName, PlatformMetrics>,
  metric: keyof PlatformMetrics
): number => SOCIAL_PLATFORMS.reduce((sum, platform) => {
  const value = metricsByPlatform[platform][metric];
  return sum + (typeof value === 'number' ? value : 0);
}, 0);

const formatMetricNumber = (value: number) => numberFormatter.format(Math.round(value));
const formatMetricDisplay = (value: number | null | undefined) =>
  value == null ? null : formatMetricNumber(value);

const parsePostDate = (date: string) => {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isWithinDays = (date: string, days: number) => {
  const parsed = parsePostDate(date);
  if (!parsed) return false;
  return parsed.getTime() >= Date.now() - days * 24 * 60 * 60 * 1000;
};

const getPlatformStats = (data: SocialAnalyticsPayload, platform: PlatformName) =>
  data.platformComparisons.find(comparison => comparison.platform === platform)?.stats ?? [];

const getPlatformStatValue = (
  data: SocialAnalyticsPayload,
  platform: PlatformName,
  labels: string[]
) => {
  const normalizedLabels = labels.map(label => label.toLowerCase());
  const stat = getPlatformStats(data, platform).find(item =>
    normalizedLabels.includes(item.label.toLowerCase())
  );
  return safeNumber(stat?.value);
};

const getOptionalPlatformStatValue = (
  data: SocialAnalyticsPayload,
  platform: PlatformName,
  labels: string[]
) => {
  const normalizedLabels = labels.map(label => label.toLowerCase());
  const stat = getPlatformStats(data, platform).find(item =>
    normalizedLabels.includes(item.label.toLowerCase())
  );
  return stat?.value == null ? null : safeNumber(stat.value);
};

const sumPosts = (
  posts: RecentPostRow[],
  platform: PlatformName,
  key: keyof Pick<RecentPostRow, 'reach' | 'likes' | 'comments' | 'shares' | 'saves'>,
  days?: number
) => posts
  .filter(post => post.platform === platform)
  .filter(post => (days ? isWithinDays(post.date, days) : true))
  .reduce((sum, post) => sum + safeNumber(post[key]), 0);

const sumPostsOrNull = (
  posts: RecentPostRow[],
  platform: PlatformName,
  key: keyof Pick<RecentPostRow, 'reach' | 'likes' | 'comments' | 'shares' | 'saves'>,
  days?: number
) => {
  const matchingPosts = posts
    .filter(post => post.platform === platform)
    .filter(post => (days ? isWithinDays(post.date, days) : true));
  const hasValue = matchingPosts.some(post => post[key] != null);
  return hasValue
    ? matchingPosts.reduce((sum, post) => sum + safeNumber(post[key]), 0)
    : null;
};

const estimateGainFromPercent = (currentTotal: number, percent: number) => {
  if (!currentTotal || !percent) return 0;
  const previous = currentTotal / (1 + percent / 100);
  return Math.max(0, currentTotal - previous);
};

const buildPlatformMetrics = (
  data: SocialAnalyticsPayload,
  platform: PlatformName
): PlatformMetrics => {
  const liveMetrics = data.platformMetrics?.[platform];
  if (liveMetrics) return liveMetrics;

  const followers = getOptionalPlatformStatValue(data, platform, ['Followers']);
  const followerGrowthPercent = getPlatformStatValue(data, platform, ['Follower Growth']);
  const recentReachTotal = sumPostsOrNull(data.recentPosts, platform, 'reach');
  const platformViews = getOptionalPlatformStatValue(
    data,
    platform,
    platform === 'TikTok' ? ['Video Views', 'Views'] : ['Views', 'Video Views']
  );
  const postViews = platformViews ?? recentReachTotal;

  return {
    followers,
    followers7: 0,
    followers30: followers == null ? 0 : estimateGainFromPercent(followers, followerGrowthPercent),
    postViews,
    postViews7: sumPosts(data.recentPosts, platform, 'reach', 7),
    postViews30: sumPosts(data.recentPosts, platform, 'reach', 30),
    likes: getOptionalPlatformStatValue(data, platform, ['Total Likes']) ?? sumPostsOrNull(data.recentPosts, platform, 'likes'),
    likes7: sumPosts(data.recentPosts, platform, 'likes', 7),
    likes30: sumPosts(data.recentPosts, platform, 'likes', 30),
    comments: sumPostsOrNull(data.recentPosts, platform, 'comments'),
    comments7: sumPosts(data.recentPosts, platform, 'comments', 7),
    comments30: sumPosts(data.recentPosts, platform, 'comments', 30),
    shares: sumPostsOrNull(data.recentPosts, platform, 'shares'),
    shares7: sumPosts(data.recentPosts, platform, 'shares', 7),
    shares30: sumPosts(data.recentPosts, platform, 'shares', 30),
    saves: sumPostsOrNull(data.recentPosts, platform, 'saves'),
    saves7: sumPosts(data.recentPosts, platform, 'saves', 7),
    saves30: sumPosts(data.recentPosts, platform, 'saves', 30),
    reach: platform === 'TikTok'
      ? undefined
      : getOptionalPlatformStatValue(data, platform, ['Reach']) ?? recentReachTotal,
  };
};

const previousFromGrowth = (current: number, growth: number) => Math.max(0, current - growth);
const previousFromGrowthValue = (current: number | null, growth: number) =>
  current == null ? 0 : previousFromGrowth(current, growth);

const buildMetricCards = (
  metrics: PlatformMetrics,
  includeReach = false,
  includeSaves = true,
  descriptionPrefix?: string
): DashboardMetric[] => {
  const cards: DashboardMetric[] = [
    { title: 'Total followers', value: metrics.followers, accent: true },
    {
      title: 'Followers gained in past 7 days',
      value: metrics.followers7,
      trendCurrent: metrics.followers7,
      trendPrevious: previousFromGrowthValue(metrics.followers, metrics.followers7),
    },
    {
      title: 'Followers gained in past 30 days',
      value: metrics.followers30,
      trendCurrent: metrics.followers30,
      trendPrevious: previousFromGrowthValue(metrics.followers, metrics.followers30),
    },
    { title: 'Total post views', value: metrics.postViews },
    {
      title: 'Post views in past 7 days',
      value: metrics.postViews7,
      trendCurrent: metrics.postViews7,
      trendPrevious: previousFromGrowth(metrics.postViews30, metrics.postViews7),
    },
    {
      title: 'Post views in past 30 days',
      value: metrics.postViews30,
      trendCurrent: metrics.postViews30,
      trendPrevious: previousFromGrowthValue(metrics.postViews, metrics.postViews30),
    },
    { title: 'Total likes', value: metrics.likes },
    {
      title: 'Likes gained in past 7 days',
      value: metrics.likes7,
      trendCurrent: metrics.likes7,
      trendPrevious: previousFromGrowth(metrics.likes30, metrics.likes7),
    },
    {
      title: 'Likes gained in past 30 days',
      value: metrics.likes30,
      trendCurrent: metrics.likes30,
      trendPrevious: previousFromGrowthValue(metrics.likes, metrics.likes30),
    },
    { title: 'Total comments', value: metrics.comments },
    {
      title: 'Comments gained in past 7 days',
      value: metrics.comments7,
      trendCurrent: metrics.comments7,
      trendPrevious: previousFromGrowth(metrics.comments30, metrics.comments7),
    },
    {
      title: 'Comments gained in past 30 days',
      value: metrics.comments30,
      trendCurrent: metrics.comments30,
      trendPrevious: previousFromGrowthValue(metrics.comments, metrics.comments30),
    },
    { title: 'Total shares', value: metrics.shares },
    {
      title: 'Shares gained in past 7 days',
      value: metrics.shares7,
      trendCurrent: metrics.shares7,
      trendPrevious: previousFromGrowth(metrics.shares30, metrics.shares7),
    },
    {
      title: 'Shares gained in past 30 days',
      value: metrics.shares30,
      trendCurrent: metrics.shares30,
      trendPrevious: previousFromGrowthValue(metrics.shares, metrics.shares30),
    },
  ];

  if (includeSaves) {
    cards.push({ title: 'Total saves', value: metrics.saves });
  }

  if (includeReach) {
    cards.push({ title: 'Reach', value: metrics.reach ?? null });
  }

  return cards.map(card => ({
    ...card,
    description: card.description ?? descriptionPrefix,
  }));
};

const getBestPostForPlatform = (
  data: SocialAnalyticsPayload,
  platform: PlatformName
): TopPostCardProps => {
  const liveBestCard = data.contentPerformance.find(card =>
    card.platform === platform && card.title.toLowerCase().includes(`best ${platform.toLowerCase()}`)
  );
  if (liveBestCard) return liveBestCard;

  const bestPost = data.recentPosts
    .filter(post => post.platform === platform)
    .map(post => ({
      post,
      score: calculateBestPostScore(platform, post),
    }))
    .sort((a, b) => b.score - a.score)[0];

  const fallbackCard = data.contentPerformance.find(card => card.platform === platform);
  if (!bestPost) {
    return fallbackCard ?? {
      title: `Best ${platform} post`,
      platform,
      metricLabel: 'Score',
      metricValue: null,
      detail: 'Not enough data',
    };
  }

  return {
    title: `Best ${platform} post`,
    platform,
    metricLabel: 'Score',
    metricValue: formatMetricNumber(bestPost.score),
    detail: bestPost.post.caption || fallbackCard?.detail || 'Untitled post',
  };
};

const getInsightValue = (
  data: SocialAnalyticsPayload,
  platform: PlatformName,
  label: string
) => data.insights[platform]?.find(insight => insight.label === label)?.value ?? 'Not enough data';

const renderMetricGrid = (metrics: DashboardMetric[]) => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {metrics.map(metric => (
      <MetricCard
        key={metric.title}
        title={metric.title}
        value={formatMetricDisplay(metric.value)}
        description={metric.description}
        accent={metric.accent}
        trend={
          metric.trendCurrent != null && metric.trendPrevious != null
            ? formatTrend(metric.trendCurrent, metric.trendPrevious)
            : undefined
        }
      />
    ))}
  </div>
);

const SocialAnalyticsDashboard = ({ data, warnings = [] }: SocialAnalyticsDashboardProps) => {
  const uniqueWarnings = Array.from(new Set(warnings.filter(Boolean)));
  const metricsByPlatform = SOCIAL_PLATFORMS.reduce((acc, platform) => {
    acc[platform] = buildPlatformMetrics(data, platform);
    return acc;
  }, {} as Record<PlatformName, PlatformMetrics>);

  const crossPlatformMetrics: PlatformMetrics = {
    followers: sumMetricAcrossPlatforms(metricsByPlatform, 'followers'),
    followers7: sumMetricAcrossPlatforms(metricsByPlatform, 'followers7'),
    followers30: sumMetricAcrossPlatforms(metricsByPlatform, 'followers30'),
    postViews: sumMetricAcrossPlatforms(metricsByPlatform, 'postViews'),
    postViews7: sumMetricAcrossPlatforms(metricsByPlatform, 'postViews7'),
    postViews30: sumMetricAcrossPlatforms(metricsByPlatform, 'postViews30'),
    likes: sumMetricAcrossPlatforms(metricsByPlatform, 'likes'),
    likes7: sumMetricAcrossPlatforms(metricsByPlatform, 'likes7'),
    likes30: sumMetricAcrossPlatforms(metricsByPlatform, 'likes30'),
    comments: sumMetricAcrossPlatforms(metricsByPlatform, 'comments'),
    comments7: sumMetricAcrossPlatforms(metricsByPlatform, 'comments7'),
    comments30: sumMetricAcrossPlatforms(metricsByPlatform, 'comments30'),
    shares: sumMetricAcrossPlatforms(metricsByPlatform, 'shares'),
    shares7: sumMetricAcrossPlatforms(metricsByPlatform, 'shares7'),
    shares30: sumMetricAcrossPlatforms(metricsByPlatform, 'shares30'),
    saves: sumMetricAcrossPlatforms(metricsByPlatform, 'saves'),
    saves7: sumMetricAcrossPlatforms(metricsByPlatform, 'saves7'),
    saves30: sumMetricAcrossPlatforms(metricsByPlatform, 'saves30'),
  };

  React.useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[SocialAnalyticsDashboard] final cross-platform overview object', crossPlatformMetrics);
    }
  }, [crossPlatformMetrics]);

  const platformOrder: PlatformName[] = ['TikTok', 'Instagram', 'Facebook'];
  const bestPostCards = platformOrder.map(platform => getBestPostForPlatform(data, platform));

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h3 className="text-xl font-semibold text-foreground">Cross-Platform Overview</h3>
          <p className="text-sm text-muted-foreground">
            Totals combine TikTok, Instagram, and Facebook. Missing values count as 0.
          </p>
        </div>
        {renderMetricGrid(buildMetricCards(crossPlatformMetrics, false, true, 'TikTok + Instagram + Facebook'))}
      </section>

      <section className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {bestPostCards.map(card => (
            <TopPostCard
              key={card.title}
              title={card.title}
              platform={card.platform}
              metricLabel={card.metricLabel}
              metricValue={card.metricValue}
              detail={card.detail}
            />
          ))}
        </div>
      </section>

      {platformOrder.map(platform => {
        const includeReach = platform !== 'TikTok';
        return (
          <section key={platform} className="space-y-4">
            <div>
              <h3 className="text-xl font-semibold text-foreground">{platform}</h3>
              <p className="text-sm text-muted-foreground">
                Platform-specific performance from currently available analytics.
              </p>
            </div>

            {renderMetricGrid(buildMetricCards(metricsByPlatform[platform], includeReach, platform !== 'TikTok', platform))}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <PlatformInsightCard
                label="Best Posting Day"
                value={getInsightValue(data, platform, 'Best Posting Day') || 'Not enough data'}
                description="Highest available post performance"
              />
              <PlatformInsightCard
                label="Best Posting Time"
                value={getInsightValue(data, platform, 'Best Posting Time') || 'Not enough data'}
                description="Highest available post performance"
              />
            </div>
          </section>
        );
      })}

      {uniqueWarnings.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle>Unavailable Analytics</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {uniqueWarnings.map(warning => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default SocialAnalyticsDashboard;
