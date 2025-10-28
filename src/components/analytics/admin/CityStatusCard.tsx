import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';
import { CityMetrics } from '@/services/networkAnalyticsService';

interface CityStatusCardProps {
  metrics: CityMetrics;
  onClick?: () => void;
}

export function CityStatusCard({ metrics, onClick }: CityStatusCardProps) {
  const getStatusColor = (status: CityMetrics['status']) => {
    switch (status) {
      case 'sustainable':
        return 'bg-green-500';
      case 'near_critical':
        return 'bg-blue-500';
      case 'building':
        return 'bg-yellow-500';
      case 'below':
        return 'bg-red-500';
    }
  };

  const getStatusLabel = (status: CityMetrics['status']) => {
    switch (status) {
      case 'sustainable':
        return '✅ Sustainable';
      case 'near_critical':
        return '🟢 Near Critical';
      case 'building':
        return '🟡 Building';
      case 'below':
        return '🔴 Below';
    }
  };

  const formatGrowth = (growth: number) => {
    if (growth > 0) return `+${growth.toFixed(1)}%`;
    if (growth < 0) return `${growth.toFixed(1)}%`;
    return '0%';
  };

  return (
    <Card 
      className={`cursor-pointer hover:shadow-lg transition-all ${onClick ? 'hover:border-synth-pink' : ''}`}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">{metrics.city}</CardTitle>
          <Badge 
            variant="outline" 
            className={`${getStatusColor(metrics.status)} text-white border-0`}
          >
            {getStatusLabel(metrics.status)}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* MAU Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">MAU Progress</span>
            <span className="font-semibold text-gray-900">
              {metrics.currentMAU.toLocaleString()} / {metrics.targetMAU.toLocaleString()}
            </span>
          </div>
          <Progress 
            value={metrics.percentComplete} 
            className="h-3"
          />
          <div className="text-xs text-gray-500 text-right">
            {metrics.percentComplete.toFixed(1)}% of target
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="text-xs text-gray-500">WoW Growth</div>
            <div className={`flex items-center gap-1 text-sm font-semibold ${
              metrics.wowGrowth > 0 ? 'text-green-600' : 
              metrics.wowGrowth < 0 ? 'text-red-600' : 'text-gray-600'
            }`}>
              {metrics.wowGrowth > 0 ? (
                <TrendingUp className="w-3 h-3" />
              ) : metrics.wowGrowth < 0 ? (
                <TrendingDown className="w-3 h-3" />
              ) : (
                <Minus className="w-3 h-3" />
              )}
              {formatGrowth(metrics.wowGrowth)}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-gray-500">Week 2 Retention</div>
            <div className={`text-sm font-semibold ${
              metrics.week2Retention >= 60 ? 'text-green-600' :
              metrics.week2Retention >= 40 ? 'text-yellow-600' :
              'text-red-600'
            }`}>
              {metrics.week2Retention.toFixed(1)}%
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-gray-500">Network Score</div>
            <div className={`text-sm font-semibold ${
              metrics.networkCompleteness >= 80 ? 'text-green-600' :
              metrics.networkCompleteness >= 50 ? 'text-yellow-600' :
              'text-red-600'
            }`}>
              {metrics.networkCompleteness.toFixed(0)}%
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-gray-500">Event Coverage</div>
            <div className={`text-sm font-semibold ${
              metrics.eventCoverage >= 40 ? 'text-green-600' :
              metrics.eventCoverage >= 30 ? 'text-yellow-600' :
              'text-red-600'
            }`}>
              {metrics.eventCoverage.toFixed(0)}%
            </div>
          </div>
        </div>

        {/* User Count Info */}
        <div className="text-xs text-gray-500 pt-2 border-t">
          {metrics.userCount} total users • {metrics.activeUserCount} active
        </div>
      </CardContent>
    </Card>
  );
}

