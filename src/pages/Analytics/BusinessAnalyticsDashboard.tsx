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
  const [activeTab, setActiveTab] = useState<'overview' | 'revenue' | 'customers' | 'events' | 'achievements'>('overview');

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
    } catch (error) {
      console.error('Error fetching business data:', error);
    } finally {
      setLoading(false);
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
            trend={0}
            trendLabel="events hosted"
            color="blue"
          />
          <MetricCard
            title="Total Revenue"
            value={`$${(stats?.total_revenue || 0).toLocaleString()}`}
            icon={<DollarSign className="w-6 h-6" />}
            trend={stats?.revenue_growth_rate || 0}
            trendLabel="growth this month"
            color="green"
          />
          <MetricCard
            title="Conversion Rate"
            value={`${stats?.conversion_rate || 0}%`}
            icon={<Target className="w-6 h-6" />}
            trend={stats?.conversion_rate || 0}
            trendLabel="views to clicks"
            color="purple"
          />
          <MetricCard
            title="Customer Satisfaction"
            value={`${stats?.customer_satisfaction || 0}/5`}
            icon={<Star className="w-6 h-6" />}
            trend={stats?.customer_satisfaction || 0}
            trendLabel="average rating"
            color="yellow"
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
      </div>
    </div>
  );
}
