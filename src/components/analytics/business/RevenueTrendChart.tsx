import React from 'react';
import { RevenueInsight } from '../../../services/businessAnalyticsService';
import { DollarSign, TrendingUp, TrendingDown, Target, Calendar } from 'lucide-react';

interface RevenueTrendChartProps {
  insights: RevenueInsight[];
  className?: string;
}

export function RevenueTrendChart({ insights, className = '' }: RevenueTrendChartProps) {
  if (insights.length === 0) {
    return (
      <div className={`bg-white rounded-xl p-6 shadow-sm ${className}`}>
        <div className="text-center py-12">
          <DollarSign className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Revenue Data</h3>
          <p className="text-gray-600">
            Start hosting events to see your revenue trends
          </p>
        </div>
      </div>
    );
  }

  // Calculate summary stats
  const totalRevenue = insights.reduce((sum, insight) => sum + insight.revenue, 0);
  const totalTicketClicks = insights.reduce((sum, insight) => sum + insight.ticket_clicks, 0);
  const avgConversionRate = insights.reduce((sum, insight) => sum + insight.conversion_rate, 0) / insights.length;
  const avgTicketPrice = totalTicketClicks > 0 ? totalRevenue / totalTicketClicks : 0;

  // Find best and worst performing days
  const bestDay = insights.reduce((best, current) => 
    current.revenue > best.revenue ? current : best
  );
  const worstDay = insights.reduce((worst, current) => 
    current.revenue < worst.revenue ? current : worst
  );

  // Calculate trend (simple comparison of first half vs second half)
  const midpoint = Math.floor(insights.length / 2);
  const firstHalfRevenue = insights.slice(0, midpoint).reduce((sum, insight) => sum + insight.revenue, 0);
  const secondHalfRevenue = insights.slice(midpoint).reduce((sum, insight) => sum + insight.revenue, 0);
  const trendDirection = secondHalfRevenue > firstHalfRevenue ? 'up' : 'down';
  const trendPercentage = firstHalfRevenue > 0 
    ? Math.abs(((secondHalfRevenue - firstHalfRevenue) / firstHalfRevenue) * 100) 
    : 0;

  // Simple chart visualization
  const maxRevenue = Math.max(...insights.map(i => i.revenue));
  const maxClicks = Math.max(...insights.map(i => i.ticket_clicks));

  return (
    <div className={`bg-white rounded-xl p-6 shadow-sm ${className}`}>
      <div className="flex items-center gap-2 mb-6">
        <DollarSign className="w-5 h-5 text-green-600" />
        <h3 className="text-lg font-semibold text-gray-900">Revenue Trends</h3>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-600">Total Revenue</span>
          </div>
          <p className="text-2xl font-bold text-green-900">${totalRevenue.toLocaleString()}</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-600">Avg Conversion</span>
          </div>
          <p className="text-2xl font-bold text-blue-900">{avgConversionRate.toFixed(1)}%</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium text-purple-600">Ticket Clicks</span>
          </div>
          <p className="text-2xl font-bold text-purple-900">{totalTicketClicks}</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-yellow-600" />
            <span className="text-sm font-medium text-yellow-600">Avg Price</span>
          </div>
          <p className="text-2xl font-bold text-yellow-900">${avgTicketPrice.toFixed(0)}</p>
        </div>
      </div>

      {/* Trend Indicator */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {trendDirection === 'up' ? (
                <TrendingUp className="w-4 h-4 text-green-600" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-600" />
              )}
              <span className={`text-sm font-medium ${trendDirection === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                Revenue Trend
              </span>
            </div>
            <p className="text-lg font-semibold text-gray-900">
              {trendDirection === 'up' ? '+' : '-'}{trendPercentage.toFixed(1)}% 
              <span className="text-sm text-gray-600 ml-2">
                {insights.length > 10 ? 'last 30 days' : `last ${insights.length} days`}
              </span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Best Day</p>
            <p className="font-semibold text-gray-900">
              {new Date(bestDay.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
            <p className="text-sm text-gray-600">${bestDay.revenue}</p>
          </div>
        </div>
      </div>

      {/* Daily Performance Chart */}
      <div className="mb-6">
        <h4 className="font-semibold text-gray-900 mb-4">Daily Revenue Performance</h4>
        <div className="space-y-2">
          {insights.slice(-14).map((insight) => (
            <div key={insight.date} className="flex items-center gap-4">
              <div className="w-20 text-sm text-gray-600">
                {new Date(insight.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              <div className="flex-1 flex items-center gap-2">
                {/* Revenue Bar */}
                <div className="flex-1 bg-gray-200 rounded-full h-3 relative">
                  <div
                    className="bg-green-500 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${(insight.revenue / maxRevenue) * 100}%` }}
                  />
                  <span className="absolute right-2 top-0 text-xs text-gray-600 leading-3">
                    ${insight.revenue}
                  </span>
                </div>
                {/* Ticket Clicks Bar */}
                <div className="flex-1 bg-gray-200 rounded-full h-3 relative">
                  <div
                    className="bg-blue-500 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${(insight.ticket_clicks / maxClicks) * 100}%` }}
                  />
                  <span className="absolute right-2 top-0 text-xs text-gray-600 leading-3">
                    {insight.ticket_clicks}
                  </span>
                </div>
              </div>
              <div className="w-16 text-right">
                <span className="text-sm font-medium text-gray-900">{insight.conversion_rate}%</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
          <div className="w-20"></div>
          <div className="flex-1 flex items-center gap-2">
            <div className="flex-1 text-center">Revenue ($)</div>
            <div className="flex-1 text-center">Ticket Clicks</div>
          </div>
          <div className="w-16 text-center">Conversion</div>
        </div>
      </div>

      {/* Performance Insights */}
      <div className="border-t border-gray-200 pt-4">
        <h4 className="font-semibold text-gray-900 mb-3">Revenue Insights</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-sm font-medium text-green-900">Peak Revenue Day</p>
            <p className="text-xs text-green-700">
              {new Date(bestDay.date).toLocaleDateString()} with ${bestDay.revenue}
            </p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-sm font-medium text-blue-900">Conversion Performance</p>
            <p className="text-xs text-blue-700">
              Average {avgConversionRate.toFixed(1)}% conversion rate
            </p>
          </div>
          <div className="bg-purple-50 rounded-lg p-3">
            <p className="text-sm font-medium text-purple-900">Ticket Pricing</p>
            <p className="text-xs text-purple-700">
              Average ticket price ${avgTicketPrice.toFixed(0)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
