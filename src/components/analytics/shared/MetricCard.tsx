/**
 * MetricCard Component
 * 
 * Displays a single metric with value, change indicator, and trend
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUp, ArrowDown, Minus, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: number | string;
  change?: number;
  changePercent?: number;
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
  subtitle?: string;
  className?: string;
  valuePrefix?: string;
  valueSuffix?: string;
}

export function MetricCard({
  title,
  value,
  change,
  changePercent,
  trend,
  icon,
  subtitle,
  className,
  valuePrefix = '',
  valueSuffix = ''
}: MetricCardProps) {
  const getTrendIcon = () => {
    if (!trend || trend === 'neutral') return <Minus className="w-4 h-4" />;
    return trend === 'up' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />;
  };

  const getTrendColor = () => {
    if (!trend || trend === 'neutral') return 'text-gray-500';
    return trend === 'up' ? 'text-green-600' : 'text-red-600';
  };

  const formatValue = (val: number | string): string => {
    if (typeof val === 'number') {
      // Format large numbers with commas
      return val.toLocaleString();
    }
    return val;
  };

  return (
    <Card className={cn('glass-card inner-glow floating-shadow', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-gray-600">
            {title}
          </CardTitle>
          {icon && <div className="text-synth-pink">{icon}</div>}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          <div className="text-3xl font-bold text-gray-900">
            {valuePrefix}{formatValue(value)}{valueSuffix}
          </div>
          
          {(change !== undefined || changePercent !== undefined) && (
            <div className={cn('flex items-center gap-1 text-sm', getTrendColor())}>
              {getTrendIcon()}
              <span className="font-medium">
                {change !== undefined && `${change > 0 ? '+' : ''}${change}`}
                {changePercent !== undefined && ` (${changePercent > 0 ? '+' : ''}${changePercent}%)`}
              </span>
              {subtitle && <span className="text-gray-500 ml-1">{subtitle}</span>}
            </div>
          )}
          
          {!change && !changePercent && subtitle && (
            <div className="text-sm text-gray-500">{subtitle}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

