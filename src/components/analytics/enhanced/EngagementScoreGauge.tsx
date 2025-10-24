/**
 * Engagement Score Gauge
 * 
 * Visualizes engagement score with interactive gauge and detailed metrics.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Activity, 
  TrendingUp, 
  Clock,
  MousePointer,
  Eye,
  Heart
} from 'lucide-react';

interface EngagementMetrics {
  score: number;
  sessionDuration: number;
  interactionCount: number;
  pageViews: number;
  likes: number;
  shares: number;
  comments: number;
  bounceRate: number;
}

interface EngagementScoreGaugeProps {
  metrics: EngagementMetrics;
  title?: string;
  showBreakdown?: boolean;
  previousScore?: number;
  className?: string;
}

export function EngagementScoreGauge({ 
  metrics, 
  title = "Engagement Score",
  showBreakdown = true,
  previousScore,
  className = ""
}: EngagementScoreGaugeProps) {
  const getScoreColor = (score: number): string => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    if (score >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  const getScoreLabel = (score: number): string => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Poor';
  };

  const getScoreDescription = (score: number): string => {
    if (score >= 80) return 'Outstanding engagement! Users are highly active and invested.';
    if (score >= 60) return 'Good engagement levels. Room for improvement in some areas.';
    if (score >= 40) return 'Moderate engagement. Focus on improving user experience.';
    return 'Low engagement. Significant improvements needed to retain users.';
  };

  const calculateTrend = (current: number, previous?: number): { value: number; isPositive: boolean } => {
    if (!previous) return { value: 0, isPositive: true };
    const change = current - previous;
    return { value: Math.abs(change), isPositive: change >= 0 };
  };

  const trend = previousScore ? calculateTrend(metrics.score, previousScore) : null;

  // Calculate gauge rotation (0-180 degrees for semicircle)
  const rotation = (metrics.score / 100) * 180;

  return (
    <Card className={`glass-card inner-glow ${className}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-synth-pink" />
            {title}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className={`${getScoreColor(metrics.score)} border-current`}
            >
              {getScoreLabel(metrics.score)}
            </Badge>
            {trend && (
              <div className={`flex items-center gap-1 text-xs ${
                trend.isPositive ? 'text-green-600' : 'text-red-600'
              }`}>
                <TrendingUp className={`w-3 h-3 ${trend.isPositive ? '' : 'rotate-180'}`} />
                {trend.value.toFixed(0)} pts
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Gauge Visualization */}
        <div className="flex justify-center">
          <div className="relative w-48 h-24">
            {/* Background Arc */}
            <svg className="w-full h-full" viewBox="0 0 200 100">
              <path
                d="M 20 80 A 60 60 0 0 1 180 80"
                stroke="#e5e7eb"
                strokeWidth="12"
                fill="none"
                strokeLinecap="round"
              />
              
              {/* Progress Arc */}
              <path
                d="M 20 80 A 60 60 0 0 1 180 80"
                stroke={metrics.score >= 80 ? '#10b981' : 
                       metrics.score >= 60 ? '#f59e0b' : 
                       metrics.score >= 40 ? '#f97316' : '#ef4444'}
                strokeWidth="12"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${rotation * 1.05} 314`}
                strokeDashoffset="157"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            
            {/* Score Display */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className={`text-3xl font-bold ${getScoreColor(metrics.score)}`}>
                {metrics.score}
              </div>
              <div className="text-sm text-gray-600">/ 100</div>
            </div>
          </div>
        </div>

        {/* Score Description */}
        <div className="text-center">
          <p className="text-sm text-gray-700">
            {getScoreDescription(metrics.score)}
          </p>
        </div>

        {/* Breakdown Metrics */}
        {showBreakdown && (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-900">Engagement Breakdown</h4>
            
            {/* Session Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
                <Clock className="w-4 h-4 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {Math.floor(metrics.sessionDuration / 60000)}m
                  </p>
                  <p className="text-xs text-gray-600">Session Time</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
                <MousePointer className="w-4 h-4 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {metrics.interactionCount}
                  </p>
                  <p className="text-xs text-gray-600">Interactions</p>
                </div>
              </div>
            </div>

            {/* Content Engagement */}
            <div className="grid grid-cols-3 gap-2">
              <div className="flex items-center gap-1 p-2 bg-gray-50 rounded-lg">
                <Eye className="w-3 h-3 text-gray-600" />
                <div>
                  <p className="text-xs font-medium text-gray-900">{metrics.pageViews}</p>
                  <p className="text-xs text-gray-600">Views</p>
                </div>
              </div>
              
              <div className="flex items-center gap-1 p-2 bg-gray-50 rounded-lg">
                <Heart className="w-3 h-3 text-gray-600" />
                <div>
                  <p className="text-xs font-medium text-gray-900">{metrics.likes}</p>
                  <p className="text-xs text-gray-600">Likes</p>
                </div>
              </div>
              
              <div className="flex items-center gap-1 p-2 bg-gray-50 rounded-lg">
                <Activity className="w-3 h-3 text-gray-600" />
                <div>
                  <p className="text-xs font-medium text-gray-900">{metrics.shares}</p>
                  <p className="text-xs text-gray-600">Shares</p>
                </div>
              </div>
            </div>

            {/* Bounce Rate Warning */}
            {metrics.bounceRate > 70 && (
              <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full" />
                  <span className="text-xs font-medium text-red-900">
                    High bounce rate: {metrics.bounceRate.toFixed(1)}%
                  </span>
                </div>
                <p className="text-xs text-red-700 mt-1">
                  Consider improving content relevance and user experience
                </p>
              </div>
            )}
          </div>
        )}

        {/* Improvement Suggestions */}
        <div className="p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Improvement Suggestions</h4>
          <div className="space-y-1">
            {metrics.score < 60 && (
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-purple-500 rounded-full" />
                <span className="text-xs text-gray-700">
                  Increase session duration by improving content quality
                </span>
              </div>
            )}
            {metrics.interactionCount < 5 && (
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-purple-500 rounded-full" />
                <span className="text-xs text-gray-700">
                  Add more interactive elements to boost engagement
                </span>
              </div>
            )}
            {metrics.bounceRate > 50 && (
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-purple-500 rounded-full" />
                <span className="text-xs text-gray-700">
                  Optimize page load times and content relevance
                </span>
              </div>
            )}
            {metrics.score >= 80 && (
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                <span className="text-xs text-green-700">
                  Excellent engagement! Keep up the great work
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
