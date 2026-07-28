import * as React from 'react';

import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface MetricCardProps {
  title: string;
  value: string | null;
  description?: string;
  trend?: React.ReactNode;
  accent?: boolean;
  className?: string;
}

const MetricCard = ({ title, value, description, trend, accent = false, className }: MetricCardProps) => (
  <Card
    className={cn(
      'shadow-sm border bg-white',
      accent ? 'border-pink-200' : 'border-slate-200',
      className
    )}
  >
    <CardHeader className="px-4 pb-1">
      <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </CardTitle>
      {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
    </CardHeader>
    <CardContent className="px-4 pt-2 pb-4">
      <p className={cn('text-2xl font-semibold', accent ? 'text-pink-600' : 'text-foreground')}>
        {value ?? 'N/A'}
      </p>
      {trend && <div className="mt-1">{trend}</div>}
    </CardContent>
  </Card>
);

export default MetricCard;
