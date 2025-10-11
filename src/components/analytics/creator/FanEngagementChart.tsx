import React from 'react';
import { ContentPerformance } from '../../../services/creatorAnalyticsService';
import { TrendingUp, Eye, Users, Calendar } from 'lucide-react';

interface FanEngagementChartProps {
  performance: ContentPerformance[];
  className?: string;
}

export function FanEngagementChart({ performance, className = '' }: FanEngagementChartProps) {
  if (performance.length === 0) {
    return (
      <div className={`bg-white rounded-xl p-6 shadow-sm ${className}`}>
        <div className="text-center py-12">
          <TrendingUp className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Performance Data</h3>
          <p className="text-gray-600">
            Start creating content to see your engagement trends
          </p>
        </div>
      </div>
    );
  }

  // Calculate summary stats
  const totalViews = performance.reduce((sum, p) => sum + p.event_views, 0);
  const totalVisits = performance.reduce((sum, p) => sum + p.profile_visits, 0);
  const totalGains = performance.reduce((sum, p) => sum + p.follower_gains, 0);
  const avgEngagement = performance.reduce((sum, p) => sum + p.engagement_rate, 0) / performance.length;

  // Find peak performance day
  const peakDay = performance.reduce((peak, current) => 
    current.event_views > peak.event_views ? current : peak
  );

  // Simple chart visualization (in a real app, you'd use a charting library like Chart.js or Recharts)
  const maxViews = Math.max(...performance.map(p => p.event_views));
  const maxVisits = Math.max(...performance.map(p => p.profile_visits));

  return (
    <div className={`bg-white rounded-xl p-6 shadow-sm ${className}`}>
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="w-5 h-5 text-purple-600" />
        <h3 className="text-lg font-semibold text-gray-900">Fan Engagement Trends</h3>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-600">Total Views</span>
          </div>
          <p className="text-2xl font-bold text-blue-900">{totalViews.toLocaleString()}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-600">Profile Visits</span>
          </div>
          <p className="text-2xl font-bold text-green-900">{totalVisits.toLocaleString()}</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium text-purple-600">Follower Gains</span>
          </div>
          <p className="text-2xl font-bold text-purple-900">{totalGains.toLocaleString()}</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-yellow-600" />
            <span className="text-sm font-medium text-yellow-600">Avg Engagement</span>
          </div>
          <p className="text-2xl font-bold text-yellow-900">{avgEngagement.toFixed(1)}%</p>
        </div>
      </div>

      {/* Peak Performance Highlight */}
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-purple-600" />
          <span className="text-sm font-medium text-purple-600">Peak Performance Day</span>
        </div>
        <p className="text-lg font-semibold text-gray-900">
          {new Date(peakDay.date).toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
        </p>
        <p className="text-sm text-gray-600">
          {peakDay.event_views} event views • {peakDay.profile_visits} profile visits • {peakDay.engagement_rate}% engagement
        </p>
      </div>

      {/* Simple Chart Visualization */}
      <div className="mb-6">
        <h4 className="font-semibold text-gray-900 mb-4">Daily Performance</h4>
        <div className="space-y-2">
          {performance.slice(-7).map((day) => (
            <div key={day.date} className="flex items-center gap-4">
              <div className="w-20 text-sm text-gray-600">
                {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              <div className="flex-1 flex items-center gap-2">
                {/* Event Views Bar */}
                <div className="flex-1 bg-gray-200 rounded-full h-3 relative">
                  <div
                    className="bg-blue-500 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${(day.event_views / maxViews) * 100}%` }}
                  />
                  <span className="absolute right-2 top-0 text-xs text-gray-600 leading-3">
                    {day.event_views}
                  </span>
                </div>
                {/* Profile Visits Bar */}
                <div className="flex-1 bg-gray-200 rounded-full h-3 relative">
                  <div
                    className="bg-green-500 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${(day.profile_visits / maxVisits) * 100}%` }}
                  />
                  <span className="absolute right-2 top-0 text-xs text-gray-600 leading-3">
                    {day.profile_visits}
                  </span>
                </div>
              </div>
              <div className="w-16 text-right">
                <span className="text-sm font-medium text-gray-900">{day.engagement_rate}%</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
          <div className="w-20"></div>
          <div className="flex-1 flex items-center gap-2">
            <div className="flex-1 text-center">Event Views</div>
            <div className="flex-1 text-center">Profile Visits</div>
          </div>
          <div className="w-16 text-center">Engagement</div>
        </div>
      </div>

      {/* Performance Insights */}
      <div className="border-t border-gray-200 pt-4">
        <h4 className="font-semibold text-gray-900 mb-3">Performance Insights</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-sm font-medium text-blue-900">Best Day for Views</p>
            <p className="text-xs text-blue-700">
              {new Date(peakDay.date).toLocaleDateString()} with {peakDay.event_views} views
            </p>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-sm font-medium text-green-900">Consistent Engagement</p>
            <p className="text-xs text-green-700">
              Average {avgEngagement.toFixed(1)}% engagement rate over {performance.length} days
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
