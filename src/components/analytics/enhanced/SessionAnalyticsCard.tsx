/**
 * Session Analytics Card
 * 
 * Displays session metrics including duration, engagement score, and interaction patterns.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Clock, 
  Activity, 
  TrendingUp, 
  Users,
  Eye,
  MousePointer
} from 'lucide-react';

interface SessionMetrics {
  duration: number;
  interactionCount: number;
  engagementScore: number;
  pageViews: number;
  bounceRate: number;
}

interface SessionAnalyticsCardProps {
  metrics: SessionMetrics;
  title?: string;
  showTrends?: boolean;
  previousMetrics?: SessionMetrics;
  className?: string;
}

export function SessionAnalyticsCard({ 
  metrics, 
  title = "Session Analytics",
  showTrends = false,
  previousMetrics,
  className = ""
}: SessionAnalyticsCardProps) {
  const formatDuration = (milliseconds: number): string => {
    const minutes = Math.floor(milliseconds / (1000 * 60));
    const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const getEngagementScoreColor = (score: number): string => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    if (score >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  const getEngagementScoreLabel = (score: number): string => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Poor';
  };

  const calculateTrend = (current: number, previous?: number): { value: number; isPositive: boolean } => {
    if (!previous || previous === 0) return { value: 0, isPositive: true };
    const change = ((current - previous) / previous) * 100;
    return { value: Math.abs(change), isPositive: change >= 0 };
  };

  const durationTrend = showTrends && previousMetrics ? 
    calculateTrend(metrics.duration, previousMetrics.duration) : null;
  const engagementTrend = showTrends && previousMetrics ? 
    calculateTrend(metrics.engagementScore, previousMetrics.engagementScore) : null;

  return (
    <Card className={`glass-card inner-glow ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-synth-pink" />
            {title}
          </CardTitle>
          <Badge 
            variant="outline" 
            className={`${getEngagementScoreColor(metrics.engagementScore)} border-current`}
          >
            {getEngagementScoreLabel(metrics.engagementScore)}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Session Duration */}
        <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Session Duration</p>
              <p className="text-xs text-gray-600">Total time spent</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-gray-900">
              {formatDuration(metrics.duration)}
            </p>
            {durationTrend && (
              <p className={`text-xs flex items-center gap-1 ${
                durationTrend.isPositive ? 'text-green-600' : 'text-red-600'
              }`}>
                <TrendingUp className={`w-3 h-3 ${durationTrend.isPositive ? '' : 'rotate-180'}`} />
                {durationTrend.value.toFixed(1)}%
              </p>
            )}
          </div>
        </div>

        {/* Engagement Score */}
        <div className="flex items-center justify-between p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Engagement Score</p>
              <p className="text-xs text-gray-600">0-100 scale</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`text-lg font-bold ${getEngagementScoreColor(metrics.engagementScore)}`}>
              {metrics.engagementScore}/100
            </p>
            {engagementTrend && (
              <p className={`text-xs flex items-center gap-1 ${
                engagementTrend.isPositive ? 'text-green-600' : 'text-red-600'
              }`}>
                <TrendingUp className={`w-3 h-3 ${engagementTrend.isPositive ? '' : 'rotate-180'}`} />
                {engagementTrend.value.toFixed(1)}%
              </p>
            )}
          </div>
        </div>

        {/* Interaction Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
            <MousePointer className="w-4 h-4 text-gray-600" />
            <div>
              <p className="text-sm font-medium text-gray-900">{metrics.interactionCount}</p>
              <p className="text-xs text-gray-600">Interactions</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
            <Eye className="w-4 h-4 text-gray-600" />
            <div>
              <p className="text-sm font-medium text-gray-900">{metrics.pageViews}</p>
              <p className="text-xs text-gray-600">Page Views</p>
            </div>
          </div>
        </div>

        {/* Bounce Rate */}
        <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-600" />
            <span className="text-sm text-gray-600">Bounce Rate</span>
          </div>
          <span className={`text-sm font-medium ${
            metrics.bounceRate > 70 ? 'text-red-600' : 
            metrics.bounceRate > 40 ? 'text-yellow-600' : 'text-green-600'
          }`}>
            {metrics.bounceRate.toFixed(1)}%
          </span>
        </div>

        {/* Session Quality Indicator */}
        <div className="mt-4 p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-900">Session Quality</span>
            <div className="flex items-center gap-2">
              <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ${
                    metrics.engagementScore >= 80 ? 'bg-green-500' :
                    metrics.engagementScore >= 60 ? 'bg-yellow-500' :
                    metrics.engagementScore >= 40 ? 'bg-orange-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${metrics.engagementScore}%` }}
                />
              </div>
              <span className="text-xs text-gray-600">
                {metrics.engagementScore >= 80 ? 'Excellent' :
                 metrics.engagementScore >= 60 ? 'Good' :
                 metrics.engagementScore >= 40 ? 'Fair' : 'Poor'}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
