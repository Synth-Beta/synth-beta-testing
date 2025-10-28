import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { RetentionCohort } from '@/services/networkAnalyticsService';
import { TrendingUp } from 'lucide-react';

interface CohortRetentionChartProps {
  data: RetentionCohort[];
  city?: string;
}

export function CohortRetentionChart({ data, city }: CohortRetentionChartProps) {
  // Format data for chart
  const chartData = data.map(cohort => ({
    cohort: new Date(cohort.cohortWeek).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: '2-digit'
    }),
    'Week 2': parseFloat(cohort.week2Retention.toFixed(1)),
    'Week 4': parseFloat(cohort.week4Retention.toFixed(1)),
    'Week 8': parseFloat(cohort.week8Retention.toFixed(1)),
    cohortSize: cohort.cohortSize
  })).reverse(); // Reverse to show oldest to newest

  // Calculate average retention
  const avgWeek2 = data.length > 0 
    ? data.reduce((sum, c) => sum + c.week2Retention, 0) / data.length 
    : 0;
  const avgWeek4 = data.length > 0 
    ? data.reduce((sum, c) => sum + c.week4Retention, 0) / data.length 
    : 0;
  const avgWeek8 = data.length > 0 
    ? data.reduce((sum, c) => sum + c.week8Retention, 0) / data.length 
    : 0;

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Cohort Retention Curves</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <p className="text-sm">No retention data available</p>
              <p className="text-xs text-gray-400 mt-1">
                Need at least 8 weeks of user signup data to calculate retention
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-synth-pink" />
            Cohort Retention Curves
            {city && <span className="text-base font-normal text-gray-500">({city})</span>}
          </CardTitle>
          <div className="flex gap-4 text-xs text-gray-600">
            <div>
              <span className="font-semibold">Avg W2:</span> {avgWeek2.toFixed(1)}%
            </div>
            <div>
              <span className="font-semibold">Avg W4:</span> {avgWeek4.toFixed(1)}%
            </div>
            <div>
              <span className="font-semibold">Avg W8:</span> {avgWeek8.toFixed(1)}%
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="cohort" 
              stroke="#6b7280"
              tick={{ fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis 
              stroke="#6b7280"
              tick={{ fontSize: 12 }}
              domain={[0, 100]}
              label={{ 
                value: 'Retention %', 
                angle: -90, 
                position: 'insideLeft',
                style: { textAnchor: 'middle', fill: '#6b7280' }
              }}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#fff', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px'
              }}
              formatter={(value: number) => `${value.toFixed(1)}%`}
              labelFormatter={(label) => `Cohort: ${label}`}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="Week 2" 
              stroke="#3b82f6" 
              strokeWidth={2}
              dot={{ r: 4 }}
            />
            <Line 
              type="monotone" 
              dataKey="Week 4" 
              stroke="#10b981" 
              strokeWidth={2}
              dot={{ r: 4 }}
            />
            <Line 
              type="monotone" 
              dataKey="Week 8" 
              stroke="#8b5cf6" 
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>

        {/* Summary Stats */}
        <div className="mt-4 grid grid-cols-3 gap-4 pt-4 border-t">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {avgWeek2.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500">Avg Week 2 Retention</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {avgWeek4.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500">Avg Week 4 Retention</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {avgWeek8.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500">Avg Week 8 Retention</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

