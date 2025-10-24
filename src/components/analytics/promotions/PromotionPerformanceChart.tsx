/**
 * PromotionPerformanceChart Component
 * Displays time-series chart of promotion performance
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Eye, MousePointer, Target } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';

interface PromotionPerformanceChartProps {
  data: {
    date: string;
    impressions: number;
    clicks: number;
    conversions: number;
    spend: number;
  }[];
  className?: string;
}

export function PromotionPerformanceChart({ data, className = '' }: PromotionPerformanceChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Promotion Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-gray-500">
            No performance data available
          </div>
        </CardContent>
      </Card>
    );
  }


  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Promotion Performance Over Time
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Legend */}
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded"></div>
              <span>Impressions</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-purple-500 rounded"></div>
              <span>Clicks</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded"></div>
              <span>Conversions</span>
            </div>
          </div>

          {/* Chart */}
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={formatDate}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis />
                <Tooltip 
                  formatter={(value, name) => [value.toLocaleString(), name]}
                  labelFormatter={(label) => `Date: ${formatDate(label)}`}
                />
                <Legend />
                <Bar dataKey="impressions" fill="#3b82f6" name="Impressions" />
                <Bar dataKey="clicks" fill="#8b5cf6" name="Clicks" />
                <Bar dataKey="conversions" fill="#10b981" name="Conversions" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-sm text-gray-600 mb-1">
                <Eye className="h-4 w-4" />
                <span>Total Impressions</span>
              </div>
              <p className="text-lg font-semibold">
                {data.reduce((sum, d) => sum + d.impressions, 0).toLocaleString()}
              </p>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-sm text-gray-600 mb-1">
                <MousePointer className="h-4 w-4" />
                <span>Total Clicks</span>
              </div>
              <p className="text-lg font-semibold">
                {data.reduce((sum, d) => sum + d.clicks, 0).toLocaleString()}
              </p>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-sm text-gray-600 mb-1">
                <Target className="h-4 w-4" />
                <span>Total Conversions</span>
              </div>
              <p className="text-lg font-semibold">
                {data.reduce((sum, d) => sum + d.conversions, 0).toLocaleString()}
              </p>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-sm text-gray-600 mb-1">
                <span>Total Spend</span>
              </div>
              <p className="text-lg font-semibold">
                ${data.reduce((sum, d) => sum + d.spend, 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default PromotionPerformanceChart;
