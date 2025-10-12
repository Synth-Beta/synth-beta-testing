import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { 
  AdminAnalyticsService, 
  PlatformStats, 
  UserGrowth, 
  EngagementMetrics, 
  RevenueMetrics, 
  ContentMetrics, 
  SystemHealth, 
  UserSegment, 
  GeographicDistribution, 
  AdminAchievement,
  NorthStarMetric
} from '../../services/adminAnalyticsService';
import { MetricCard } from '../../components/analytics/shared/MetricCard';
import { TopListCard } from '../../components/analytics/shared/TopListCard';
import { AchievementCard } from '../../components/analytics/shared/AchievementCard';
import { SkeletonCard } from '../../components/analytics/shared/SkeletonCard';
import { AdminClaimReviewPanel } from '../../components/admin/AdminClaimReviewPanel';
import { AdminModerationPanel } from '../../components/admin/AdminModerationPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { 
  Shield, 
  Users, 
  TrendingUp, 
  DollarSign, 
  Calendar, 
  Activity,
  Globe,
  Server,
  BarChart3,
  PieChart,
  Trophy, 
  Award, 
  Download,
  Crown,
  Eye,
  Search,
  Star,
  Ticket,
  Zap,
  Database,
  AlertTriangle,
  CheckCircle,
  Flag,
  Heart,
  Target,
  Compass
} from 'lucide-react';

export default function AdminAnalyticsDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);
  const [userGrowth, setUserGrowth] = useState<UserGrowth[]>([]);
  const [engagementMetrics, setEngagementMetrics] = useState<EngagementMetrics | null>(null);
  const [revenueMetrics, setRevenueMetrics] = useState<RevenueMetrics | null>(null);
  const [contentMetrics, setContentMetrics] = useState<ContentMetrics | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [userSegments, setUserSegments] = useState<UserSegment[]>([]);
  const [geographicDistribution, setGeographicDistribution] = useState<GeographicDistribution[]>([]);
  const [achievements, setAchievements] = useState<AdminAchievement[]>([]);
  const [northStarMetric, setNorthStarMetric] = useState<NorthStarMetric | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'revenue' | 'content' | 'system' | 'achievements' | 'claims' | 'moderation'>('overview');

  // Debug activeTab changes
  useEffect(() => {
    console.log('🔍 AdminAnalyticsDashboard: activeTab changed to:', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (user) {
      fetchAdminData();
    }
  }, [user]);

  const fetchAdminData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      const [
        platformStatsData,
        userGrowthData,
        engagementMetricsData,
        revenueMetricsData,
        contentMetricsData,
        systemHealthData,
        userSegmentsData,
        geographicDistributionData,
        achievementsData,
        northStarMetricData
      ] = await Promise.all([
        AdminAnalyticsService.getPlatformStats(),
        AdminAnalyticsService.getUserGrowth(),
        AdminAnalyticsService.getEngagementMetrics(),
        AdminAnalyticsService.getRevenueMetrics(),
        AdminAnalyticsService.getContentMetrics(),
        AdminAnalyticsService.getSystemHealth(),
        AdminAnalyticsService.getUserSegments(),
        AdminAnalyticsService.getGeographicDistribution(),
        AdminAnalyticsService.getAdminAchievements(),
        AdminAnalyticsService.getNorthStarMetric()
      ]);

      setPlatformStats(platformStatsData);
      setUserGrowth(userGrowthData);
      setEngagementMetrics(engagementMetricsData);
      setRevenueMetrics(revenueMetricsData);
      setContentMetrics(contentMetricsData);
      setSystemHealth(systemHealthData);
      setUserSegments(userSegmentsData);
      setGeographicDistribution(geographicDistributionData);
      setAchievements(achievementsData);
      setNorthStarMetric(northStarMetricData);
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!user) return;

    try {
      const data = await AdminAnalyticsService.exportAdminData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `admin-analytics-${new Date().toISOString().split('T')[0]}.json`;
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
                <Shield className="w-8 h-8 text-red-600" />
                <h1 className="gradient-text text-3xl font-bold">Admin Analytics</h1>
              </div>
              <p className="text-gray-600">
                Platform-wide analytics, system health, and business intelligence
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
              <button className="px-6 py-2 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-lg hover:from-red-700 hover:to-orange-700 transition-all">
                System Settings
              </button>
            </div>
          </div>
        </div>

        {/* Key Platform Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            title="North Star: ECI/U"
            value={northStarMetric?.eci_per_user || 0}
            icon={<Target className="w-6 h-6" />}
            trend={northStarMetric?.monthly_growth_rate > 0 ? "up" : northStarMetric?.monthly_growth_rate < 0 ? "down" : "neutral"}
            subtitle="concert intents per user"
          />
          <MetricCard
            title="Total Users"
            value={platformStats?.total_users || 0}
            icon={<Users className="w-6 h-6" />}
            trend={
              platformStats?.platform_growth_rate > 0
                ? "up"
                : platformStats?.platform_growth_rate < 0
                ? "down"
                : "neutral"
            }
          />
          <MetricCard
            title="Platform Revenue"
            value={`$${(platformStats?.total_revenue || 0).toLocaleString()}`}
            icon={<DollarSign className="w-6 h-6" />}
            trend={revenueMetrics?.revenue_growth_rate > 0 ? "up" : revenueMetrics?.revenue_growth_rate < 0 ? "down" : "neutral"}
            subtitle="revenue growth"
          />
          <MetricCard
            title="Total Events"
            value={platformStats?.total_events || 0}
            icon={<Calendar className="w-6 h-6" />}
            trend={contentMetrics?.content_growth_rate > 0 ? "up" : contentMetrics?.content_growth_rate < 0 ? "down" : "neutral"}
            subtitle="events this month"
          />
        </div>

        {/* Navigation Tabs */}
        <div className="mb-8">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {[
                { id: 'overview', label: 'Overview', icon: BarChart3 },
                { id: 'users', label: 'Users', icon: Users },
                { id: 'revenue', label: 'Revenue', icon: DollarSign },
                { id: 'content', label: 'Content', icon: Calendar },
                { id: 'claims', label: 'Claims', icon: Award },
                { id: 'moderation', label: 'Moderation', icon: Flag },
                { id: 'system', label: 'System', icon: Server },
                { id: 'achievements', label: 'Achievements', icon: Trophy },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    console.log('🔍 AdminAnalyticsDashboard: Tab clicked:', tab.id);
                    setActiveTab(tab.id as any);
                  }}
                  className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-red-500 text-red-600'
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
            {/* North Star Metric Section */}
            <div className="bg-gradient-to-r from-pink-50 to-red-50 rounded-xl p-6 shadow-sm border border-pink-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-gradient-to-r from-pink-500 to-red-500 rounded-lg">
                  <Target className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">North Star Metric</h3>
                  <p className="text-sm text-gray-600">Engaged Concert Intent per User (ECI/U)</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-pink-600 mb-1">
                    {northStarMetric?.eci_per_user || 0}
                  </div>
                  <div className="text-sm text-gray-600">Average ECI per User</div>
                  <div className="text-xs text-gray-500">This month</div>
                </div>
                
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-1">
                    {northStarMetric?.total_engaged_users || 0}
                  </div>
                  <div className="text-sm text-gray-600">Engaged Users</div>
                  <div className="text-xs text-gray-500">Active this month</div>
                </div>
                
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600 mb-1">
                    {northStarMetric?.total_concert_intents || 0}
                  </div>
                  <div className="text-sm text-gray-600">Total Concert Intents</div>
                  <div className="text-xs text-gray-500">Saves + RSVPs + Shares</div>
                </div>
              </div>
              
              {/* Breakdown */}
              <div className="mt-6 pt-6 border-t border-pink-200">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Intent Breakdown</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-white rounded-lg">
                    <div className="text-lg font-semibold text-pink-600">{northStarMetric?.breakdown.saves || 0}</div>
                    <div className="text-xs text-gray-600">Saves</div>
                  </div>
                  <div className="text-center p-3 bg-white rounded-lg">
                    <div className="text-lg font-semibold text-blue-600">{northStarMetric?.breakdown.rsvps || 0}</div>
                    <div className="text-xs text-gray-600">RSVPs</div>
                  </div>
                  <div className="text-center p-3 bg-white rounded-lg">
                    <div className="text-lg font-semibold text-purple-600">{northStarMetric?.breakdown.shares || 0}</div>
                    <div className="text-xs text-gray-600">Shares</div>
                  </div>
                </div>
              </div>
              
              {/* Top Engaged Users */}
              {northStarMetric?.top_engaged_users && northStarMetric.top_engaged_users.length > 0 && (
                <div className="mt-6 pt-6 border-t border-pink-200">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Top Engaged Users</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {northStarMetric.top_engaged_users.slice(0, 6).map((user, index) => (
                      <div key={user.user_id} className="flex items-center justify-between p-3 bg-white rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-pink-400 to-red-400 rounded-full flex items-center justify-center text-white text-xs font-bold">
                            {index + 1}
                          </div>
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {user.user_name}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-pink-600">
                          {user.eci_score} ECI
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Engagement Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-600">Page Views</span>
                </div>
                <p className="text-2xl font-bold text-blue-900">{engagementMetrics?.total_page_views || 0}</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Search className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-600">Searches</span>
                </div>
                <p className="text-2xl font-bold text-green-900">{engagementMetrics?.searches_performed || 0}</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="w-4 h-4 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-600">Reviews</span>
                </div>
                <p className="text-2xl font-bold text-yellow-900">{engagementMetrics?.reviews_written || 0}</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Ticket className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-600">Ticket Clicks</span>
                </div>
                <p className="text-2xl font-bold text-purple-900">{engagementMetrics?.tickets_clicked || 0}</p>
              </div>
            </div>

            {/* User Segments and Geographic Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">User Segments</h3>
                {userSegments.length > 0 ? (
                  <div className="space-y-3">
                    {userSegments.map((segment) => (
                      <div key={segment.segment} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">{segment.segment}</p>
                          <p className="text-sm text-gray-500">{segment.avg_sessions} avg sessions</p>
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
                    <p className="text-gray-500">No user segment data available</p>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Geographic Distribution</h3>
                {geographicDistribution.length > 0 ? (
                  <div className="space-y-3">
                    {geographicDistribution.slice(0, 5).map((geo) => (
                      <div key={geo.country} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">{geo.country}</p>
                          <p className="text-sm text-gray-500">{geo.events} events</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">{geo.users}</p>
                          <p className="text-sm text-gray-500">users</p>
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

        {activeTab === 'users' && (
          <div className="space-y-6">
            {/* User Growth Chart */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">User Growth</h3>
              {userGrowth.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Date</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">New Users</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Active Users</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Total Users</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Retention</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userGrowth.slice(-10).map((growth) => (
                        <tr key={growth.date} className="border-b border-gray-100">
                          <td className="py-3 px-4 font-medium text-gray-900">
                            {new Date(growth.date).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-600">{growth.new_users}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{growth.active_users}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{growth.total_users}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{growth.retention_rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No user growth data available</p>
                </div>
              )}
            </div>

            {/* User Segments Table */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">User Segmentation</h3>
              {userSegments.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Segment</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Count</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Percentage</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Avg Sessions</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Avg Revenue</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-900">Retention</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userSegments.map((segment) => (
                        <tr key={segment.segment} className="border-b border-gray-100">
                          <td className="py-3 px-4 font-medium text-gray-900">{segment.segment}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{segment.count}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{segment.percentage}%</td>
                          <td className="py-3 px-4 text-right text-gray-600">{segment.avg_sessions}</td>
                          <td className="py-3 px-4 text-right text-gray-600">${segment.avg_revenue}</td>
                          <td className="py-3 px-4 text-right text-gray-600">{segment.retention_rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <PieChart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No user segment data available</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'revenue' && (
          <div className="space-y-6">
            {/* Revenue Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-600">Total Revenue</span>
                </div>
                <p className="text-2xl font-bold text-green-900">${(revenueMetrics?.total_revenue || 0).toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-600">This Month</span>
                </div>
                <p className="text-2xl font-bold text-blue-900">${(revenueMetrics?.revenue_this_month || 0).toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-600">Avg Per User</span>
                </div>
                <p className="text-2xl font-bold text-purple-900">${revenueMetrics?.average_revenue_per_user || 0}</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-600">Growth Rate</span>
                </div>
                <p className="text-2xl font-bold text-yellow-900">{revenueMetrics?.revenue_growth_rate || 0}%</p>
              </div>
            </div>

            {/* Revenue Sources */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Sources</h3>
              {revenueMetrics?.top_revenue_sources && revenueMetrics.top_revenue_sources.length > 0 ? (
                <div className="space-y-3">
                  {revenueMetrics.top_revenue_sources.map((source) => (
                    <div key={source.source} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{source.source}</p>
                        <p className="text-sm text-gray-500">{source.percentage}% of total</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">${source.revenue.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
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

        {activeTab === 'content' && (
          <div className="space-y-6">
            {/* Content Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-600">Total Events</span>
                </div>
                <p className="text-2xl font-bold text-blue-900">{contentMetrics?.total_events || 0}</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-600">Total Artists</span>
                </div>
                <p className="text-2xl font-bold text-green-900">{contentMetrics?.total_artists || 0}</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-600">Total Venues</span>
                </div>
                <p className="text-2xl font-bold text-purple-900">{contentMetrics?.total_venues || 0}</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="w-4 h-4 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-600">Avg Rating</span>
                </div>
                <p className="text-2xl font-bold text-yellow-900">{contentMetrics?.average_event_rating || 0}/5</p>
              </div>
            </div>

            {/* Content Growth */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Content Statistics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm font-medium text-blue-900 mb-1">Events This Month</p>
                  <p className="text-2xl font-bold text-blue-900">{contentMetrics?.events_this_month || 0}</p>
                  <p className="text-xs text-blue-700">New events added</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm font-medium text-green-900 mb-1">Total Reviews</p>
                  <p className="text-2xl font-bold text-green-900">{contentMetrics?.total_reviews || 0}</p>
                  <p className="text-xs text-green-700">User reviews written</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'system' && (
          <div className="space-y-6">
            {/* System Health Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-600">API Response Time</span>
                </div>
                <p className="text-2xl font-bold text-green-900">{systemHealth?.api_response_time || 0}ms</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Database className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-600">Database Performance</span>
                </div>
                <p className="text-2xl font-bold text-blue-900">{systemHealth?.database_performance || 0}%</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-600">Uptime</span>
                </div>
                <p className="text-2xl font-bold text-purple-900">{systemHealth?.uptime_percentage || 0}%</p>
              </div>
            </div>

            {/* System Metrics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Metrics</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Error Rate</span>
                    <div className="flex items-center gap-2">
                      {systemHealth && systemHealth.error_rate < 1 ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="font-semibold">{systemHealth?.error_rate || 0}%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Active Connections</span>
                    <span className="font-semibold">{systemHealth?.active_connections || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Cache Hit Rate</span>
                    <span className="font-semibold">{systemHealth?.cache_hit_rate || 0}%</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">System Status</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="text-gray-900">API Services</span>
                    <span className="ml-auto text-sm text-green-600">Operational</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="text-gray-900">Database</span>
                    <span className="ml-auto text-sm text-green-600">Operational</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="text-gray-900">File Storage</span>
                    <span className="ml-auto text-sm text-green-600">Operational</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="text-gray-900">CDN</span>
                    <span className="ml-auto text-sm text-green-600">Operational</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'achievements' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-3 mb-2">
                <Trophy className="w-8 h-8 text-yellow-500" />
                <h2 className="gradient-text text-2xl font-bold">Platform Achievements</h2>
              </div>
              <p className="text-gray-600 text-sm">
                Track your platform milestones and growth metrics
              </p>
            </div>

            {/* Achievement Categories */}
            {['users', 'revenue', 'content', 'platform'].map((category) => {
              const categoryAchievements = achievements.filter(a => a.category === category);
              const categoryLabels = {
                users: 'User Growth',
                revenue: 'Revenue Goals',
                content: 'Content Creation',
                platform: 'Platform Engagement'
              };

              return (
                <div key={category} className="bg-white rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <Award className="w-5 h-5 text-red-600" />
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

        {/* Claims Review Tab */}
        {activeTab === 'claims' && (
          <div className="space-y-6">
            <AdminClaimReviewPanel />
          </div>
        )}

        {/* Moderation Tab */}
        {activeTab === 'moderation' && (
          <div className="space-y-6">
            {(() => { console.log('🔍 AdminAnalyticsDashboard: Rendering moderation tab, activeTab:', activeTab); return null; })()}
            <AdminModerationPanel />
          </div>
        )}
      </div>
    </div>
  );
}
