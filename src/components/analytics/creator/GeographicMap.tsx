import React from 'react';
import { GeographicInsight } from '../../../services/creatorAnalyticsService';
import { MapPin, Users, Calendar } from 'lucide-react';

interface GeographicMapProps {
  insights: GeographicInsight[];
  className?: string;
}

export function GeographicMap({ insights, className = '' }: GeographicMapProps) {
  if (insights.length === 0) {
    return (
      <div className={`bg-white rounded-xl p-6 shadow-sm ${className}`}>
        <div className="text-center py-12">
          <MapPin className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Geographic Data</h3>
          <p className="text-gray-600">
            Start performing at venues to see your geographic reach
          </p>
        </div>
      </div>
    );
  }

  // Group insights by state for better visualization
  const stateData = insights.reduce((acc, insight) => {
    const state = insight.state;
    if (!acc[state]) {
      acc[state] = {
        state,
        totalFans: 0,
        totalEvents: 0,
        cities: [],
        engagementRate: 0,
      };
    }
    acc[state].totalFans += insight.fan_count;
    acc[state].totalEvents += insight.event_count;
    acc[state].cities.push(insight.city);
    acc[state].engagementRate = Math.max(acc[state].engagementRate, insight.engagement_rate);
    return acc;
  }, {} as Record<string, {
    state: string;
    totalFans: number;
    totalEvents: number;
    cities: string[];
    engagementRate: number;
  }>);

  const sortedStates = Object.values(stateData).sort((a, b) => b.totalFans - a.totalFans);

  return (
    <div className={`bg-white rounded-xl p-6 shadow-sm ${className}`}>
      <div className="flex items-center gap-2 mb-6">
        <MapPin className="w-5 h-5 text-purple-600" />
        <h3 className="text-lg font-semibold text-gray-900">Geographic Reach</h3>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium text-purple-600">States Reached</span>
          </div>
          <p className="text-2xl font-bold text-purple-900">{sortedStates.length}</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-600">Total Fans</span>
          </div>
          <p className="text-2xl font-bold text-blue-900">
            {insights.reduce((sum, insight) => sum + insight.fan_count, 0)}
          </p>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-600">Total Events</span>
          </div>
          <p className="text-2xl font-bold text-green-900">
            {insights.reduce((sum, insight) => sum + insight.event_count, 0)}
          </p>
        </div>
      </div>

      {/* State Breakdown */}
      <div className="space-y-4">
        <h4 className="font-semibold text-gray-900">Performance by State</h4>
        {sortedStates.map((stateData, index) => (
          <div key={stateData.state} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-sm font-semibold text-purple-600">
                  {index + 1}
                </div>
                <div>
                  <h5 className="font-semibold text-gray-900">{stateData.state}</h5>
                  <p className="text-sm text-gray-500">
                    {stateData.cities.length} cit{stateData.cities.length === 1 ? 'y' : 'ies'}: {stateData.cities.join(', ')}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-900">{stateData.totalFans} fans</p>
                <p className="text-sm text-gray-500">{stateData.totalEvents} events</p>
              </div>
            </div>
            
            {/* Engagement Bar */}
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(stateData.engagementRate * 4, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Engagement Rate: {stateData.engagementRate.toFixed(1)}%
            </p>
          </div>
        ))}
      </div>

      {/* City Details */}
      <div className="mt-6">
        <h4 className="font-semibold text-gray-900 mb-4">City Performance</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {insights.slice(0, 8).map((insight) => (
            <div key={`${insight.city}-${insight.state}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">{insight.city}</p>
                <p className="text-sm text-gray-500">{insight.state}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-900">{insight.fan_count}</p>
                <p className="text-sm text-gray-500">fans</p>
              </div>
            </div>
          ))}
        </div>
        {insights.length > 8 && (
          <p className="text-sm text-gray-500 mt-3 text-center">
            And {insights.length - 8} more cities...
          </p>
        )}
      </div>
    </div>
  );
}
