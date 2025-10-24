/**
 * Revenue Attribution Chart
 * 
 * Displays revenue sources and attribution with confidence scores and trends.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  DollarSign, 
  TrendingUp, 
  Target,
  PieChart,
  BarChart3,
  AlertCircle
} from 'lucide-react';

interface RevenueSource {
  source: string;
  revenue: number;
  percentage: number;
  confidence_score: number;
  trend?: number;
  attribution_window: number;
}

interface RevenueAttributionChartProps {
  sources: RevenueSource[];
  totalRevenue: number;
  title?: string;
  showConfidenceScores?: boolean;
  showTrends?: boolean;
  className?: string;
}

export function RevenueAttributionChart({ 
  sources, 
  totalRevenue,
  title = "Revenue Attribution",
  showConfidenceScores = true,
  showTrends = true,
  className = ""
}: RevenueAttributionChartProps) {
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getConfidenceColor = (score: number): string => {
    if (score >= 0.8) return 'text-green-600 bg-green-50';
    if (score >= 0.6) return 'text-yellow-600 bg-yellow-50';
    if (score >= 0.4) return 'text-orange-600 bg-orange-50';
    return 'text-red-600 bg-red-50';
  };

  const getConfidenceLabel = (score: number): string => {
    if (score >= 0.8) return 'High';
    if (score >= 0.6) return 'Medium';
    if (score >= 0.4) return 'Low';
    return 'Very Low';
  };

  const getSourceColor = (index: number): string => {
    const colors = [
      'from-blue-500 to-blue-600',
      'from-green-500 to-green-600',
      'from-purple-500 to-purple-600',
      'from-pink-500 to-pink-600',
      'from-yellow-500 to-yellow-600',
      'from-indigo-500 to-indigo-600'
    ];
    return colors[index % colors.length];
  };

  const getTrendIcon = (trend?: number) => {
    if (!trend) return null;
    return (
      <div className={`flex items-center gap-1 ${
        trend > 0 ? 'text-green-600' : 'text-red-600'
      }`}>
        <TrendingUp className={`w-3 h-3 ${trend < 0 ? 'rotate-180' : ''}`} />
        <span className="text-xs">{Math.abs(trend).toFixed(1)}%</span>
      </div>
    );
  };

  return (
    <Card className={`glass-card inner-glow ${className}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-synth-pink" />
            {title}
          </CardTitle>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</p>
            <p className="text-sm text-gray-600">Total Revenue</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Revenue Sources */}
        <div className="space-y-3">
          {sources.map((source, index) => (
            <div key={source.source} className="p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 bg-gradient-to-r ${getSourceColor(index)} rounded-full flex items-center justify-center`}>
                    <DollarSign className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 capitalize">{source.source}</h4>
                    <p className="text-sm text-gray-600">
                      {source.attribution_window}h attribution window
                    </p>
                  </div>
                </div>
                
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">
                    {formatCurrency(source.revenue)}
                  </p>
                  <p className="text-sm text-gray-600">
                    {source.percentage.toFixed(1)}% of total
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-3">
                <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full bg-gradient-to-r ${getSourceColor(index)} transition-all duration-500`}
                    style={{ width: `${source.percentage}%` }}
                  />
                </div>
              </div>

              {/* Metrics Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {showConfidenceScores && (
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${getConfidenceColor(source.confidence_score)}`}
                    >
                      {getConfidenceLabel(source.confidence_score)} Confidence
                    </Badge>
                  )}
                  
                  {showTrends && getTrendIcon(source.trend)}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600">
                    Confidence: {(source.confidence_score * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className="p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <PieChart className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">Top Source</span>
            </div>
            <p className="text-lg font-bold text-blue-900">
              {sources[0]?.source || 'N/A'}
            </p>
            <p className="text-xs text-blue-700">
              {sources[0]?.percentage.toFixed(1)}% of revenue
            </p>
          </div>

          <div className="p-3 bg-green-50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-900">Avg Confidence</span>
            </div>
            <p className="text-lg font-bold text-green-900">
              {((sources.reduce((sum, s) => sum + s.confidence_score, 0) / sources.length) * 100).toFixed(0)}%
            </p>
            <p className="text-xs text-green-700">
              Data quality score
            </p>
          </div>
        </div>

        {/* Data Quality Warning */}
        {sources.some(s => s.confidence_score < 0.5) && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-600" />
              <span className="text-sm font-medium text-yellow-900">
                Data Quality Notice
              </span>
            </div>
            <p className="text-xs text-yellow-800 mt-1">
              Some revenue sources have low confidence scores. Consider improving data collection for more accurate attribution.
            </p>
          </div>
        )}

        {/* Attribution Insights */}
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Attribution Insights</h4>
          <div className="space-y-1">
            {sources
              .filter(s => s.percentage > 20)
              .map((source, index) => (
                <div key={index} className="flex items-center justify-between text-xs">
                  <span className="text-gray-700">
                    {source.source} drives {source.percentage.toFixed(1)}% of revenue
                  </span>
                  <span className="text-gray-600">
                    {source.attribution_window}h window
                  </span>
                </div>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
