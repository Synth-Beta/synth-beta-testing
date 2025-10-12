import React from 'react';
import { CustomerInsight } from '../../../services/businessAnalyticsService';
import { Users, Star, Repeat, DollarSign, TrendingUp } from 'lucide-react';

interface CustomerSegmentationProps {
  insights: CustomerInsight[];
  className?: string;
}

export function CustomerSegmentation({ insights, className = '' }: CustomerSegmentationProps) {
  if (insights.length === 0) {
    return (
      <div className={`bg-white rounded-xl p-6 shadow-sm ${className}`}>
        <div className="text-center py-12">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Customer Data</h3>
          <p className="text-gray-600">
            Start hosting events to see your customer segmentation
          </p>
        </div>
      </div>
    );
  }

  // Calculate total customers
  const totalCustomers = insights.reduce((sum, insight) => sum + insight.count, 0);
  const totalRevenue = insights.reduce((sum, insight) => sum + (insight.count * insight.avg_spending), 0);
  const avgLoyaltyScore = insights.reduce((sum, insight) => sum + insight.loyalty_score, 0) / insights.length;

  // Find the most valuable segment
  const mostValuableSegment = insights.reduce((best, current) => 
    current.loyalty_score > best.loyalty_score ? current : best
  );

  // Calculate segment distribution for pie chart visualization
  const segmentColors = {
    'New Customers': 'bg-blue-500',
    'Regular Customers': 'bg-green-500',
    'VIP Customers': 'bg-purple-500',
  };

  return (
    <div className={`bg-white rounded-xl p-6 shadow-sm ${className}`}>
      <div className="flex items-center gap-2 mb-6">
        <Users className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-semibold text-gray-900">Customer Segmentation</h3>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-600">Total Customers</span>
          </div>
          <p className="text-2xl font-bold text-blue-900">{totalCustomers.toLocaleString()}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-600">Total Value</span>
          </div>
          <p className="text-2xl font-bold text-green-900">${totalRevenue.toLocaleString()}</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium text-purple-600">Avg Loyalty</span>
          </div>
          <p className="text-2xl font-bold text-purple-900">{avgLoyaltyScore.toFixed(1)}</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-yellow-600" />
            <span className="text-sm font-medium text-yellow-600">Top Segment</span>
          </div>
          <p className="text-2xl font-bold text-yellow-900">{mostValuableSegment.customer_segment}</p>
        </div>
      </div>

      {/* Segment Distribution */}
      <div className="mb-6">
        <h4 className="font-semibold text-gray-900 mb-4">Customer Distribution</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {insights.map((insight) => {
            const colorClass = segmentColors[insight.customer_segment as keyof typeof segmentColors] || 'bg-gray-500';
            const segmentRevenue = insight.count * insight.avg_spending;
            
            return (
              <div key={insight.customer_segment} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${colorClass}`}></div>
                    <h5 className="font-semibold text-gray-900">{insight.customer_segment}</h5>
                  </div>
                  <span className="text-sm text-gray-500">{insight.percentage}%</span>
                </div>
                
                {/* Progress bar */}
                <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                  <div
                    className={`h-2 rounded-full ${colorClass} transition-all duration-300`}
                    style={{ width: `${insight.percentage}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-gray-500">Customers</p>
                    <p className="font-semibold text-gray-900">{insight.count}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Revenue</p>
                    <p className="font-semibold text-gray-900">${segmentRevenue.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Avg Events</p>
                    <p className="font-semibold text-gray-900">{insight.avg_events_attended}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Loyalty</p>
                    <p className="font-semibold text-gray-900">{insight.loyalty_score}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed Table */}
      <div className="mb-6">
        <h4 className="font-semibold text-gray-900 mb-4">Segment Details</h4>
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
              {insights.map((insight) => (
                <tr key={insight.customer_segment} className="border-b border-gray-100">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${segmentColors[insight.customer_segment as keyof typeof segmentColors] || 'bg-gray-500'}`}></div>
                      <span className="font-medium text-gray-900">{insight.customer_segment}</span>
                    </div>
                  </td>
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
      </div>

      {/* Customer Insights */}
      <div className="border-t border-gray-200 pt-4">
        <h4 className="font-semibold text-gray-900 mb-3">Customer Insights</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-sm font-medium text-blue-900">Most Valuable Segment</p>
            <p className="text-xs text-blue-700">
              {mostValuableSegment.customer_segment} with {mostValuableSegment.loyalty_score} loyalty score
            </p>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-sm font-medium text-green-900">Revenue Potential</p>
            <p className="text-xs text-green-700">
              ${totalRevenue.toLocaleString()} total customer value across all segments
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
