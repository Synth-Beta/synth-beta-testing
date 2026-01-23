import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { 
  AdminAnalyticsService, 
  PlatformStats, 
  UserGrowth, 
  EngagementMetrics, 
  ContentMetrics, 
  UserSegment, 
  GeographicDistribution, 
  AdminAchievement,
  NorthStarMetric,
  TimeSeriesDataPoint,
  UserStats,
  ActiveUserMetrics,
  FeatureUsage,
  FeatureAdoptionFunnel,
  SessionAnalytics,
  SocialGraphMetrics,
  SearchEffectiveness
} from '../../services/adminAnalyticsService';
import { MetricCard } from '../../components/analytics/shared/MetricCard';
import { TopListCard } from '../../components/analytics/shared/TopListCard';
import { AchievementCard } from '../../components/analytics/shared/AchievementCard';
import { SkeletonCard } from '../../components/analytics/shared/SkeletonCard';
import { AdminModerationPanel } from '../../components/admin/AdminModerationPanel';
import { VerificationManagement } from '../../components/admin/VerificationManagement';
import { 
  Shield, 
  Users, 
  TrendingUp, 
  Calendar, 
  Activity,
  Globe,
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
  CheckCircle,
  Flag,
  Heart,
  Target,
  MapPin,
  UserPlus,
  UserCheck
} from 'lucide-react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart as RechartsPieChart, Cell } from 'recharts';
import { useViewTracking } from '@/hooks/useViewTracking';

export default function AdminAnalyticsDashboard() {
  // Track analytics dashboard view
  useViewTracking('view', 'analytics_admin', { dashboard_type: 'admin' });

  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);
  const [userGrowth, setUserGrowth] = useState<UserGrowth[]>([]);
  const [engagementMetrics, setEngagementMetrics] = useState<EngagementMetrics | null>(null);
  const [contentMetrics, setContentMetrics] = useState<ContentMetrics | null>(null);
  const [userSegments, setUserSegments] = useState<UserSegment[]>([]);
  const [geographicDistribution, setGeographicDistribution] = useState<GeographicDistribution[]>([]);
  const [achievements, setAchievements] = useState<AdminAchievement[]>([]);
  const [northStarMetric, setNorthStarMetric] = useState<NorthStarMetric | null>(null);
  const [dauOverTime, setDauOverTime] = useState<TimeSeriesDataPoint[]>([]);
  const [mauOverTime, setMauOverTime] = useState<TimeSeriesDataPoint[]>([]);
  const [newUsersOverTime, setNewUsersOverTime] = useState<TimeSeriesDataPoint[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [activeUserMetrics, setActiveUserMetrics] = useState<ActiveUserMetrics | null>(null);
  const [featureUsage, setFeatureUsage] = useState<FeatureUsage[]>([]);
  const [featureAdoptionFunnel, setFeatureAdoptionFunnel] = useState<FeatureAdoptionFunnel[]>([]);
  const [sessionAnalytics, setSessionAnalytics] = useState<SessionAnalytics | null>(null);
  const [socialGraphMetrics, setSocialGraphMetrics] = useState<SocialGraphMetrics | null>(null);
  const [searchEffectiveness, setSearchEffectiveness] = useState<SearchEffectiveness | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'active-users' | 'content' | 'achievements' | 'moderation'>('overview');
  
  // Track tab switches
  const handleTabChange = (tab: 'overview' | 'users' | 'active-users' | 'content' | 'achievements' | 'moderation') => {
    try {
      import('@/services/interactionTrackingService').then(({ trackInteraction }) => {
        trackInteraction.click('view', `analytics_tab_${tab}`, { 
          tab, 
          dashboard_type: 'admin' 
        });
      });
    } catch (error) {
      console.error('Error tracking tab switch:', error);
    }
    setActiveTab(tab);
  };

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
        contentMetricsData,
        userSegmentsData,
        geographicDistributionData,
        achievementsData,
        northStarMetricData,
        dauOverTimeData,
        mauOverTimeData,
        newUsersOverTimeData,
        userStatsData,
        activeUserMetricsData,
        featureUsageData,
        featureAdoptionFunnelData,
        sessionAnalyticsData,
        socialGraphMetricsData,
        searchEffectivenessData
      ] = await Promise.all([
        AdminAnalyticsService.getPlatformStats(),
        AdminAnalyticsService.getUserGrowth(),
        AdminAnalyticsService.getEngagementMetrics(),
        AdminAnalyticsService.getContentMetrics(),
        AdminAnalyticsService.getUserSegments(),
        AdminAnalyticsService.getGeographicDistribution(),
        AdminAnalyticsService.getAdminAchievements(),
        AdminAnalyticsService.getNorthStarMetric(),
        AdminAnalyticsService.getDAUOverTime(30),
        AdminAnalyticsService.getMAUOverTime(12),
        AdminAnalyticsService.getNewUsersOverTime(30),
        AdminAnalyticsService.getUserStats(),
        AdminAnalyticsService.getActiveUserMetrics(),
        AdminAnalyticsService.getFeatureUsage(),
        AdminAnalyticsService.getFeatureAdoptionFunnel(),
        AdminAnalyticsService.getSessionAnalytics(),
        AdminAnalyticsService.getSocialGraphMetrics(),
        AdminAnalyticsService.getSearchEffectiveness()
      ]);

      setPlatformStats(platformStatsData);
      setUserGrowth(userGrowthData);
      setEngagementMetrics(engagementMetricsData);
      setContentMetrics(contentMetricsData);
      setUserSegments(userSegmentsData);
      setGeographicDistribution(geographicDistributionData);
      setAchievements(achievementsData);
      setNorthStarMetric(northStarMetricData);
      setDauOverTime(dauOverTimeData);
      setMauOverTime(mauOverTimeData);
      setNewUsersOverTime(newUsersOverTimeData);
      setUserStats(userStatsData);
      setActiveUserMetrics(activeUserMetricsData);
      setFeatureUsage(featureUsageData);
      setFeatureAdoptionFunnel(featureAdoptionFunnelData);
      setSessionAnalytics(sessionAnalyticsData);
      setSocialGraphMetrics(socialGraphMetricsData);
      setSearchEffectiveness(searchEffectivenessData);
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
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--neutral-50)', paddingBottom: 'var(--spacing-bottom-nav, 32px)' }}>
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
            title="Daily Active Users"
            value={platformStats?.daily_active_users || 0}
            icon={<Activity className="w-6 h-6" />}
            subtitle="active today"
          />
          <MetricCard
            title="Monthly Active Users"
            value={platformStats?.monthly_active_users || 0}
            icon={<TrendingUp className="w-6 h-6" />}
            subtitle="last 30 days"
          />
          <MetricCard
            title="Active Users (10+ interactions)"
            value={activeUserMetrics?.total_active_users || 0}
            icon={<UserCheck className="w-6 h-6" />}
            subtitle="users with 10+ interactions"
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
                { id: 'active-users', label: 'Active Users', icon: UserCheck },
                { id: 'content', label: 'Content', icon: Calendar },
                { id: 'moderation', label: 'Moderation', icon: Flag },
                { id: 'achievements', label: 'Achievements', icon: Trophy },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    console.log('🔍 AdminAnalyticsDashboard: Tab clicked:', tab.id);
                    handleTabChange(tab.id as any);
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

            {/* Feature Usage Tracking */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <Zap className="w-5 h-5 text-purple-600" />
                <h3 className="text-lg font-semibold text-gray-900">Feature Usage</h3>
              </div>
              {featureUsage.length > 0 ? (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 font-medium text-gray-900">Feature</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-900">Category</th>
                          <th className="text-right py-3 px-4 font-medium text-gray-900">Total Uses</th>
                          <th className="text-right py-3 px-4 font-medium text-gray-900">Unique Users</th>
                          <th className="text-right py-3 px-4 font-medium text-gray-900">Last 7d</th>
                          <th className="text-right py-3 px-4 font-medium text-gray-900">Last 30d</th>
                          <th className="text-right py-3 px-4 font-medium text-gray-900">Growth</th>
                        </tr>
                      </thead>
                      <tbody>
                        {featureUsage.slice(0, 15).map((feature, index) => (
                          <tr key={feature.feature_name} className="border-b border-gray-100">
                            <td className="py-3 px-4 font-medium text-gray-900">{feature.feature_name}</td>
                            <td className="py-3 px-4 text-gray-600">
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-purple-100 text-purple-700">
                                {feature.feature_category}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right text-gray-600">{feature.total_uses.toLocaleString()}</td>
                            <td className="py-3 px-4 text-right text-gray-600">{feature.unique_users.toLocaleString()}</td>
                            <td className="py-3 px-4 text-right text-gray-600">{feature.uses_last_7d.toLocaleString()}</td>
                            <td className="py-3 px-4 text-right text-gray-600">{feature.uses_last_30d.toLocaleString()}</td>
                            <td className="py-3 px-4 text-right">
                              <span className={`font-semibold ${feature.growth_rate > 0 ? 'text-green-600' : feature.growth_rate < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                                {feature.growth_rate > 0 ? '+' : ''}{feature.growth_rate.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Zap className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No feature usage data available</p>
                </div>
              )}
            </div>

            {/* Feature Adoption Funnel */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <Target className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">Feature Adoption Funnel</h3>
              </div>
              {featureAdoptionFunnel.length > 0 ? (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 font-medium text-gray-900">Feature</th>
                          <th className="text-right py-3 px-4 font-medium text-gray-900">Discovery</th>
                          <th className="text-right py-3 px-4 font-medium text-gray-900">Trial</th>
                          <th className="text-right py-3 px-4 font-medium text-gray-900">Adoption</th>
                          <th className="text-right py-3 px-4 font-medium text-gray-900">Retention</th>
                          <th className="text-right py-3 px-4 font-medium text-gray-900">Discovery→Trial</th>
                          <th className="text-right py-3 px-4 font-medium text-gray-900">Trial→Adoption</th>
                          <th className="text-right py-3 px-4 font-medium text-gray-900">Adoption→Retention</th>
                        </tr>
                      </thead>
                      <tbody>
                        {featureAdoptionFunnel.map((funnel) => (
                          <tr key={funnel.feature_name} className="border-b border-gray-100">
                            <td className="py-3 px-4 font-medium text-gray-900">{funnel.feature_name}</td>
                            <td className="py-3 px-4 text-right text-gray-600">{funnel.discovery_count.toLocaleString()}</td>
                            <td className="py-3 px-4 text-right text-gray-600">{funnel.trial_count.toLocaleString()}</td>
                            <td className="py-3 px-4 text-right text-gray-600">{funnel.adoption_count.toLocaleString()}</td>
                            <td className="py-3 px-4 text-right text-gray-600">{funnel.retention_count.toLocaleString()}</td>
                            <td className="py-3 px-4 text-right">
                              <span className="font-semibold text-blue-600">{funnel.discovery_to_trial_rate.toFixed(1)}%</span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span className="font-semibold text-green-600">{funnel.trial_to_adoption_rate.toFixed(1)}%</span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span className="font-semibold text-purple-600">{funnel.adoption_to_retention_rate.toFixed(1)}%</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Target className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No feature adoption data available</p>
                </div>
              )}
            </div>

            {/* Search Effectiveness */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <Search className="w-5 h-5 text-green-600" />
                <h3 className="text-lg font-semibold text-gray-900">Search Effectiveness</h3>
              </div>
              {searchEffectiveness ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-blue-900 mb-1">Total Searches</p>
                      <p className="text-2xl font-bold text-blue-900">{searchEffectiveness.total_searches.toLocaleString()}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-green-900 mb-1">Search→Click Rate</p>
                      <p className="text-2xl font-bold text-green-900">{searchEffectiveness.search_to_click_rate.toFixed(1)}%</p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-purple-900 mb-1">Search→Interest Rate</p>
                      <p className="text-2xl font-bold text-purple-900">{searchEffectiveness.search_to_interest_rate.toFixed(1)}%</p>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-orange-900 mb-1">Unique Searchers</p>
                      <p className="text-2xl font-bold text-orange-900">{searchEffectiveness.unique_searchers.toLocaleString()}</p>
                    </div>
                  </div>

                  {searchEffectiveness.top_queries.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Top Search Queries</h4>
                      <div className="space-y-2">
                        {searchEffectiveness.top_queries.slice(0, 10).map((query, index) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-gradient-to-r from-green-400 to-blue-400 rounded-full flex items-center justify-center text-white text-xs font-bold">
                                {index + 1}
                              </div>
                              <span className="font-medium text-gray-900">{query.query}</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-sm text-gray-600">{query.count} searches</span>
                              <span className="text-sm font-semibold text-green-600">{query.click_rate.toFixed(1)}% click rate</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No search data available</p>
                </div>
              )}
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
            {/* Important User Stats */}
            {userStats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-600">Total Users</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-900">{userStats.total_users.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-1">All registered users</p>
                </div>
                <div className="bg-white rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <UserCheck className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-600">Verified Users</span>
                  </div>
                  <p className="text-2xl font-bold text-green-900">{userStats.verified_users.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {userStats.total_users > 0 
                      ? `${Math.round((userStats.verified_users / userStats.total_users) * 100)}% verified`
                      : '0% verified'}
                  </p>
                </div>
                <div className="bg-white rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-purple-600" />
                    <span className="text-sm font-medium text-purple-600">Active (7d)</span>
                  </div>
                  <p className="text-2xl font-bold text-purple-900">{userStats.active_users_7d.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-1">Active in last 7 days</p>
                </div>
                <div className="bg-white rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <UserPlus className="w-4 h-4 text-pink-600" />
                    <span className="text-sm font-medium text-pink-600">New (7d)</span>
                  </div>
                  <p className="text-2xl font-bold text-pink-900">{userStats.new_users_7d.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-1">New users this week</p>
                </div>
                <div className="bg-white rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-orange-600" />
                    <span className="text-sm font-medium text-orange-600">Active (30d)</span>
                  </div>
                  <p className="text-2xl font-bold text-orange-900">{userStats.active_users_30d.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-1">Active in last 30 days</p>
                </div>
                <div className="bg-white rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Star className="w-4 h-4 text-yellow-600" />
                    <span className="text-sm font-medium text-yellow-600">With Reviews</span>
                  </div>
                  <p className="text-2xl font-bold text-yellow-900">{userStats.users_with_reviews.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-1">Users who wrote reviews</p>
                </div>
                <div className="bg-white rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Heart className="w-4 h-4 text-red-600" />
                    <span className="text-sm font-medium text-red-600">With Friends</span>
                  </div>
                  <p className="text-2xl font-bold text-red-900">{userStats.users_with_friends.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-1">Users with connections</p>
                </div>
                <div className="bg-white rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-medium text-indigo-600">Avg Account Age</span>
                  </div>
                  <p className="text-2xl font-bold text-indigo-900">{Math.round(userStats.avg_account_age_days)}</p>
                  <p className="text-xs text-gray-500 mt-1">Days since registration</p>
                </div>
              </div>
            )}

            {/* Daily Active Users Chart */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Daily Active Users (DAU)</h3>
                <Activity className="w-5 h-5 text-blue-600" />
              </div>
              {dauOverTime.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={dauOverTime}>
                    <defs>
                      <linearGradient id="dauGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#6b7280"
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return `${date.getMonth() + 1}/${date.getDate()}`;
                      }}
                    />
                    <YAxis stroke="#6b7280" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                      labelFormatter={(value) => {
                        const date = new Date(value);
                        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#3b82f6" 
                      fillOpacity={1} 
                      fill="url(#dauGradient)"
                      name="Active Users"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8">
                  <Activity className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No DAU data available</p>
                </div>
              )}
            </div>

            {/* Monthly Active Users Chart */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Monthly Active Users (MAU)</h3>
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              {mauOverTime.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={mauOverTime}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#6b7280"
                      tickFormatter={(value) => {
                        const [year, month] = value.split('-');
                        return `${month}/${year.slice(2)}`;
                      }}
                    />
                    <YAxis stroke="#6b7280" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                      labelFormatter={(value) => {
                        const [year, month] = value.split('-');
                        const date = new Date(parseInt(year), parseInt(month) - 1);
                        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#10b981" 
                      strokeWidth={3}
                      dot={{ fill: '#10b981', r: 4 }}
                      name="Active Users"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8">
                  <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No MAU data available</p>
                </div>
              )}
            </div>

            {/* New Users Chart */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">New Users Over Time</h3>
                <UserPlus className="w-5 h-5 text-pink-600" />
              </div>
              {newUsersOverTime.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={newUsersOverTime}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#6b7280"
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return `${date.getMonth() + 1}/${date.getDate()}`;
                      }}
                    />
                    <YAxis stroke="#6b7280" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                      labelFormatter={(value) => {
                        const date = new Date(value);
                        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                      }}
                    />
                    <Bar 
                      dataKey="value" 
                      fill="#ec4899" 
                      radius={[8, 8, 0, 0]}
                      name="New Users"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8">
                  <UserPlus className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No new users data available</p>
                </div>
              )}
            </div>

            {/* User Geography Chart */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">User Geography</h3>
                <Globe className="w-5 h-5 text-indigo-600" />
              </div>
              {geographicDistribution.length > 0 ? (
                <div className="space-y-4">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart 
                      data={geographicDistribution.slice(0, 10)}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" stroke="#6b7280" />
                      <YAxis 
                        type="category" 
                        dataKey="city" 
                        stroke="#6b7280"
                        width={120}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                        formatter={(value: any) => [value.toLocaleString(), 'Users']}
                      />
                      <Bar 
                        dataKey="users" 
                        fill="#6366f1" 
                        radius={[0, 8, 8, 0]}
                        name="Users"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Top Cities by User Count</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {geographicDistribution.slice(0, 12).map((geo, index) => (
                        <div key={`${geo.city || 'Unknown'}-${geo.country}-${index}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-gradient-to-r from-indigo-400 to-purple-400 rounded-full flex items-center justify-center text-white text-xs font-bold">
                              {index + 1}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{geo.city || 'Unknown'}</p>
                              <p className="text-xs text-gray-500">{geo.country}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-gray-900">{geo.users.toLocaleString()}</p>
                            <p className="text-xs text-gray-500">users</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Globe className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No geographic data available</p>
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

            {/* Session Analytics */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <Activity className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg font-semibold text-gray-900">Session Analytics</h3>
              </div>
              {sessionAnalytics ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-blue-900 mb-1">Total Sessions</p>
                      <p className="text-2xl font-bold text-blue-900">{sessionAnalytics.total_sessions.toLocaleString()}</p>
                      <p className="text-xs text-blue-700 mt-1">All time</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-green-900 mb-1">Avg Duration</p>
                      <p className="text-2xl font-bold text-green-900">{sessionAnalytics.avg_session_duration_minutes.toFixed(1)} min</p>
                      <p className="text-xs text-green-700 mt-1">Per session</p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-purple-900 mb-1">Avg Pages</p>
                      <p className="text-2xl font-bold text-purple-900">{sessionAnalytics.avg_pages_per_session.toFixed(1)}</p>
                      <p className="text-xs text-purple-700 mt-1">Per session</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-orange-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-orange-900 mb-1">Sessions (7d)</p>
                      <p className="text-2xl font-bold text-orange-900">{sessionAnalytics.sessions_last_7d.toLocaleString()}</p>
                    </div>
                    <div className="bg-pink-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-pink-900 mb-1">Sessions (30d)</p>
                      <p className="text-2xl font-bold text-pink-900">{sessionAnalytics.sessions_last_30d.toLocaleString()}</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-red-900 mb-1">Bounce Rate</p>
                      <p className="text-2xl font-bold text-red-900">{sessionAnalytics.bounce_rate.toFixed(1)}%</p>
                      <p className="text-xs text-red-700 mt-1">1 page view only</p>
                    </div>
                  </div>

                  {sessionAnalytics.sessions_by_hour.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Sessions by Hour of Day</h4>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={sessionAnalytics.sessions_by_hour}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis 
                            dataKey="hour" 
                            stroke="#6b7280"
                            tickFormatter={(value) => {
                              const hour = value % 24;
                              return `${hour}:00`;
                            }}
                          />
                          <YAxis stroke="#6b7280" />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                            labelFormatter={(value) => `${value}:00`}
                            formatter={(value: any) => [value.toLocaleString(), 'Sessions']}
                          />
                          <Bar 
                            dataKey="session_count" 
                            fill="#6366f1" 
                            radius={[8, 8, 0, 0]}
                            name="Sessions"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Activity className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No session data available</p>
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
            {['users', 'content', 'platform'].map((category) => {
              const categoryAchievements = achievements.filter(a => a.category === category);
              const categoryLabels = {
                users: 'User Growth',
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

        {/* Active Users Tab */}
        {activeTab === 'active-users' && (
          <div className="space-y-6">
            {/* Active Users Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <UserCheck className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-600">Total Active Users</span>
                </div>
                <p className="text-2xl font-bold text-blue-900">{activeUserMetrics?.total_active_users || 0}</p>
                <p className="text-xs text-gray-500 mt-1">10+ interactions</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-600">Active (7d)</span>
                </div>
                <p className="text-2xl font-bold text-green-900">{activeUserMetrics?.active_users_7d || 0}</p>
                <p className="text-xs text-gray-500 mt-1">Last 7 days</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-600">Active (30d)</span>
                </div>
                <p className="text-2xl font-bold text-purple-900">{activeUserMetrics?.active_users_30d || 0}</p>
                <p className="text-xs text-gray-500 mt-1">Last 30 days</p>
              </div>
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4 text-orange-600" />
                  <span className="text-sm font-medium text-orange-600">Avg Interactions</span>
                </div>
                <p className="text-2xl font-bold text-orange-900">{activeUserMetrics?.avg_interactions_per_active_user || 0}</p>
                <p className="text-xs text-gray-500 mt-1">Per active user</p>
              </div>
            </div>

            {/* Verification Stats */}
            <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-6 shadow-sm border border-green-200">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <h3 className="text-xl font-bold text-gray-900">Verification Statistics</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600 mb-1">
                    {activeUserMetrics?.verification_stats.total_verified || 0}
                  </div>
                  <div className="text-sm text-gray-600">Verified Users</div>
                  <div className="text-xs text-gray-500">
                    {activeUserMetrics?.total_active_users > 0 
                      ? `${Math.round((activeUserMetrics.verification_stats.total_verified / activeUserMetrics.total_active_users) * 100)}% of active users`
                      : '0%'}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-1">
                    {activeUserMetrics?.verification_stats.avg_trust_score || 0}%
                  </div>
                  <div className="text-sm text-gray-600">Avg Trust Score</div>
                  <div className="text-xs text-gray-500">Across active users</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600 mb-1">
                    {activeUserMetrics?.verification_stats.avg_verification_progress || 0}/8
                  </div>
                  <div className="text-sm text-gray-600">Avg Progress</div>
                  <div className="text-xs text-gray-500">Criteria met</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600 mb-1">
                    {activeUserMetrics?.verification_stats.users_near_verification || 0}
                  </div>
                  <div className="text-sm text-gray-600">Near Verification</div>
                  <div className="text-xs text-gray-500">40%+ trust score</div>
                </div>
              </div>
            </div>

            {/* Social Graph Metrics */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <Heart className="w-5 h-5 text-pink-600" />
                <h3 className="text-lg font-semibold text-gray-900">Social Graph Metrics</h3>
              </div>
              {socialGraphMetrics ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-pink-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-pink-900 mb-1">Total Connections</p>
                      <p className="text-2xl font-bold text-pink-900">{socialGraphMetrics.total_connections.toLocaleString()}</p>
                      <p className="text-xs text-pink-700 mt-1">Friendships</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-blue-900 mb-1">Avg Connections</p>
                      <p className="text-2xl font-bold text-blue-900">{socialGraphMetrics.avg_connections_per_user.toFixed(1)}</p>
                      <p className="text-xs text-blue-700 mt-1">Per user</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-green-900 mb-1">Network Density</p>
                      <p className="text-2xl font-bold text-green-900">{socialGraphMetrics.network_density.toFixed(2)}%</p>
                      <p className="text-xs text-green-700 mt-1">Connectedness</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-purple-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-purple-900 mb-1">With Connections</p>
                      <p className="text-2xl font-bold text-purple-900">{socialGraphMetrics.users_with_connections.toLocaleString()}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-gray-900 mb-1">Without Connections</p>
                      <p className="text-2xl font-bold text-gray-900">{socialGraphMetrics.users_without_connections.toLocaleString()}</p>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-orange-900 mb-1">Avg Degree</p>
                      <p className="text-2xl font-bold text-orange-900">{socialGraphMetrics.avg_connection_degree.toFixed(1)}</p>
                    </div>
                    <div className="bg-indigo-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-indigo-900 mb-1">Growth Rate</p>
                      <p className="text-2xl font-bold text-indigo-900">
                        {socialGraphMetrics.connection_growth_rate > 0 ? '+' : ''}
                        {socialGraphMetrics.connection_growth_rate.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Heart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No social graph data available</p>
                </div>
              )}
            </div>

            {/* Verification Management Component */}
            {user && (
              <div className="bg-white rounded-xl shadow-sm">
                <VerificationManagement currentUserId={user.id} />
              </div>
            )}

            {/* Geographic Distribution */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Geographic Distribution</h3>
                <Globe className="w-5 h-5 text-indigo-600" />
              </div>
              {activeUserMetrics?.geographic_distribution && activeUserMetrics.geographic_distribution.length > 0 ? (
                <div className="space-y-4">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart 
                      data={activeUserMetrics.geographic_distribution.slice(0, 10)}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" stroke="#6b7280" />
                      <YAxis 
                        type="category" 
                        dataKey="city" 
                        stroke="#6b7280"
                        width={120}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                        formatter={(value: any) => [value.toLocaleString(), 'Users']}
                      />
                      <Bar 
                        dataKey="users" 
                        fill="#6366f1" 
                        radius={[0, 8, 8, 0]}
                        name="Users"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Top Cities by Active Users</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {activeUserMetrics.geographic_distribution.slice(0, 12).map((geo, index) => (
                        <div key={`${geo.city || 'Unknown'}-${geo.country}-${index}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-gradient-to-r from-indigo-400 to-purple-400 rounded-full flex items-center justify-center text-white text-xs font-bold">
                              {index + 1}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{geo.city || 'Unknown'}</p>
                              <p className="text-xs text-gray-500">{geo.country}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-gray-900">{geo.users.toLocaleString()}</p>
                            <p className="text-xs text-gray-500">users</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Globe className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No geographic data available</p>
                </div>
              )}
            </div>

            {/* Time Series Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Daily Active Users</h3>
                  <Activity className="w-5 h-5 text-blue-600" />
                </div>
                {activeUserMetrics?.time_series_data.daily && activeUserMetrics.time_series_data.daily.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={activeUserMetrics.time_series_data.daily}>
                      <defs>
                        <linearGradient id="dauGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="date" 
                        stroke="#6b7280"
                        tickFormatter={(value) => {
                          const date = new Date(value);
                          return `${date.getMonth() + 1}/${date.getDate()}`;
                        }}
                      />
                      <YAxis stroke="#6b7280" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#3b82f6" 
                        fillOpacity={1} 
                        fill="url(#dauGradient)"
                        name="Active Users"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-8">
                    <Activity className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No data available</p>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Weekly Active Users</h3>
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                {activeUserMetrics?.time_series_data.weekly && activeUserMetrics.time_series_data.weekly.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={activeUserMetrics.time_series_data.weekly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="date" 
                        stroke="#6b7280"
                        tickFormatter={(value) => {
                          const date = new Date(value);
                          return `${date.getMonth() + 1}/${date.getDate()}`;
                        }}
                      />
                      <YAxis stroke="#6b7280" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#10b981" 
                        strokeWidth={3}
                        dot={{ fill: '#10b981', r: 4 }}
                        name="Active Users"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-8">
                    <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No data available</p>
                  </div>
                )}
              </div>
            </div>
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
