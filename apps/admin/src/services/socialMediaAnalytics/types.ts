export type PlatformName = 'Facebook' | 'Instagram' | 'TikTok';

export const SOCIAL_PLATFORMS: PlatformName[] = ['Facebook', 'Instagram', 'TikTok'];

export interface SocialOverviewMetric {
  label: string;
  value: string | null;
  description?: string;
  accent?: boolean;
}

export interface PlatformStat {
  label: string;
  value: string | null;
  subLabel?: string;
}

export interface SocialPlatformMetrics {
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

export type SocialPlatformMetricsMap = Record<PlatformName, SocialPlatformMetrics>;

export interface PlatformComparison {
  platform: PlatformName;
  stats: PlatformStat[];
}

export interface TopPostCardProps {
  title: string;
  platform: PlatformName;
  metricLabel: string;
  metricValue: string | null;
  detail: string;
  className?: string;
}

export interface RecentPostRow {
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

export interface PlatformInsightCardProps {
  label: string;
  value: string | null;
  description?: string;
  accent?: boolean;
  className?: string;
}

export type SocialInsightsMap = Record<PlatformName, PlatformInsightCardProps[]>;

export interface SocialAnalyticsPayload {
  overview: SocialOverviewMetric[];
  platformComparisons: PlatformComparison[];
  contentPerformance: TopPostCardProps[];
  recentPosts: RecentPostRow[];
  insights: SocialInsightsMap;
  platformMetrics?: SocialPlatformMetricsMap;
}

export interface SocialAnalyticsResponse {
  data: SocialAnalyticsPayload;
  warning?: string;
  warnings?: string[];
  usedFallback: boolean;
}
