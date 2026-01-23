import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { CreatorAnalyticsService, CreatorStats, FanInsight, GeographicInsight, ContentPerformance, CreatorAchievement } from '../../services/creatorAnalyticsService';
import { MetricCard } from '../../components/analytics/shared/MetricCard';
import { TopListCard } from '../../components/analytics/shared/TopListCard';
import { AchievementCard } from '../../components/analytics/shared/AchievementCard';
import { SkeletonCard } from '../../components/analytics/shared/SkeletonCard';
import { 
  ConversionFunnelChart, 
  RevenueAttributionChart, 
  TrendLineChart,
  EngagementScoreGauge 
} from '../../components/analytics/enhanced';
import { ConversionFunnelService } from '../../services/conversionFunnelService';
import { RevenueEstimationService } from '../../services/revenueEstimationService';
import { PromotionAnalyticsService } from '../../services/promotionAnalyticsService';
import { usePromotionRealtime } from '../../hooks/usePromotionRealtime';
import { PromotionPerformanceChart } from '../../components/analytics/promotions/PromotionPerformanceChart';
import { 
  Users, 
  TrendingUp, 
  Eye, 
  Star, 
  MapPin, 
  Trophy, 
  Award, 
  Download,
  Crown,
  BarChart3,
  Calendar,
  Globe
} from 'lucide-react';
import { useViewTracking } from '@/hooks/useViewTracking';

export default function CreatorAnalyticsDashboard() {
  // Track analytics dashboard view
  useViewTracking('view', 'analytics_creator', { dashboard_type: 'creator' });

  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [fanInsights, setFanInsights] = useState<FanInsight[]>([]);
  const [geographicInsights, setGeographicInsights] = useState<GeographicInsight[]>([]);
  const [contentPerformance, setContentPerformance] = useState<ContentPerformance[]>([]);
  const [achievements, setAchievements] = useState<CreatorAchievement[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'fans' | 'content' | 'achievements' | 'promotions'>('overview');
  
  // Track tab switches
  const handleTabChange = (tab: 'overview' | 'fans' | 'content' | 'achievements' | 'promotions') => {
    try {
      import('@/services/interactionTrackingService').then(({ trackInteraction }) => {
        trackInteraction.click('view', `analytics_tab_${tab}`, { 
          tab, 
          dashboard_type: 'creator' 
        });
      });
    } catch (error) {
      console.error('Error tracking tab switch:', error);
    }
    setActiveTab(tab);
  };
  const [promotionLoading, setPromotionLoading] = useState(false);

  // Load promotion data when promotions tab is activated
  const loadPromotionData = async () => {
    if (!user) return;
    
    setPromotionLoading(true);
    try {
      console.log('🔍 CreatorAnalyticsDashboard: Loading promotion data...');
      const [promotionData, comparisonData, trendsData] = await Promise.all([
        PromotionAnalyticsService.getUserPromotions(user.id),
        PromotionAnalyticsService.getPromotionPerformanceComparison(user.id),
        PromotionAnalyticsService.getPromotionTrends(user.id, 30)
      ]);
      
      console.log('🔍 CreatorAnalyticsDashboard: Promotion data loaded:', {
        promotions: promotionData.length,
        comparisons: comparisonData.length,
        trends: trendsData.length
      });
      
      setPromotionMetrics(promotionData);
      setPromotionComparison(comparisonData);
      setPromotionTrends(trendsData);
    } catch (error) {
      console.error('Error loading promotion data:', error);
    } finally {
      setPromotionLoading(false);
    }
  };
  const [conversionFunnel, setConversionFunnel] = useState<any>(null);
  const [revenueMetrics, setRevenueMetrics] = useState<any>(null);
  const [followerTrends, setFollowerTrends] = useState<any[]>([]);
  const [engagementMetrics, setEngagementMetrics] = useState<any>(null);
  const [promotionMetrics, setPromotionMetrics] = useState<any[]>([]);
  const [promotionComparison, setPromotionComparison] = useState<any[]>([]);
  const [promotionTrends, setPromotionTrends] = useState<any[]>([]);
  
  // Realtime promotion analytics
  const { isLive: promotionIsLive, lastUpdate: promotionLastUpdate } = usePromotionRealtime({
    userId: user?.id || '',
    enabled: !!user
  });

  useEffect(() => {
    if (user) {
      fetchCreatorData();
    }
  }, [user]);

  // Load promotion data when promotions tab is activated
  useEffect(() => {
    if (activeTab === 'promotions' && user) {
      loadPromotionData();
    }
  }, [activeTab, user]);

  const fetchCreatorData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      // For now, use user ID as creator ID - in real app, this would be the artist/creator profile ID
      const creatorId = user.id;
      console.log('🔍 CreatorAnalyticsDashboard: Fetching data for creatorId:', creatorId);
      
      const [
        statsData,
        fanInsightsData,
        geographicInsightsData,
        contentPerformanceData,
        achievementsData
      ] = await Promise.all([
        CreatorAnalyticsService.getCreatorStats(creatorId),
        CreatorAnalyticsService.getFanInsights(creatorId),
        CreatorAnalyticsService.getGeographicInsights(creatorId),
        CreatorAnalyticsService.getContentPerformance(creatorId),
        CreatorAnalyticsService.getCreatorAchievements(creatorId)
      ]);

      setStats(statsData);
      setFanInsights(fanInsightsData);
      setGeographicInsights(geographicInsightsData);
      setContentPerformance(contentPerformanceData);
      setAchievements(achievementsData);

      // Load enhanced analytics
      await loadEnhancedAnalytics(creatorId);
    } catch (error) {
      console.error('Error fetching creator data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadEnhancedAnalytics = async (creatorId: string) => {
    try {
      const timeRange = {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: new Date()
      };

      // Load conversion funnel analysis
      const funnelData = await ConversionFunnelService.analyzeFunnel('creator', timeRange);
      setConversionFunnel(funnelData);

      // Load revenue metrics
      const revenueData = await RevenueEstimationService.getUserRevenueMetrics(creatorId, timeRange);
      setRevenueMetrics(revenueData);

      // Create follower trends from content performance
      const trends = contentPerformance.map(perf => ({
        date: perf.date,
        value: perf.follower_gains,
        label: 'New Followers'
      }));
      setFollowerTrends(trends);

      // Create engagement metrics
      const engagementData = {
        score: stats?.engagement_rate || 0,
        sessionDuration: 0, // Not applicable for creators
        interactionCount: stats?.total_event_views || 0,
        pageViews: stats?.total_event_views || 0,
        likes: stats?.total_reviews || 0,
        shares: 0, // TODO: Add share tracking
        comments: 0, // TODO: Add comment tracking
        bounceRate: 0 // Not applicable for creators
      };
      setEngagementMetrics(engagementData);

      // Load promotion analytics
      const [promotionData, comparisonData, trendsData] = await Promise.all([
        PromotionAnalyticsService.getUserPromotions(creatorId),
        PromotionAnalyticsService.getPromotionPerformanceComparison(creatorId),
        PromotionAnalyticsService.getPromotionTrends(creatorId, 30)
      ]);
      setPromotionMetrics(promotionData);
      setPromotionComparison(comparisonData);
      setPromotionTrends(trendsData);
    } catch (error) {
      console.error('Error loading enhanced analytics:', error);
    }
  };

  const handleExport = async () => {
    if (!user) return;

    try {
      const data = await CreatorAnalyticsService.exportCreatorData(user.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `creator-analytics-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting data:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <SkeletonCard />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--neutral-50)', paddingBottom: 'var(--spacing-bottom-nav, 32px)' }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Crown className="w-8 h-8 text-purple-600" />
                <h1 className="gradient-text text-3xl font-bold">Creator Analytics</h1>
              </div>
              <p className="text-gray-600">
                Track your fan engagement, content performance, and growth metrics
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Export Data
              </button>
              <button className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all">
                Upgrade to Pro
              </button>
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            title="Total Followers"
            value={stats?.total_followers || 0}
            icon={<Users className="w-6 h-6" />}
            trend={
              stats?.fan_growth_rate > 0
                ? "up"
                : stats?.fan_growth_rate < 0
                ? "down"
                : "neutral"
            }
            subtitle="growth this month"
          />
          <MetricCard
            title="Engagement Rate"
            value={`${stats?.engagement_rate || 0}%`}
            icon={<TrendingUp className="w-6 h-6" />}
            trend="neutral"
            subtitle="interactions per follower"
          />
          <MetricCard
            title="Event Views"
            value={stats?.total_event_views || 0}
            icon={<Eye className="w-6 h-6" />}
            trend="neutral"
            subtitle="total views"
          />
          <MetricCard
            title="Fan Reviews"
            value={stats?.total_reviews || 0}
            icon={<Star className="w-6 h-6" />}
            trend="neutral"
            subtitle="reviews received"
          />
        </div>

        {/* Navigation Tabs */}
        <div className="mb-8">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {[
                { id: 'overview', label: 'Overview', icon: BarChart3 },
                { id: 'fans', label: 'Fan Insights', icon: Users },
                { id: 'content', label: 'Content Performance', icon: Calendar },
                { id: 'promotions', label: 'Promotions', icon: TrendingUp },
                { id: 'achievements', label: 'Achievements', icon: Trophy },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id as any)}
                  className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-purple-500 text-purple-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Enhanced Analytics Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Engagement Score */}
              {engagementMetrics && (
                <EngagementScoreGauge
                  metrics={engagementMetrics}
                  title="Creator Engagement Score"
                  showBreakdown={true}
                />
              )}

              {/* Follower Growth Trend */}
              {followerTrends.length > 0 && (
                <TrendLineChart
                  data={followerTrends}
                  title="Follower Growth"
                  valueLabel="New Followers"
                  showTrend={true}
                />
              )}
            </div>

            {/* Conversion Funnel */}
            {conversionFunnel && conversionFunnel.stages.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-synth-pink" />
                  Fan Conversion Funnel
                </h2>
                <ConversionFunnelChart
                  stages={conversionFunnel.stages}
                  title="Fan Journey Analysis"
                  showOptimizationTips={true}
                />
              </div>
            )}

            {/* Revenue Attribution */}
            {revenueMetrics && revenueMetrics.total_revenue > 0 && (
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Star className="w-5 h-5 text-synth-pink" />
                  Revenue Attribution
                </h2>
                <RevenueAttributionChart
                  sources={revenueMetrics.top_revenue_sources.map((source: any) => ({
                    source: source.source,
                    revenue: source.revenue,
                    percentage: source.percentage,
                    confidence_score: 0.8,
                    attribution_window: 24
                  }))}
                  totalRevenue={revenueMetrics.total_revenue}
                  title="Revenue Sources"
                  showConfidenceScores={true}
                />
              </div>
            )}

            {/* Original Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Fan Insights */}
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="w-5 h-5 text-purple-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Top Venues</h3>
                </div>
                {fanInsights.length > 0 ? (
                  <div className="space-y-3">
                    {fanInsights.slice(0, 5).map((insight, index) => (
                      <div key={insight.venue_name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-sm font-semibold text-purple-600">
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{insight.venue_name}</p>
                            <p className="text-sm text-gray-500">{insight.event_count} events</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">{insight.total_views}</p>
                          <p className="text-sm text-gray-500">views</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No venue data available</p>
                  </div>
                )}
              </div>

              {/* Geographic Reach */}
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Globe className="w-5 h-5 text-purple-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Geographic Reach</h3>
                </div>
                {geographicInsights.length > 0 ? (
                  <div className="space-y-3">
                    {geographicInsights.slice(0, 5).map((insight, index) => (
                      <div key={`${insight.city}-${insight.state}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm font-semibold text-blue-600">
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{insight.city}, {insight.state}</p>
                            <p className="text-sm text-gray-500">{insight.event_count} events</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">{insight.fan_count}</p>
                          <p className="text-sm text-gray-500">fans</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Globe className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No geographic data available</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'fans' && (
          <div className="space-y-6">
            {/* Fan Insights */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Venue Performance</h3>
              {fanInsights.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Venue</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Events</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Views</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Engagement</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Fan Density</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fanInsights.map((insight) => (
                        <tr key={insight.venue_name} className="border-b border-gray-100">
                          <td className="py-3 px-4 font-medium text-gray-900">{insight.venue_name}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{insight.event_count}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{insight.total_views}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{insight.engagement_score}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{insight.fan_density}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No fan insights available</p>
                </div>
              )}
            </div>

            {/* Geographic Insights */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Geographic Distribution</h3>
              {geographicInsights.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Location</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Fans</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Events</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Engagement</th>
                      </tr>
                    </thead>
                    <tbody>
                      {geographicInsights.map((insight) => (
                        <tr key={`${insight.city}-${insight.state}`} className="border-b border-gray-100">
                          <td className="py-3 px-4 font-medium text-gray-900">{insight.city}, {insight.state}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{insight.fan_count}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{insight.event_count}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{insight.engagement_rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Globe className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No geographic data available</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'content' && (
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Content Performance</h3>
            {contentPerformance.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-medium text-gray-900">Date</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-900">Event Views</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-900">Profile Visits</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-900">Follower Gains</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-900">Engagement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contentPerformance.map((performance) => (
                      <tr key={performance.date} className="border-b border-gray-100">
                        <td className="py-3 px-4 font-medium text-gray-900">
                          {new Date(performance.date).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-600">{performance.event_views}</td>
                        <td className="py-3 px-4 text-right text-gray-600">{performance.profile_visits}</td>
                        <td className="py-3 px-4 text-right text-gray-600">{performance.follower_gains}</td>
                        <td className="py-3 px-4 text-right text-gray-600">{performance.engagement_rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8">
                <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No content performance data available</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'achievements' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-3 mb-2">
                <Trophy className="w-8 h-8 text-yellow-500" />
                <h2 className="gradient-text text-2xl font-bold">Creator Achievements</h2>
              </div>
              <p className="text-gray-600 text-sm">
                Track your milestones as a creator and artist
              </p>
            </div>

            {/* Achievement Categories */}
            {['follower', 'engagement', 'venue', 'revenue'].map((category) => {
              const categoryAchievements = achievements.filter(a => a.category === category);
              const categoryLabels = {
                follower: 'Follower Milestones',
                engagement: 'Engagement Goals',
                venue: 'Venue Performance',
                revenue: 'Revenue Targets'
              };

              return (
                <div key={category} className="bg-white rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <Award className="w-5 h-5 text-purple-600" />
                    <h3 className="text-lg font-semibold text-gray-900">
                      {categoryLabels[category as keyof typeof categoryLabels]}
                    </h3>
                  </div>
                  
                  {categoryAchievements.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {categoryAchievements.map((achievement) => (
                        <AchievementCard
                          key={achievement.id}
                          name={achievement.name}
                          description={achievement.description}
                          icon={achievement.icon}
                          progress={achievement.progress}
                          goal={achievement.goal}
                          unlocked={achievement.unlocked}
                          unlockedAt={achievement.unlockedAt}
                          compact
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Award className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500">No achievements in this category yet</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Promotions Tab */}
        {activeTab === 'promotions' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-gray-900">Promotion Analytics</h2>
                  {promotionIsLive && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      Live
                    </div>
                  )}
                </div>
                <p className="text-gray-600">Track your event promotion performance and ROI</p>
                {promotionLastUpdate && (
                  <p className="text-xs text-gray-500 mt-1">
                    Last updated: {promotionLastUpdate.toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>

            {promotionMetrics.length === 0 ? (
              <div className="text-center py-12">
                <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Promotions Yet</h3>
                <p className="text-gray-500 mb-4">Start promoting your events to see detailed analytics here</p>
                <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                  Promote Your First Event
                </button>
              </div>
            ) : (
              <>
                {/* Active Promotions */}
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                  {promotionMetrics.slice(0, 3).map((promotion) => (
                    <div key={promotion.id} className="bg-white rounded-xl p-6 shadow-sm border">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-lg truncate">{promotion.event.title}</h3>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          promotion.promotion_tier === 'featured' 
                            ? 'bg-gradient-to-r from-yellow-100 to-orange-100 text-yellow-800'
                            : promotion.promotion_tier === 'premium'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {promotion.promotion_tier}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-600">Impressions</p>
                          <p className="text-xl font-bold">{promotion.impressions.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Clicks</p>
                          <p className="text-xl font-bold">{promotion.clicks.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Conversions</p>
                          <p className="text-xl font-bold text-green-600">{promotion.conversions.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">CTR</p>
                          <p className="text-xl font-bold">{((promotion.clicks / promotion.impressions) * 100).toFixed(1)}%</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Performance Chart */}
                <PromotionPerformanceChart 
                  data={promotionTrends.map(trend => ({
                    date: trend.date,
                    impressions: trend.impressions || 0,
                    clicks: trend.clicks || 0,
                    conversions: trend.conversions || 0,
                    spend: trend.spend || 0
                  }))}
                  className="bg-white rounded-xl shadow-sm border"
                />

                {/* Comparison Table */}
                {promotionComparison.length > 0 && (
                  <div className="bg-white rounded-xl p-6 shadow-sm border">
                    <h3 className="text-lg font-semibold mb-4">Promotion Comparison</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2">Event</th>
                            <th className="text-left py-2">Tier</th>
                            <th className="text-left py-2">Impressions</th>
                            <th className="text-left py-2">Clicks</th>
                            <th className="text-left py-2">Conversions</th>
                            <th className="text-left py-2">CTR</th>
                            <th className="text-left py-2">ROI</th>
                          </tr>
                        </thead>
                        <tbody>
                          {promotionComparison.slice(0, 5).map((promotion) => (
                            <tr key={promotion.promotion_id} className="border-b">
                              <td className="py-2 font-medium truncate max-w-32">{promotion.event_title}</td>
                              <td className="py-2">
                                <span className={`px-2 py-1 rounded text-xs ${
                                  promotion.tier === 'featured' 
                                    ? 'bg-gradient-to-r from-yellow-100 to-orange-100 text-yellow-800'
                                    : promotion.tier === 'premium'
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'bg-blue-100 text-blue-700'
                                }`}>
                                  {promotion.tier}
                                </span>
                              </td>
                              <td className="py-2">{promotion.impressions.toLocaleString()}</td>
                              <td className="py-2">{promotion.clicks.toLocaleString()}</td>
                              <td className="py-2">{promotion.conversions.toLocaleString()}</td>
                              <td className="py-2">{promotion.ctr.toFixed(1)}%</td>
                              <td className="py-2">
                                <span className={`font-semibold ${promotion.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {promotion.roi >= 0 ? '+' : ''}{promotion.roi.toFixed(1)}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
