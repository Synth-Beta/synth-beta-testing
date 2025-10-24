/**
 * Conversion Funnel Chart
 * 
 * Visualizes conversion funnel with drop-off rates and optimization opportunities.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingDown, 
  Users, 
  Target,
  AlertTriangle,
  CheckCircle,
  ArrowRight
} from 'lucide-react';

interface FunnelStage {
  stage_name: string;
  stage_order: number;
  users_entered: number;
  users_completed: number;
  conversion_rate: number;
  drop_off_rate: number;
  average_time_spent: number;
  revenue_attributed: number;
  key_actions: string[];
  optimization_opportunities: string[];
}

interface ConversionFunnelChartProps {
  stages: FunnelStage[];
  title?: string;
  showOptimizationTips?: boolean;
  className?: string;
}

export function ConversionFunnelChart({ 
  stages, 
  title = "Conversion Funnel",
  showOptimizationTips = true,
  className = ""
}: ConversionFunnelChartProps) {
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getStageColor = (stageOrder: number): string => {
    const colors = [
      'from-blue-500 to-blue-600',
      'from-purple-500 to-purple-600', 
      'from-pink-500 to-pink-600',
      'from-green-500 to-green-600',
      'from-yellow-500 to-yellow-600'
    ];
    return colors[stageOrder % colors.length];
  };

  const getDropOffSeverity = (dropOffRate: number): 'low' | 'medium' | 'high' => {
    if (dropOffRate > 70) return 'high';
    if (dropOffRate > 40) return 'medium';
    return 'low';
  };

  const getDropOffColor = (severity: 'low' | 'medium' | 'high'): string => {
    switch (severity) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-green-600 bg-green-50';
    }
  };

  const totalUsers = stages[0]?.users_entered || 0;
  const finalConversion = stages[stages.length - 1]?.conversion_rate || 0;

  return (
    <Card className={`glass-card inner-glow ${className}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Target className="w-5 h-5 text-synth-pink" />
            {title}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-blue-600 border-blue-200">
              {formatNumber(totalUsers)} Total Users
            </Badge>
            <Badge variant="outline" className="text-green-600 border-green-200">
              {finalConversion.toFixed(1)}% Final Conversion
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Funnel Visualization */}
        <div className="space-y-3">
          {stages.map((stage, index) => {
            const isLastStage = index === stages.length - 1;
            const dropOffSeverity = getDropOffSeverity(stage.drop_off_rate);
            const stageColor = getStageColor(stage.stage_order);
            
            return (
              <div key={stage.stage_name} className="relative">
                {/* Stage Bar */}
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {stage.stage_name}
                        </span>
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${getDropOffColor(dropOffSeverity)}`}
                        >
                          {stage.conversion_rate.toFixed(1)}% conversion
                        </Badge>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">
                          {formatNumber(stage.users_entered)} → {formatNumber(stage.users_completed)}
                        </p>
                        <p className="text-xs text-gray-600">
                          {stage.average_time_spent.toFixed(1)}m avg time
                        </p>
                      </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="relative">
                      <div className="w-full h-8 bg-gray-200 rounded-lg overflow-hidden">
                        <div 
                          className={`h-full bg-gradient-to-r ${stageColor} transition-all duration-500`}
                          style={{ width: `${(stage.users_completed / stage.users_entered) * 100}%` }}
                        />
                      </div>
                      
                      {/* Drop-off Indicator */}
                      {stage.drop_off_rate > 0 && (
                        <div className="absolute top-0 right-0 flex items-center gap-1">
                          <TrendingDown className="w-4 h-4 text-red-500" />
                          <span className="text-xs text-red-600 font-medium">
                            -{stage.drop_off_rate.toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Revenue Attribution */}
                    {stage.revenue_attributed > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-green-600 font-medium">
                          ${stage.revenue_attributed.toFixed(0)} revenue
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Arrow to Next Stage */}
                {!isLastStage && (
                  <div className="flex justify-center my-2">
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Optimization Tips */}
        {showOptimizationTips && (
          <div className="mt-6 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-yellow-600" />
              <h4 className="text-sm font-semibold text-gray-900">Optimization Opportunities</h4>
            </div>
            
            <div className="space-y-2">
              {stages
                .filter(stage => stage.drop_off_rate > 40)
                .map((stage, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-gray-900">
                        {stage.stage_name} Stage
                      </p>
                      <p className="text-xs text-gray-600">
                        {stage.drop_off_rate.toFixed(1)}% drop-off rate - {stage.optimization_opportunities[0]}
                      </p>
                    </div>
                  </div>
                ))}
              
              {stages.filter(stage => stage.drop_off_rate > 40).length === 0 && (
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-xs text-green-700">
                    Great! No significant drop-off issues detected.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Key Actions Summary */}
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Key Actions Across Funnel</h4>
          <div className="flex flex-wrap gap-1">
            {Array.from(new Set(stages.flatMap(s => s.key_actions)))
              .slice(0, 6)
              .map((action, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {action}
                </Badge>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
