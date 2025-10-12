import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { CreatorAnalyticsService, CreatorStats, FanInsight, GeographicInsight, ContentPerformance, CreatorAchievement } from '../../services/creatorAnalyticsService';
import { MetricCard } from '../../components/analytics/shared/MetricCard';
import { TopListCard } from '../../components/analytics/shared/TopListCard';
import { AchievementCard } from '../../components/analytics/shared/AchievementCard';
import { SkeletonCard } from '../../components/analytics/shared/SkeletonCard';
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

export default function CreatorAnalyticsDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [fanInsights, setFanInsights] = useState<FanInsight[]>([]);
  const [geographicInsights, setGeographicInsights] = useState<GeographicInsight[]>([]);
  const [contentPerformance, setContentPerformance] = useState<ContentPerformance[]>([]);
  const [achievements, setAchievements] = useState<CreatorAchievement[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'fans' | 'content' | 'achievements'>('overview');

  useEffect(() => {
    if (user) {
      fetchCreatorData();
    }
  }, [user]);

  const fetchCreatorData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      // For now, use user ID as creator ID - in real app, this would be the artist/creator profile ID
      const creatorId = user.id;
      
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
    } catch (error) {
      console.error('Error fetching creator data:', error);
    } finally {
      setLoading(false);
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
    <div className="min-h-screen bg-gray-50 p-6">
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
            trend={stats?.fan_growth_rate || 0}
            trendLabel="growth this month"
            color="purple"
          />
          <MetricCard
            title="Engagement Rate"
            value={`${stats?.engagement_rate || 0}%`}
            icon={<TrendingUp className="w-6 h-6" />}
            trend={stats?.engagement_rate || 0}
            trendLabel="interactions per follower"
            color="pink"
          />
          <MetricCard
            title="Event Views"
            value={stats?.total_event_views || 0}
            icon={<Eye className="w-6 h-6" />}
            trend={0}
            trendLabel="total views"
            color="blue"
          />
          <MetricCard
            title="Fan Reviews"
            value={stats?.total_reviews || 0}
            icon={<Star className="w-6 h-6" />}
            trend={0}
            trendLabel="reviews received"
            color="yellow"
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
                { id: 'achievements', label: 'Achievements', icon: Trophy },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
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
      </div>
    </div>
  );
}
