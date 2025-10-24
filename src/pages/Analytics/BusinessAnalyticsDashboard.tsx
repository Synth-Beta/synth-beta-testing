import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { 
  BusinessAnalyticsService, 
  BusinessStats, 
  EventPerformance, 
  CustomerInsight, 
  RevenueInsight, 
  ArtistPerformance, 
  BusinessAchievement 
} from '../../services/businessAnalyticsService';
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
import { 
  Building2, 
  TrendingUp, 
  Users, 
  DollarSign, 
  Target, 
  Star, 
  Repeat, 
  Calendar,
  Trophy, 
  Award, 
  Download,
  Crown,
  BarChart3,
  PieChart,
  TrendingDown
} from 'lucide-react';

export default function BusinessAnalyticsDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<BusinessStats | null>(null);
  const [eventPerformance, setEventPerformance] = useState<EventPerformance[]>([]);
  const [customerInsights, setCustomerInsights] = useState<CustomerInsight[]>([]);
  const [revenueInsights, setRevenueInsights] = useState<RevenueInsight[]>([]);
  const [artistPerformance, setArtistPerformance] = useState<ArtistPerformance[]>([]);
  const [achievements, setAchievements] = useState<BusinessAchievement[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'revenue' | 'customers' | 'events' | 'achievements' | 'promotions'>('overview');
  const [conversionFunnel, setConversionFunnel] = useState<any>(null);
  const [revenueMetrics, setRevenueMetrics] = useState<any>(null);
  const [revenueTrends, setRevenueTrends] = useState<any[]>([]);
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
      fetchBusinessData();
    }
  }, [user]);

  const fetchBusinessData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      // For now, use a placeholder business ID - in real app, this would be the venue/business profile ID
      const businessId = 'Sample Venue'; // TODO: Get from user's business profile
      
      const [
        statsData,
        eventPerformanceData,
        customerInsightsData,
        revenueInsightsData,
        artistPerformanceData,
        achievementsData
      ] = await Promise.all([
        BusinessAnalyticsService.getBusinessStats(businessId),
        BusinessAnalyticsService.getEventPerformance(businessId),
        BusinessAnalyticsService.getCustomerInsights(businessId),
        BusinessAnalyticsService.getRevenueInsights(businessId),
        BusinessAnalyticsService.getArtistPerformance(businessId),
        BusinessAnalyticsService.getBusinessAchievements(businessId)
      ]);

      setStats(statsData);
      setEventPerformance(eventPerformanceData);
      setCustomerInsights(customerInsightsData);
      setRevenueInsights(revenueInsightsData);
      setArtistPerformance(artistPerformanceData);
      setAchievements(achievementsData);

      // Load enhanced analytics
      await loadEnhancedAnalytics();
    } catch (error) {
      console.error('Error fetching business data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadEnhancedAnalytics = async () => {
    try {
      const timeRange = {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: new Date()
      };

      // Load conversion funnel analysis for business
      const funnelData = await ConversionFunnelService.analyzeFunnel('business', timeRange);
      setConversionFunnel(funnelData);

      // Load revenue metrics
      const revenueData = await RevenueEstimationService.getUserRevenueMetrics(user?.id || '', timeRange);
      setRevenueMetrics(revenueData);

      // Create revenue trends from revenue insights
      const trends = revenueInsights.map(insight => ({
        date: insight.date,
        value: insight.revenue,
        label: 'Daily Revenue'
      }));
      setRevenueTrends(trends);

      // Create engagement metrics for business
      const engagementData = {
        score: stats?.conversion_rate || 0,
        sessionDuration: 0, // Not applicable for business
        interactionCount: stats?.total_events || 0,
        pageViews: stats?.total_events || 0,
        likes: stats?.customer_satisfaction || 0,
        shares: 0, // TODO: Add share tracking
        comments: 0, // TODO: Add comment tracking
        bounceRate: 0 // Not applicable for business
      };
      setEngagementMetrics(engagementData);

      // Load promotion analytics
      if (user) {
        const [promotionData, comparisonData, trendsData] = await Promise.all([
          PromotionAnalyticsService.getUserPromotions(user.id),
          PromotionAnalyticsService.getPromotionPerformanceComparison(user.id),
          PromotionAnalyticsService.getPromotionTrends(user.id, 30)
        ]);
        setPromotionMetrics(promotionData);
        setPromotionComparison(comparisonData);
        setPromotionTrends(trendsData);
      }
    } catch (error) {
      console.error('Error loading enhanced analytics:', error);
    }
  };

  const handleExport = async () => {
    if (!user) return;

    try {
      const businessId = 'Sample Venue'; // TODO: Get from user's business profile
      const data = await BusinessAnalyticsService.exportBusinessData(businessId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `business-analytics-${new Date().toISOString().split('T')[0]}.json`;
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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Building2 className="w-8 h-8 text-blue-600" />
                <h1 className="gradient-text text-3xl font-bold">Business Analytics</h1>
              </div>
              <p className="text-gray-600">
                Track your venue performance, revenue, and customer insights
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
              <button className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all">
                Upgrade to Pro
              </button>
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            title="Total Events"
            value={stats?.total_events || 0}
            icon={<Calendar className="w-6 h-6" />}
            trend="neutral"
          />
          <MetricCard
            title="Total Revenue"
            value={`$${(stats?.total_revenue || 0).toLocaleString()}`}
            icon={<DollarSign className="w-6 h-6" />}
            trend={stats?.revenue_growth_rate > 0 ? "up" : stats?.revenue_growth_rate < 0 ? "down" : "neutral"}
          />
          <MetricCard
            title="Conversion Rate"
            value={`${stats?.conversion_rate || 0}%`}
            icon={<Target className="w-6 h-6" />}
            trend="neutral"
          />
          <MetricCard
            title="Customer Satisfaction"
            value={`${stats?.customer_satisfaction || 0}/5`}
            icon={<Star className="w-6 h-6" />}
            trend="neutral"
          />
        </div>

        {/* Navigation Tabs */}
        <div className="mb-8">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {[
                { id: 'overview', label: 'Overview', icon: BarChart3 },
                { id: 'revenue', label: 'Revenue', icon: DollarSign },
                { id: 'customers', label: 'Customers', icon: Users },
                { id: 'events', label: 'Events', icon: Calendar },
                { id: 'promotions', label: 'Promotions', icon: TrendingUp },
                { id: 'achievements', label: 'Achievements', icon: Trophy },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
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
              {/* Business Performance Score */}
              {engagementMetrics && (
                <EngagementScoreGauge
                  metrics={engagementMetrics}
                  title="Business Performance Score"
                  showBreakdown={true}
                />
              )}

              {/* Revenue Trends */}
              {revenueTrends.length > 0 && (
                <TrendLineChart
                  data={revenueTrends}
                  title="Revenue Trends"
                  valueLabel="Daily Revenue"
                  showTrend={true}
                />
              )}
            </div>

            {/* Conversion Funnel */}
            {conversionFunnel && conversionFunnel.stages.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5 text-synth-pink" />
                  Customer Conversion Funnel
                </h2>
                <ConversionFunnelChart
                  stages={conversionFunnel.stages}
                  title="Customer Journey Analysis"
                  showOptimizationTips={true}
                />
              </div>
            )}

            {/* Revenue Attribution */}
            {revenueMetrics && revenueMetrics.total_revenue > 0 && (
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-synth-pink" />
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
              {/* Top Performing Events */}
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Top Performing Events</h3>
                </div>
                {eventPerformance.length > 0 ? (
                  <div className="space-y-3">
                    {eventPerformance.slice(0, 5).map((event, index) => (
                      <div key={event.event_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm font-semibold text-blue-600">
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{event.title}</p>
                            <p className="text-sm text-gray-500">{event.artist_name}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">${event.revenue_generated}</p>
                          <p className="text-sm text-gray-500">{event.total_views} views</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No event data available</p>
                  </div>
                )}
              </div>

              {/* Customer Segments */}
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <PieChart className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Customer Segments</h3>
                </div>
                {customerInsights.length > 0 ? (
                  <div className="space-y-3">
                    {customerInsights.map((segment, index) => (
                      <div key={segment.customer_segment} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-sm font-semibold text-green-600">
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{segment.customer_segment}</p>
                            <p className="text-sm text-gray-500">{segment.avg_events_attended} avg events</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">{segment.count}</p>
                          <p className="text-sm text-gray-500">{segment.percentage}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No customer data available</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'revenue' && (
          <div className="space-y-6">
            {/* Revenue Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-600">Total Revenue</span>
                </div>
                <p className="text-2xl font-bold text-green-900">${(stats?.total_revenue || 0).toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-600">Conversion Rate</span>
                </div>
                <p className="text-2xl font-bold text-blue-900">{stats?.conversion_rate || 0}%</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-600">Avg Ticket Price</span>
                </div>
                <p className="text-2xl font-bold text-purple-900">$50</p>
              </div>
            </div>

            {/* Revenue Insights Table */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Trends</h3>
              {revenueInsights.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Date</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Revenue</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Ticket Clicks</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Conversion Rate</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Avg Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueInsights.slice(-10).map((insight) => (
                        <tr key={insight.date} className="border-b border-gray-100">
                          <td className="py-3 px-4 font-medium text-gray-900">
                            {new Date(insight.date).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-600">${insight.revenue}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{insight.ticket_clicks}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{insight.conversion_rate}%</td>
                          <td className="py-3 px-4 text-right text-gray-600">${insight.avg_ticket_price}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No revenue data available</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'customers' && (
          <div className="space-y-6">
            {/* Customer Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-600">Total Attendees</span>
                </div>
                <p className="text-2xl font-bold text-blue-900">{(stats?.total_attendees || 0).toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Repeat className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-600">Repeat Rate</span>
                </div>
                <p className="text-2xl font-bold text-green-900">{stats?.repeat_customer_rate || 0}%</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="w-4 h-4 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-600">Satisfaction</span>
                </div>
                <p className="text-2xl font-bold text-yellow-900">{stats?.customer_satisfaction || 0}/5</p>
              </div>
            </div>

            {/* Customer Insights Table */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Segmentation</h3>
              {customerInsights.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Segment</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Count</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Percentage</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Avg Events</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Avg Spending</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Loyalty Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerInsights.map((insight) => (
                        <tr key={insight.customer_segment} className="border-b border-gray-100">
                          <td className="py-3 px-4 font-medium text-gray-900">{insight.customer_segment}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{insight.count}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{insight.percentage}%</td>
                          <td className="py-3 px-4 text-right text-gray-600">{insight.avg_events_attended}</td>
                          <td className="py-3 px-4 text-right text-gray-600">${insight.avg_spending}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{insight.loyalty_score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No customer data available</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'events' && (
          <div className="space-y-6">
            {/* Event Performance Table */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Event Performance</h3>
              {eventPerformance.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Event</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Artist</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Date</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Views</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Interested</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Revenue</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eventPerformance.map((event) => (
                        <tr key={event.event_id} className="border-b border-gray-100">
                          <td className="py-3 px-4 font-medium text-gray-900">{event.title}</td>
                          <td className="py-3 px-4 text-gray-600">{event.artist_name}</td>
                          <td className="py-3 px-4 text-gray-600">
                            {new Date(event.event_date).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-600">{event.total_views}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{event.total_interested}</td>
                          <td className="py-3 px-4 text-right text-gray-600">${event.revenue_generated}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{event.avg_rating}/5</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No event data available</p>
                </div>
              )}
            </div>

            {/* Artist Performance */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Artist Performance</h3>
              {artistPerformance.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Artist</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Events</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Views</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Revenue</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Rating</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Repeat Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {artistPerformance.map((artist) => (
                        <tr key={artist.artist_name} className="border-b border-gray-100">
                          <td className="py-3 px-4 font-medium text-gray-900">{artist.artist_name}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{artist.events_count}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{artist.total_views}</td>
                          <td className="py-3 px-4 text-right text-gray-600">${artist.total_revenue}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{artist.avg_rating}/5</td>
                          <td className="py-3 px-4 text-right text-gray-600">{artist.repeat_rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No artist performance data available</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'achievements' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-3 mb-2">
                <Trophy className="w-8 h-8 text-yellow-500" />
                <h2 className="gradient-text text-2xl font-bold">Business Achievements</h2>
              </div>
              <p className="text-gray-600 text-sm">
                Track your business milestones and growth metrics
              </p>
            </div>

            {/* Achievement Categories */}
            {['events', 'revenue', 'customers', 'growth'].map((category) => {
              const categoryAchievements = achievements.filter(a => a.category === category);
              const categoryLabels = {
                events: 'Event Hosting',
                revenue: 'Revenue Goals',
                customers: 'Customer Satisfaction',
                growth: 'Growth Metrics'
              };

              return (
                <div key={category} className="bg-white rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <Award className="w-5 h-5 text-blue-600" />
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
                <p className="text-gray-600">Track your venue's event promotion performance and ROI</p>
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
                <p className="text-gray-500 mb-4">Start promoting your venue's events to see detailed analytics here</p>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
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
                {promotionTrends.length > 0 && (
                  <div className="bg-white rounded-xl p-6 shadow-sm border">
                    <h3 className="text-lg font-semibold mb-4">Promotion Performance Over Time</h3>
                    <div className="h-64 flex items-center justify-center text-gray-500">
                      Performance chart would go here
                    </div>
                  </div>
                )}

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
