/**
 * Trend Line Chart
 * 
 * Displays time-series data with trend analysis and forecasting.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  TrendingDown,
  BarChart3,
  Calendar,
  Target
} from 'lucide-react';

interface TrendDataPoint {
  date: string;
  value: number;
  label?: string;
  metadata?: Record<string, any>;
}

interface TrendLineChartProps {
  data: TrendDataPoint[];
  title?: string;
  valueLabel?: string;
  showTrend?: boolean;
  showForecast?: boolean;
  className?: string;
}

export function TrendLineChart({ 
  data, 
  title = "Trend Analysis",
  valueLabel = "Value",
  showTrend = true,
  showForecast = false,
  className = ""
}: TrendLineChartProps) {
  const formatValue = (value: number): string => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toString();
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const calculateTrend = (data: TrendDataPoint[]): { direction: 'up' | 'down' | 'flat'; percentage: number } => {
    if (data.length < 2) return { direction: 'flat', percentage: 0 };
    
    const firstValue = data[0].value;
    const lastValue = data[data.length - 1].value;
    const percentage = ((lastValue - firstValue) / firstValue) * 100;
    
    if (Math.abs(percentage) < 1) return { direction: 'flat', percentage: 0 };
    return { 
      direction: percentage > 0 ? 'up' : 'down', 
      percentage: Math.abs(percentage) 
    };
  };

  const getMaxValue = (): number => {
    return Math.max(...data.map(d => d.value));
  };

  const getMinValue = (): number => {
    return Math.min(...data.map(d => d.value));
  };

  const getValuePosition = (value: number, max: number, min: number): number => {
    if (max === min) return 50;
    return ((value - min) / (max - min)) * 100;
  };

  const trend = calculateTrend(data);
  const maxValue = getMaxValue();
  const minValue = getMinValue();
  const range = maxValue - minValue;

  return (
    <Card className={`glass-card inner-glow ${className}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-synth-pink" />
            {title}
          </CardTitle>
          {showTrend && (
            <div className="flex items-center gap-2">
              {trend.direction === 'up' && (
                <Badge variant="outline" className="text-green-600 border-green-200">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  +{trend.percentage.toFixed(1)}%
                </Badge>
              )}
              {trend.direction === 'down' && (
                <Badge variant="outline" className="text-red-600 border-red-200">
                  <TrendingDown className="w-3 h-3 mr-1" />
                  -{trend.percentage.toFixed(1)}%
                </Badge>
              )}
              {trend.direction === 'flat' && (
                <Badge variant="outline" className="text-gray-600 border-gray-200">
                  <Target className="w-3 h-3 mr-1" />
                  Stable
                </Badge>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Chart Container */}
        <div className="relative h-48 bg-gradient-to-b from-gray-50 to-white rounded-lg p-4">
          {/* Grid Lines */}
          <div className="absolute inset-4">
            {[0, 25, 50, 75, 100].map((line, index) => (
              <div
                key={index}
                className="absolute w-full border-t border-gray-200"
                style={{ top: `${line}%` }}
              />
            ))}
          </div>

          {/* Data Line */}
          <svg className="absolute inset-4 w-full h-full">
            <polyline
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={data.map((point, index) => {
                const x = (index / (data.length - 1)) * 100;
                const y = 100 - getValuePosition(point.value, maxValue, minValue);
                return `${x},${y}`;
              }).join(' ')}
            />
            
            {/* Data Points */}
            {data.map((point, index) => {
              const x = (index / (data.length - 1)) * 100;
              const y = 100 - getValuePosition(point.value, maxValue, minValue);
              return (
                <circle
                  key={index}
                  cx={x}
                  cy={y}
                  r="4"
                  fill="#8b5cf6"
                  className="hover:r-6 transition-all duration-200"
                />
              );
            })}
          </svg>

          {/* Y-Axis Labels */}
          <div className="absolute left-0 top-4 bottom-4 flex flex-col justify-between text-xs text-gray-600">
            <span>{formatValue(maxValue)}</span>
            <span>{formatValue((maxValue + minValue) / 2)}</span>
            <span>{formatValue(minValue)}</span>
          </div>
        </div>

        {/* Data Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="text-lg font-bold text-blue-900">
              {formatValue(data[data.length - 1]?.value || 0)}
            </div>
            <div className="text-xs text-blue-700">Current</div>
          </div>
          
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-lg font-bold text-green-900">
              {formatValue(maxValue)}
            </div>
            <div className="text-xs text-green-700">Peak</div>
          </div>
          
          <div className="text-center p-3 bg-purple-50 rounded-lg">
            <div className="text-lg font-bold text-purple-900">
              {formatValue(data.reduce((sum, d) => sum + d.value, 0) / data.length)}
            </div>
            <div className="text-xs text-purple-700">Average</div>
          </div>
        </div>

        {/* Recent Data Points */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-900">Recent Data</h4>
          <div className="space-y-1">
            {data.slice(-5).map((point, index) => (
              <div key={index} className="flex items-center justify-between text-xs">
                <span className="text-gray-600">{formatDate(point.date)}</span>
                <span className="font-medium text-gray-900">{formatValue(point.value)}</span>
                {point.label && (
                  <span className="text-gray-500">{point.label}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Trend Analysis */}
        {showTrend && (
          <div className="p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold text-gray-900">Trend Analysis</span>
            </div>
            <p className="text-xs text-gray-700">
              {trend.direction === 'up' && `Showing ${trend.percentage.toFixed(1)}% growth over the period`}
              {trend.direction === 'down' && `Showing ${trend.percentage.toFixed(1)}% decline over the period`}
              {trend.direction === 'flat' && 'Values have remained relatively stable'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
